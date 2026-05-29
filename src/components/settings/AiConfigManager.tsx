import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, GripVertical, Loader2, PackagePlus, Pencil, PlugZap, Plus, RefreshCw, Search, Server, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AiConfig, AiProvider } from "@/lib/api";
import { SortableItem } from "../tag-manager/SortableItem";

type ManagerView = "list" | "detail";
type ProviderStatus = "untested" | "testing" | "ok" | "failed";

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
  onCreateProvider: () => string | null;
  onFillDeepSeekDefaults: () => string | null;
  onUpdateProvider: (providerId: string, patch: Partial<AiProvider>) => void;
  onSetDefaultProvider: (providerId: string) => void;
  onSetDefaultModel: (providerId: string, modelId: string) => void;
  onDeleteProvider: (providerId: string) => void;
  onTestProvider: (providerId: string) => Promise<boolean>;
  onSyncProviderModels: (providerId: string) => Promise<boolean>;
  onModelSearchChange: (value: string) => void;
  onManualModelIdChange: (value: string) => void;
  onAddModel: () => void;
  onDeleteModel: (providerId: string, modelId: string) => void;
  onReorderProviders: (sourceId: string, targetId: string) => void;
  onOpenManager?: () => void;
}

const getProviderName = (provider: AiProvider | null | undefined) => provider?.name.trim() || provider?.id || "";

const getModelCountLabel = (count: number) => `${count} ${count === 1 ? "model" : "models"}`;

