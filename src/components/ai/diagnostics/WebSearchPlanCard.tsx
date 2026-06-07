import { memo, useState } from "react";
import type { SearchDecision, WebSearchProvider } from "@/lib/aiWebSearch";
import { getWebReadBudgetPlan } from "@/lib/aiWebSearch";
import { getDebugReasonLabel } from "@/lib/searchDiagnostics";
import {
  getBooleanLabel,
  getFreshnessLabel,
  getPlannerTriggerLabel,
  getSearchConfidenceLabel,
  getSearchDepthLabel,
  getSearchIntentLabel,
  getSearchPlanChips,
  getSearchVerticalLabel,
  getWebSearchProviderLabel,
  SEARCH_PLAN_QUERY_LIMIT,
} from "./diagnosticsUtils";

type WebSearchPlanCardProps = {
  decision: SearchDecision;
  provider: WebSearchProvider;
  filteredCount?: number;
  filterReason?: string;
  onPerfCounter?: (name: string, amount?: number) => void;
};

function WebSearchPlanCardComponent({
  decision,
  provider,
  filteredCount,
  filterReason,
  onPerfCounter,
}: WebSearchPlanCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!decision.shouldSearch) return null;

  onPerfCounter?.("webSearchPlanCardRender");
  if (!isExpanded) {
    return (
      <div className="notex-debug-card notex-diagnostics-card mb-2 grid gap-2 rounded-xl border border-sky-200/70 bg-sky-50/65 px-3.5 py-2.5 text-[13px] leading-6 text-slate-700 shadow-[0_8px_20px_rgb(15_23_42/0.05)] dark:border-sky-400/20 dark:bg-sky-400/[0.08] dark:text-slate-200">
        <button
          type="button"
          className="flex min-w-0 items-center justify-between gap-3 text-left"
          onClick={() => setIsExpanded(true)}
        >
          <span className="min-w-0 truncate font-medium text-foreground">联网搜索计划</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">展开诊断</span>
        </button>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>queries={decision.queries.length}</span>
          <span>intent={decision.intent}</span>
          <span>provider={getWebSearchProviderLabel(provider)}</span>
        </div>
      </div>
    );
  }

  const chips = getSearchPlanChips(decision);
  const visibleQueries = decision.queries.slice(0, SEARCH_PLAN_QUERY_LIMIT);
  const hiddenQueryCount = Math.max(0, decision.queries.length - visibleQueries.length);
  const aiPlanner = decision.aiPlanner;
  const sourceStrategy = decision.sourceStrategy;
  const readBudget = sourceStrategy?.readBudget ?? getWebReadBudgetPlan(decision);

  return (
    <div className="notex-debug-card notex-diagnostics-card mb-2 grid gap-3 rounded-xl border border-sky-200/70 bg-sky-50/65 px-3.5 py-3 text-[13px] leading-6 text-slate-700 shadow-[0_8px_20px_rgb(15_23_42/0.05)] dark:border-sky-400/20 dark:bg-sky-400/[0.08] dark:text-slate-200">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">联网搜索计划</span>
        <span className="rounded-full border border-sky-200/80 bg-white/70 px-1.5 py-0.5 text-[10px] leading-4 text-sky-700 dark:border-sky-300/20 dark:bg-white/[0.05] dark:text-sky-200">
          按需公开搜索
        </span>
      </div>
      <div className="grid gap-1.5">
        {decision.rawQuestion && (
          <div className="grid min-w-0 gap-1">
            <span className="text-muted-foreground">原始问题</span>
            <div className="min-w-0 break-words rounded-md bg-background/70 px-2.5 py-1 text-[13px] leading-6 text-foreground dark:bg-white/[0.05]">
              {decision.rawQuestion}
            </div>
          </div>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">当前搜索源</span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[12px] text-foreground dark:bg-white/[0.05]">
            {getWebSearchProviderLabel(provider)}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">意图</span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-foreground dark:bg-white/[0.05]">
            {getSearchIntentLabel(decision.intent)}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">搜索必要性</span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-foreground dark:bg-white/[0.05]">
            {getSearchConfidenceLabel(decision.confidence)}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">时效 / 新闻</span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[12px] text-foreground dark:bg-white/[0.05]">
            近期：{getBooleanLabel(decision.recencyIntent)}
          </span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[12px] text-foreground dark:bg-white/[0.05]">
            新闻：{getBooleanLabel(decision.newsIntent)}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">搜索类型 / 阅读预算</span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[12px] text-foreground dark:bg-white/[0.05]">
            类型：{getSearchVerticalLabel(decision.vertical ?? aiPlanner?.vertical)}
          </span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[12px] text-foreground dark:bg-white/[0.05]">
            深度：{getSearchDepthLabel(readBudget.depth)}
          </span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[12px] text-foreground dark:bg-white/[0.05]">
            计划读取：{readBudget.targetReadSuccesses}/{readBudget.maxReadAttempts}
          </span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[12px] text-foreground dark:bg-white/[0.05]">
            并发：{readBudget.maxConcurrentReads}
          </span>
        </div>
        {decision.topicKeywords && decision.topicKeywords.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="shrink-0 text-muted-foreground">主题词</span>
            {decision.topicKeywords.slice(0, 8).map((keyword) => (
              <span
                key={keyword}
                className="max-w-full rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-foreground dark:bg-white/[0.05]"
              >
                {keyword}
              </span>
            ))}
          </div>
        )}
        {decision.reason && (
          <div className="grid min-w-0 gap-1">
            <span className="text-muted-foreground">判断原因</span>
            <div className="min-w-0 break-words rounded-md bg-background/70 px-2 py-1 text-[11px] leading-5 text-foreground dark:bg-white/[0.05]">
              {decision.reason}
            </div>
          </div>
        )}
        {chips.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="shrink-0 text-muted-foreground">识别信息</span>
            {chips.map((chip) => (
              <span
                key={chip}
                className="max-w-full rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-foreground dark:bg-white/[0.05]"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
        {visibleQueries.length > 0 && (
          <div className="grid min-w-0 gap-1">
            <span className="text-muted-foreground">计划搜索</span>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {visibleQueries.map((query) => (
                <span
                  key={query}
                  className="min-w-0 max-w-full rounded-md border border-border/60 bg-background/80 px-2 py-1 text-[11px] leading-5 text-foreground break-words dark:border-white/10 dark:bg-white/[0.05]"
                >
                  {query}
                </span>
              ))}
              {hiddenQueryCount > 0 && (
                <span className="rounded-md bg-background/60 px-2 py-1 text-[11px] text-muted-foreground dark:bg-white/[0.04]">
                  还有 {hiddenQueryCount} 条
                </span>
              )}
            </div>
          </div>
        )}
        {aiPlanner && (
          <div className="grid min-w-0 gap-1">
            <span className="text-muted-foreground">AI 搜索规划</span>
            <div className="grid min-w-0 gap-1.5 rounded-md bg-background/70 px-2.5 py-2 text-[13px] leading-6 text-foreground dark:bg-white/[0.05]">
              <div className="flex min-w-0 flex-wrap gap-1.5">
                <span className="rounded-full bg-background/80 px-2 py-0.5 dark:bg-white/[0.05]">
                  状态：{aiPlanner.enabled ? "已启用" : "未启用"}
                </span>
                <span className="rounded-full bg-background/80 px-2 py-0.5 dark:bg-white/[0.05]">
                  本轮使用：{aiPlanner.used ? "是" : "否"}
                </span>
                <span className="rounded-full bg-background/80 px-2 py-0.5 dark:bg-white/[0.05]">
                  触发：{getPlannerTriggerLabel(aiPlanner.trigger)}
                </span>
                {aiPlanner.freshness && (
                  <span className="rounded-full bg-background/80 px-2 py-0.5 dark:bg-white/[0.05]">
                    时效：{getFreshnessLabel(aiPlanner.freshness)}
                  </span>
                )}
                {aiPlanner.retried && (
                  <span className="rounded-full bg-background/80 px-2 py-0.5 dark:bg-white/[0.05]">
                    已重搜
                  </span>
                )}
              </div>
              {aiPlanner.plannerContext && (
                <div className="min-w-0 break-words text-muted-foreground">
                  当前时间：{aiPlanner.plannerContext.currentDateText}（{aiPlanner.plannerContext.currentTimeZone}） · 时效窗口：{aiPlanner.plannerContext.recencyWindowHint} · 语言：{aiPlanner.plannerContext.locale}
                </div>
              )}
              {aiPlanner.ruleBasedQueries.length > 0 && (
                <div className="min-w-0 break-words text-muted-foreground">
                  规则搜索词：{aiPlanner.ruleBasedQueries.join(" | ")}
                </div>
              )}
              {aiPlanner.generatedQueries && aiPlanner.generatedQueries.length > 0 && (
                <div className="min-w-0 break-words">
                  AI 生成搜索词：{aiPlanner.generatedQueries.join(" | ")}
                </div>
              )}
              {aiPlanner.topicKeywords && aiPlanner.topicKeywords.length > 0 && (
                <div className="min-w-0 break-words text-muted-foreground">
                  主题词：{aiPlanner.topicKeywords.join(" / ")}
                </div>
              )}
              {aiPlanner.negativeKeywords && aiPlanner.negativeKeywords.length > 0 && (
                <div className="min-w-0 break-words text-muted-foreground">
                  排除词：{aiPlanner.negativeKeywords.join(" / ")}
                </div>
              )}
              {aiPlanner.fallbackReason && (
                <div className="min-w-0 break-words text-amber-700 dark:text-amber-200">
                  兜底原因：{getDebugReasonLabel(aiPlanner.fallbackReason)}
                </div>
              )}
            </div>
          </div>
        )}
        {sourceStrategy && (
          <div className="grid min-w-0 gap-1">
            <span className="text-muted-foreground">来源策略</span>
            <div className="grid min-w-0 gap-1.5 rounded-md bg-background/70 px-2.5 py-2 text-[13px] leading-6 text-foreground dark:bg-white/[0.05]">
              <div className="min-w-0 break-words">
                搜索类型：{getSearchVerticalLabel(sourceStrategy.vertical)}；候选上限：{sourceStrategy.candidateLimit}；{sourceStrategy.reason}
              </div>
              {sourceStrategy.targetedQueries.length > 0 && (
                <div className="min-w-0 break-words text-muted-foreground">
                  定向搜索词：{sourceStrategy.targetedQueries.join(" | ")}
                </div>
              )}
              {sourceStrategy.droppedTargetedQueries && sourceStrategy.droppedTargetedQueries.length > 0 && (
                <div className="min-w-0 break-words text-muted-foreground">
                  Dropped query diversification：{sourceStrategy.droppedTargetedQueries.map((item) => `${item.query} (${item.reason})`).join(" | ")}
                </div>
              )}
              {sourceStrategy.preferredDomains.length > 0 && (
                <div className="min-w-0 break-words text-muted-foreground">
                  优先站点：{sourceStrategy.preferredDomains.slice(0, 8).join(" / ")}
                </div>
              )}
              {sourceStrategy.registryBoosts.length > 0 && (
                <div className="min-w-0 break-words text-muted-foreground">
                  站点加权：{sourceStrategy.registryBoosts.slice(0, 6).map((boost) => `${boost.label}+${boost.weight}`).join(" / ")}
                </div>
              )}
            </div>
          </div>
        )}
        {typeof filteredCount === "number" && filteredCount > 0 && (
          <div className="grid min-w-0 gap-1">
            <span className="text-muted-foreground">低相关结果过滤</span>
            <div className="min-w-0 break-words rounded-md bg-background/70 px-2.5 py-1.5 text-[13px] leading-6 text-foreground dark:bg-white/[0.05]">
              已过滤 {filteredCount} 条低相关结果{filterReason ? `：${getDebugReasonLabel(filterReason)}` : "，原因：搜索词或主题不匹配"}
            </div>
          </div>
        )}
      </div>
      <div className="text-[12px] leading-5 text-muted-foreground">
        当前阶段会先生成搜索计划，再按授权和配置决定是否执行公开搜索。
      </div>
    </div>
  );
}

export const WebSearchPlanCard = memo(WebSearchPlanCardComponent);
