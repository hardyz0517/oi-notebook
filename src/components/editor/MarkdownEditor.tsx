import { type ComponentType, useEffect, useRef, useState } from "react";
import { history, historyKeymap } from "@codemirror/commands";
import { EditorView, keymap, ViewUpdate } from "@codemirror/view";
import { EditorState, Transaction } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  AArrowDown,
  AArrowUp,
  Bold,
  Code,
  Code2,
  Image,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Sigma,
  SquareFunction,
  Strikethrough,
  Table2,
  X,
} from "lucide-react";
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
  zoomLabel?: string;
  className?: string;
}

interface MarkdownSnippet {
  text: string;
  anchorOffset?: number;
  headOffset?: number;
}

interface MarkdownToolbarAction {
  id: string;
  label: string;
  title: string;
  icon?: ComponentType<{ className?: string }>;
  run: (view: EditorView, helpers: MarkdownToolbarActionHelpers) => void;
}

interface MarkdownToolbarGroup {
  id: string;
  actions: MarkdownToolbarAction[];
}

type InsertDialogKind = "link" | "image" | "code-block" | "table";

interface MarkdownToolbarActionHelpers {
  openInsertDialog: (kind: InsertDialogKind, view: EditorView) => void;
}

interface InsertDialogState {
  kind: InsertDialogKind;
  selectionFrom: number;
  selectionTo: number;
}

interface MarkdownShortcutBinding {
  key: string;
  actionId: string;
}

const placeholderSnippet = (before: string, placeholder: string, after: string): MarkdownSnippet => ({
  text: `${before}${placeholder}${after}`,
  anchorOffset: before.length,
  headOffset: before.length + placeholder.length,
});

const insertMarkdownSnippet = (
  view: EditorView,
  createSnippet: (selection: string) => MarkdownSnippet,
) => {
  const selection = view.state.selection.main;
  const selectedText = view.state.sliceDoc(selection.from, selection.to);
  const snippet = createSnippet(selectedText);
  const anchor = snippet.anchorOffset === undefined
    ? selection.from + snippet.text.length
    : selection.from + snippet.anchorOffset;
  const head = snippet.headOffset === undefined
    ? anchor
    : selection.from + snippet.headOffset;

  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: snippet.text },
    selection: { anchor, head },
    scrollIntoView: true,
  });
  view.focus();
};

const createWrappedSelectionSnippet = (
  before: string,
  placeholder: string,
  after: string = before,
) => (
  (selection: string): MarkdownSnippet =>
    selection ? { text: `${before}${selection}${after}` } : placeholderSnippet(before, placeholder, after)
);

const insertMarkdownText = (
  view: EditorView,
  selectionFrom: number,
  selectionTo: number,
  text: string,
) => {
  view.dispatch({
    changes: { from: selectionFrom, to: selectionTo, insert: text },
    selection: { anchor: selectionFrom + text.length },
    scrollIntoView: true,
  });
  view.focus();
};

const transformSelectedLines = (
  view: EditorView,
  transformLine: (line: string) => string,
) => {
  const selection = view.state.selection.main;
  const fromLine = view.state.doc.lineAt(selection.from);
  const toLine = view.state.doc.lineAt(
    selection.empty ? selection.to : Math.max(selection.from, selection.to - 1),
  );
  const lineMaps: Array<{
    oldFrom: number;
    oldTo: number;
    newFrom: number;
    oldText: string;
    newText: string;
  }> = [];
  let replacement = "";
  let nextNewFrom = fromLine.from;

  for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const oldText = line.text;
    const newText = transformLine(oldText);

    if (lineNumber > fromLine.number) {
      replacement += "\n";
      nextNewFrom += 1;
    }

    lineMaps.push({
      oldFrom: line.from,
      oldTo: line.to,
      newFrom: nextNewFrom,
      oldText,
      newText,
    });
    replacement += newText;
    nextNewFrom += newText.length;
  }

  const mapPosition = (position: number) => {
    let deltaBeforeLine = 0;

    for (const lineMap of lineMaps) {
      if (position < lineMap.oldFrom) return position + deltaBeforeLine;

      const delta = lineMap.newText.length - lineMap.oldText.length;
      if (position <= lineMap.oldTo) {
        const offset = position - lineMap.oldFrom;
        return lineMap.newFrom + Math.max(0, Math.min(lineMap.newText.length, offset + delta));
      }

      deltaBeforeLine += delta;
    }

    return position + deltaBeforeLine;
  };

  view.dispatch({
    changes: { from: fromLine.from, to: toLine.to, insert: replacement },
    selection: {
      anchor: mapPosition(selection.anchor),
      head: mapPosition(selection.head),
    },
    scrollIntoView: true,
  });
  view.focus();
};

