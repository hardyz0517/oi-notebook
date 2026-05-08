import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { resolveNoteAssetUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MarkdownPreviewProps {
  markdown: string;
  noteRelativePath?: string | null;
  scrollRatio?: number;
  className?: string;
}

export default function MarkdownPreview({
  markdown,
  noteRelativePath,
  scrollRatio,
  className,
}: MarkdownPreviewProps) {
  // 渲染结果，初始为空字符串。
  // 初次挂载时预览区域显示空白，不闪"(empty)"之类的占位文字，
  // 等第一次 renderMarkdown 完成后再显示内容。
  const [renderedHtml, setRenderedHtml] = useState("");

  // 滚动容器的 DOM 引用，用于程序化设置 scrollTop
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // ── 竞态条件（race condition）防御 ────────────────────────────────────
    // 问题场景：用户快速连续输入，每次 markdown 变化都触发一次 renderMarkdown
    // （异步）。如果第 N 次渲染比第 N+1 次晚 resolve，就会用过期的结果覆盖
    // 最新的，导致预览和编辑器内容不一致。
    //
    // 解法：在 effect 开始时设一个 cancelled 标志。useEffect 的 cleanup 在
    // 下次 effect 执行前被调用，此时把 cancelled 置 true；之前那次异步的
    // .then() 会检查这个标志，发现已取消就不再 setRenderedHtml，从而丢弃
    // 过期结果。
    let cancelled = false;

    renderMarkdown(markdown)
      .then((html) => rewritePreviewImageSources(html, noteRelativePath))
      .then((html) => {
        if (!cancelled) {
          setRenderedHtml(html);
        }
      });

    return () => {
      // effect cleanup：将当前这次异步操作标记为已取消
      cancelled = true;
    };
  }, [markdown, noteRelativePath]); // markdown 每次变化都重新渲染

  // 编辑器滚动比例变化、或 HTML 重新渲染后同步预览位置
  // scrollRatio 为 undefined 时（初次挂载）跳过，避免奇怪跳动
  // renderedHtml 加入依赖：HTML 渲染完 scrollHeight 才稳定，渲染后需重新对齐
  useEffect(() => {
    if (scrollRatio === undefined) return;
    const el = containerRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return;
    el.scrollTop = scrollRatio * max;
  }, [scrollRatio, renderedHtml]);

  useEffect(() => {
    const root = containerRef.current?.querySelector<HTMLElement>("[data-markdown-preview-content]");
    if (!root) return;

    const timeoutIds = new Set<number>();

    for (const code of root.querySelectorAll<HTMLElement>("pre > code")) {
      const pre = code.parentElement;
      if (!pre || pre.dataset.copyDecorated === "true") continue;

      pre.dataset.copyDecorated = "true";
      pre.classList.add("relative");

      const button = document.createElement("button");
      button.type = "button";
      button.dataset.codeCopyButton = "true";
      button.setAttribute("aria-label", "复制代码");
      button.title = "复制代码";
      button.className =
        "code-copy-button absolute right-3 top-3 z-50 grid h-8 w-8 place-items-center rounded-sm border border-white/80 bg-white text-zinc-950 shadow-xl ring-1 ring-black/30 backdrop-blur transition hover:scale-105 hover:border-white hover:bg-zinc-100 hover:text-black hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
      setCodeCopyButtonIcon(button, "copy");

      pre.append(button);
    }

    const setButtonStatus = (button: HTMLButtonElement, status: "copied" | "failed") => {
      if (status === "copied") {
        setCodeCopyButtonIcon(button, "check");
        button.title = "已复制";
        button.setAttribute("aria-label", "已复制");
      } else {
        button.title = "复制失败";
        button.setAttribute("aria-label", "复制失败");
      }

      const timeoutId = window.setTimeout(() => {
        setCodeCopyButtonIcon(button, "copy");
        button.title = "复制代码";
        button.setAttribute("aria-label", "复制代码");
        timeoutIds.delete(timeoutId);
      }, 1400);
      timeoutIds.add(timeoutId);
    };

    const handleCopyClick = async (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest<HTMLButtonElement>("button[data-code-copy-button='true']");
      if (!button || !root.contains(button)) return;

      const code = button.closest("pre")?.querySelector<HTMLElement>(":scope > code");
      const text = code?.textContent ?? "";

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

  return (
    // 外层容器：支持 className 覆盖，负责滚动
    <div ref={containerRef} className={cn("h-full w-full min-w-0 overflow-auto", className)}>
      {/*
       * dangerouslySetInnerHTML 说明：
       * 这里的 HTML 来自我们自己的 unified 管线（remark → rehype → HTML），
       * 内容是用户本地编写的 Markdown，不是来自外部不受信任的网络输入。
       * 作为本地桌面应用，XSS 风险可接受；但要注意如果未来引入远程内容，
       * 需要在管线中加 rehype-sanitize 做净化。
       */}
      <div
        data-markdown-preview-content
        className={cn(
          // 基础排版：内边距、字号、文字颜色
          "min-w-0 max-w-full overflow-x-hidden break-words p-5 text-[calc(0.875rem*var(--content-zoom,1))] text-foreground",

          // ── 标题 ──────────────────────────────────────────────────────
          "[&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:text-[calc(1.5rem*var(--content-zoom,1))] [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:tracking-tight",
          "[&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:text-[calc(1.25rem*var(--content-zoom,1))] [&_h2]:font-semibold [&_h2]:leading-tight",
          "[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-[calc(1.125rem*var(--content-zoom,1))] [&_h3]:font-semibold [&_h3]:leading-snug",
          "[&_h4]:mb-2 [&_h4]:mt-3 [&_h4]:text-[calc(1rem*var(--content-zoom,1))] [&_h4]:font-semibold",

          // ── 段落 ──────────────────────────────────────────────────────
          "[&_p]:mb-3 [&_p]:leading-relaxed",

          // ── 行内代码（inline code）──────────────────────────────────────
          // 注意：pre > code 是代码块，样式会在下面被 reset，不受这条影响
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[calc(0.75rem*var(--content-zoom,1))]",

          // ── 代码块（pre + code）─────────────────────────────────────────
          // pre 只加间距和圆角；背景色和文字颜色由 Shiki 注入的 inline style 控制，
          // 不在这里设置，避免与 Shiki 生成的 style 属性冲突。
          "[&_pre]:my-4 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-sm",
          // reset 行内 code 样式，防止 pre > code 继承背景和 padding
          "[&_pre_code]:inline-block [&_pre_code]:min-w-max [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit",
          "[&_pre_.line]:block [&_pre_.line]:min-h-[1.4em]",
          "[&_pre_.oi-code-line-highlight]:mx-[-1rem] [&_pre_.oi-code-line-highlight]:border-l-2 [&_pre_.oi-code-line-highlight]:border-amber-300/80 [&_pre_.oi-code-line-highlight]:bg-amber-300/15 [&_pre_.oi-code-line-highlight]:px-4",

          // ── 引用块 ────────────────────────────────────────────────────
          "[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",

          // Luogu-style directive callouts.
          "[&_.oi-callout]:my-4 [&_.oi-callout]:overflow-hidden [&_.oi-callout]:rounded-sm [&_.oi-callout]:border [&_.oi-callout]:bg-muted/35",
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

          // ── 列表 ──────────────────────────────────────────────────────
          "[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6",
          "[&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6",
          "[&_li]:mb-1",

          // ── 链接 ──────────────────────────────────────────────────────
          "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
          "[&_a:hover]:opacity-75",

          // ── 分隔线 ────────────────────────────────────────────────────
          "[&_hr]:my-6 [&_hr]:border-border",

          // ── 表格 ──────────────────────────────────────────────────────
          "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse",
          "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
          "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2",

          // ── 加粗 / 斜体 ───────────────────────────────────────────────
          "[&_strong]:font-semibold",
          "[&_em]:italic",

          // ── KaTeX ─────────────────────────────────────────────────────
          // .katex 和 .katex-display 的样式由 katex/dist/katex.min.css 控制，
          // 这里只给块级公式加上下间距，其余不干预。
          "[&_.katex-display]:my-4",
        )}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
}

function getDirectCalloutTitle(callout: HTMLElement): HTMLElement | null {
  const title = callout.querySelector<HTMLElement>(":scope > .oi-callout-title");
  return title;
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
