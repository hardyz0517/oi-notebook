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
      button.textContent = "复制";
      button.dataset.codeCopyButton = "true";
      button.setAttribute("aria-label", "复制代码块");
      button.className =
        "absolute right-2 top-2 z-10 rounded-sm border border-border/70 bg-background/85 px-2 py-1 text-[11px] leading-none text-muted-foreground shadow-sm backdrop-blur transition hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

      pre.append(button);
    }

    const setButtonStatus = (button: HTMLButtonElement, label: string) => {
      button.textContent = label;
      const timeoutId = window.setTimeout(() => {
        button.textContent = "复制";
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
        setButtonStatus(button, "已复制");
      } catch (error) {
        console.warn("Copy code block failed:", error);
        setButtonStatus(button, "复制失败");
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
          "min-w-0 max-w-full overflow-x-hidden break-words p-5 text-sm text-foreground",

          // ── 标题 ──────────────────────────────────────────────────────
          "[&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:tracking-tight",
          "[&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:leading-tight",
          "[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:leading-snug",
          "[&_h4]:mb-2 [&_h4]:mt-3 [&_h4]:text-base [&_h4]:font-semibold",

          // ── 段落 ──────────────────────────────────────────────────────
          "[&_p]:mb-3 [&_p]:leading-relaxed",

          // ── 行内代码（inline code）──────────────────────────────────────
          // 注意：pre > code 是代码块，样式会在下面被 reset，不受这条影响
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",

          // ── 代码块（pre + code）─────────────────────────────────────────
          // pre 只加间距和圆角；背景色和文字颜色由 Shiki 注入的 inline style 控制，
          // 不在这里设置，避免与 Shiki 生成的 style 属性冲突。
          "[&_pre]:my-4 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-sm",
          // reset 行内 code 样式，防止 pre > code 继承背景和 padding
          "[&_pre_code]:inline-block [&_pre_code]:min-w-max [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit",

          // ── 引用块 ────────────────────────────────────────────────────
          "[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",

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
