import { type ComponentType, type ReactNode, useEffect, useRef, useState } from "react";
import { history, historyKeymap } from "@codemirror/commands";
import { Decoration, type DecorationSet, EditorView, keymap, lineNumbers, ViewUpdate } from "@codemirror/view";
import { EditorState, StateEffect, StateField, Transaction } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { foldGutter } from "@codemirror/language";
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

// ref 杞彂璇存槑锛堜负浠€涔堜笉鐢?forwardRef锛夛細
// React 19 宸茬粡鎶?ref 鏀规垚鏅€?prop锛屼笉鍐嶉渶瑕?forwardRef 鍖呰銆?// 褰撳墠闃舵娌℃湁璋冪敤鍛戒护寮?API 鐨勯渶姹傦紙插入图片绛夊姛鑳藉湪鍚庣画杩唬鍐嶅仛锛夛紝
// 鏆備笉鏆撮湶 EditorView ref锛屼繚鎸佺粍浠舵帴鍙ｇ畝娲併€傚眾鏃剁洿鎺ュ姞 ref prop 鍗冲彲銆?
interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  aiContextSelectionRange?: MarkdownEditorSelectionRange | null;
  onSelectionChange?: (selectedText: string, range: MarkdownEditorSelectionRange | null) => void;
  onPasteImage?: (file: File) => Promise<string>;
  onScroll?: (ratio: number) => void;
  hideToolbar?: boolean;
  className?: string;
  onToolbarApiChange?: (api: MarkdownEditorToolbarApi | null) => void;
  onScrollApiChange?: (api: MarkdownEditorScrollApi | null) => void;
}

export interface MarkdownEditorScrollApi {
  scrollToRatio: (ratio: number) => void;
}

export interface MarkdownEditorSelectionRange {
  from: number;
  to: number;
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

export interface MarkdownEditorToolbarApi {
  executeAction: (actionId: string) => boolean;
  hasEditor: () => boolean;
}

interface MarkdownEditorToolbarProps {
  disabled?: boolean;
  zoomLabel?: string;
  trailingContent?: ReactNode;
  onAction?: (actionId: string) => void;
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
  { key: "Mod-d", actionId: "strike" },
  { key: "Mod-i", actionId: "italic" },
  { key: "Mod-m", actionId: "inline-math" },
  { key: "Mod-Shift-h", actionId: "divider" },
  { key: "Mod-Shift-1", actionId: "code-block" },
  { key: "Mod-Shift-2", actionId: "table" },
  { key: "Mod-Shift-i", actionId: "image" },
  { key: "Mod-Shift-l", actionId: "link" },
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
        label: "鈭歺",
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

const setAiContextSelectionRange = StateEffect.define<MarkdownEditorSelectionRange | null>();

const aiContextSelectionDecoration = Decoration.mark({
  class: "cm-ai-context-selection",
});

const aiContextSelectionField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    let nextDecorations = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (!effect.is(setAiContextSelectionRange)) continue;

      const range = effect.value;
      if (!range || range.from === range.to) {
        nextDecorations = Decoration.none;
        continue;
      }

      const docLength = transaction.state.doc.length;
      const from = Math.max(0, Math.min(docLength, Math.min(range.from, range.to)));
      const to = Math.max(0, Math.min(docLength, Math.max(range.from, range.to)));
      nextDecorations = from === to ? Decoration.none : Decoration.set([
        aiContextSelectionDecoration.range(from, to),
      ]);
    }

