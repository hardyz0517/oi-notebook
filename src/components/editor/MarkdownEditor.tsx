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
  className?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  className,
}: MarkdownEditorProps) {
  // 容器 div 的 DOM 引用，CodeMirror 需要一个真实的 DOM 节点作为挂载点
  const containerRef = useRef<HTMLDivElement>(null);

  // 保存 EditorView 实例，供外部 value 同步时使用
  const viewRef = useRef<EditorView | null>(null);

  // 把 onChange 存进 ref，这样 update listener 永远调用最新版本的回调，
  // 同时又不需要把 onChange 加入 useEffect 的依赖数组（否则每次父组件重渲
  // 都会重建整个编辑器）。
  const onChangeFn = useRef(onChange);
  useEffect(() => {
    onChangeFn.current = onChange;
  }, [onChange]);

  // 记录"编辑器自己最后产生的值"，用来打破同步死循环：
  // 用户输入 → onChange → 父组件更新 value prop → 下面的 useEffect 同步回来
  // → 如果不判断，会再次触发 onChange → 无限循环。
  // 通过比较 value 和这个 ref，可以知道变化是"外部文件切换"还是"自己刚才打的字"。
  const editorOwnValue = useRef(value);

  // ─── 挂载 EditorView，仅执行一次 ─────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value, // 用初始 value 作为初始文档内容
        extensions: [
          // Markdown 语法高亮与解析。
          // codeLanguages 选项可以开启代码块内的语言高亮（需要额外安装
          // @codemirror/language-data），此处暂不开启，Shiki 负责预览侧高亮。
          markdown(),

          // One Dark 主题，与应用整体深色风格保持一致
          oneDark,

          // 软换行：Markdown 编辑必须打开，否则长行会溢出容器
          EditorView.lineWrapping,

          // 监听文档变化，把最新内容通过 onChange 同步给 React
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) {
              const newValue = update.state.doc.toString();
              // 先更新 "编辑器自己产生的值"，再调 onChange，
              // 这样当父组件把新 value 传回来时，下面的 useEffect 能识别出
              // "这是我自己刚打的字，不需要再 dispatch 一次"。
              editorOwnValue.current = newValue;
              onChangeFn.current(newValue);
            }
          }),

          // 覆盖 CodeMirror 默认样式，使其融入应用整体设计
          EditorView.theme({
            // 让编辑器撑满父容器
            "&": { height: "100%" },
            // scroller 负责滚动，设 overflow:auto 并继承字体
            // （Lyra 主题在 html 上挂了 JetBrains Mono，inherit 能拿到）
            ".cm-scroller": { overflow: "auto", fontFamily: "inherit" },
            // 内容区留内边距，阅读体验更好
            ".cm-content": { padding: "12px 16px", minHeight: "100%" },
            // 去掉聚焦时 CodeMirror 自带的 outline，由主题的 focus-visible 接管
            ".cm-focused": { outline: "none" },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    // 用初始 value 初始化追踪 ref（与 EditorState.create 保持一致）
    editorOwnValue.current = value;

    // cleanup：组件卸载时销毁编辑器实例。
    // React StrictMode 下 useEffect 会执行 mount → unmount → mount 两轮，
    // 必须在这里 destroy，否则会出现两个编辑器实例叠在同一个 DOM 节点上。
    return () => {
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
