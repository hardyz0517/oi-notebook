import { memo, useState } from "react";
import type { WebSearchProvider, WebSource } from "@/lib/aiWebSearch";
import {
  formatBingDiagnostics,
  formatDirectDiscoveryDiagnostics,
  formatNewsReadDiagnostics,
  formatSearchPreparationDiagnosticsForDisplay,
  getDebugReasonLabel,
  getSearchStageDebugLabel,
} from "@/lib/searchDiagnostics";
import { cn } from "@/lib/utils";
import {
  getProviderDebugLabel,
  getReliabilityLabel,
  getSourceCardDescription,
  getSourceDebugCacheLabel,
  getSourceDebugKindLabel,
  getSourceDebugReadMethodLabel,
  getSourceExcerptStatusLabel,
  getSourceOriginLabel,
  getSourceRelevanceLabel,
  getSourceTypeLabel,
  isDirectDiscoverySource,
  SEARCH_SOURCE_PREVIEW_LIMIT,
  splitDebugItem,
} from "./diagnosticsUtils";

type WebSearchSourcesCardProps = {
  sources?: WebSource[];
  error?: string;
  searchDebug?: string;
  messageId?: string;
  highlightedCitationId?: string | null;
  provider: WebSearchProvider;
  onOpenExternalUrl: (url: string) => void | Promise<void>;
  onPerfCounter?: (name: string, amount?: number) => void;
};

