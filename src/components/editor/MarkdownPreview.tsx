import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { renderMarkdown } from "@/lib/markdown";
import { resolveNoteAssetUrl } from "@/lib/api";
import {
  markPreviewCommit,
  markPreviewEffectStart,
  markPreviewHtmlReady,
  markPreviewSchedule,
  markPreviewStaleRender,
} from "@/lib/previewPerf";
import { cn } from "@/lib/utils";

interface MarkdownPreviewProps {
  markdown: string;
  noteRelativePath?: string | null;
  onScroll?: (ratio: number) => void;
  onScrollApiChange?: (api: MarkdownPreviewScrollApi | null) => void;
  className?: string;
}

export interface MarkdownPreviewScrollApi {
  scrollToRatio: (ratio: number) => void;
}

function MarkdownPreview({
  markdown,
  noteRelativePath,
  onScroll,
  onScrollApiChange,
  className,
}: MarkdownPreviewProps) {
  const [renderedHtml, setRenderedHtml] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const renderVersionRef = useRef(0);
  const pendingRenderRef = useRef<{
    scheduledAt: number;
    finishedAt: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const renderVersion = renderVersionRef.current + 1;
    renderVersionRef.current = renderVersion;
    const scheduledAt = markPreviewEffectStart(markdown.length);

    markPreviewSchedule(markdown.length);

    renderMarkdown(markdown)
      .then((html) => rewritePreviewImageSources(html, noteRelativePath))
      .then((html) => {
        if (!cancelled && renderVersionRef.current === renderVersion) {
          markPreviewHtmlReady();
          pendingRenderRef.current = {
            scheduledAt,
            finishedAt: now(),
          };
          setRenderedHtml(html);
        } else {
          markPreviewStaleRender();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [markdown, noteRelativePath]);

  useLayoutEffect(() => {
    const pendingRender = pendingRenderRef.current;
    if (!pendingRender) return;

    const committedAt = now();
    markPreviewCommit({
      commitMs: committedAt - pendingRender.finishedAt,
      totalPreviewMs: committedAt - pendingRender.scheduledAt,
      scheduleDelayMs: pendingRender.finishedAt - pendingRender.scheduledAt,
    });
    pendingRenderRef.current = null;
  }, [renderedHtml]);

  useEffect(() => {
    onScrollApiChange?.({
      scrollToRatio: (ratio: number) => {
        const el = containerRef.current;
        if (!el) return;

        const max = el.scrollHeight - el.clientHeight;
        if (max <= 0) return;

        const nextRatio = Math.min(1, Math.max(0, ratio));
        el.scrollTop = nextRatio * max;
      },
    });

    return () => onScrollApiChange?.(null);
  }, [onScrollApiChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return;
      onScroll?.(el.scrollTop / max);
    };

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [onScroll, renderedHtml]);

  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const timeoutIds = new Set<number>();
    let animationFrameId: number | null = null;

    const decorateCodeBlocks = () => {
      for (const code of root.querySelectorAll<HTMLElement>("pre > code")) {
        const pre = code.parentElement;
        if (!pre) continue;

        normalizeShikiCodeLines(code);
        const shell = ensureCodeBlockShell(pre);
        ensureCodeCopyButton(shell);

        pre.dataset.copyDecorated = "true";
        shell.dataset.copyDecorated = "true";
      }
    };

    const scheduleDecoration = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        decorateCodeBlocks();
      });
    };

    decorateCodeBlocks();
    scheduleDecoration();

    const observer = new MutationObserver(scheduleDecoration);
    observer.observe(root, { childList: true, subtree: true });

    const setButtonStatus = (button: HTMLButtonElement, status: "copied" | "failed") => {
      if (status === "copied") {
        setCodeCopyButtonIcon(button, "check");
        button.title = "Copied";
        button.setAttribute("aria-label", "Copied");
      } else {
        button.title = "Copy failed";
        button.setAttribute("aria-label", "Copy failed");
      }

      const timeoutId = window.setTimeout(() => {
        setCodeCopyButtonIcon(button, "copy");
        button.title = "Copy code";
        button.setAttribute("aria-label", "Copy code");
        timeoutIds.delete(timeoutId);
      }, 1400);
      timeoutIds.add(timeoutId);
    };

    const handleCopyClick = async (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest<HTMLButtonElement>("button[data-code-copy-button='true']");
      if (!button || !root.contains(button)) return;

      const code = button.parentElement?.querySelector<HTMLElement>("pre > code");
      const text = code ? getCodeBlockText(code) : "";

      try {
        await navigator.clipboard.writeText(text);
        setButtonStatus(button, "copied");
      } catch (error) {
        console.warn("Copy code block failed:", error);
        setButtonStatus(button, "failed");
      }
    };

    root.addEventListener("click", handleCopyClick);

    return () => {
      root.removeEventListener("click", handleCopyClick);
      observer.disconnect();
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [renderedHtml]);

  useEffect(() => {
    const root = containerRef.current?.querySelector<HTMLElement>("[data-markdown-preview-content]");
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
  }, [renderedHtml]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || !root.contains(anchor)) return;

      const rawHref = anchor.getAttribute("href")?.trim();
      if (!rawHref || rawHref.startsWith("#")) return;

      if (isHttpUrl(rawHref) || isMailtoUrl(rawHref)) {
        event.preventDefault();
        void openExternalPreviewLink(rawHref);
        return;
      }

      if (isRelativePreviewHref(rawHref)) {
        event.preventDefault();
        toast.info("Relative links are not opened from desktop preview yet.");
      }
    };

    root.addEventListener("click", handleClick);

    return () => {
      root.removeEventListener("click", handleClick);
    };
  }, [renderedHtml]);

  return (
    <div ref={containerRef} className={cn("h-full w-full min-w-0 overflow-auto", className)}>
      <div
        ref={contentRef}
        data-markdown-preview-content="true"
        style={{
          fontSize: "calc(var(--preview-font-size, 14px) * var(--md-content-zoom, 1))",
          lineHeight: "var(--content-line-height, 1.7)",
        }}
        className={cn(
          "min-w-0 max-w-full overflow-x-hidden break-words px-4 py-4 text-foreground",
          "[&_h1]:mb-[calc(var(--content-block-spacing,0.75rem)*1.35)] [&_h1]:mt-[calc(var(--content-block-spacing,0.75rem)*2)] [&_h1]:text-[1.714em] [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:tracking-tight",
          "[&_h2]:mb-[calc(var(--content-block-spacing,0.75rem)*1.15)] [&_h2]:mt-[calc(var(--content-block-spacing,0.75rem)*1.7)] [&_h2]:text-[1.43em] [&_h2]:font-semibold [&_h2]:leading-tight",
          "[&_h3]:mb-[var(--content-block-spacing,0.75rem)] [&_h3]:mt-[calc(var(--content-block-spacing,0.75rem)*1.35)] [&_h3]:text-[1.286em] [&_h3]:font-semibold [&_h3]:leading-snug",
          "[&_h4]:mb-[var(--content-block-spacing,0.75rem)] [&_h4]:mt-[var(--content-block-spacing,0.75rem)] [&_h4]:text-[1.14em] [&_h4]:font-semibold",
          "[&_p]:mb-[var(--content-block-spacing,0.75rem)] [&_p]:leading-[var(--content-line-height,1.7)]",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em]",
          "[&_pre]:my-0 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-[inherit]",
          "[&_pre_code]:inline-block [&_pre_code]:min-w-max [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit",
          "[&_blockquote]:my-[var(--content-block-spacing,0.75rem)] [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
          "[&_.oi-callout]:my-[var(--content-callout-spacing,1rem)] [&_.oi-callout]:overflow-hidden [&_.oi-callout]:rounded-sm [&_.oi-callout]:border [&_.oi-callout]:bg-muted/35",
          "[&_.oi-callout-title]:flex [&_.oi-callout-title]:cursor-pointer [&_.oi-callout-title]:select-none [&_.oi-callout-title]:items-center [&_.oi-callout-title]:gap-2 [&_.oi-callout-title]:border-b [&_.oi-callout-title]:px-4 [&_.oi-callout-title]:py-2.5 [&_.oi-callout-title]:text-sm [&_.oi-callout-title]:font-semibold [&_.oi-callout-title]:not-italic [&_.oi-callout-title]:outline-none [&_.oi-callout-title]:transition-colors [&_.oi-callout-title]:focus-visible:ring-2 [&_.oi-callout-title]:focus-visible:ring-ring",
          "[&_.oi-callout-chevron]:inline-flex [&_.oi-callout-chevron]:h-4 [&_.oi-callout-chevron]:w-4 [&_.oi-callout-chevron]:shrink-0 [&_.oi-callout-chevron]:items-center [&_.oi-callout-chevron]:justify-center [&_.oi-callout-chevron]:text-base [&_.oi-callout-chevron]:leading-none [&_.oi-callout-chevron]:opacity-75 [&_.oi-callout-chevron]:transition-transform",
          "[&_.oi-callout[data-state='open']>.oi-callout-title>.oi-callout-chevron]:rotate-90",
          "[&_.oi-callout[data-state='collapsed']>.oi-callout-body]:hidden",
          "[&_.oi-callout-body]:px-4 [&_.oi-callout-body]:py-3",
          "[&_.oi-callout-body>*:first-child]:mt-0 [&_.oi-callout-body>*:last-child]:mb-0",
          "[&_.oi-callout-info]:border-sky-500/45 [&_.oi-callout-info_.oi-callout-title]:border-sky-500/30 [&_.oi-callout-info_.oi-callout-title]:bg-sky-500/10 [&_.oi-callout-info_.oi-callout-title]:text-sky-200",
          "[&_.oi-callout-success]:border-emerald-500/45 [&_.oi-callout-success_.oi-callout-title]:border-emerald-500/30 [&_.oi-callout-success_.oi-callout-title]:bg-emerald-500/10 [&_.oi-callout-success_.oi-callout-title]:text-emerald-200",
          "[&_.oi-callout-warning]:border-amber-500/45 [&_.oi-callout-warning_.oi-callout-title]:border-amber-500/30 [&_.oi-callout-warning_.oi-callout-title]:bg-amber-500/10 [&_.oi-callout-warning_.oi-callout-title]:text-amber-200",
          "[&_.oi-callout-error]:border-rose-500/45 [&_.oi-callout-error_.oi-callout-title]:border-rose-500/30 [&_.oi-callout-error_.oi-callout-title]:bg-rose-500/10 [&_.oi-callout-error_.oi-callout-title]:text-rose-200",
          "[&_.oi-callout[data-open='true']>.oi-callout-title]:after:ml-1 [&_.oi-callout[data-open='true']>.oi-callout-title]:after:rounded [&_.oi-callout[data-open='true']>.oi-callout-title]:after:border [&_.oi-callout[data-open='true']>.oi-callout-title]:after:border-current/30 [&_.oi-callout[data-open='true']>.oi-callout-title]:after:px-1.5 [&_.oi-callout[data-open='true']>.oi-callout-title]:after:py-0.5 [&_.oi-callout[data-open='true']>.oi-callout-title]:after:text-[10px] [&_.oi-callout[data-open='true']>.oi-callout-title]:after:font-medium [&_.oi-callout[data-open='true']>.oi-callout-title]:after:text-current/75 [&_.oi-callout[data-open='true']>.oi-callout-title]:after:content-['open']",
          "[&_ul]:mb-[var(--content-block-spacing,0.75rem)] [&_ul]:list-disc [&_ul]:pl-6",
          "[&_ol]:mb-[var(--content-block-spacing,0.75rem)] [&_ol]:list-decimal [&_ol]:pl-6",
          "[&_li]:mb-[var(--content-list-item-spacing,0.25rem)]",
          "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
          "[&_a:hover]:opacity-75",
          "[&_hr]:my-[calc(var(--content-block-spacing,0.75rem)*2)] [&_hr]:border-border",
          "[&_table]:my-[var(--content-callout-spacing,1rem)] [&_table]:w-full [&_table]:border-collapse",
          "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
          "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2",
          "[&_strong]:font-semibold",
          "[&_em]:italic",
          "[&_.katex-display]:my-[var(--content-callout-spacing,1rem)]",
        )}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
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