function StatusBadge({ status }: { status: ProviderStatus }) {
  const label = status === "testing" ? "测试中" : status === "ok" ? "连接正常" : status === "failed" ? "连接失败" : "未测试";
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-sm border px-1.5 text-[11px]",
        status === "ok" && "border-emerald-400/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
        status === "failed" && "border-red-400/45 bg-red-500/10 text-red-700 dark:text-red-200",
        status === "testing" && "border-sky-400/45 bg-sky-500/10 text-sky-700 dark:text-sky-200",
        status === "untested" && "border-border/70 bg-muted/20 text-muted-foreground",
      )}
    >
      {status === "testing" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {label}
    </span>
  );
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {hint && <span className="text-[11px] leading-4 text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-3 border-b border-border/60 py-5 last:border-b-0">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {children}
    </section>
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

  const providers = config?.providers ?? [];
  const providerIds = useMemo(() => providers.map((provider) => provider.id), [providers]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const defaultProvider = providers.find((provider) => provider.id === config?.default_provider_id) ?? providers[0] ?? null;
  const defaultSummary = defaultProvider
    ? `${getProviderName(defaultProvider)} · ${getModelCountLabel(defaultProvider.models.length)}`
    : null;
  const activeProvider = selectedProvider ?? defaultProvider;
  const activeProviderName = getProviderName(activeProvider) || "AI 配置组";
  const activeProviderIsDefault = Boolean(activeProvider && config?.default_provider_id === activeProvider.id);
  const activeProviderDefaultModel = activeProvider?.default_model ?? config?.default_model_id ?? "";
  const activeStatus = activeProvider ? providerStatuses[activeProvider.id] ?? "untested" : "untested";
  const deleteProvider = deleteProviderId ? providers.find((provider) => provider.id === deleteProviderId) ?? null : null;

  const modelOptions = useMemo(
    () => [...new Set((activeProvider?.models ?? []).map((model) => model.id).filter(Boolean))],
    [activeProvider?.models],
  );

  const openDetailForProvider = (provider: AiProvider) => {
    onSelectProvider(provider);
    setView("detail");
  };

  const handleCreate = () => {
    const providerId = onCreateProvider();
    const provider = providerId ? providers.find((item) => item.id === providerId) : null;
    if (provider) onSelectProvider(provider);
    setView("detail");
  };

  const handleFillDeepSeek = () => {
    const providerId = onFillDeepSeekDefaults();
    const provider = providerId ? (config?.providers ?? []).find((item) => item.id === providerId) : null;
    if (provider) onSelectProvider(provider);
    if (providerId) setView("detail");
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
    onDeleteProvider(deleteProviderId);
    setDeleteProviderId(null);
  };

  const defaultModelDatalistId = activeProvider ? `ai-default-models-${activeProvider.id}` : "ai-default-models";
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
            <div className="text-base font-semibold text-foreground">AI 配置组</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">管理 NoteX 使用的模型与 API 配置。</div>
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
            <div>共 {providers.length} 个配置组</div>
          </div>
        ) : (
          <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
            <div className="font-medium text-foreground">还没有 AI 配置组</div>
            <div>添加 OpenAI-compatible API 配置后即可在 NoteX 中使用。</div>
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
      <header className="shrink-0 border-b border-border/60 bg-muted/10 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">
              AI 配置组
            </h2>
            <p className="text-xs leading-5 text-muted-foreground">管理 NoteX 使用的模型与 API 配置</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={handleCreate} disabled={isLoading || isSaving}>
              <Plus className="h-3.5 w-3.5" />
              新建配置组
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleFillDeepSeek} disabled={isSaving}>
              <PackagePlus className="h-3.5 w-3.5" />
              填入 DeepSeek 默认配置
            </Button>
          </div>
        </div>
      </header>

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
                  <div className="text-base font-semibold text-foreground">还没有 AI 配置组</div>
                  <div className="text-sm leading-6 text-muted-foreground">添加 OpenAI-compatible API 配置后即可在 NoteX 中使用。</div>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <Button type="button" size="sm" onClick={handleCreate}>
                      <Plus className="h-3.5 w-3.5" />
                      新建配置组
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
                const status = providerStatuses[provider.id] ?? "untested";
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
                        title={`拖动配置组排序 ${getProviderName(provider)}`}
                        aria-label={`拖动配置组排序 ${getProviderName(provider)}`}
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
                        <StatusBadge status={status} />
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
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => void handleTest(provider.id)} disabled={isBusy} aria-label={`测试连接 ${getProviderName(provider)}`} title="测试连接">
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
      ) : (
        activeProvider && (
          <div className="relative h-full min-h-0 overflow-hidden">
            <button
              type="button"
              className="absolute left-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-md border border-border/50 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-accent hover:text-foreground"
              onClick={() => setView("list")}
              aria-label="返回配置组列表"
              title="返回配置组列表"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden">
              <div className="mx-auto grid max-w-[920px] gap-4 px-6 pb-8 pt-16">
                <div className="flex min-w-0 flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="min-w-0 truncate text-xl font-semibold text-foreground">{activeProviderName}</div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>OpenAI-compatible API</span>
                      <span>·</span>
                      <span>{getModelCountLabel(activeProvider.models.length)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleTest(activeProvider.id)} disabled={isBusy}>
                      {activeProviderBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                      测试连接
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleSync(activeProvider.id)} disabled={isBusy}>
                      {activeProviderBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      同步模型
                    </Button>
                  </div>
                </div>

                <Section title="基本信息">
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <FieldLabel label="配置组名称" />
                      <Input value={activeProvider.name} placeholder="DeepSeek 主力" onChange={(event) => onUpdateProvider(activeProvider.id, { name: event.target.value, updated_at: Date.now() })} />
                      <p className="h-4 text-[11px] leading-4 text-muted-foreground">&nbsp;</p>
                    </div>
                    <div className="space-y-2">
                      <FieldLabel label="默认模型" />
                      <Input
                        list={defaultModelDatalistId}
                        value={activeProviderDefaultModel}
                        placeholder="deepseek-chat"
                        onChange={(event) => onUpdateProvider(activeProvider.id, { default_model: event.target.value.trim() || null, updated_at: Date.now() })}
                      />
                      <p className="h-4 text-[11px] leading-4 text-muted-foreground">可手动输入，也可从已同步或手动添加的模型中选择。</p>
                      <datalist id={defaultModelDatalistId}>
                        {modelOptions.map((modelId) => <option key={modelId} value={modelId} />)}
                      </datalist>
                    </div>
                  </div>
                </Section>

                <Section title="连接配置">
                  <div className="grid gap-3">
                    <div className="grid gap-1.5">
                      <FieldLabel label="Base URL" hint="OpenAI-compatible endpoint，例如 https://api.example.com/v1。" />
                      <Input value={activeProvider.base_url} placeholder="https://api.example.com/v1" onChange={(event) => onUpdateProvider(activeProvider.id, { base_url: event.target.value, updated_at: Date.now() })} />
                    </div>
                    <div className="grid gap-1.5">
                      <FieldLabel label="API Key" hint="密钥只在输入框内显示；保存方式沿用现有配置逻辑。" />
                      <Input value={activeProvider.api_key} type="password" placeholder="sk-..." onChange={(event) => onUpdateProvider(activeProvider.id, { api_key: event.target.value, updated_at: Date.now() })} />
                    </div>
                  </div>
                </Section>

                <Section title="连接操作">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleTest(activeProvider.id)} disabled={isBusy}>
                      {activeProviderBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                      测试连接
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleSync(activeProvider.id)} disabled={isBusy}>
                      {activeProviderBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      同步模型
                    </Button>
                    <StatusBadge status={activeStatus} />
                  </div>
                </Section>

                <Section title="模型列表">
                  <div className="grid gap-3">
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
                    <div className="max-h-[300px] overflow-auto rounded-md border border-border/70">
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
        )
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
            <div id="ai-config-delete-title" className="font-heading text-base font-semibold tracking-tight text-foreground">删除配置组？</div>
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
