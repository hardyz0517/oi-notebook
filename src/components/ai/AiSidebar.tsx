import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import {
  Archive,
  ArrowUp,
  Bot,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileText,
  MessageCircle,
  PenLine,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiSidebarNoteContext, AiSidebarProps } from "@/components/ai/types";

type AiMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  text: string;
};

type SlashCommand = {
  id: string;
  label: string;
  description: string;
  group: "文档操作" | "上下文";
  icon: ComponentType<{ className?: string }>;
  requiresNote?: boolean;
  requiresSelection?: boolean;
};

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "polish-all",
    label: "全文润色",
    description: "基于当前笔记生成润色建议。",
    group: "文档操作",
    icon: Sparkles,
    requiresNote: true,
  },
  {
    id: "polish-selection",
    label: "润色选中",
    description: "只处理当前选中文段。",
    group: "文档操作",
    icon: PenLine,
    requiresNote: true,
    requiresSelection: true,
  },
  {
    id: "complete-tags",
    label: "补全标签",
    description: "根据正文建议 tags。",
    group: "文档操作",
    icon: Tag,
    requiresNote: true,
  },
  {
    id: "summarize",
    label: "总结本文",
    description: "生成摘要。",
    group: "文档操作",
    icon: FileText,
    requiresNote: true,
  },
  {
    id: "explain-paragraph",
    label: "解释当前段落",
    description: "解释光标附近内容。",
    group: "上下文",
    icon: BookOpen,
    requiresNote: true,
  },
  {
    id: "compress-context",
    label: "压缩上下文",
    description: "整理当前对话上下文。",
    group: "上下文",
    icon: Archive,
  },
  {
    id: "retrospective",
    label: "生成复盘",
    description: "面向 OI 题解生成复盘建议。",
    group: "上下文",
    icon: ClipboardList,
    requiresNote: true,
  },
];

const COMMAND_GROUPS: SlashCommand["group"][] = ["文档操作", "上下文"];

const getCommandDisabledReason = (command: SlashCommand, context: AiSidebarNoteContext): string | null => {
  if (command.requiresNote && !context.filePath) return "请先打开一篇笔记";
  if (command.requiresNote && !context.hasBody) return "当前笔记暂无正文";
  if (command.requiresSelection && context.selectionStatus !== "available") return "需要先选中文段";
  return null;
};

const getSelectionLabel = (context: AiSidebarNoteContext): string => {
  if (context.selectionStatus === "available") return `已选中 ${context.selectedTextLength ?? 0} 字`;
  if (context.selectionStatus === "empty") return "未选中文段";
  return "选区待接入";
};

const getCompactPath = (path: string): string => path.replace(/\\/g, "/");