const prefixSelectedLines = (
  view: EditorView,
  createPrefix: (lineIndex: number) => string,
) => {
  const selection = view.state.selection.main;
  const fromLine = view.state.doc.lineAt(selection.from);
  const toLine = view.state.doc.lineAt(
    selection.empty ? selection.to : Math.max(selection.from, selection.to - 1),
  );
  const from = fromLine.from;
  const to = toLine.to;
  const selectedLines = view.state.sliceDoc(from, to).split("\n");
  const replacement = selectedLines
    .map((line, index) => `${createPrefix(index)}${line}`)
    .join("\n");

  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from, head: from + replacement.length },
    scrollIntoView: true,
  });
  view.focus();
};

const prefixListSelectedLines = (
  view: EditorView,
  createPrefix: (lineIndex: number) => string,
  existingPrefixPattern: RegExp,
) => {
  let lineIndex = 0;

  transformSelectedLines(view, (line) => {
    if (existingPrefixPattern.test(line)) {
      lineIndex += 1;
      return line;
    }

    const [, indent = "", content = ""] = line.match(/^(\s*)(.*)$/) ?? [];
    const prefix = createPrefix(lineIndex);
    lineIndex += 1;

    return `${indent}${prefix}${content}`;
  });
};

const insertBlockquote = (view: EditorView) => {
  const selection = view.state.selection.main;

  if (selection.empty) {
    const line = view.state.doc.lineAt(selection.from);
    const existingText = line.text;
    const insertText = existingText.length === 0 ? "> " : `> ${existingText}`;
    const cursorOffset = existingText.length === 0 ? 2 : insertText.length;

    view.dispatch({
      changes: { from: line.from, to: line.to, insert: insertText },
      selection: { anchor: line.from + cursorOffset },
      scrollIntoView: true,
    });
    view.focus();
    return;
  }

  prefixSelectedLines(view, () => "> ");
};

const insertHorizontalRule = (view: EditorView) => {
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.from);
  const beforeText = view.state.doc.sliceString(0, line.from);
  const afterText = view.state.doc.sliceString(line.to);
  const needsLeadingBreaks = beforeText.length === 0 ? "" : beforeText.endsWith("\n\n") ? "" : beforeText.endsWith("\n") ? "\n" : "\n\n";
  const needsTrailingBreaks = afterText.length === 0 ? "" : afterText.startsWith("\n\n") ? "" : afterText.startsWith("\n") ? "\n" : "\n\n";
  const insertText = `${needsLeadingBreaks}---${needsTrailingBreaks}`;
  const insertFrom = line.from;
  const insertTo = selection.empty ? line.from : selection.to;

  view.dispatch({
    changes: { from: insertFrom, to: insertTo, insert: insertText },
    selection: { anchor: insertFrom + insertText.length },
    scrollIntoView: true,
  });
  view.focus();
};

