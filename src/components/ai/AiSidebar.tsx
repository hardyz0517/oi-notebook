import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import {
  Archive,
  ArrowUp,
  Bot,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  Loader2,
  MessageCircle,
  PenLine,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { renderMarkdownForTheme } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import type { AiSidebarNoteContext, AiSidebarProps } from "@/components/ai/types";
import {
  openExternalUrl,
  startCurrentNoteChatStream,
  type NoteChatContextPayload,
  type NoteChatHistoryMessage,
  type NoteChatStreamChunkEvent,
  type NoteChatStreamDoneEvent,
  type NoteChatStreamErrorEvent,
} from "@/lib/api";

type AiChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  state?: "done" | "loading" | "streaming" | "error";
  retryText?: string;
  requestId?: number;
  streamId?: string;
  retryContext?: NoteChatContextPayload;
};

type AiConversation = {
  id: string;
  title: string;
  messages: AiChatMessage[];
  createdAt: number;
  updatedAt: number;
};

type AiConversationStorage = {
  conversations: AiConversation[];
  activeConversationId: string;
};

type StreamTarget = {
  conversationId: string;
  messageId: string;
  requestId: number;
};

type SlashCommand = {
  id: string;
  label: string;
  description: string;
  group: "文档" | "上下文";
  icon: ComponentType<{ className?: string }>;
  requiresNote?: boolean;
  requiresSelection?: boolean;
};

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "polish-all",
    label: "全文润色",
    description: "为当前笔记准备润色建议。",
    group: "文档",
    icon: Sparkles,
    requiresNote: true,
  },
  {
    id: "polish-selection",
    label: "润色选中",
    description: "只处理当前选中的文本。",
    group: "文档",
    icon: PenLine,
    requiresNote: true,
    requiresSelection: true,
  },
  {
    id: "complete-tags",
    label: "补全标签",
    description: "根据笔记正文建议标签。",
    group: "文档",
    icon: Tag,
    requiresNote: true,
  },
  {
    id: "summarize",
    label: "总结本文",
    description: "为当前笔记生成摘要。",
    group: "文档",
    icon: FileText,
    requiresNote: true,
  },
  {
    id: "explain-paragraph",
    label: "解释当前段落",
    description: "解释光标附近的上下文。",
    group: "上下文",
    icon: BookOpen,
    requiresNote: true,
  },
  {
    id: "compress-context",
    label: "压缩上下文",
    description: "准备更紧凑的对话上下文。",
    group: "上下文",
    icon: Archive,
  },
  {
    id: "retrospective",
    label: "生成复盘",
    description: "准备 OI 题解复盘建议。",
    group: "上下文",
    icon: ClipboardList,
    requiresNote: true,
  },
];

const COMMAND_GROUPS: SlashCommand["group"][] = ["文档", "上下文"];
const NOTE_CHAT_MAX_MARKDOWN_CHARS = 16000;
const NOTE_CHAT_MAX_SELECTION_CHARS = 4000;
const AI_CONVERSATIONS_STORAGE_KEY = "oi-notebook.aiConversations";
const AI_CONVERSATION_LIMIT = 20;
const AI_CONVERSATION_MESSAGE_LIMIT = 100;
const AI_REQUEST_HISTORY_LIMIT = 8;
const AI_REQUEST_HISTORY_MESSAGE_MAX_CHARS = 1200;
const UNTITLED_CONVERSATION_TITLE = "New chat";

const getCommandDisabledReason = (command: SlashCommand, context: AiSidebarNoteContext): string | null => {
  if (command.requiresNote && !context.filePath) return "需要先打开笔记";
  if (command.requiresNote && !context.hasBody) return "当前笔记还没有正文";
  if (command.requiresSelection && context.selectionStatus !== "available") return "需要先选中文本";
  return null;
};

const getSelectionLabel = (context: AiSidebarNoteContext): string => {
  if (context.selectionStatus === "available") return `selected ${context.selectedTextLength ?? 0} chars`;
  if (context.selectionStatus === "empty") return "no selection";
  return "selection unavailable";
};

const getCompactPath = (path: string): string => path.replace(/\\/g, "/");

const truncateText = (text: string, maxChars: number): { text: string; truncated: boolean } => {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
};

const getChatErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const detailStart = message.indexOf("; debug=");
  const scopedMessage = detailStart >= 0 ? message.slice(0, detailStart) : message;
  const normalized = scopedMessage.replace(/^AI chat(?: stream)? failed:\s*/i, "").trim();

  if (
    message.includes("base_url is missing") ||
    message.includes("api_key is missing") ||
    message.includes("model is missing")
  ) {
    return "AI is not configured. Open settings and fill base_url / api_key / model.";
  }
  if (message.includes("request timed out")) return "The request timed out. Please retry.";
  if (message.includes("network error")) return "Could not connect to the AI service.";
  if (normalized.includes("empty stream")) return "The AI service returned an empty stream. Please retry.";
  if (normalized.includes("non JSON stream chunk") || normalized.includes("unreadable stream chunk")) {
    return "The AI service returned an unreadable stream chunk. Please retry.";
  }
  if (normalized.includes("stream interrupted")) return "The AI response was interrupted. Please retry.";
  if (normalized.includes("HTTP ")) return "The AI service returned an error response. Check settings and retry.";
  if (normalized.startsWith("AI ")) return normalized;
  return "AI chat failed. Please retry.";
};