export default function AiSidebar({ context, onClose }: AiSidebarProps) {
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const [isCommandPanelDismissed, setIsCommandPanelDismissed] = useState(false);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const messageSeqRef = useRef(0);
  const commandRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
    setActiveCommandIndex(0);
  }, [commandQuery]);

  useEffect(() => {
    if (!isCommandPanelOpen || visibleCommands.length === 0) return;
    const activeCommand = visibleCommands[activeCommandIndex];
    if (!activeCommand) return;
    commandRowRefs.current[activeCommand.id]?.scrollIntoView({ block: "nearest" });
  }, [activeCommandIndex, isCommandPanelOpen, visibleCommands]);

  const appendMessages = (...nextMessages: Array<Omit<AiMessage, "id">>) => {
    setMessages((current) => [
      ...current,
      ...nextMessages.map((message) => {
        messageSeqRef.current += 1;
        return { ...message, id: messageSeqRef.current };
      }),
    ]);
  };

  const selectCommand = (command: SlashCommand) => {
    const commandText = `/${command.label}`;
    const disabledReason = getCommandDisabledReason(command, context);
    setInputValue(`${commandText} `);
    setIsCommandPanelDismissed(true);
    setActiveCommandIndex(0);
    appendMessages({
      role: "system",
      text: disabledReason
        ? `${commandText} 需要先准备上下文：${disabledReason}。`
        : `${commandText} 已就绪，下一步接入执行逻辑。`,
    });
  };

  const submitInput = () => {
    const value = inputValue.trim();
    if (!value) return;

    appendMessages(
      { role: "user", text: value },
      {
        role: "assistant",
        text: value.startsWith("/")
          ? "我已经记录这个操作，下一步会接入真正执行。"
          : "聊天问答将在下一步接入。",
      },
    );
    setInputValue("");
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
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
    ? `${getSelectionLabel(context)} · ${context.tags.length} tags`
    : "未选择笔记";
  const composerHint = context.filePath ? "当前笔记上下文" : "未选择笔记";
  let commandOrdinal = 0;

  return (
    <aside className="flex w-[390px] max-w-[42vw] shrink-0 flex-col overflow-hidden border-l border-border/80 bg-background/95 text-foreground">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/70 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="truncate text-sm font-semibold">AI 助手</div>
        </div>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onClose}
          title="关闭 AI 助手"
          aria-label="关闭 AI 助手"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="shrink-0 border-b border-border/60 px-3 py-1.5">
        {context.filePath ? (
          <div className="grid gap-0.5">
            <div className="flex min-w-0 items-center justify-between gap-3 leading-4">
              <span className="text-[11px] font-medium text-muted-foreground">当前笔记</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{context.bodyLength} 字</span>
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
                {isContextExpanded ? "收起上下文" : "展开上下文"}
              </button>
            </div>
            {isContextExpanded && (
              <div className="mt-0.5 grid gap-0.5 rounded-md bg-muted/20 px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
                <div className="truncate" title={context.tags.join(", ") || undefined}>
                  tags：{context.tags.length > 0 ? context.tags.join(", ") : "未填写"}
                </div>
                <div className="line-clamp-2" title={context.summary || undefined}>
                  summary：{context.summary || "未填写"}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-md bg-muted/15 px-2.5 py-1.5">
            <div className="min-w-0">
              <div className="text-[13px] font-medium leading-5 text-foreground">未选择笔记</div>
              <div className="text-[11px] leading-4 text-muted-foreground">打开笔记后会带入标题、路径、正文和选区。</div>
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
              <div className="text-sm font-medium text-foreground">我会读取当前笔记</div>
              <div className="text-sm leading-6 text-muted-foreground">
                输入 / 选择操作，或直接提问。当前版本只打通交互，不会调用 AI。
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
                    : message.role === "assistant"
                      ? "mr-auto border border-border/70 bg-muted/20 text-foreground"
                      : "mx-auto flex items-start gap-2 border border-border/60 bg-background/80 text-muted-foreground",
                )}
              >
                {message.role === "system" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{message.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="relative shrink-0 px-3 pb-3 pt-2">
        {isCommandPanelOpen && (
          <div className="absolute bottom-[calc(100%-0.45rem)] left-3 right-3 z-20 overflow-hidden rounded-2xl border border-[#dcdfe6] bg-white text-popover-foreground shadow-[0_18px_48px_rgb(15_23_42/0.16)] dark:border-white/10 dark:bg-[#2f3134] dark:shadow-[0_18px_52px_rgb(0_0_0/0.42)]">
            <div className="flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground">
              <div className="font-medium">选择命令</div>
              <div>↑↓ · Enter</div>
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
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">没有匹配的命令</div>
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
            placeholder="输入问题，或输入 / 选择操作"
            className="max-h-36 min-h-20 w-full resize-none border-0 !bg-transparent px-2 py-1.5 text-sm leading-6 text-foreground !shadow-none outline-none placeholder:text-muted-foreground/75 focus:!shadow-none"
          />
          <div className="flex items-center justify-between gap-2 px-1.5 pt-2 text-[11px] text-muted-foreground">
            <span className="truncate">{inputValue.startsWith("/") ? "输入 / 选择操作" : composerHint}</span>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#202124] text-white shadow-sm transition-[background-color,color,opacity,transform,box-shadow] hover:bg-[#111827] hover:shadow disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-55 dark:bg-[#f3f4f6] dark:text-[#202124] dark:hover:bg-white dark:disabled:bg-white/12 dark:disabled:text-muted-foreground"
              onClick={submitInput}
              disabled={inputValue.trim().length === 0}
              title="发送"
              aria-label="发送"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