    return nextDecorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function MarkdownEditorToolbar({
  disabled = false,
  zoomLabel,
  trailingContent,
  onAction,
}: MarkdownEditorToolbarProps) {
  return (
    <div className="markdown-toolbar flex min-h-8 shrink-0 flex-wrap items-center gap-0.5 border-b border-border bg-background px-2 py-1">
      {markdownToolbarGroups.map((group, groupIndex) => (
        <div
          key={group.id}
          className={cn("flex items-center gap-0.5", disabled && "pointer-events-none opacity-45")}
        >
          {groupIndex > 0 && <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />}
          {group.actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                title={action.title}
                aria-label={action.title}
                disabled={disabled}
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm px-1.5 font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none"
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (disabled) return;
                  onAction?.(action.id);
                }}
              >
                {Icon ? <Icon className="h-3.5 w-3.5" /> : action.label}
              </button>
            );
          })}
        </div>
      ))}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {zoomLabel && (
          <span className="shrink-0 px-1.5 font-semibold text-muted-foreground">
            {zoomLabel}
          </span>
        )}
        {trailingContent}
      </div>
    </div>
  );
}

export default function MarkdownEditor({
  value,
  onChange,
  aiContextSelectionRange,
  onSelectionChange,
  onPasteImage,
  onScroll,
  hideToolbar = false,
  className,
  onToolbarApiChange,
  onScrollApiChange,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeFn = useRef(onChange);
  useEffect(() => {
    onChangeFn.current = onChange;
  }, [onChange]);

  const onSelectionChangeFn = useRef(onSelectionChange);
  useEffect(() => {
    onSelectionChangeFn.current = onSelectionChange;
  }, [onSelectionChange]);

  const onPasteImageFn = useRef(onPasteImage);
  useEffect(() => {
    onPasteImageFn.current = onPasteImage;
  }, [onPasteImage]);

  const onScrollFn = useRef(onScroll);
  useEffect(() => {
    onScrollFn.current = onScroll;
  }, [onScroll]);

  const editorOwnValue = useRef(value);
  const isApplyingExternalValueRef = useRef(false);

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

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          markdown(),
          lineNumbers(),
          foldGutter({
            openText: "⌄",
            closedText: "›",
          }),
          oneDark,
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

          // Listen for document changes and sync the latest content back to React.
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) {
              const newValue = update.state.doc.toString();

              editorOwnValue.current = newValue;
              if (isApplyingExternalValueRef.current) return;
              onChangeFn.current(newValue);
            }
            if (update.selectionSet || update.docChanged) {
              const selection = update.state.selection.main;
              const selectedText = selection.empty ? "" : update.state.sliceDoc(selection.from, selection.to);
              const range = selection.empty ? null : {
                from: Math.min(selection.from, selection.to),
                to: Math.max(selection.from, selection.to),
              };
              onSelectionChangeFn.current?.(selectedText, range);
            }
          }),

          aiContextSelectionField,

          // Override CodeMirror defaults so the editor fits the app dark theme.
          EditorView.theme({
            "&": { height: "100%", backgroundColor: "var(--background)" },
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
            ".cm-gutters": {
              backgroundColor: "var(--background)",
              borderRight: "1px solid color-mix(in oklch, var(--border) 18%, transparent)",
              color: "var(--muted-foreground)",
              paddingLeft: "1px",
              paddingRight: "1px",
              fontFamily: "var(--font-mono)",
              fontSize: "calc(var(--editor-font-size, 14px) * var(--md-content-zoom, 1) * 0.92)",
              lineHeight: "var(--content-line-height, 1.7)",
              userSelect: "none",
            },
            ".cm-lineNumbers .cm-gutterElement": {
              minWidth: "2.55rem",
              padding: "0 0.45rem 0 0.3rem",
              fontVariantNumeric: "tabular-nums",
              textAlign: "right",
            },
            ".cm-foldGutter": {
              minWidth: "0.95rem",
            },
            ".cm-foldGutter .cm-gutterElement": {
              width: "0.95rem",
              padding: "0 0.12rem 0 0",
              textAlign: "center",
              color: "color-mix(in oklch, var(--muted-foreground) 86%, transparent)",
              cursor: "pointer",
            },
            ".cm-foldGutter .cm-gutterElement:hover": {
              color: "color-mix(in oklch, var(--foreground) 82%, var(--muted-foreground))",
            },
            ".cm-content": {
              padding: "12px 14px 12px 12px",
              minHeight: "100%",
              caretColor: "var(--foreground)",
              fontSize: "calc(var(--editor-font-size, 14px) * var(--md-content-zoom, 1))",
              lineHeight: "var(--content-line-height, 1.7)",
            },
            ".cm-focused": { outline: "none" },
            "&.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent)" },
            ".cm-selectionBackground": { backgroundColor: "var(--muted)" },
            ".cm-ai-context-selection": {
              backgroundColor: "color-mix(in oklch, var(--primary) 18%, transparent)",
              borderRadius: "2px",
            },
            "&.cm-focused .cm-ai-context-selection": {
              backgroundColor: "color-mix(in oklch, var(--primary) 13%, transparent)",
            },
            ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
            ".cm-activeLine": { backgroundColor: "transparent" },
            ".cm-activeLineGutter": {
              backgroundColor: "transparent",
              color: "color-mix(in oklch, var(--foreground) 82%, var(--muted-foreground))",
            },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    editorOwnValue.current = value;

    // 鐩戝惉缂栬緫鍣ㄦ粴鍔紝璁＄畻 0~1 姣斾緥涓婃姤缁欑埗缁勪欢
    const handleScroll = () => {
      const el = view.scrollDOM;
      const max = el.scrollHeight - el.clientHeight;
      const ratio = max > 0 ? el.scrollTop / max : 0;
      onScrollFn.current?.(ratio);
    };
    view.scrollDOM.addEventListener("scroll", handleScroll);

    // Clean up the EditorView instance on unmount, including StrictMode remounts.
    return () => {
      view.scrollDOM.removeEventListener("scroll", handleScroll);
      view.destroy();
      viewRef.current = null;
      onSelectionChangeFn.current?.("", null);
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: setAiContextSelectionRange.of(aiContextSelectionRange ?? null),
      annotations: Transaction.addToHistory.of(false),
    });
  }, [aiContextSelectionRange]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (currentDoc === value) {
      editorOwnValue.current = value;
      return;
    }

    const currentSelection = view.state.selection.main;
    const nextAnchor = Math.min(currentSelection.anchor, value.length);
    const nextHead = Math.min(currentSelection.head, value.length);

    isApplyingExternalValueRef.current = true;
    try {
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: value,
        },
        selection: { anchor: nextAnchor, head: nextHead },
        annotations: Transaction.addToHistory.of(false),
      });
    } finally {
      isApplyingExternalValueRef.current = false;
    }
    editorOwnValue.current = value;
  }, [value]);

  useEffect(() => {
    onToolbarApiChange?.({
      executeAction: (actionId: string) => {
        const view = viewRef.current;
        if (!view) return false;
        return executeToolbarAction(actionId, view);
      },
      hasEditor: () => viewRef.current !== null,
    });

    return () => onToolbarApiChange?.(null);
  }, [onToolbarApiChange]);

  useEffect(() => {
    onScrollApiChange?.({
      scrollToRatio: (ratio: number) => {
        const view = viewRef.current;
        if (!view) return;

        const el = view.scrollDOM;
        const max = el.scrollHeight - el.clientHeight;
        if (max <= 0) return;

        const nextRatio = Math.min(1, Math.max(0, ratio));
        el.scrollTop = nextRatio * max;
      },
    });

    return () => onScrollApiChange?.(null);
  }, [onScrollApiChange]);

  return (
    <div className={cn("flex h-full w-full min-w-0 flex-col overflow-hidden", className)}>
      {!hideToolbar && (
        <MarkdownEditorToolbar
          zoomLabel={undefined}
          onAction={(actionId) => {
            const view = viewRef.current;
            if (!view) return;
            executeToolbarAction(actionId, view);
          }}
        />
      )}
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
                {insertDialog.kind === "code-block" && "插入代码块"}
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