const createConversationId = (): string =>
  `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createMessageId = (sequence: number): string => `msg-${Date.now().toString(36)}-${sequence}`;

const createEmptyConversation = (now = Date.now()): AiConversation => ({
  id: createConversationId(),
  title: UNTITLED_CONVERSATION_TITLE,
  messages: [],
  createdAt: now,
  updatedAt: now,
});

const getConversationTitleFromQuestion = (question: string): string => {
  const compact = question.replace(/\s+/g, " ").trim();
  if (!compact) return UNTITLED_CONVERSATION_TITLE;
  return compact.length <= 28 ? compact : `${compact.slice(0, 28)}...`;
};

const isAiChatMessage = (value: unknown): value is AiChatMessage => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AiChatMessage>;
  return typeof item.id === "string" && typeof item.text === "string" && (
    item.role === "user" || item.role === "assistant" || item.role === "system"
  );
};

const sanitizeMessagesForStorage = (messages: AiChatMessage[]): AiChatMessage[] =>
  messages.slice(-AI_CONVERSATION_MESSAGE_LIMIT).map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text,
    state: message.state === "error" ? "error" : "done",
    retryText: message.retryText,
    requestId: message.requestId,
  }));

const hasConversationContent = (conversation: AiConversation): boolean =>
  conversation.messages.some((message) => (
    (message.role === "user" || message.role === "assistant") && message.text.trim().length > 0
  ));

const sanitizeConversation = (value: unknown): AiConversation | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<AiConversation>;
  if (typeof item.id !== "string" || typeof item.title !== "string") return null;
  if (!Array.isArray(item.messages)) return null;

  const createdAt = typeof item.createdAt === "number" ? item.createdAt : Date.now();
  const updatedAt = typeof item.updatedAt === "number" ? item.updatedAt : createdAt;
  return {
    id: item.id,
    title: item.title.trim() || UNTITLED_CONVERSATION_TITLE,
    messages: sanitizeMessagesForStorage(item.messages.filter(isAiChatMessage)),
    createdAt,
    updatedAt,
  };
};

const limitConversations = (conversations: AiConversation[]): AiConversation[] =>
  [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, AI_CONVERSATION_LIMIT);

const pruneBlankConversations = (conversations: AiConversation[], activeConversationId: string): AiConversation[] => {
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
  const keepBlankConversationId = activeConversation && !hasConversationContent(activeConversation)
    ? activeConversation.id
    : conversations.find((conversation) => !hasConversationContent(conversation))?.id;

  return conversations.filter((conversation) => (
    hasConversationContent(conversation) || conversation.id === keepBlankConversationId
  ));
};

const loadConversationState = (): AiConversationStorage => {
  const fallback = createEmptyConversation();

  try {
    const raw = window.localStorage.getItem(AI_CONVERSATIONS_STORAGE_KEY);
    if (!raw) {
      return { conversations: [fallback], activeConversationId: fallback.id };
    }

    const parsed = JSON.parse(raw) as Partial<AiConversationStorage>;
    const conversations = limitConversations(
      Array.isArray(parsed.conversations)
        ? parsed.conversations.map(sanitizeConversation).filter((item): item is AiConversation => item !== null)
        : [],
    );
    if (conversations.length === 0) {
      return { conversations: [fallback], activeConversationId: fallback.id };
    }

    const activeConversationId =
      typeof parsed.activeConversationId === "string" &&
      conversations.some((conversation) => conversation.id === parsed.activeConversationId)
        ? parsed.activeConversationId
        : conversations[0].id;

    const prunedConversations = limitConversations(pruneBlankConversations(conversations, activeConversationId));
    return {
      conversations: prunedConversations,
      activeConversationId: prunedConversations.some((conversation) => conversation.id === activeConversationId)
        ? activeConversationId
        : prunedConversations[0].id,
    };
  } catch (error) {
    console.warn("Load AI conversations failed:", error);
    return { conversations: [fallback], activeConversationId: fallback.id };
  }
};

const getTheme = (): "dark" | "light" =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

const hasLatexCommand = (content: string): boolean => /\\{1,2}[A-Za-z]+/.test(content);

const normalizeLatexCommands = (content: string): string =>
  content.trim().replace(/\\\\([A-Za-z]+)/g, "\\$1");

const inlineMath = (content: string): string => `$${normalizeLatexCommands(content)}$`;

const displayMath = (content: string): string => `$$\n${normalizeLatexCommands(content)}\n$$`;

const normalizeDollarMath = (segment: string): string =>
  segment.replace(/\$\$([\s\S]*?)\$\$|\$([^\n$]*?)\$/g, (match: string, displayContent?: string, inlineContent?: string) => {
    if (typeof displayContent === "string") return displayMath(displayContent);
    if (typeof inlineContent === "string") return inlineMath(inlineContent);
    return match;
  });

const normalizeEscapedMathDelimiters = (segment: string): string =>
  segment
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, content: string) => inlineMath(content))
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, content: string) => displayMath(content));

const looksLikeStandaloneMath = (content: string): boolean => {
  const trimmed = content.trim();
  if (!trimmed || /^[xX]\s*$/.test(trimmed)) return false;
  return hasLatexCommand(trimmed) || /[_^=<>+\-*/]/.test(trimmed);
};

const normalizeStandaloneBracketDisplayMath = (segment: string): string =>
  segment.replace(/^([ \t]*)\[\s*([^\]\n]+?)\s*\]([ \t]*)$/gm, (match: string, leading: string, content: string, trailing: string) =>
    looksLikeStandaloneMath(content) ? `${leading}${displayMath(content)}${trailing}` : match,
  );

const normalizeBareParenMath = (segment: string): string =>
  segment.replace(/\(\s*([^()\n]*?\\{1,2}[A-Za-z][^()\n]*?)\s*\)/g, (match: string, content: string) =>
    hasLatexCommand(content) ? inlineMath(content) : match,
  );

const mapOutsideDollarMath = (segment: string, transformOutside: (outside: string) => string): string => {
  const matches = Array.from(segment.matchAll(/\$\$[\s\S]*?\$\$|\$[^\n$]*?\$/g));
  if (matches.length === 0) return transformOutside(segment);

  let output = "";
  let cursor = 0;

  for (const match of matches) {
    const index = match.index ?? 0;
    output += transformOutside(segment.slice(cursor, index));
    output += normalizeDollarMath(match[0]);
    cursor = index + match[0].length;
  }

  output += transformOutside(segment.slice(cursor));
  return output;
};

const normalizeMathInSegment = (segment: string): string => {
  const withEscapedDelimiters = normalizeEscapedMathDelimiters(segment);
  return mapOutsideDollarMath(withEscapedDelimiters, (outside) =>
    normalizeBareParenMath(normalizeStandaloneBracketDisplayMath(outside)),
  );
};

const splitMarkdownByFencedCode = (markdown: string): Array<{ text: string; isCode: boolean }> => {
  const lines = markdown.match(/.*(?:\r\n|\n|$)/g) ?? [];
  const chunks: Array<{ text: string; isCode: boolean }> = [];
  let buffer = "";
  let inFence = false;
  let fenceMarker = "";

  const pushBuffer = (isCode: boolean) => {
    if (!buffer) return;
    chunks.push({ text: buffer, isCode });
    buffer = "";
  };

  for (const line of lines) {
    if (!line) continue;

    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (!inFence && fenceMatch) {
      pushBuffer(false);
      inFence = true;
      fenceMarker = fenceMatch[1][0];
      buffer += line;
      continue;
    }

    if (inFence) {
      buffer += line;
      if (fenceMatch && fenceMatch[1][0] === fenceMarker) {
        inFence = false;
        fenceMarker = "";
        pushBuffer(true);
      }
      continue;
    }

    buffer += line;
  }

  pushBuffer(inFence);
  return chunks;
};

const normalizeAiMathDelimiters = (markdown: string): string =>
  splitMarkdownByFencedCode(markdown)
    .map((chunk) => (chunk.isCode ? chunk.text : normalizeMathInSegment(chunk.text)))
    .join("");

const createAiCodeCopyIcon = (icon: "copy" | "check"): SVGSVGElement => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "h-3.5 w-3.5");
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
};

const setAiCodeCopyButtonStatus = (button: HTMLButtonElement, status: "copy" | "copied" | "failed") => {
  const label = document.createElement("span");
  label.className = "ai-code-copy-label";
  label.textContent = status === "copied" ? "已复制" : status === "failed" ? "复制失败" : "复制";
  button.replaceChildren(createAiCodeCopyIcon(status === "copied" ? "check" : "copy"), label);
  button.title = label.textContent;
  button.setAttribute("aria-label", button.title);
};

const getAiCodeBlockText = (code: HTMLElement): string => {
  const lines = Array.from(code.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("line"),
  );
  if (lines.length > 0) {
    return lines.map((line) => line.textContent ?? "").join("\n");
  }
  return code.textContent ?? "";
};

const decorateAiCodeBlocks = (html: string): string => {
  const template = document.createElement("template");
  template.innerHTML = html;

  for (const code of Array.from(template.content.querySelectorAll<HTMLElement>("pre > code"))) {
    const pre = code.parentElement;
    if (!(pre instanceof HTMLPreElement)) continue;

    const existingShell = pre.closest<HTMLDivElement>(".ai-code-block-shell");
    if (existingShell) {
      if (!existingShell.querySelector("button[data-ai-code-copy-button='true']")) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.aiCodeCopyButton = "true";
        button.className = "ai-code-copy-button";
        setAiCodeCopyButtonStatus(button, "copy");
        existingShell.append(button);
      }
      continue;
    }

    pre.dataset.aiCodeBlock = "true";
    const shell = document.createElement("div");
    shell.className = "ai-code-block-shell";
    pre.replaceWith(shell);
    shell.append(pre);

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.aiCodeCopyButton = "true";
    button.className = "ai-code-copy-button";
    setAiCodeCopyButtonStatus(button, "copy");
    shell.append(button);
  }

  return template.innerHTML;
};

const isHttpUrl = (href: string): boolean => /^https?:\/\//i.test(href);

function AiMarkdownMessage({ markdown }: { markdown: string }) {
  const [renderedHtml, setRenderedHtml] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const normalizedMarkdown = useMemo(() => normalizeAiMathDelimiters(markdown), [markdown]);

  useEffect(() => {
    let cancelled = false;
    const theme = getTheme();

    renderMarkdownForTheme(normalizedMarkdown, theme)
      .then((html) => {
        if (!cancelled) setRenderedHtml(decorateAiCodeBlocks(html));
      })
      .catch((error) => {
        console.warn("Render AI markdown message failed:", error);
        if (!cancelled) setRenderedHtml("");
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedMarkdown]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !renderedHtml) return;

    const timeoutIds = new Set<number>();

    const handleClick = async (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest<HTMLButtonElement>("button[data-ai-code-copy-button='true']");
      if (button && root.contains(button)) {
        const code = button.closest(".ai-code-block-shell")?.querySelector<HTMLElement>("pre > code");
        const text = code ? getAiCodeBlockText(code) : "";

        try {
          await navigator.clipboard.writeText(text);
          setAiCodeCopyButtonStatus(button, "copied");
        } catch (error) {
          console.warn("Copy AI code block failed:", error);
          setAiCodeCopyButtonStatus(button, "failed");
        }

        const timeoutId = window.setTimeout(() => {
          setAiCodeCopyButtonStatus(button, "copy");
          timeoutIds.delete(timeoutId);
        }, 1400);
        timeoutIds.add(timeoutId);
        return;
      }

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

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || !root.contains(anchor)) return;

      const rawHref = anchor.getAttribute("href")?.trim();
      if (!rawHref || !isHttpUrl(rawHref)) return;

      event.preventDefault();
      try {
        await openExternalUrl(rawHref);
      } catch (error) {
        console.warn("Open AI message link failed:", error);
      }
    };

    root.addEventListener("click", handleClick);

    return () => {
      root.removeEventListener("click", handleClick);
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [renderedHtml]);

  if (!renderedHtml) {
    return <div className="whitespace-pre-wrap break-words">{markdown}</div>;
  }

  return (
    <div
      ref={containerRef}
      data-ai-markdown-message="true"
      className={cn(
        "min-w-0 max-w-full overflow-hidden break-words text-sm leading-6 text-foreground",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:leading-snug",
        "[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:leading-snug",
        "[&_h3]:mb-1.5 [&_h3]:mt-2.5 [&_h3]:text-sm [&_h3]:font-semibold",
        "[&_p]:mb-2 [&_p]:leading-6",
        "[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:mb-1",
        "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.88em]",
        "[&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border/70",
        "[&_pre_code]:inline-block [&_pre_code]:min-w-max [&_pre_code]:bg-transparent [&_pre_code]:p-3 [&_pre_code]:text-inherit",
        "[&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse",
        "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold",
        "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_strong]:font-semibold [&_em]:italic",
        "[&_.katex-display]:my-2 [&_.katex-display]:max-w-full [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden",
      )}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}

export default function AiSidebar({ context, isAiConfigured, isOpen, onClose }: AiSidebarProps) {
  const initialConversationStateRef = useRef<AiConversationStorage | null>(null);
  if (initialConversationStateRef.current === null) {
    initialConversationStateRef.current = loadConversationState();
  }

  const [inputValue, setInputValue] = useState("");
  const [conversations, setConversations] = useState<AiConversation[]>(
    initialConversationStateRef.current.conversations,
  );
  const [activeConversationId, setActiveConversationId] = useState(
    initialConversationStateRef.current.activeConversationId,
  );
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const [isCommandPanelDismissed, setIsCommandPanelDismissed] = useState(false);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const messageSeqRef = useRef(0);
  const requestSeqRef = useRef(0);
  const streamTargetsRef = useRef<Map<string, StreamTarget>>(new Map());
  const activeStreamsRef = useRef<Set<string>>(new Set());
  const commandRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0];
  const messages = activeConversation?.messages ?? [];

  const commandQuery = inputValue.startsWith("/") ? inputValue.slice(1).trim() : "";
  const visibleCommands = useMemo(() => {
    if (!inputValue.startsWith("/")) return [];
    if (!commandQuery) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((command) =>
      `${command.label} ${command.description} ${command.group}`.toLocaleLowerCase().includes(commandQuery.toLocaleLowerCase()),
    );
  }, [commandQuery, inputValue]);
  const isCommandPanelOpen = inputValue.startsWith("/") && !isCommandPanelDismissed;
  const groupedVisibleCommands = COMMAND_GROUPS.map((group) => ({
    group,
    commands: visibleCommands.filter((command) => command.group === group),
  })).filter((group) => group.commands.length > 0);

  useEffect(() => {
    if (!activeConversation) {
      const nextConversation = createEmptyConversation();
      setConversations([nextConversation]);
      setActiveConversationId(nextConversation.id);
    }
  }, [activeConversation]);

  useEffect(() => {
    const persistedConversations = limitConversations(pruneBlankConversations(conversations, activeConversationId)).map((conversation) => ({
      ...conversation,
      messages: sanitizeMessagesForStorage(conversation.messages),
    }));
    const nextActiveConversationId = persistedConversations.some((conversation) => conversation.id === activeConversationId)
      ? activeConversationId
      : persistedConversations[0]?.id;

    if (!nextActiveConversationId) return;

    try {
      window.localStorage.setItem(
        AI_CONVERSATIONS_STORAGE_KEY,
        JSON.stringify({
          conversations: persistedConversations,
          activeConversationId: nextActiveConversationId,
        }),
      );
    } catch (error) {
      console.warn("Persist AI conversations failed:", error);
    }
  }, [activeConversationId, conversations]);

  useEffect(() => {
    setActiveCommandIndex(0);
  }, [commandQuery]);

  useEffect(() => {
    if (!isCommandPanelOpen || visibleCommands.length === 0) return;
    const activeCommand = visibleCommands[activeCommandIndex];
    if (!activeCommand) return;
    commandRowRefs.current[activeCommand.id]?.scrollIntoView({ block: "nearest" });
  }, [activeCommandIndex, isCommandPanelOpen, visibleCommands]);

  const updateRespondingState = () => {
    setIsResponding(activeStreamsRef.current.size > 0);
  };

  const createMessage = (message: Omit<AiChatMessage, "id">): AiChatMessage => {
    messageSeqRef.current += 1;
    return { ...message, id: createMessageId(messageSeqRef.current) };
  };

  const updateConversationMessages = (
    conversationId: string,
    updater: (conversation: AiConversation) => AiConversation,
  ) => {
    setConversations((current) => {
      const now = Date.now();
      const next = current.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const updated = updater(conversation);
        return {
          ...updated,
          messages: updated.messages.slice(-AI_CONVERSATION_MESSAGE_LIMIT),
          updatedAt: now,
        };
      });
      return limitConversations(next);
    });
  };

  const appendMessages = (conversationId: string, ...nextMessages: AiChatMessage[]) => {
    updateConversationMessages(conversationId, (conversation) => {
      const firstUserMessage = nextMessages.find((message) => message.role === "user");
      const shouldRetitle =
        conversation.title === UNTITLED_CONVERSATION_TITLE &&
        conversation.messages.every((message) => message.role !== "user");
      return {
        ...conversation,
        title: shouldRetitle && firstUserMessage ? getConversationTitleFromQuestion(firstUserMessage.text) : conversation.title,
        messages: [...conversation.messages, ...nextMessages],
      };
    });
  };

  const replaceMessage = (
    conversationId: string,
    messageId: string,
    updater: (message: AiChatMessage) => AiChatMessage,
  ) => {
    updateConversationMessages(conversationId, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) => (message.id === messageId ? updater(message) : message)),
    }));
  };

  const createNewConversation = () => {
    if (activeConversation && !hasConversationContent(activeConversation)) {
      setActiveConversationId(activeConversation.id);
      setIsHistoryOpen(false);
      setActiveCommandIndex(0);
      setIsCommandPanelDismissed(false);
      return;
    }

    const conversation = createEmptyConversation();
    setConversations((current) => limitConversations(pruneBlankConversations([conversation, ...current], conversation.id)));
    setActiveConversationId(conversation.id);
    setIsHistoryOpen(false);
    setInputValue("");
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
  };

  const selectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setIsHistoryOpen(false);
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
  };

  const deleteConversation = (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    const confirmed = window.confirm(`Delete chat "${conversation.title}"?`);
    if (!confirmed) return;

    for (const [streamId, target] of Array.from(streamTargetsRef.current.entries())) {
      if (target.conversationId !== conversationId) continue;
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
    }
    updateRespondingState();

    const remaining = limitConversations(conversations.filter((item) => item.id !== conversationId));
    if (remaining.length === 0) {
      const fallback = createEmptyConversation();
      setConversations([fallback]);
      setActiveConversationId(fallback.id);
    } else {
      setConversations(remaining);
      if (conversationId === activeConversationId) {
        setActiveConversationId(remaining[0].id);
      }
    }

    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
  };

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    void listen<NoteChatStreamChunkEvent>("ai-chat-stream-chunk", (event) => {
      const { streamId, delta } = event.payload;
      const target = streamTargetsRef.current.get(streamId);
      if (disposed || !target || !delta) return;

      replaceMessage(target.conversationId, target.messageId, (message) => ({
        ...message,
        text: message.state === "streaming" ? `${message.text}${delta}` : message.text,
      }));
    }).then((unlisten) => unlisteners.push(unlisten));

    void listen<NoteChatStreamDoneEvent>("ai-chat-stream-done", (event) => {
      const { streamId } = event.payload;
      const target = streamTargetsRef.current.get(streamId);
      if (disposed || !target) return;

      replaceMessage(target.conversationId, target.messageId, (message) => ({
        ...message,
        text: message.text.trim().length > 0 ? message.text : "The AI service returned no content. Please retry.",
        state: "done",
      }));
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
      updateRespondingState();
    }).then((unlisten) => unlisteners.push(unlisten));

    void listen<NoteChatStreamErrorEvent>("ai-chat-stream-error", (event) => {
      const { streamId, message, detail } = event.payload;
      const target = streamTargetsRef.current.get(streamId);
      if (disposed || !target) return;
      if (detail) {
        console.warn("AI sidebar stream failed", { streamId, detail });
      }

      replaceMessage(target.conversationId, target.messageId, (currentMessage) => ({
        ...currentMessage,
        text: getChatErrorMessage(message),
        state: "error",
      }));
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
      updateRespondingState();
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [activeConversationId, messages]);

  const buildChatContext = (): NoteChatContextPayload => {
    const truncatedSelection = truncateText(context.selectedText.trim(), NOTE_CHAT_MAX_SELECTION_CHARS);
    const truncatedMarkdown = truncateText(context.markdownBody, NOTE_CHAT_MAX_MARKDOWN_CHARS);

    return {
      noteTitle: context.filePath ? context.title : "",
      notePath: context.filePath ?? "",
      tags: context.tags,
      summary: context.summary.trim(),
      selectedText: truncatedSelection.text,
      markdown: truncatedMarkdown.text,
      markdownTruncated: truncatedMarkdown.truncated,
    };
  };

  const buildRequestHistory = (conversationId: string): NoteChatHistoryMessage[] => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return [];

    return conversation.messages
      .filter((message) => {
        if (message.role !== "user" && message.role !== "assistant") return false;
        if (message.state === "loading" || message.state === "streaming" || message.state === "error") return false;
        return message.text.trim().length > 0;
      })
      .slice(-AI_REQUEST_HISTORY_LIMIT)
      .map((message) => ({
        role: message.role as "user" | "assistant",
        text: truncateText(message.text.trim(), AI_REQUEST_HISTORY_MESSAGE_MAX_CHARS).text,
      }));
  };

  const submitQuestion = async (questionText: string, snapshot?: NoteChatContextPayload) => {
    if (isResponding) return;

    const conversationId = activeConversation?.id;
    const question = questionText.trim();
    if (!conversationId || !question) return;

    if (!isAiConfigured) {
      appendMessages(
        conversationId,
        createMessage({ role: "user", text: question, state: "done" }),
        createMessage({ role: "system", text: "AI is not configured. Open settings first.", state: "done" }),
      );
      setInputValue("");
      return;
    }

    const chatContext = snapshot ?? buildChatContext();

    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    const streamId = `${Date.now()}-${requestId}`;
    const chatHistory = buildRequestHistory(conversationId);
    const userMessage = createMessage({ role: "user", text: question, state: "done" });
    const assistantMessage = createMessage({
      role: "assistant",
      text: "",
      state: "streaming",
      retryText: question,
      requestId,
      streamId,
      retryContext: chatContext,
    });

    appendMessages(conversationId, userMessage, assistantMessage);

    setInputValue("");
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
    streamTargetsRef.current.set(streamId, {
      conversationId,
      messageId: assistantMessage.id,
      requestId,
    });
    activeStreamsRef.current.add(streamId);
    updateRespondingState();

    void startCurrentNoteChatStream({
      streamId,
      question,
      context: chatContext,
      chatHistory,
    }).catch((error) => {
      console.warn("AI sidebar chat request failed", {
        requestId,
        streamId,
        notePath: chatContext.notePath,
        error,
      });
      const target = streamTargetsRef.current.get(streamId);
      if (!target) return;
      replaceMessage(target.conversationId, target.messageId, (message) => ({
        ...message,
        text: message.state === "error" ? message.text : getChatErrorMessage(error),
        state: "error",
      }));
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
      updateRespondingState();
    });
  };

  const selectCommand = (command: SlashCommand) => {
    const conversationId = activeConversation?.id;
    if (!conversationId) return;

    const commandText = `/${command.label}`;
    const disabledReason = getCommandDisabledReason(command, context);
    setInputValue(`${commandText} `);
    setIsCommandPanelDismissed(true);
    setActiveCommandIndex(0);
    appendMessages(
      conversationId,
      createMessage({
        role: "system",
        state: "done",
        text: disabledReason
          ? `${commandText} 需要更多上下文：${disabledReason}。`
          : `${commandText} 已记录。真实执行逻辑仍是占位。`,
      }),
    );
  };

  const submitInput = () => {
    const conversationId = activeConversation?.id;
    const value = inputValue.trim();
    if (!conversationId || !value || isResponding) return;

    if (value.startsWith("/")) {
      appendMessages(
        conversationId,
        createMessage({ role: "user", text: value, state: "done" }),
        createMessage({
          role: "assistant",
          text: "我已记录这个操作。真实执行逻辑仍是占位。",
          state: "done",
        }),
      );
      setInputValue("");
      setActiveCommandIndex(0);
      setIsCommandPanelDismissed(false);
      return;
    }

    void submitQuestion(value);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isCommandPanelOpen && visibleCommands.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveCommandIndex((current) => (current + 1) % visibleCommands.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveCommandIndex((current) => (current - 1 + visibleCommands.length) % visibleCommands.length);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        selectCommand(visibleCommands[activeCommandIndex] ?? visibleCommands[0]);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (isCommandPanelOpen && visibleCommands.length > 0) {
        selectCommand(visibleCommands[activeCommandIndex] ?? visibleCommands[0]);
        return;
      }
      submitInput();
    }
  };

  const contextMeta = context.filePath
    ? `${getSelectionLabel(context)} - ${context.tags.length} tags`
    : "no note selected";
  const composerHint = context.filePath ? "current note context" : "no note selected";
  const sortedConversations = useMemo(
    () => limitConversations(pruneBlankConversations(conversations, activeConversationId)),
    [activeConversationId, conversations],
  );
  let commandOrdinal = 0;

  return (
    <aside
      className={cn(
        "w-[390px] max-w-[42vw] shrink-0 flex-col overflow-hidden border-l border-border/80 bg-background/95 text-foreground",
        isOpen ? "flex" : "hidden",
      )}
      aria-hidden={!isOpen}
    >
      <div className="relative flex h-11 shrink-0 items-center justify-between border-b border-border/70 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="truncate text-sm font-semibold">AI Assistant</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={createNewConversation}
            title="New chat"
            aria-label="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              isHistoryOpen && "bg-accent text-accent-foreground",
            )}
            onClick={() => setIsHistoryOpen((open) => !open)}
            title="Chat history"
            aria-label="Chat history"
            aria-pressed={isHistoryOpen}
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onClose}
            title="Close AI Assistant"
            aria-label="Close AI Assistant"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isHistoryOpen && (
          <div className="absolute right-3 top-10 z-30 w-[340px] max-w-[calc(100%-1.5rem)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
              <span className="text-xs font-medium text-foreground">Chat history</span>
              <span className="text-[11px] text-muted-foreground">max {AI_CONVERSATION_LIMIT}</span>
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5 [scrollbar-width:thin]">
              {sortedConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={cn(
                    "group flex w-full min-w-0 items-center gap-1 rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
                    conversation.id === activeConversationId && "bg-accent text-accent-foreground",
                  )}
                >
                  <button
                    type="button"
                    className="grid min-w-0 flex-1 gap-1 px-2.5 py-2 text-left"
                    onClick={() => selectConversation(conversation.id)}
                  >
                    <span className="truncate text-sm font-medium">{conversation.title}</span>
                    <span className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>{conversation.messages.length} messages</span>
                      <span className="shrink-0 tabular-nums">{new Date(conversation.updatedAt).toLocaleString()}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-75 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteConversation(conversation.id);
                    }}
                    title="Delete chat"
                    aria-label={`Delete chat ${conversation.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-b border-border/60 px-3 py-1.5">
        <div className="mb-1.5 flex min-w-0 items-center justify-between gap-3">
          <span className="truncate text-[12px] font-medium leading-5 text-foreground" title={activeConversation?.title}>
            Chat: {activeConversation?.title ?? UNTITLED_CONVERSATION_TITLE}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{messages.length} msg</span>
        </div>
        {context.filePath ? (
          <div className="grid gap-0.5">
            <div className="flex min-w-0 items-center justify-between gap-3 leading-4">
              <span className="text-[11px] font-medium text-muted-foreground">Current context</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{context.bodyLength} chars</span>
            </div>
            <div className="truncate text-[13px] font-medium leading-5 text-foreground" title={context.title}>
              {context.title}
            </div>
            <div className="truncate text-[11px] leading-4 text-muted-foreground/85" title={context.filePath}>
              {getCompactPath(context.filePath)}
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 text-[11px] leading-4 text-muted-foreground">
              <span className="truncate">{contextMeta}</span>
              <button
                type="button"
                className="shrink-0 rounded-sm text-[11px] text-muted-foreground/90 underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => setIsContextExpanded((expanded) => !expanded)}
              >
                {isContextExpanded ? "Hide context" : "Show context"}
              </button>
            </div>
            {isContextExpanded && (
              <div className="mt-0.5 grid gap-0.5 rounded-md bg-muted/20 px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
                <div className="truncate" title={context.tags.join(", ") || undefined}>
                  tags: {context.tags.length > 0 ? context.tags.join(", ") : "empty"}
                </div>
                <div className="line-clamp-2" title={context.summary || undefined}>
                  summary: {context.summary || "empty"}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-md bg-muted/15 px-2.5 py-1.5">
            <div className="min-w-0">
              <div className="text-[13px] font-medium leading-5 text-foreground">No note selected</div>
              <div className="text-[11px] leading-4 text-muted-foreground">Open a note to attach title, path, body and selection.</div>
            </div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-44 items-center justify-center px-5 text-center">
            <div className="grid max-w-72 gap-3">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/20 text-muted-foreground">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium text-foreground">Independent chat</div>
              <div className="text-sm leading-6 text-muted-foreground">
                Switching notes changes only the next request context. This chat stays active.
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[92%] rounded-lg px-3 py-2 text-sm leading-6 shadow-sm",
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : message.role === "assistant" && message.state === "error"
                      ? "mr-auto border border-amber-500/30 bg-amber-500/10 text-foreground"
                      : message.role === "assistant"
                        ? "mr-auto border border-border/70 bg-muted/20 text-foreground"
                        : "mx-auto flex items-start gap-2 border border-border/60 bg-background/80 text-muted-foreground",
                )}
              >
                {message.role === "system" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                {message.role === "assistant" && (message.state === "loading" || message.state === "streaming") && (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                )}
                <div className="min-w-0">
                  {message.role === "assistant" ? (
                    <AiMarkdownMessage markdown={message.text || (message.state === "streaming" ? "Generating..." : "")} />
                  ) : (
                    <div className="whitespace-pre-wrap break-words">
                      {message.text || (message.state === "streaming" ? "Generating..." : "")}
                    </div>
                  )}
                  {message.role === "assistant" && message.state === "error" && message.retryText && (
                    <button
                      type="button"
                      className="mt-2 inline-flex h-7 items-center rounded-md border border-border/70 px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => {
                        if (isResponding) return;
                        void submitQuestion(message.retryText ?? "", message.retryContext);
                      }}
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="relative shrink-0 px-3 pb-3 pt-2">
        {isCommandPanelOpen && (
          <div className="absolute bottom-[calc(100%-0.45rem)] left-3 right-3 z-20 overflow-hidden rounded-2xl border border-[#dcdfe6] bg-white text-popover-foreground shadow-[0_18px_48px_rgb(15_23_42/0.16)] dark:border-white/10 dark:bg-[#2f3134] dark:shadow-[0_18px_52px_rgb(0_0_0/0.42)]">
            <div className="flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground">
              <div className="font-medium">选择命令</div>
              <div>上下键 - 回车</div>
            </div>
            {visibleCommands.length > 0 ? (
              <div className="max-h-72 overflow-y-auto px-1.5 pb-1.5 [scrollbar-width:thin] [scrollbar-color:color-mix(in_oklch,var(--muted-foreground)_30%,transparent)_transparent]">
                {groupedVisibleCommands.map(({ group, commands }) => (
                  <div key={group} className="py-0.5">
                    <div className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/75">
                      {group}
                    </div>
                    <div className="grid gap-0.5">
                      {commands.map((command) => {
                        const itemIndex = commandOrdinal;
                        commandOrdinal += 1;
                        const Icon = command.icon;
                        const disabledReason = getCommandDisabledReason(command, context);
                        const isActive = itemIndex === activeCommandIndex;
                        return (
                          <button
                            key={command.id}
                            ref={(element) => {
                              commandRowRefs.current[command.id] = element;
                            }}
                            type="button"
                            className={cn(
                              "flex h-11 w-full items-center gap-2 rounded-lg px-2 text-left transition-[background-color,color,box-shadow]",
                              isActive
                                ? "bg-[#eef3f8] text-foreground shadow-[inset_0_0_0_1px_rgb(15_23_42/0.03)] dark:bg-white/10"
                                : "text-foreground hover:bg-[#f5f7fa] dark:hover:bg-white/[0.07]",
                            )}
                            onMouseEnter={() => setActiveCommandIndex(itemIndex)}
                            onClick={() => selectCommand(command)}
                            data-active={isActive ? "true" : undefined}
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-baseline gap-2">
                                <span className="shrink-0 text-sm font-medium text-foreground">{command.label}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {disabledReason ? `${command.description} ${disabledReason}` : command.description}
                                </span>
                              </span>
                            </span>
                            {disabledReason && (
                              <span className="shrink-0 rounded-full bg-muted/70 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground dark:bg-white/[0.08]">
                                占位
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">没有匹配命令</div>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-[#dcdfe6] bg-[#fafafa] p-2.5 shadow-[0_10px_26px_rgb(15_23_42/0.06)] transition-[border-color,box-shadow,background-color] focus-within:border-[#b8c0cc] focus-within:shadow-[0_12px_32px_rgb(15_23_42/0.10)] dark:border-white/10 dark:bg-[#2b2d2f] dark:shadow-[0_12px_34px_rgb(0_0_0/0.24)] dark:focus-within:border-white/20 dark:focus-within:shadow-[0_14px_38px_rgb(0_0_0/0.34)]">
          <textarea
            value={inputValue}
            onChange={(event) => {
              setInputValue(event.target.value);
              setActiveCommandIndex(0);
              setIsCommandPanelDismissed(false);
            }}
            onKeyDown={handleInputKeyDown}
            rows={3}
            placeholder="Ask a question, or type /"
            className="max-h-36 min-h-20 w-full resize-none border-0 !bg-transparent px-2 py-1.5 text-sm leading-6 text-foreground !shadow-none outline-none placeholder:text-muted-foreground/75 focus:!shadow-none"
          />
          <div className="flex items-center justify-between gap-2 px-1.5 pt-2 text-[11px] text-muted-foreground">
            <span className="truncate">{inputValue.startsWith("/") ? "选择命令" : composerHint}</span>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#202124] text-white shadow-sm transition-[background-color,color,opacity,transform,box-shadow] hover:bg-[#111827] hover:shadow disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-55 dark:bg-[#f3f4f6] dark:text-[#202124] dark:hover:bg-white dark:disabled:bg-white/12 dark:disabled:text-muted-foreground"
              onClick={submitInput}
              disabled={inputValue.trim().length === 0 || isResponding}
              title={isResponding ? "Thinking" : "Send"}
              aria-label={isResponding ? "Thinking" : "Send"}
            >
              {isResponding ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
