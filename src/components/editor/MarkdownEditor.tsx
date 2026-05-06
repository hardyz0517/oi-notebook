import { useEffect, useRef } from "react";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { cn } from "@/lib/utils";

// ref 转发说明（为什么不用 forwardRef）：
// React 19 已经把 ref 改成普通 prop，不再需要 forwardRef 包装。
// 当前阶段没有调用命令式 API 的需求（插入图片等功能在后续迭代再做），
// 暂不暴露 EditorView ref，保持组件接口简洁。届时直接加 ref prop 即可。

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onPasteImage?: (file: File) => Promise<string>;
  onScroll?: (ratio: number) => void;
  className?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  onPasteImage,
  onScroll,
  className,
}: MarkdownEditorProps) {
  // 容器 div 的 DOM 引用，CodeMirror 需要一个真实的 DOM 节点作为挂载点
  const containerRef = useRef<HTMLDivElement>(null);

  // 保存 EditorView 实例，供外部 value 同步时使用
  const viewRef = useRef<EditorView | null>(null);

  // 把 onChange / onScroll 存进 ref，这样 listener 永远调用最新版本的回调，
  // 同时又不需要把它们加入 useEffect 的依赖数组（否则每次父组件重渲
  // 都会重建整个编辑器）。
  const onChangeFn = useRef(onChange);
  useEffect(() => {
    onChangeFn.current = onChange;
  }, [onChange]);

  const onPasteImageFn = useRef(onPasteImage);
  useEffect(() => {
    onPasteImageFn.current = onPasteImage;
  }, [onPasteImage]);

  const onScrollFn = useRef(onScroll);
  useEffect(() => {
    onScrollFn.current = onScroll;
  }, [onScroll]);

  // 记录"编辑器自己最后产生的值"，用来打破同步死循环：
  // 用户输入 → onChange → 父组件更新 value prop → 下面的 useEffect 同步回来
  // → 如果不判断，会再次触发 onChange → 无限循环。
  // 通过比较 value 和这个 ref，可以知道变化是"外部文件切换"还是"自己刚才打的字"。
  const editorOwnValue = useRef(value);

  // 上一次上报给父组件的滚动比例，小于 0.005 的变化不上报，避免抖动
  const lastRatioRef = useRef(0);

  // ─── 挂载 EditorView，仅执行一次 ─────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value, // 用初始 value 作为初始文档内容
        extensions: [
          // Markdown 语法高亮与解析。
          markdown(),

          // One Dark 主题，与应用整体深色风格保持一致
          oneDark,

          // 软换行：Markdown 编辑必须打开，否则长行会溢出容器
          EditorView.lineWrapping,

          EditorView.domEventHandlers({
            paste(event, view) {
              const items = Array.from(event.clipboardData?.items ?? []);
              const imageItem = items.find((item) => item.type.startsWith("image/"));
              const imageFile = imageItem?.getAsFile();
              const pasteImage = onPasteImageFn.current;

              if (!imageFile || !pasteImage) return false;

              event.preventDefault();
              pasteImage(imageFile)
                .then((markdownImage) => {
                  view.dispatch(view.state.replaceSelection(markdownImage));
                  view.focus();
                })
                .catch((e) => {
                  console.error("Paste image failed:", e);
                });

              return true;
            },
          }),

          // 监听文档变化，把最新内容通过 onChange 同步给 React
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) {
              const newValue = update.state.doc.toString();
              // 区分用户输入 vs 程序 dispatch：
              // 如果新内容已经等于 editorOwnValue.current，说明这次变化来自
              // "外部 value 变化" effect 的 dispatch（同步外部值），
              // 不应触发 onChange 否则会让 isDirty 被误置为 true。
              // 用户真实输入时，editorOwnValue.current 还是旧值，两者不等。
              if (newValue === editorOwnValue.current) return;
              editorOwnValue.current = newValue;
              onChangeFn.current(newValue);
            }
          }),

          // 覆盖 CodeMirror 默认样式，使其融入应用整体设计
          EditorView.theme({
            // 显式用 Lyra --background，覆盖 oneDark 自带的蓝灰背景
            "&": { height: "100%", backgroundColor: "var(--background)" },
            // scroller 和 gutters 也一并覆盖，保持三栏背景一致
            ".cm-scroller": {
              backgroundColor: "var(--background)",
              overflow: "auto",
              fontFamily: "inherit",
              scrollbarColor: "color-mix(in oklch, var(--muted-foreground) 45%, transparent) transparent",
              scrollbarWidth: "thin",
            },
            ".cm-scroller::-webkit-scrollbar": { width: "10px", height: "10px" },
            ".cm-scroller::-webkit-scrollbar-track": { backgroundColor: "transparent" },
            ".cm-scroller::-webkit-scrollbar-thumb": {
              backgroundColor: "color-mix(in oklch, var(--muted-foreground) 30%, transparent)",
              border: "3px solid transparent",
              backgroundClip: "content-box",
            },
            ".cm-scroller::-webkit-scrollbar-thumb:hover": {
              backgroundColor: "color-mix(in oklch, var(--muted-foreground) 45%, transparent)",
            },
            ".cm-gutters": { backgroundColor: "var(--background)", borderRight: "none" },
            // 内容区留内边距；caretColor 对齐主题 foreground
            ".cm-content": { padding: "12px 16px", minHeight: "100%", caretColor: "var(--foreground)" },
            // 去掉聚焦时 CodeMirror 自带的 outline，由主题的 focus-visible 接管
            ".cm-focused": { outline: "none" },
            // 选中态：聚焦时用 accent，非聚焦时用 muted，避免 oneDark 默认蓝色过强
            "&.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent)" },
            ".cm-selectionBackground": { backgroundColor: "var(--muted)" },
            // 光标颜色对齐主题 foreground，避免 oneDark 默认蓝色在 Lyra 里突兀
            ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
            // 当前行高亮在 Markdown 编辑场景下干扰视觉，关掉
            ".cm-activeLine": { backgroundColor: "transparent" },
            ".cm-activeLineGutter": { backgroundColor: "transparent" },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    // 用初始 value 初始化追踪 ref（与 EditorState.create 保持一致）
    editorOwnValue.current = value;

    // 监听编辑器滚动，计算 0~1 比例上报给父组件
    const handleScroll = () => {
      const el = view.scrollDOM;
      const max = el.scrollHeight - el.clientHeight;
      const ratio = max > 0 ? el.scrollTop / max : 0;
      if (Math.abs(ratio - lastRatioRef.current) >= 0.005) {
        lastRatioRef.current = ratio;
        onScrollFn.current?.(ratio);
      }
    };
    view.scrollDOM.addEventListener("scroll", handleScroll);

    // cleanup：组件卸载时销毁编辑器实例。
    // React StrictMode 下 useEffect 会执行 mount → unmount → mount 两轮，
    // 必须在这里 destroy，否则会出现两个编辑器实例叠在同一个 DOM 节点上。
    return () => {
      view.scrollDOM.removeEventListener("scroll", handleScroll);
      view.destroy();
      viewRef.current = null;
    };
  }, []); // 空依赖：只在挂载时执行一次，外部 value 变化由下面的 effect 处理

  // ─── 外部 value 变化时同步到编辑器（例如切换笔记文件）──────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // 如果新 value 就是编辑器自己刚产生的，说明是用户输入触发的更新，
    // 不需要再 dispatch 回去（否则光标位置会被重置）。
    if (value === editorOwnValue.current) return;

    // 外部变化（例如文件切换）：用新内容替换整个文档
    editorOwnValue.current = value;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full overflow-hidden", className)}
    />
  );
}
