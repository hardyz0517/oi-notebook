import {
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkDirective from "remark-directive";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { highlightCode } from "./highlight";
import { remarkLuoguCallouts } from "./markdownCallouts";

type MarkdownRendererProps = {
  markdown: string;
};

const safeExternalProtocols = new Set(["http:", "https:", "mailto:"]);
const copyResetDelay = 1400;

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <rect x="7" y="6" width="9" height="11" rx="2" />
      <path d="M4 13V5a2 2 0 0 1 2-2h7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="m4.5 10.5 3.4 3.4 7.6-8.2" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M10 3.5 17 16H3L10 3.5Z" />
      <path d="M10 8v3.2" />
      <path d="M10 14.2h.01" />
    </svg>
  );
}

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

type CodeNode = {
  data?: {
    meta?: string | null;
  };
  properties?: {
    metastring?: string | null;
  };
};

function CodeBlock({ children, metaString }: { children: ReactNode; metaString?: string }) {
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

    highlightCode(codeText, language, metaString).then((html) => {
      if (!cancelled) {
        setHighlightedHtml(html);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [codeText, language, metaString]);

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

  const copyLabel =
    copyState === "copied" ? "Code copied" : copyState === "failed" ? "Copy failed" : "Copy code";

  return (
    <div className="code-block">
      {language ? <span className="code-block-language">{language}</span> : null}
      <button
        type="button"
        className={`code-copy-button code-copy-button-${copyState}`}
        onClick={copyCode}
        aria-label={copyLabel}
        title={copyLabel}
      >
        {copyState === "copied" ? (
          <CheckIcon />
        ) : copyState === "failed" ? (
          <WarningIcon />
        ) : (
          <CopyIcon />
        )}
      </button>
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
    const codeChild = Array.isArray(children) ? children[0] : children;
    const node =
      codeChild && typeof codeChild === "object" && "props" in codeChild
        ? ((codeChild.props as { node?: unknown }).node ?? null)
        : null;
    const codeProps =
      codeChild && typeof codeChild === "object" && "props" in codeChild
        ? (codeChild.props as { "data-meta"?: string })
        : null;
    const metaString = getCodeMetaString(node) ?? codeProps?.["data-meta"];

    return <CodeBlock metaString={metaString}>{children}</CodeBlock>;
  },
  code({
    children,
    className,
    node,
  }: HTMLAttributes<HTMLElement> & { children?: ReactNode; node?: unknown }) {
    const metaString = getCodeMetaString(node);

    return (
      <code className={className} data-meta={metaString}>
        {children}
      </code>
    );
  },
};

function getCodeMetaString(node: unknown): string | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }

  const codeNode = node as CodeNode;
  return codeNode.data?.meta ?? codeNode.properties?.metastring ?? undefined;
}

export function MarkdownRenderer({ markdown }: MarkdownRendererProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    for (const callout of root.querySelectorAll<HTMLElement>(
      ".oi-callout[data-callout-collapsible='true']",
    )) {
      const isOpen = callout.dataset.open === "true";
      setCalloutExpanded(callout, isOpen);

      const title = getDirectCalloutTitle(callout);
      if (!title) continue;

      title.setAttribute("role", "button");
      title.tabIndex = 0;

      if (!title.querySelector(":scope > .oi-callout-chevron")) {
        const chevron = document.createElement("span");
        chevron.className = "oi-callout-chevron";
        chevron.setAttribute("aria-hidden", "true");
        chevron.textContent = ">";
        title.prepend(chevron);
      }
    }

    const toggleFromTitle = (title: HTMLElement) => {
      const callout = title.closest<HTMLElement>(".oi-callout[data-callout-collapsible='true']");
      if (!callout || !root.contains(callout) || getDirectCalloutTitle(callout) !== title) {
        return;
      }

      setCalloutExpanded(callout, callout.dataset.state !== "open");
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const title = target.closest<HTMLElement>(".oi-callout-title");
      if (!title || !root.contains(title)) return;

      toggleFromTitle(title);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.classList.contains("oi-callout-title")) {
        return;
      }

      event.preventDefault();
      toggleFromTitle(target);
    };

    root.addEventListener("click", handleClick);
    root.addEventListener("keydown", handleKeyDown);

    return () => {
      root.removeEventListener("click", handleClick);
      root.removeEventListener("keydown", handleKeyDown);
    };
  }, [markdown]);

  return (
    <div ref={rootRef} className="prose-content">
      <ReactMarkdown
        components={components}
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkDirective, remarkLuoguCallouts, remarkMath]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function getDirectCalloutTitle(callout: HTMLElement): HTMLElement | null {
  return callout.querySelector<HTMLElement>(":scope > .oi-callout-title");
}

function setCalloutExpanded(callout: HTMLElement, expanded: boolean) {
  const title = getDirectCalloutTitle(callout);
  const body = callout.querySelector<HTMLElement>(":scope > .oi-callout-body");

  callout.dataset.state = expanded ? "open" : "collapsed";
  title?.setAttribute("aria-expanded", expanded ? "true" : "false");
  if (body) {
    body.hidden = !expanded;
    body.toggleAttribute("hidden", !expanded);
    body.style.display = expanded ? "" : "none";
  }
}