function WebSearchSourcesCardComponent({
  sources,
  error,
  searchDebug,
  messageId,
  highlightedCitationId,
  provider,
  onOpenExternalUrl,
  onPerfCounter,
}: WebSearchSourcesCardProps) {
  const visibleSources = (sources ?? []).slice(0, SEARCH_SOURCE_PREVIEW_LIMIT);
  const hiddenCount = Math.max(0, (sources?.length ?? 0) - visibleSources.length);
  const [isExpanded, setIsExpanded] = useState(false);

  if (visibleSources.length === 0 && !error && !searchDebug) return null;
  onPerfCounter?.("webSearchSourcesCardRender");
  if (!isExpanded) {
    const sourceCount = sources?.length ?? 0;
    return (
      <div className="notex-debug-card notex-web-source-card mb-2 grid gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-3.5 py-2.5 text-[13px] leading-6 text-slate-700 shadow-[0_8px_20px_rgb(15_23_42/0.05)] dark:border-emerald-400/20 dark:bg-emerald-400/[0.07] dark:text-slate-200">
        <button
          type="button"
          className="flex min-w-0 items-center justify-between gap-3 text-left"
          onClick={() => setIsExpanded(true)}
        >
          <span className="min-w-0 truncate font-medium text-foreground">搜索来源诊断</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">展开来源</span>
        </button>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>sources={sourceCount}</span>
          {hiddenCount > 0 && <span>hidden={hiddenCount}</span>}
          {error && <span>hasError</span>}
          {searchDebug && <span>hasDiagnostics</span>}
        </div>
      </div>
    );
  }

  const strongCount = (sources ?? []).filter((source) => source.relevance !== "candidate").length;
  const candidateCount = (sources ?? []).filter((source) => source.relevance === "candidate").length;
  const usableCount = (sources ?? []).filter((source) => source.usableEvidence === true && source.evidenceStatus === "usable").length;
  const rejectedCount = (sources ?? []).filter((source) => source.evidenceStatus === "rejected").length;
  const directSources = (sources ?? []).filter(isDirectDiscoverySource);

  const diagnosticsText = searchDebug ?? visibleSources.find((source) => source.searchDiagnostics)?.searchDiagnostics;
  if (diagnosticsText) {
    onPerfCounter?.("diagnosticsMarkdownFormatCount");
  }
  const bingDiagnosticsLines = diagnosticsText && (diagnosticsText.includes("provider=bing") || diagnosticsText.includes("attemptedStages="))
    ? formatBingDiagnostics(diagnosticsText)
    : [];
  const preparationDiagnosticsLines = diagnosticsText ? formatSearchPreparationDiagnosticsForDisplay(diagnosticsText) : [];
  const directDiagnosticsLines = diagnosticsText ? formatDirectDiscoveryDiagnostics(diagnosticsText) : [];
  const newsReadDiagnosticsLines = diagnosticsText ? formatNewsReadDiagnostics(diagnosticsText) : [];
  if (directSources.length > 0) {
    onPerfCounter?.("directSourceCardRender", Math.min(directSources.length, 6));
  }

  return (
    <div className="notex-debug-card notex-web-source-card mb-2 grid gap-2.5 rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-3.5 py-3 text-[13px] leading-6 text-slate-700 shadow-[0_8px_20px_rgb(15_23_42/0.05)] dark:border-emerald-400/20 dark:bg-emerald-400/[0.07] dark:text-slate-200">
      {visibleSources.length > 0 ? (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              {usableCount > 0 ? `可引用来源 ${usableCount} 个` : "找到候选，但没有成功读取到可引用正文"}
            </span>
            <span className="rounded-full border border-emerald-200/80 bg-white/70 px-1.5 py-0.5 text-[10px] leading-4 text-emerald-700 dark:border-emerald-300/20 dark:bg-white/[0.05] dark:text-emerald-200">
              {visibleSources.some((source) => source.sourceKind === "explicit_url") ? "含用户链接" : "仅搜索结果"}
            </span>
            {visibleSources.length > 0 && (
              <span className="text-[12px] text-muted-foreground">
                强相关 {strongCount} 个 · 候选 {candidateCount} 个 · 拒绝 {rejectedCount} 个
              </span>
            )}
          </div>
          <div className="grid gap-2">
            {visibleSources.map((source, index) => {
              const description = getSourceCardDescription(source);
              const clusterDebugItems = [
                source.eventCluster ? `Event cluster：${source.eventCluster}` : undefined,
                source.clusterLabel ? `Cluster label：${source.clusterLabel}` : undefined,
                source.clusterReason ? `Cluster reason：${source.clusterReason}` : undefined,
                typeof source.clusterSize === "number" ? `Cluster size：${source.clusterSize}` : undefined,
                source.queryFocusEntities?.length ? `Query focus：${source.queryFocusEntities.join(", ")}` : undefined,
                source.companySpecificNews !== undefined ? `Company-specific news：${source.companySpecificNews === true ? "yes" : "no"}` : undefined,
                source.focusEntitySource ? `Focus entity source：${source.focusEntitySource}` : undefined,
                source.candidatePrimaryEntities?.length ? `Candidate entities：${source.candidatePrimaryEntities.join(", ")}` : undefined,
                source.entityMatchStrength ? `Entity match：${source.entityMatchStrength}` : undefined,
                source.entityFilterApplied !== undefined ? `Entity filter：${source.entityFilterApplied === true ? "yes" : "no"}` : undefined,
                source.rejectedWrongEntityReason ? `Wrong entity reason：${source.rejectedWrongEntityReason}` : undefined,
                source.selectedForRoundup !== undefined ? `Selected for roundup：${source.selectedForRoundup === true ? "yes" : "no"}` : undefined,
                source.droppedAsDuplicateCluster === true ? "Dropped：duplicate event cluster" : undefined,
              ].filter((item): item is string => Boolean(item));
              const debugItems = [
                ...clusterDebugItems,
                `来源类型：${getSourceDebugKindLabel(source)}`,
                `读取方式：${getSourceDebugReadMethodLabel(source)}`,
                getProviderDebugLabel(source, provider),
                getSearchStageDebugLabel(source),
                source.discoveryMethod ? `Discovery：${source.discoveryMethod}` : undefined,
                source.sourceKind ? `SourceKind：${source.sourceKind}` : undefined,
                source.discoveredBy ? `DiscoveredBy：${source.discoveredBy}` : undefined,
                source.feedUrl ? `Feed：${source.feedUrl}` : undefined,
                source.sourceHome ? `SourceHome：${source.sourceHome}` : undefined,
                source.directDiscoveryReason ? `Direct：${source.directDiscoveryReason}` : undefined,
                source.newsLike === true ? "新闻判断：像新闻" : source.newsLike === false ? "新闻判断：不像新闻" : undefined,
                `Evidence：${source.evidenceStatus ?? "candidate"}`,
                `Page：${source.pageType ?? "unknown"}`,
                `Content：${source.contentStatus ?? "not_fetched"}`,
                source.finalUrlHost ? `Final host：${source.finalUrlHost}` : undefined,
                source.contentType ? `Content-Type：${source.contentType}` : undefined,
                typeof source.bodyBytes === "number" ? `Body bytes：${source.bodyBytes}` : undefined,
                typeof source.extractedTextChars === "number" ? `Extracted chars：${source.extractedTextChars}` : undefined,
                typeof source.excerptChars === "number" ? `Excerpt chars：${source.excerptChars}` : undefined,
                source.publishedAt ? `Published：${source.publishedAt}` : undefined,
                source.sourcePublishedAt ? `Freshness date：${source.sourcePublishedAt}` : undefined,
                source.freshnessStatus ? `Freshness：${source.freshnessStatus}` : undefined,
                typeof source.sourceAgeDays === "number" ? `Age days：${source.sourceAgeDays}` : undefined,
                source.staleReason ? `Stale reason：${source.staleReason}` : undefined,
                `Strength：${source.sourceStrength ?? "rejected"}`,
                `Usable：${source.usableEvidence === true ? "是" : "否"}`,
                source.rejectedReason ? `拒绝原因：${source.rejectedReason}` : undefined,
                source.evidenceReason ? `准入原因：${source.evidenceReason}` : undefined,
                source.needsJsReason ? `needs_js：${source.needsJsReason}` : undefined,
                source.blockedReason ? `blocked：${source.blockedReason}` : undefined,
                source.extractionFailureReason ? `extractor failure：${source.extractionFailureReason}` : undefined,
                source.filteredReason ? `过滤原因：${getDebugReasonLabel(source.filteredReason)}` : undefined,
                source.dateHint ? `发布时间：${source.dateHint}` : undefined,
                typeof source.freshnessScore === "number" ? `时效评分：${source.freshnessScore}` : undefined,
                `已注入回答上下文：${source.injectedIntoAnswer === true ? "是" : "否"}`,
                source.sourceRegistryBoost ? `站点加权：${source.sourceRegistryLabel ?? "命中"} (${source.sourceRegistryBoost > 0 ? "+" : ""}${source.sourceRegistryBoost})` : undefined,
                `缓存：${getSourceDebugCacheLabel(source)}`,
              ].filter((item): item is string => Boolean(item));
              return (
                <div
                  key={[
                    "source-card",
                    source.id || "no-id",
                    source.url || "no-url",
                    source.sourceType || "no-type",
                    source.sourceKind || "no-kind",
                    source.evidenceStatus || "no-status",
                    index,
                  ].join(":")}
                  data-source-message-id={messageId}
                  data-source-citation-id={source.citationId}
                  className={cn(
                    "notex-source-card grid min-w-0 gap-1 rounded-lg border border-border/60 bg-background/75 px-2.5 py-2 transition-colors dark:border-white/10 dark:bg-white/[0.04]",
                    highlightedCitationId && source.citationId === highlightedCitationId && "border-primary/60 bg-primary/10 ring-1 ring-primary/30 dark:bg-primary/15",
                  )}
                >
                  <div className="notex-source-pill-row flex min-w-0 flex-wrap items-center gap-1.5">
                    {source.citationId && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                        {source.citationId}
                      </span>
                    )}
                    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-200">
                      {getSourceTypeLabel(source.sourceType)}
                    </span>
                    <span
                      className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-700 dark:text-sky-200"
                      title={[source.relevanceReason, source.rankReason].filter(Boolean).join(" · ") || undefined}
                    >
                      {getSourceRelevanceLabel(source)}
                    </span>
                    <span
                      className="rounded-full bg-background/80 px-1.5 py-0.5 text-[11px] text-foreground dark:bg-white/[0.05]"
                      title={source.reliabilityReason}
                    >
                      {getReliabilityLabel(source)}
                    </span>
                    <span
                      className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-200"
                      title={[
                        source.excerptError,
                        source.cacheStatus === "hit" ? "来自本地联网缓存" : undefined,
                        source.cacheStatus === "stale" ? "Provider 失败，使用过期本地缓存" : undefined,
                      ].filter(Boolean).join("；") || undefined}
                    >
                      {getSourceExcerptStatusLabel(source)}
                    </span>
                    <span
                      className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[11px] text-violet-700 dark:text-violet-200"
                      title={source.constructedReason}
                    >
                      {getSourceOriginLabel(source)}
                    </span>
                    <span className="notex-source-pill min-w-0 max-w-full break-words text-[12px] text-muted-foreground">
                      {source.site ?? source.url}
                    </span>
                  </div>
                  <a
                    href={source.url}
                    className="min-w-0 break-words text-sm font-medium leading-5 text-foreground underline decoration-transparent underline-offset-4 transition-colors hover:text-primary hover:decoration-current"
                    title={source.url}
                    onClick={(event) => {
                      event.preventDefault();
                      void onOpenExternalUrl(source.url);
                    }}
                  >
                    {source.title}
                  </a>
                  {description && (
                    <div className="line-clamp-2 min-w-0 break-words text-[12px] leading-5 text-muted-foreground">
                      {description}
                    </div>
                  )}
                  <div className="min-w-0 break-all text-[11px] leading-5 text-muted-foreground/80">
                    {source.url}
                  </div>
                  <div className="notex-source-detail-grid min-w-0 text-[12px] leading-5 text-muted-foreground/80">
                    {debugItems.map((item, debugIndex) => {
                      const debugItem = splitDebugItem(item);
                      return (
                        <span key={`source-debug:${index}:${debugIndex}:${item}`} className="notex-source-detail-row">
                          {debugItem.key && <span className="notex-source-detail-key">{debugItem.key}</span>}
                          <span className="notex-source-detail-value">{debugItem.value}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <div className="text-[11px] text-muted-foreground">还有 {hiddenCount} 个来源未展开。</div>
          )}
          {error && (
            <div className="text-[11px] leading-5 text-muted-foreground">{error}</div>
          )}
          {bingDiagnosticsLines.length > 0 && (
            <div className="grid gap-1 rounded-md border border-amber-200/60 bg-amber-50/70 px-2.5 py-2 text-[12px] leading-5 text-amber-900 dark:border-amber-300/20 dark:bg-amber-400/[0.08] dark:text-amber-100">
              <div className="font-medium">Bing 阶段诊断</div>
              {bingDiagnosticsLines.map((line, index) => (
                <div key={`success-bing-diagnostic:${index}:${line}`} className="break-words">{line}</div>
              ))}
            </div>
          )}
          {preparationDiagnosticsLines.length > 0 && (
            <div className="grid gap-1 rounded-md border border-slate-200/80 bg-slate-50/80 px-2.5 py-2 text-[12px] leading-5 text-slate-800 dark:border-slate-300/20 dark:bg-white/[0.06] dark:text-slate-100">
              <div className="font-medium">搜索准备诊断</div>
              {preparationDiagnosticsLines.map((line, index) => (
                <div key={`success-preparation-diagnostic:${index}:${line}`} className="break-words">{line}</div>
              ))}
            </div>
          )}
          {directDiagnosticsLines.length > 0 && (
            <div className="grid gap-1 rounded-md border border-cyan-200/60 bg-cyan-50/70 px-2.5 py-2 text-[12px] leading-5 text-cyan-950 dark:border-cyan-300/20 dark:bg-cyan-400/[0.08] dark:text-cyan-100">
              <div className="font-medium">Direct Discovery 诊断</div>
              {directDiagnosticsLines.map((line, index) => (
                <div key={`success-direct-diagnostic:${index}:${line}`} className="break-words">{line}</div>
              ))}
            </div>
          )}
          {newsReadDiagnosticsLines.length > 0 && (
            <div className="grid gap-1 rounded-md border border-emerald-200/70 bg-emerald-50/70 px-2.5 py-2 text-[12px] leading-5 text-emerald-950 dark:border-emerald-300/20 dark:bg-emerald-400/[0.08] dark:text-emerald-100">
              <div className="font-medium">News Read Budget</div>
              {newsReadDiagnosticsLines.map((line, index) => (
                <div key={`success-news-read-diagnostic:${index}:${line}`} className="break-words">{line}</div>
              ))}
            </div>
          )}
          {directSources.length > 0 && (
            <div className="grid gap-1 rounded-md border border-cyan-200/60 bg-cyan-50/70 px-2.5 py-2 text-[12px] leading-5 text-cyan-950 dark:border-cyan-300/20 dark:bg-cyan-400/[0.08] dark:text-cyan-100">
              <div className="font-medium">Direct Discovery</div>
              {directSources.slice(0, 6).map((source, index) => (
                <div key={[
                  "success-direct-source",
                  source.id || "no-id",
                  source.url || "no-url",
                  source.title || "no-title",
                  source.discoveryMethod || "no-discovery",
                  source.sourceKind || "no-kind",
                  source.evidenceStatus || "no-status",
                  index,
                ].join(":")} className="break-words">
                  {source.title} · {source.discoveryMethod ?? "unknown"} · {source.sourceKind ?? "unknown"}
                  {source.dateHint ? ` · ${source.dateHint}` : ""}
                  {source.evidenceStatus ? ` · ${source.evidenceStatus}` : ""}
                  {source.directDiscoveryReason ? ` · ${source.directDiscoveryReason}` : ""}
                </div>
              ))}
              {directSources.length > 6 && (
                <div className="text-cyan-800/80 dark:text-cyan-100/80">还有 {directSources.length - 6} 个 Direct Discovery 候选。</div>
              )}
            </div>
          )}
          {candidateCount > 0 && (
            <div className="text-[11px] leading-5 text-muted-foreground">
              部分相关资料仅作为算法背景，回答时不会当作目标题目的直接依据。
            </div>
          )}
          <div className="text-[11px] leading-5 text-muted-foreground">
            仅少量强相关公开网页会尝试提取正文摘录；不会读取登录态、Cookie 或浏览器数据。
          </div>
        </>
      ) : (
        <div className="grid gap-1.5">
          <div className="text-[12px] leading-5 text-muted-foreground">{error}</div>
          {bingDiagnosticsLines.length > 0 && (
            <div className="grid gap-1 rounded-md border border-amber-200/60 bg-amber-50/70 px-2.5 py-2 text-[12px] leading-5 text-amber-900 dark:border-amber-300/20 dark:bg-amber-400/[0.08] dark:text-amber-100">
              <div className="font-medium">Bing 阶段诊断</div>
              {bingDiagnosticsLines.map((line, index) => (
                <div key={`error-bing-diagnostic:${index}:${line}`} className="break-words">{line}</div>
              ))}
            </div>
          )}
          {preparationDiagnosticsLines.length > 0 && (
            <div className="grid gap-1 rounded-md border border-slate-200/80 bg-slate-50/80 px-2.5 py-2 text-[12px] leading-5 text-slate-800 dark:border-slate-300/20 dark:bg-white/[0.06] dark:text-slate-100">
              <div className="font-medium">搜索准备诊断</div>
              {preparationDiagnosticsLines.map((line, index) => (
                <div key={`error-preparation-diagnostic:${index}:${line}`} className="break-words">{line}</div>
              ))}
            </div>
          )}
          {directDiagnosticsLines.length > 0 && (
            <div className="grid gap-1 rounded-md border border-cyan-200/60 bg-cyan-50/70 px-2.5 py-2 text-[12px] leading-5 text-cyan-950 dark:border-cyan-300/20 dark:bg-cyan-400/[0.08] dark:text-cyan-100">
              <div className="font-medium">Direct Discovery 诊断</div>
              {directDiagnosticsLines.map((line, index) => (
                <div key={`error-direct-diagnostic:${index}:${line}`} className="break-words">{line}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const WebSearchSourcesCard = memo(WebSearchSourcesCardComponent);