function ensureCodeBlockShell(pre: HTMLElement) {
  const parent = pre.parentElement;
  if (parent?.classList.contains("oi-code-block-shell")) {
    return parent;
  }

  const shell = document.createElement("div");
  shell.className = "oi-code-block-shell";
  pre.replaceWith(shell);
  shell.append(pre);
  return shell;
}

function ensureCodeCopyButton(shell: HTMLElement) {
  const existingButton = shell.querySelector<HTMLButtonElement>(
    ":scope > button[data-code-copy-button='true'], :scope > button.code-copy-button",
  );
  if (existingButton) return existingButton;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.codeCopyButton = "true";
  button.setAttribute("aria-label", "Copy code");
  button.title = "Copy code";
  button.className =
    "code-copy-button absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full border-0 bg-transparent p-0 text-zinc-300 opacity-70 transition focus-visible:outline-none";
  setCodeCopyButtonIcon(button, "copy");

  shell.append(button);
  return button;
}

function getCodeBlockText(code: HTMLElement) {
  const lines = Array.from(code.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("line"),
  );

  if (lines.length > 0) {
    return lines.map((line) => line.textContent ?? "").join("\n");
  }

  return code.textContent ?? "";
}

function normalizeShikiCodeLines(code: HTMLElement) {
  const hasDirectLines = Array.from(code.children).some((child) => child.classList.contains("line"));
  if (!hasDirectLines) return;

  for (const child of Array.from(code.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE && /^[\s\r\n\t]*$/.test(child.textContent ?? "")) {
      child.remove();
    }
  }
}

function isHttpUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function isMailtoUrl(href: string): boolean {
  return /^mailto:/i.test(href);
}

function isRelativePreviewHref(href: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

async function openExternalPreviewLink(href: string) {
  try {
    await openUrl(href);
  } catch (error) {
    console.warn("Open preview link failed:", error);
    toast.error("Failed to open external link.");
  }
}

function shouldResolveNoteAsset(src: string): boolean {
  const normalized = src.replace(/\\/g, "/").toLowerCase();
  if (
    normalized === "" ||
    normalized.startsWith("/") ||
    normalized.includes("?") ||
    normalized.includes("#")
  ) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/.test(normalized)) {
    return false;
  }
  return normalized === "assets" || normalized.startsWith("assets/") || normalized.includes("/assets/");
}

async function rewritePreviewImageSources(
  html: string,
  noteRelativePath?: string | null,
): Promise<string> {
  if (!noteRelativePath) return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const images = Array.from(doc.querySelectorAll("img"));

  await Promise.all(
    images.map(async (image) => {
      const src = image.getAttribute("src");
      if (!src || !shouldResolveNoteAsset(src)) return;

      try {
        const resolvedSrc = await resolveNoteAssetUrl(noteRelativePath, src);
        image.setAttribute("src", resolvedSrc);
      } catch (error) {
        console.warn("Resolve note image failed:", error);
      }
    }),
  );

  return doc.body.innerHTML;
}

function now() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function setCodeCopyButtonIcon(button: HTMLButtonElement, icon: "copy" | "check") {
  button.replaceChildren(createCodeCopyIcon(icon));
}

function createCodeCopyIcon(icon: "copy" | "check") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "h-4 w-4");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.25");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  if (icon === "check") {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M20 6 9 17l-5-5");
    svg.append(path);
    return svg;
  }

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", "14");
  rect.setAttribute("height", "14");
  rect.setAttribute("x", "8");
  rect.setAttribute("y", "8");
  rect.setAttribute("rx", "2");
  rect.setAttribute("ry", "2");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2");

  svg.append(rect, path);
  return svg;
}

export default memo(MarkdownPreview);