const changeHeadingLevel = (view: EditorView, direction: "increase" | "decrease") => {
  transformSelectedLines(view, (line) => {
    if (line.trim().length === 0) return line;

    const headingMatch = line.match(/^(\s{0,3})(#{1,6})(\s+|$)(.*)$/);
    if (headingMatch) {
      const [, indent, hashes, space, content] = headingMatch;
      const currentLevel = hashes.length;
      const nextLevel = direction === "increase"
        ? Math.max(1, currentLevel - 1)
        : Math.min(6, currentLevel + 1);
      return `${indent}${"#".repeat(nextLevel)}${space || " "}${content}`;
    }

    const paragraphMatch = line.match(/^(\s*)(.*)$/);
    const indent = paragraphMatch?.[1] ?? "";
    const content = paragraphMatch?.[2] ?? line;
    return `${indent}# ${content}`;
  });
};

const clampTableSize = (value: number) => Math.min(20, Math.max(1, Math.trunc(value)));

const createEmptyTableCells = (rows: number, columns: number) => (
  Array.from({ length: clampTableSize(rows) }, () =>
    Array.from({ length: clampTableSize(columns) }, () => ""),
  )
);

const resizeTableCells = (cells: string[][], rows: number, columns: number) => (
  Array.from({ length: clampTableSize(rows) }, (_, rowIndex) =>
    Array.from({ length: clampTableSize(columns) }, (_, columnIndex) =>
      cells[rowIndex]?.[columnIndex] ?? "",
    ),
  )
);

const normalizeMarkdownTableCell = (cell: string) => cell
  .replace(/\r?\n/g, " ")
  .replace(/\|/g, "\\|")
  .trim();

const createMarkdownTable = (cells: string[][]) => {
  const safeRows = Math.max(1, cells.length);
  const safeColumns = Math.max(1, cells[0]?.length ?? 1);
  const normalizedCells = resizeTableCells(cells, safeRows, safeColumns)
    .map((row) => row.map(normalizeMarkdownTableCell));
  const header = normalizedCells[0];
  const separator = Array.from({ length: safeColumns }, () => "---");
  const bodyRows = normalizedCells.slice(1);
  const renderRow = (cells: string[]) => `| ${cells.join(" | ")} |`;

  return [renderRow(header), renderRow(separator), ...bodyRows.map(renderRow)].join("\n");
};

const markdownShortcutBindings: MarkdownShortcutBinding[] = [
  { key: "Mod-b", actionId: "bold" },
  { key: "Mod-i", actionId: "italic" },
  { key: "Mod-m", actionId: "inline-math" },
  { key: "Mod-Shift-h", actionId: "divider" },
  { key: "Mod-Shift-q", actionId: "quote" },
  { key: "Mod-Shift-7", actionId: "unordered-list" },
  { key: "Mod-Shift-8", actionId: "ordered-list" },
  { key: "Mod-Shift-9", actionId: "task-list" },
];

const markdownToolbarGroups: MarkdownToolbarGroup[] = [
  {
    id: "structure",
    actions: [
      {
        id: "heading-increase",
        label: "H+",
        title: "\u6807\u9898\u589e\u5927\u4e00\u7ea7",
        icon: AArrowUp,
        run: (view) => changeHeadingLevel(view, "increase"),
      },
      {
        id: "heading-decrease",
        label: "H-",
        title: "\u6807\u9898\u51cf\u5c0f\u4e00\u7ea7",
        icon: AArrowDown,
        run: (view) => changeHeadingLevel(view, "decrease"),
      },
      {
        id: "divider",
        label: "---",
        title: "Horizontal rule",
        icon: Minus,
        run: (view) => insertHorizontalRule(view),
      },
    ],
  },
  {
    id: "inline",
    actions: [
      {
        id: "bold",
        label: "B",
        title: "Bold",
        icon: Bold,
        run: (view) => insertMarkdownSnippet(view, createWrappedSelectionSnippet("**", "bold text")),
      },
      {
        id: "italic",
        label: "I",
        title: "Italic",
        icon: Italic,
        run: (view) => insertMarkdownSnippet(view, createWrappedSelectionSnippet("*", "italic text")),
      },
      {
        id: "strike",
        label: "S",
        title: "Strikethrough",
        icon: Strikethrough,
        run: (view) => insertMarkdownSnippet(view, (selection) =>
          selection ? { text: `~~${selection}~~` } : placeholderSnippet("~~", "deleted text", "~~"),
        ),
      },
      {
        id: "inline-code",
        label: "<>",
        title: "Inline code",
        icon: Code,
        run: (view) => insertMarkdownSnippet(view, (selection) =>
          selection ? { text: `\`${selection}\`` } : placeholderSnippet("`", "code", "`"),
        ),
      },
      {
        id: "inline-math",
        label: "√x",
        title: "Inline formula",
        icon: Sigma,
        run: (view) => insertMarkdownSnippet(view, createWrappedSelectionSnippet("$", "a_i")),
      },
    ],
  },
  {
    id: "insert",
    actions: [
      {
        id: "link",
        label: "Link",
        title: "Link",
        icon: Link,
        run: (view, helpers) => helpers.openInsertDialog("link", view),
      },
      {
        id: "image",
        label: "Img",
        title: "Image",
        icon: Image,
        run: (view, helpers) => helpers.openInsertDialog("image", view),
      },
      {
        id: "code-block",
        label: "Code",
        title: "C++ code block",
        icon: Code2,
        run: (view, helpers) => helpers.openInsertDialog("code-block", view),
      },
      {
        id: "table",
        label: "Table",
        title: "Table",
        icon: Table2,
        run: (view, helpers) => helpers.openInsertDialog("table", view),
      },
      {
        id: "block-math",
        label: "$$",
        title: "Block formula",
        icon: SquareFunction,
        run: (view) => insertMarkdownSnippet(view, (selection) =>
          selection
            ? { text: `$$\n${selection}\n$$` }
            : placeholderSnippet("$$\n", "a_i = b_i + c_i", "\n$$"),
        ),
      },
    ],
  },
  {
    id: "block",
    actions: [
      {
        id: "quote",
        label: ">",
        title: "Quote",
        icon: Quote,
        run: (view) => insertBlockquote(view),
      },
      {
        id: "unordered-list",
        label: "-",
        title: "Unordered list",
        icon: List,
        run: (view) => prefixListSelectedLines(view, () => "- ", /^\s*-\s+/),
      },
      {
        id: "ordered-list",
        label: "1.",
        title: "Ordered list",
        icon: ListOrdered,
        run: (view) => prefixListSelectedLines(view, (index) => `${index + 1}. `, /^\s*\d+\.\s+/),
      },
      {
        id: "task-list",
        label: "[]",
        title: "Task list",
        icon: ListChecks,
        run: (view) => prefixListSelectedLines(view, () => "- [ ] ", /^\s*-\s\[\s\]\s+/),
      },
    ],
  },
];

const markdownToolbarActionMap = new Map(
  markdownToolbarGroups.flatMap((group) => group.actions.map((action) => [action.id, action] as const)),
);

export default function MarkdownEditor({
  value,
  onChange,
  onPasteImage,
  onScroll,
  zoomLabel,
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

  const [insertDialog, setInsertDialog] = useState<InsertDialogState | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [codeLanguage, setCodeLanguage] = useState("cpp");
  const [codeContent, setCodeContent] = useState("");
  const [tableRows, setTableRows] = useState(3);
  const [tableColumns, setTableColumns] = useState(3);
  const [tableCells, setTableCells] = useState<string[][]>(() => createEmptyTableCells(3, 3));

  const updateTableSize = (rows: number, columns: number) => {
    const safeRows = clampTableSize(rows);
    const safeColumns = clampTableSize(columns);

    setTableRows(safeRows);
    setTableColumns(safeColumns);
    setTableCells((currentCells) => resizeTableCells(currentCells, safeRows, safeColumns));
  };

  const updateTableCell = (rowIndex: number, columnIndex: number, value: string) => {
    setTableCells((currentCells) => currentCells.map((row, currentRowIndex) =>
      row.map((cell, currentColumnIndex) =>
        currentRowIndex === rowIndex && currentColumnIndex === columnIndex ? value : cell,
      ),
    ));
  };

  const openInsertDialog = (kind: InsertDialogKind, view: EditorView) => {
    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to);

    setInsertDialog({ kind, selectionFrom: selection.from, selectionTo: selection.to });
    if (kind === "link") {
      setLinkUrl("");
      setLinkText(selectedText);
    } else if (kind === "image") {
      setImageUrl("");
      setImageAlt(selectedText);
    } else if (kind === "code-block") {
      setCodeLanguage("cpp");
      setCodeContent(selectedText);
    } else if (kind === "table") {
      setTableRows(3);
      setTableColumns(3);
      setTableCells(createEmptyTableCells(3, 3));
    }
  };

  const executeToolbarAction = (actionId: string, view: EditorView) => {
    const action = markdownToolbarActionMap.get(actionId);
    if (!action) return false;

    action.run(view, { openInsertDialog });
    return true;
  };

  const closeInsertDialog = () => {
    setInsertDialog(null);
    requestAnimationFrame(() => viewRef.current?.focus());
  };

  const confirmInsertDialog = () => {
    const view = viewRef.current;
    if (!view || !insertDialog) return;

    let markdownText = "";
    if (insertDialog.kind === "link") {
      markdownText = `[${linkText || "链接介绍"}](${linkUrl || "https://example.com"})`;
    } else if (insertDialog.kind === "image") {
      markdownText = `![${imageAlt || "图片描述"}](${imageUrl || "image-url"})`;
    } else if (insertDialog.kind === "code-block") {
      markdownText = `\`\`\`${codeLanguage || "cpp"}\n${codeContent}\n\`\`\``;
    } else {
      markdownText = createMarkdownTable(tableCells);
    }

    setInsertDialog(null);
    insertMarkdownText(view, insertDialog.selectionFrom, insertDialog.selectionTo, markdownText);
  };

  useEffect(() => {
    if (!insertDialog) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeInsertDialog();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [insertDialog]);

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

          history(),
          keymap.of([
            ...markdownShortcutBindings.map(({ key, actionId }) => ({
              key,
              run: (view: EditorView) => executeToolbarAction(actionId, view),
            })),
            ...historyKeymap,
          ]),

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
            ".cm-content": {
              padding: "12px 16px",
              minHeight: "100%",
              caretColor: "var(--foreground)",
              fontSize: "calc(0.875rem * var(--content-zoom, 1))",
            },
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
      annotations: Transaction.addToHistory.of(false),
    });
  }, [value]);

  return (
    <div className={cn("flex h-full w-full min-w-0 flex-col overflow-hidden", className)}>
      <div className="flex min-h-8 shrink-0 flex-wrap items-center gap-0.5 border-b border-border bg-background px-2 py-1">
        {markdownToolbarGroups.map((group, groupIndex) => (
          <div key={group.id} className="flex items-center gap-0.5">
            {groupIndex > 0 && <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />}
            {group.actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  title={action.title}
                  aria-label={action.title}
                  className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm px-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onMouseDown={(event) => {
                    const view = viewRef.current;
                    if (!view) return;

                    event.preventDefault();
                    action.run(view, { openInsertDialog });
                  }}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5" /> : action.label}
                </button>
              );
            })}
          </div>
        ))}
        {zoomLabel && (
          <span className="ml-auto shrink-0 px-1.5 text-[10px] font-semibold text-muted-foreground">
            {zoomLabel}
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-hidden"
      />
      {insertDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="markdown-insert-dialog-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeInsertDialog();
          }}
        >
          <form
            className={cn(
              "grid w-full gap-4 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-xl",
              insertDialog.kind === "table" ? "max-w-3xl" : "max-w-md",
            )}
            onSubmit={(event) => {
              event.preventDefault();
              confirmInsertDialog();
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="markdown-insert-dialog-title" className="text-sm font-semibold">
                {insertDialog.kind === "link" && "插入链接"}
                {insertDialog.kind === "image" && "插入图片"}
                {insertDialog.kind === "code-block" && "插入代码"}
                {insertDialog.kind === "table" && "插入表格"}
              </h2>
              <button
                type="button"
                title="关闭"
                aria-label="关闭"
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={closeInsertDialog}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {insertDialog.kind === "link" && (
              <div className="grid gap-3">
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  链接地址
                  <input
                    autoFocus
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder="https://www.luogu.com.cn/problem/P1001"
                    className="h-9 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  链接介绍
                  <input
                    value={linkText}
                    onChange={(event) => setLinkText(event.target.value)}
                    placeholder="洛谷题目"
                    className="h-9 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
                  />
                </label>
              </div>
            )}

            {insertDialog.kind === "image" && (
              <div className="grid gap-3">
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  图片地址
                  <input
                    autoFocus
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                    placeholder="assets/example.png"
                    className="h-9 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  图片描述
                  <input
                    value={imageAlt}
                    onChange={(event) => setImageAlt(event.target.value)}
                    placeholder="图片描述"
                    className="h-9 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
                  />
                </label>
              </div>
            )}

            {insertDialog.kind === "code-block" && (
              <div className="grid gap-3">
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  选择语言
                  <select
                    autoFocus
                    value={codeLanguage}
                    onChange={(event) => setCodeLanguage(event.target.value)}
                    className="h-9 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
                  >
                    <option value="cpp">cpp</option>
                    <option value="c">c</option>
                    <option value="python">python</option>
                    <option value="java">java</option>
                    <option value="rust">rust</option>
                    <option value="text">text</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  代码
                  <textarea
                    value={codeContent}
                    onChange={(event) => setCodeContent(event.target.value)}
                    placeholder="#include <bits/stdc++.h>"
                    className="min-h-44 resize-y rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
                  />
                </label>
              </div>
            )}

            {insertDialog.kind === "table" && (
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  行数
                  <input
                    autoFocus
                    type="number"
                    min={1}
                    max={20}
                    value={tableRows}
                    onChange={(event) => updateTableSize(Number(event.target.value), tableColumns)}
                    className="h-9 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  列数
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={tableColumns}
                    onChange={(event) => updateTableSize(tableRows, Number(event.target.value))}
                    className="h-9 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
                  />
                </label>
                </div>

                <div className="max-h-[48vh] overflow-auto rounded-sm border border-border">
                  <div
                    className="grid min-w-max"
                    style={{
                      gridTemplateColumns: `repeat(${tableColumns}, minmax(8rem, 1fr))`,
                    }}
                  >
                    {tableCells.map((row, rowIndex) =>
                      row.map((cell, columnIndex) => (
                        <input
                          key={`${rowIndex}-${columnIndex}`}
                          value={cell}
                          onChange={(event) => updateTableCell(rowIndex, columnIndex, event.target.value)}
                          placeholder={rowIndex === 0
                            ? `Header ${columnIndex + 1}`
                            : `Cell ${rowIndex},${columnIndex + 1}`}
                          aria-label={rowIndex === 0
                            ? `Header ${columnIndex + 1}`
                            : `Row ${rowIndex} column ${columnIndex + 1}`}
                          className={cn(
                            "h-9 min-w-0 border-b border-r border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus:z-10 focus:border-ring",
                            rowIndex === 0 && "bg-muted/40 font-semibold",
                            columnIndex === tableColumns - 1 && "border-r-0",
                            rowIndex === tableRows - 1 && "border-b-0",
                          )}
                        />
                      )),
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-sm border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={closeInsertDialog}
              >
                取消
              </button>
              <button
                type="submit"
                className="inline-flex h-8 items-center justify-center rounded-sm bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                确认
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
