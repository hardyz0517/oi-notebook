import {
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { highlightCode } from "./highlight";

type MarkdownRendererProps = {
  markdown: string;
};

const safeExternalProtocols = new Set(["http:", "https:", "mailto:"]);
const copyResetDelay = 1400;

function isExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeLinkUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith("#") || trimmed.startsWith("/")) {
    return true;
  }

  try {
    const url = new URL(trimmed);
    return safeExternalProtocols.has(url.protocol);
  } catch {
    return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  }
}

function rewriteAssetUrl(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.replace(/\\/g, "/");
  const lower = normalized.toLowerCase();

  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("?") ||
    normalized.includes("#") ||
    /^[a-z][a-z0-9+.-]*:/.test(lower)
  ) {
    return null;
  }

  const withoutCurrentDir = normalized.replace(/^(\.\/)+/, "");
  const match = withoutCurrentDir.match(/^(?:(?:\.\.\/)+)?assets\/(.+)$/);

  if (!match) {
    return null;
  }

  const assetPath = match[1];
  if (!assetPath || assetPath.includes("../") || assetPath.startsWith("/")) {
    return null;
  }

  return `/assets/${assetPath}`;
}

function getSafeImageSrc(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const rewritten = rewriteAssetUrl(value);
  if (rewritten) {
    return rewritten;
  }

  if (isExternalUrl(value)) {
    return value;
  }

  return undefined;
}

function getNodeText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children.map(getNodeText).join("");
  }

  if (children && typeof children === "object" && "props" in children) {
    const props = children.props as { children?: ReactNode };
    return getNodeText(props.children);
  }

  return "";
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const codeText = getNodeText(children).replace(/\n$/, "");
  const codeChild = Array.isArray(children) ? children[0] : children;
  const className =
    codeChild && typeof codeChild === "object" && "props" in codeChild
      ? (codeChild.props as { className?: string }).className
      : undefined;
  const language = className?.match(/language-([A-Za-z0-9_+-]+)/)?.[1];

  useEffect(() => {
    let cancelled = false;

    setHighlightedHtml(null);

    highlightCode(codeText, language).then((html) => {
      if (!cancelled) {
        setHighlightedHtml(html);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [codeText, language]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopyState("copied");
    } catch (error) {
      console.warn("Copy code block failed:", error);
      setCopyState("failed");
    }

    window.setTimeout(() => setCopyState("idle"), copyResetDelay);
  };

  const label =
    copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制";

  return (
    <div className="code-block">
      <div className="code-block-bar">
        <span>{language ?? "text"}</span>
        <button type="button" onClick={copyCode}>
          {label}
        </button>
      </div>
      {highlightedHtml ? (
        <div
          className="code-block-highlight"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre>{children}</pre>
      )}
    </div>
  );
}

const components: Components = {
  a({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) {
    if (!href || !isSafeLinkUrl(href)) {
      return <span>{children}</span>;
    }

    const external = isExternalUrl(href);
    return (
      <a
        {...props}
        href={href}
        rel={external ? "noreferrer" : undefined}
        target={external ? "_blank" : undefined}
      >
        {children}
      </a>
    );
  },
  img({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
    const safeSrc = getSafeImageSrc(src);
    if (!safeSrc) {
      return null;
    }

    return <img {...props} alt={alt ?? ""} loading="lazy" src={safeSrc} />;
  },
  pre({ children }: HTMLAttributes<HTMLPreElement> & { children?: ReactNode }) {
    return <CodeBlock>{children}</CodeBlock>;
  },
  code({ children, className }: HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
    return <code className={className}>{children}</code>;
  },
};

export function MarkdownRenderer({ markdown }: MarkdownRendererProps) {
  return (
    <div className="prose-content">
      <ReactMarkdown
        components={components}
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
