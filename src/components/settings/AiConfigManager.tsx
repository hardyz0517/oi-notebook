import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Bot, Check, ChevronDown, GripVertical, Loader2, Pencil, PlugZap, Plus, RefreshCw, Search, Server, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AiConfig, AiProvider } from "@/lib/api";
import { SortableItem } from "../tag-manager/SortableItem";

type ManagerView = "list" | "detail" | "create";
type ProviderStatus = "untested" | "testing" | "ok" | "failed";
type CreatePresetId = "custom" | "openai" | "deepseek" | "soyo" | "siliconflow" | "openrouter" | "azure";

interface CreateProviderDraft {
  presetId: CreatePresetId;
  name: string;
  note: string;
  website: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  models: string[];
}

interface CreateProviderPayload {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  models: string[];
}

interface AiConfigManagerProps {
  mode: "entry" | "page";
  config: AiConfig | null;
  selectedProvider: AiProvider | null;
  isLoading: boolean;
  isSaving: boolean;
  busyProviderId: string | null;
  modelSearchQuery: string;
  manualModelId: string;
  filteredModels: AiProvider["models"];
  onSelectProvider: (provider: AiProvider) => void;
  onCreateProvider: (draft: CreateProviderPayload) => AiProvider | null;
  onFillDeepSeekDefaults: () => string | null;
  onUpdateProvider: (providerId: string, patch: Partial<AiProvider>) => void;
  onSetDefaultProvider: (providerId: string) => void;
  onSetDefaultModel: (providerId: string, modelId: string) => void;
  onDeleteProvider: (providerId: string, options?: { skipConfirm?: boolean }) => void;
  onTestProvider: (providerId: string) => Promise<boolean>;
  onSyncProviderModels: (providerId: string) => Promise<boolean>;
  onTestCreateProvider: (draft: CreateProviderPayload) => Promise<{ ok: boolean; message: string }>;
  onSyncCreateProviderModels: (draft: CreateProviderPayload) => Promise<{ ok: boolean; models: string[]; message: string }>;
  onModelSearchChange: (value: string) => void;
  onManualModelIdChange: (value: string) => void;
  onAddModel: () => void;
  onDeleteModel: (providerId: string, modelId: string) => void;
  onReorderProviders: (sourceId: string, targetId: string) => void;
  onOpenManager?: () => void;
}

const getProviderName = (provider: AiProvider | null | undefined) => provider?.name.trim() || provider?.id || "";

const getModelCountLabel = (count: number) => `${count} 个模型`;

const createBlankProviderDraft = (): CreateProviderDraft => ({
  presetId: "custom",
  name: "",
  note: "",
  website: "",
  baseUrl: "",
  apiKey: "",
  defaultModel: "",
  models: [],
});

const CREATE_PRESETS: Array<{ id: CreatePresetId; label: string; draft: Omit<CreateProviderDraft, "presetId" | "apiKey" | "models"> & { models?: string[] } }> = [
  { id: "custom", label: "自定义配置", draft: { name: "", note: "", website: "", baseUrl: "", defaultModel: "" } },
  { id: "openai", label: "OpenAI Official", draft: { name: "OpenAI Official", note: "OpenAI 官方 API", website: "https://platform.openai.com", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o" } },
  { id: "deepseek", label: "DeepSeek", draft: { name: "DeepSeek", note: "DeepSeek 官方 API", website: "https://platform.deepseek.com", baseUrl: "https://api.deepseek.com", defaultModel: "deepseek-v4-flash" } },
  { id: "soyo", label: "Soyo", draft: { name: "Soyo", note: "兼容 OpenAI 的 API", website: "https://api.soyo.ai", baseUrl: "https://api.soyo.ai/v1", defaultModel: "" } },
  { id: "siliconflow", label: "硅基流动", draft: { name: "硅基流动", note: "SiliconFlow API", website: "https://siliconflow.cn", baseUrl: "https://api.siliconflow.cn/v1", defaultModel: "deepseek-ai/DeepSeek-V3" } },
  { id: "openrouter", label: "OpenRouter", draft: { name: "OpenRouter", note: "OpenRouter API", website: "https://openrouter.ai", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4o" } },
  { id: "azure", label: "Azure OpenAI", draft: { name: "Azure OpenAI", note: "Azure OpenAI API 地址", website: "https://azure.microsoft.com/products/ai-services/openai-service", baseUrl: "https://<resource-name>.openai.azure.com/openai/v1", defaultModel: "" } },
];

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {hint && <span className="text-[11px] leading-4 text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Section({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid w-full min-w-0 gap-3 border-b border-border/60 py-5 last:border-b-0">
      <div className="flex min-w-0 items-center justify-between gap-4">
        <h3 className="min-w-0 text-base font-semibold leading-none text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function FloatingBackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="absolute left-0 right-0 top-0 z-20 flex items-center gap-3 border-b border-border/70 bg-background/95 px-8 py-2.5 shadow-[0_8px_24px_hsl(var(--background)/0.55)] backdrop-blur">
      <button
        type="button"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={onBack}
        aria-label="返回供应商列表"
        title="返回供应商列表"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <span className="min-w-0 truncate text-sm font-medium text-foreground">{title}</span>
    </div>
  );
}

export default function AiConfigManager({
  mode,
  config,
  selectedProvider,
  isLoading,
  isSaving,
  busyProviderId,
  modelSearchQuery,
  manualModelId,
  filteredModels,
  onSelectProvider,
  onCreateProvider,
  onFillDeepSeekDefaults,
  onUpdateProvider,
  onSetDefaultProvider,
  onSetDefaultModel,
  onDeleteProvider,
  onTestProvider,
  onSyncProviderModels,
  onTestCreateProvider,
  onSyncCreateProviderModels,
  onModelSearchChange,
  onManualModelIdChange,
  onAddModel,
  onDeleteModel,
  onReorderProviders,
  onOpenManager,
}: AiConfigManagerProps) {
  const [view, setView] = useState<ManagerView>("list");
  const [draggedProviderId, setDraggedProviderId] = useState<string | null>(null);
  const [deleteProviderId, setDeleteProviderId] = useState<string | null>(null);
  const [providerStatuses, setProviderStatuses] = useState<Record<string, ProviderStatus>>({});
  const [createDraft, setCreateDraft] = useState<CreateProviderDraft>(() => createBlankProviderDraft());
  const [createError, setCreateError] = useState("");
  const [createFeedback, setCreateFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [createBusyAction, setCreateBusyAction] = useState<"test" | "sync" | null>(null);
  const [defaultModelDropdownOpen, setDefaultModelDropdownOpen] = useState(false);

  const providers = config?.providers ?? [];
  const providerIds = useMemo(() => providers.map((provider) => provider.id), [providers]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const defaultProvider = providers.find((provider) => provider.id === config?.default_provider_id) ?? providers[0] ?? null;
  const defaultSummary = defaultProvider
    ? `${getProviderName(defaultProvider)} · ${getModelCountLabel(defaultProvider.models.length)}`
    : null;
  const activeProvider = view === "detail" ? selectedProvider : selectedProvider ?? defaultProvider;
  const activeProviderIsDefault = Boolean(activeProvider && config?.default_provider_id === activeProvider.id);
  const activeProviderDefaultModel = activeProvider?.default_model ?? "";
  const deleteProvider = deleteProviderId ? providers.find((provider) => provider.id === deleteProviderId) ?? null : null;

  const modelOptions = useMemo(
    () => [...new Set((activeProvider?.models ?? []).map((model) => model.id).filter(Boolean))],
    [activeProvider?.models],
  );

  const openDetailForProvider = (provider: AiProvider) => {
    onSelectProvider(provider);
    setView("detail");
  };

  const openCreatePage = (presetId: CreatePresetId = "custom") => {
    const preset = CREATE_PRESETS.find((item) => item.id === presetId) ?? CREATE_PRESETS[0];
    setCreateDraft({
      ...createBlankProviderDraft(),
      ...preset.draft,
      presetId: preset.id,
      apiKey: "",
      models: preset.draft.models ?? [],
    });
    setCreateError("");
    setCreateFeedback(null);
    setView("create");
  };

  const handleFillDeepSeek = () => {
    if (!activeProvider) {
      openCreatePage("deepseek");
      return;
    }
    const providerId = onFillDeepSeekDefaults();
    const provider = providerId ? (config?.providers ?? []).find((item) => item.id === providerId) : null;
    if (provider) onSelectProvider(provider);
    if (providerId) setView("detail");
  };

  const updateCreateDraft = (patch: Partial<CreateProviderDraft>) => {
    setCreateDraft((current) => ({ ...current, ...patch }));
    if (createError) setCreateError("");
    if (createFeedback) setCreateFeedback(null);
  };

  const handleSelectCreatePreset = (presetId: CreatePresetId) => {
    const preset = CREATE_PRESETS.find((item) => item.id === presetId) ?? CREATE_PRESETS[0];
    setCreateDraft((current) => ({
      ...current,
      ...preset.draft,
      presetId: preset.id,
      apiKey: "",
      models: preset.draft.models ?? [],
    }));
    setCreateError("");
    setCreateFeedback(null);
  };

  const cancelCreateProvider = () => {
    setCreateDraft(createBlankProviderDraft());
    setCreateError("");
    setCreateFeedback(null);
    setView("list");
  };

  const getCreatePayload = (): CreateProviderPayload => {
    const modelId = createDraft.defaultModel.trim();
    return {
      name: createDraft.name.trim(),
      baseUrl: createDraft.baseUrl.trim(),
      apiKey: createDraft.apiKey.trim(),
      defaultModel: modelId,
      models: modelId ? [modelId, ...createDraft.models.filter((item) => item.trim() && item.trim() !== modelId)] : createDraft.models,
    };
  };

  const testCreateProvider = async () => {
    if (!createDraft.baseUrl.trim()) {
      setCreateFeedback({ tone: "error", message: "请先填写 API 地址。" });
      return;
    }
    if (!createDraft.apiKey.trim()) {
      setCreateFeedback({ tone: "error", message: "请先填写 API Key。" });
      return;
    }
    setCreateBusyAction("test");
    setCreateFeedback(null);
    try {
      const result = await onTestCreateProvider(getCreatePayload());
      setCreateFeedback({ tone: result.ok ? "success" : "error", message: result.message });
    } finally {
      setCreateBusyAction(null);
    }
  };

  const syncCreateProviderModels = async () => {
    if (!createDraft.baseUrl.trim()) {
      setCreateFeedback({ tone: "error", message: "请先填写 API 地址。" });
      return;
    }
    if (!createDraft.apiKey.trim()) {
      setCreateFeedback({ tone: "error", message: "请先填写 API Key。" });
      return;
    }
    setCreateBusyAction("sync");
    setCreateFeedback(null);
    try {
      const result = await onSyncCreateProviderModels(getCreatePayload());
      if (result.ok) {
        setCreateDraft((current) => ({ ...current, models: result.models }));
      }
      setCreateFeedback({ tone: result.ok ? "success" : "error", message: result.message });
    } finally {
      setCreateBusyAction(null);
    }
  };

  const submitCreateProvider = () => {
    const name = createDraft.name.trim();
    if (!name) {
      setCreateError("请填写供应商名称。");
      return;
    }
    // note/website are create-page-only helpers; AiProvider has no persisted fields for them.
    const provider = onCreateProvider({ ...getCreatePayload(), name });
    if (!provider) return;
    setCreateDraft(createBlankProviderDraft());
    setCreateError("");
    setCreateFeedback(null);
    setView("list");
  };

  const handleTest = async (providerId: string) => {
    setProviderStatuses((current) => ({ ...current, [providerId]: "testing" }));
    const ok = await onTestProvider(providerId);
    setProviderStatuses((current) => ({ ...current, [providerId]: ok ? "ok" : "failed" }));
  };

  const handleSync = async (providerId: string) => {
    await onSyncProviderModels(providerId);
  };

  const handleProviderSortEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    setDraggedProviderId(null);
    if (!overId || activeId === overId) return;
    if (!providerIds.includes(activeId) || !providerIds.includes(overId)) return;
    onReorderProviders(activeId, overId);
  };

  const confirmDeleteProvider = () => {
    if (!deleteProviderId) return;
    onDeleteProvider(deleteProviderId, { skipConfirm: true });
    setDeleteProviderId(null);
  };

  const isBusy = busyProviderId !== null || isSaving;
  const activeProviderBusy = Boolean(activeProvider && busyProviderId === activeProvider.id);

  // ============================================================
  // ENTRY MODE — settings page card
  // ============================================================
  if (mode === "entry") {
    return (
      <div className="grid gap-3 rounded-md border border-border/70 bg-muted/10 p-4">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-base font-semibold text-foreground">AI 供应商</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">管理 NoteX 使用的模型、供应商和 API 配置。</div>
          </div>
          <Button type="button" size="sm" onClick={onOpenManager} disabled={isLoading}>
            <Server className="h-3.5 w-3.5" />
            打开管理中心
          </Button>
        </div>
        {providers.length > 0 ? (
          <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
            <div>
              当前使用：<span className="font-medium text-foreground">{defaultSummary}</span>
            </div>
            <div>共 {providers.length} 个供应商</div>
          </div>
        ) : (
          <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
            <div className="font-medium text-foreground">还没有 AI 供应商</div>
            <div>添加兼容 OpenAI 的 API 配置后即可在 NoteX 中使用。</div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // PAGE MODE — full management page (rendered inside settings center)
  // ============================================================
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      {/* ===== Header ===== */}
      {view === "list" && (
        <header className="shrink-0 border-b border-border/60 bg-muted/10 px-[25px] py-2">
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => openCreatePage()} disabled={isLoading || isSaving}>
              <Plus className="h-3.5 w-3.5" />
              新建供应商
            </Button>
          </div>
        </header>
      )}

      {/* ===== Body ===== */}
      <main className="min-h-0 flex-1 overflow-hidden">
      {view === "list" ? (
        <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden px-[25px] py-5">
          <div className="grid w-full min-w-0 gap-3">
            {providers.length === 0 ? (
              <div className="grid min-h-[360px] place-items-center rounded-md border border-dashed border-border/70 bg-muted/10 px-6 py-12 text-center">
                <div className="grid max-w-md gap-3">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-border/70 bg-background/60 text-muted-foreground">
                    <Server className="h-5 w-5" />
                  </div>
                  <div className="text-base font-semibold text-foreground">还没有 AI 供应商</div>
                  <div className="text-sm leading-6 text-muted-foreground">添加兼容 OpenAI 的 API 配置后即可在 NoteX 中使用。</div>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <Button type="button" size="sm" onClick={() => openCreatePage()}>
                      <Plus className="h-3.5 w-3.5" />
                      新建供应商
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={handleFillDeepSeek}>
                      填入 DeepSeek 默认配置
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(event) => setDraggedProviderId(String(event.active.id))} onDragCancel={() => setDraggedProviderId(null)} onDragEnd={handleProviderSortEnd}>
                <SortableContext items={providerIds} strategy={verticalListSortingStrategy}>
                  <div className="grid w-full min-w-0 gap-3">
              {providers.map((provider) => {
                const isDefault = provider.id === config?.default_provider_id;
                const providerStatus = providerStatuses[provider.id] ?? "untested";
                const providerBusy = busyProviderId === provider.id;
                return (
                  <SortableItem key={provider.id} id={provider.id} disabled={isSaving}>
                    {({ setNodeRef, attributes, listeners, transform, transition, isDragging }) => (
                  <div
                    ref={setNodeRef}
                    style={{ transform: CSS.Transform.toString(transform), transition, width: "100%", maxWidth: "100%" }}
                    className={cn("w-full min-w-0", isDragging && "relative z-10 opacity-70 shadow-sm")}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openDetailForProvider(provider)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") openDetailForProvider(provider);
                      }}
                      className={cn(
                        "group flex min-w-0 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors",
                        isDefault
                          ? "border-primary/35 bg-background/45 shadow-[inset_2px_0_0_hsl(var(--primary)/0.55)]"
                          : "border-border/60 bg-background/45 hover:border-border/80 hover:bg-muted/15",
                        draggedProviderId === provider.id && "opacity-60",
                      )}
                    >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <button
                        type="button"
                        title={`拖动供应商排序 ${getProviderName(provider)}`}
                        aria-label={`拖动供应商排序 ${getProviderName(provider)}`}
                        className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-muted/20 hover:text-muted-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={isSaving}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                        {...attributes}
                        {...listeners}
                      >
                        <GripVertical className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-muted/15">
                        <Server className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="grid min-w-0 flex-1 gap-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-foreground">{getProviderName(provider)}</span>
                      </div>
                      <div className="min-w-0 truncate text-xs leading-5 text-muted-foreground">
                        {provider.base_url || "未填写 Base URL"}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-2">
                      <span className="hidden shrink-0 rounded-sm border border-border/60 bg-muted/10 px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline-flex">
                        {getModelCountLabel(provider.models.length)}
                      </span>
                      {isDefault && (
                        <Button type="button" variant="secondary" size="xs" disabled className="h-7 border border-primary/20 bg-primary/10 px-2 text-[11px] text-primary opacity-100">
                          使用中
                        </Button>
                      )}
                    <div className="pointer-events-none flex shrink-0 items-center justify-end gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100" onClick={(event) => event.stopPropagation()}>
                      {!isDefault && (
                        <Button type="button" variant="ghost" size="xs" className="h-7 px-2 text-[11px]" onClick={() => onSetDefaultProvider(provider.id)} disabled={isSaving}>
                          启用
                        </Button>
                      )}
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => openDetailForProvider(provider)} aria-label={`编辑 ${getProviderName(provider)}`} title="编辑">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => void handleTest(provider.id)} disabled={isBusy} aria-label={`测试连接 ${getProviderName(provider)}`} title="测试连接" data-connection-status={providerStatus}>
                        {providerBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlugZap className="h-3 w-3" />}
                      </Button>
                      <Button type="button" variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-destructive" onClick={() => setDeleteProviderId(provider.id)} disabled={isBusy} aria-label={`删除 ${getProviderName(provider)}`} title="删除">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    </div>
                  </div>
                  </div>
                    )}
                  </SortableItem>
                );
              })}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      ) : view === "create" ? (
        <div className="relative h-full min-h-0 overflow-hidden">
          <FloatingBackHeader title="添加新供应商" onBack={cancelCreateProvider} />
          <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden pb-20">
            <div className="grid w-full min-w-0 gap-5 px-8 pb-8 pt-16">
              <div className="grid gap-3 border-b border-border/70 pb-4">
                <div className="grid gap-2">
                  <div className="text-xs font-medium text-foreground">预设供应商</div>
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {CREATE_PRESETS.map((preset) => (
                      <Button
                        key={preset.id}
                        type="button"
                        size="xs"
                        variant={createDraft.presetId === preset.id ? "secondary" : "outline"}
                        className={cn("h-7 rounded-sm px-2 text-[11px]", createDraft.presetId === preset.id && "border-primary/30 bg-primary/10 text-primary")}
                        onClick={() => handleSelectCreatePreset(preset.id)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid justify-items-center gap-2">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border/70 bg-muted/15 text-muted-foreground">
                  <Bot className="h-7 w-7" />
                </div>
              </div>

              <div className="grid w-full min-w-0 gap-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <FieldLabel label="供应商名称" />
                    <Input value={createDraft.name} onChange={(event) => updateCreateDraft({ name: event.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <FieldLabel label="备注" />
                    <Input value={createDraft.note} placeholder="例如：公司专用账号" onChange={(event) => updateCreateDraft({ note: event.target.value })} />
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <FieldLabel label="官网链接" />
                  <Input value={createDraft.website} placeholder="https://example.com" onChange={(event) => updateCreateDraft({ website: event.target.value })} />
                </div>

                <div className="grid gap-1.5">
                  <FieldLabel label="API Key" hint="API Key 保存在本机配置中。" />
                  <Input value={createDraft.apiKey} type="password" placeholder="sk-..." onChange={(event) => updateCreateDraft({ apiKey: event.target.value })} />
                </div>

                <div className="grid gap-1.5">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <FieldLabel label="API 地址" hint="兼容 OpenAI 的 API 地址，例如 https://api.example.com/v1。" />
                    <Button type="button" variant="outline" size="sm" onClick={() => void testCreateProvider()} disabled={createBusyAction !== null}>
                      {createBusyAction === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                      测试连接
                    </Button>
                  </div>
                  <Input value={createDraft.baseUrl} placeholder="https://your-api-endpoint.com/v1" onChange={(event) => updateCreateDraft({ baseUrl: event.target.value })} />
                </div>

                <div className="grid gap-1.5">
                  <FieldLabel label="默认模型" hint="可手动输入，也可从获取到的模型列表中选择；留空则不设置默认模型。" />
                  <Input value={createDraft.defaultModel} placeholder="gpt-4o" onChange={(event) => updateCreateDraft({ defaultModel: event.target.value })} />
                </div>

                <div className="grid gap-2">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <h3 className="min-w-0 text-base font-semibold leading-none text-foreground">模型列表</h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      onClick={() => void syncCreateProviderModels()}
                      disabled={createBusyAction !== null}
                    >
                      {createBusyAction === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      获取模型列表
                    </Button>
                  </div>
                  <div className="max-h-[240px] w-full min-w-0 overflow-auto rounded-md border border-border/70">
                    {createDraft.models.length > 0 ? createDraft.models.map((modelId) => {
                      const isDefault = createDraft.defaultModel.trim() === modelId;
                      return (
                        <div key={modelId} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/50 px-3 py-2 text-sm last:border-b-0">
                          <span className="min-w-0 truncate text-foreground">{modelId}</span>
                          <Button type="button" size="xs" variant={isDefault ? "secondary" : "outline"} onClick={() => updateCreateDraft({ defaultModel: modelId })}>
                            {isDefault ? "已默认" : "设为默认"}
                          </Button>
                        </div>
                      );
                    }) : (
                      <div className="px-3 py-8 text-center text-sm text-muted-foreground">暂无模型。可手动填写默认模型，或获取模型列表。</div>
                    )}
                  </div>
                </div>

                {createError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {createError}
                  </div>
                )}
                {createFeedback && (
                  <div
                    className={cn(
                      "rounded-md border px-3 py-2 text-xs",
                      createFeedback.tone === "success"
                        ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                        : "border-destructive/30 bg-destructive/10 text-destructive",
                    )}
                  >
                    {createFeedback.message}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-end gap-2 border-t border-border/70 bg-background/95 px-8 py-2.5 shadow-[0_-8px_24px_hsl(var(--background)/0.75)] backdrop-blur">
            <Button type="button" variant="outline" size="sm" onClick={cancelCreateProvider}>
              取消
            </Button>
            <Button type="button" size="sm" onClick={submitCreateProvider} disabled={isSaving || createBusyAction !== null}>
              添加
            </Button>
          </div>
        </div>
      ) : !activeProvider ? (
        <div className="relative h-full min-h-0 overflow-hidden">
          <FloatingBackHeader title="编辑供应商" onBack={() => setView("list")} />
          <div className="flex h-full min-h-0 items-center justify-center px-6 pt-12">
            <div className="grid max-w-sm gap-2 text-center">
              <div className="text-sm font-medium text-foreground">当前供应商不可用</div>
              <div className="text-xs leading-5 text-muted-foreground">请返回供应商列表后重新选择。</div>
              <Button type="button" variant="outline" size="sm" className="mx-auto mt-2" onClick={() => setView("list")}>
                返回列表
              </Button>
            </div>
          </div>
        </div>
      ) : (
          <div className="relative h-full min-h-0 overflow-hidden">
            <FloatingBackHeader title="编辑供应商" onBack={() => setView("list")} />
            <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden">
              <div className="grid w-full min-w-0 gap-4 px-8 pb-8 pt-16">
                <Section title="基本信息">
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <FieldLabel label="供应商名称" />
                      <Input value={activeProvider.name} placeholder="DeepSeek 主力" onChange={(event) => onUpdateProvider(activeProvider.id, { name: event.target.value, updated_at: Date.now() })} />
                      <p className="h-4 text-[11px] leading-4 text-muted-foreground">&nbsp;</p>
                    </div>
                    <div className="space-y-2">
                      <FieldLabel label="默认模型" />
                      <div
                        className="relative"
                        onBlur={(event) => {
                          const nextTarget = event.relatedTarget;
                          if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
                            setDefaultModelDropdownOpen(false);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setDefaultModelDropdownOpen(false);
                        }}
                      >
                        <Input
                          value={activeProviderDefaultModel}
                          placeholder="deepseek-chat"
                          className="pr-10"
                          onChange={(event) => onUpdateProvider(activeProvider.id, { default_model: event.target.value.trim() || null, updated_at: Date.now() })}
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          aria-label="展开默认模型列表"
                          title="展开默认模型列表"
                          aria-expanded={defaultModelDropdownOpen}
                          onClick={() => setDefaultModelDropdownOpen((open) => !open)}
                        >
                          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", defaultModelDropdownOpen && "rotate-180")} />
                        </button>
                        {defaultModelDropdownOpen && (
                          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-border/70 bg-popover p-1 text-popover-foreground shadow-lg">
                            {modelOptions.length > 0 ? (
                              modelOptions.map((modelId) => {
                                const isSelected = activeProviderDefaultModel === modelId;
                                return (
                                  <button
                                    key={modelId}
                                    type="button"
                                    className={cn(
                                      "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground",
                                      isSelected && "bg-primary/10 text-primary",
                                    )}
                                    onClick={() => {
                                      onSetDefaultModel(activeProvider.id, modelId);
                                      setDefaultModelDropdownOpen(false);
                                    }}
                                  >
                                    <span className="min-w-0 truncate">{modelId}</span>
                                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                                  </button>
                                );
                              })
                            ) : (
                              <div className="px-2 py-4 text-center text-xs text-muted-foreground">暂无模型，请先同步或手动添加模型</div>
                            )}
                          </div>
                        )}
                      </div>
                      <p className="h-4 text-[11px] leading-4 text-muted-foreground">可手动输入，也可从已同步或手动添加的模型中选择。</p>
                    </div>
                  </div>
                </Section>

                <Section title="连接配置">
                  <div className="grid w-full min-w-0 gap-3">
                    <div className="grid gap-1.5">
                      <FieldLabel label="API 地址" hint="兼容 OpenAI 的 API 地址，例如 https://api.example.com/v1。" />
                      <Input value={activeProvider.base_url} placeholder="https://api.example.com/v1" onChange={(event) => onUpdateProvider(activeProvider.id, { base_url: event.target.value, updated_at: Date.now() })} />
                    </div>
                    <div className="grid gap-1.5">
                      <FieldLabel label="API Key" hint="密钥只在输入框内显示；API Key 保存在本机配置中。" />
                      <Input value={activeProvider.api_key} type="password" placeholder="sk-..." onChange={(event) => onUpdateProvider(activeProvider.id, { api_key: event.target.value, updated_at: Date.now() })} />
                    </div>
                  </div>
                </Section>

                <Section
                  title="模型列表"
                  action={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      onClick={() => void handleSync(activeProvider.id)}
                      disabled={isBusy}
                    >
                      {activeProviderBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      获取模型列表
                    </Button>
                  }
                >
                  <div className="grid w-full min-w-0 gap-3">
                    <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <div className="relative min-w-0">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input value={modelSearchQuery} placeholder="搜索模型" onChange={(event) => onModelSearchChange(event.target.value)} className="pl-8" />
                      </div>
                      <Input value={manualModelId} placeholder="手动添加模型 ID" onChange={(event) => onManualModelIdChange(event.target.value)} />
                      <Button type="button" variant="outline" size="sm" onClick={onAddModel} disabled={!manualModelId.trim()}>
                        <Plus className="h-3.5 w-3.5" />
                        添加模型
                      </Button>
                    </div>
                    <div className="max-h-[300px] w-full min-w-0 overflow-auto rounded-md border border-border/70">
                      {filteredModels.length > 0 ? filteredModels.map((model) => {
                        const isDefault = model.id === activeProvider.default_model || (activeProviderIsDefault && model.id === config?.default_model_id);
                        return (
                          <div key={model.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/50 px-3 py-2 text-sm last:border-b-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="min-w-0 truncate text-foreground">{model.name || model.id}</span>
                              {isDefault && <span className="inline-flex h-5 shrink-0 items-center rounded-sm border border-primary/45 bg-primary/10 px-1.5 text-[11px] text-primary">默认</span>}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button type="button" size="xs" variant={isDefault ? "secondary" : "outline"} onClick={() => onSetDefaultModel(activeProvider.id, model.id)}>
                                {isDefault ? "已默认" : "设为默认"}
                              </Button>
                              <Button type="button" size="icon-xs" variant="ghost" onClick={() => onDeleteModel(activeProvider.id, model.id)} aria-label={`删除模型 ${model.id}`}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="px-3 py-8 text-center text-sm text-muted-foreground">暂无匹配模型。</div>
                      )}
                    </div>
                  </div>
                </Section>
              </div>
            </div>
          </div>
      )}
      </main>

      {/* ===== Delete confirmation ===== */}
      {deleteProvider && (
        <div className="absolute inset-0 z-[140] grid place-items-center bg-black/45 px-4" role="presentation">
          <div
            className="w-full max-w-sm rounded-lg border border-border/80 bg-popover p-5 text-popover-foreground shadow-2xl shadow-black/35"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ai-config-delete-title"
            aria-describedby="ai-config-delete-description"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div id="ai-config-delete-title" className="font-heading text-base font-semibold tracking-tight text-foreground">删除供应商？</div>
            <div id="ai-config-delete-description" className="mt-2 text-xs leading-5 text-muted-foreground">
              将删除「{getProviderName(deleteProvider)}」及其模型列表配置。此操作不可撤销。
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDeleteProviderId(null)}>
                取消
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={confirmDeleteProvider} disabled={isBusy}>
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
