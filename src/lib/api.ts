import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AiSearchQueryPlan, SearchDecision, WebSearchConfig, WebSearchMode, WebSearchRequest, WebSearchResult, WebSourceExcerptRequest, WebSourceExcerptResult } from "@/lib/aiWebSearch";
import { toApiError } from "@/lib/apiError";
import type { KnowledgeGraphEdgeSource } from "@/lib/knowledge/knowledgeTypes";
import type { AiTagRecommendationIgnored, UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";
import type { NoteFileInfo } from "@/types/note";

export interface SaveNoteAssetResult {
  markdownPath: string;
  assetRelativePath: string;
}

export interface MarkdownSavePathClassification {
  kind: "note" | "external";
  relativePath: string | null;
  absolutePath: string;
}

const safeExternalProtocols = new Set(["http:", "https:", "mailto:"]);

export function isSafeExternalUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  try {
    return safeExternalProtocols.has(new URL(trimmed).protocol);
  } catch {
    return false;
  }
}

export async function openExternalUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!isSafeExternalUrl(trimmed)) {
    throw new Error("Unsupported external URL protocol.");
  }

  await openUrl(trimmed);
}

export interface NoteSearchResult {
  path: string;
  title: string;
  date: string;
  tags: string[];
  summary: string;
  excerpt: string;
}

export interface ImportLuoguInsightResult {
  relativePath: string;
  aiModel: string;
}

export interface ReadLuoguProblemContentInput {
  problemId: string;
  kind: "problem" | "solution" | "discussion" | string;
}

export interface ReadLuoguProblemContentResult {
  problemId: string;
  kind: string;
  url: string;
  fetched: boolean;
  status: string;
  title: string;
  excerpt: string;
  excerptChars: number;
  sourceRole: string;
  luoguCookieUsed: boolean;
  luoguCookieAvailable: boolean;
  permissionRequired: boolean;
  error: string | null;
}

export interface LuoguSourceProblemResult {
  problemId: string;
  problemTitle: string;
  difficulty: string | null;
  topics: string[];
}

export interface ReadLuoguProblemSetResult {
  problemSetId: string;
  title: string | null;
  problems: LuoguSourceProblemResult[];
}

export interface ReadLuoguContestResult {
  contestId: string;
  title: string | null;
  problems: LuoguSourceProblemResult[];
}

export interface LuoguConfig {
  luogu: {
    uid: string;
    client_id: string;
    last_submission_id: number | null;
  };
  ai: AiConfig;
  blog: BlogConfig;
}

export interface BlogConfig {
  title: string;
  subtitle: string;
}

export interface AiConfig {
  base_url: string;
  api_key: string;
  model: string;
  chat_response_style: string;
  providers: AiProvider[];
  default_provider_id: string | null;
  default_model_id: string | null;
  web_search: WebSearchConfig;
}

export interface AiProvider {
  id: string;
  name: string;
  kind: "openai-compatible" | string;
  base_url: string;
  api_key: string;
  enabled: boolean;
  default_model: string | null;
  models: AiModel[];
  created_at: number | null;
  updated_at: number | null;
}

export interface AiModel {
  id: string;
  name: string | null;
  enabled: boolean;
  supports_stream: boolean;
  source: "synced" | "manual" | string;
  updated_at: number | null;
}

export interface AiProviderActionResult {
  provider: AiProvider;
  config: AiConfig;
}

export interface SyncAiProviderModelsResult {
  provider: AiProvider;
  syncedCount: number;
  config: AiConfig;
}

export interface SyncAiProviderDraftModelsResult {
  provider: AiProvider;
  syncedCount: number;
}

export interface TestAiProviderResult {
  providerId: string;
  ok: boolean;
  modelCount: number;
}

export interface LuoguSubmissionPreview {
  submissionId: string;
  problemId: string;
  problemTitle: string;
  difficulty: string;
  status: string;
  submitTime: string;
}

export interface TestLuoguConnectionResult {
  fetchedCount: number;
  submissions: LuoguSubmissionPreview[];
}

export interface PreviewLuoguSubmission {
  submissionId: string;
  problemId: string;
  problemTitle: string;
  difficulty: string;
  status: string;
  isAc: boolean;
  submitTime: string;
  statusLabel: string;
}

export interface PreviewLuoguSubmissionsResult {
  fetchedCount: number;
  limit: number;
  uidConfigured: boolean;
  clientIdConfigured: boolean;
  aiConfigured: boolean;
  lastSubmissionId: number | null;
  submissions: PreviewLuoguSubmission[];
}

export interface PreviewLuoguSubmissionPageResult {
  page: number;
  fetchedCount: number;
  hasMore: boolean;
  uidConfigured: boolean;
  clientIdConfigured: boolean;
  aiConfigured: boolean;
  lastSubmissionId: number | null;
  submissions: PreviewLuoguSubmission[];
}

export interface ImportLuoguSubmissionResult {
  submissionId: string;
  problemId: string;
  problemTitle: string;
  relativePath: string | null;
  draftFallback: boolean;
  skipped: boolean;
  skipReason: string | null;
  failed: boolean;
  error: string | null;
  committed: boolean;
  commitStatus: "committed" | "noChanges" | "skipped" | "failed" | string;
}

export interface PrepareLuoguSubmissionNoteResult {
  submissionId: string;
  problemId: string;
  problemTitle: string;
  difficulty: string;
  suggestedRelativePath: string;
  markdown: string;
  sourceCode: string;
  draftFallback: boolean;
  aiStatus: "organized" | "rawDraftFallback" | "skipped" | "failed" | string;
  reason: string | null;
  existing: boolean;
  skipped: boolean;
  skipReason: string | null;
}

export interface LuoguPrepareRules {
  requireAc: boolean;
  allowRawDraftWithoutInsight: boolean;
  includeSourceCode?: boolean;
}

export interface WriteLuoguPreparedNoteResult {
  relativePath: string | null;
  skipped: boolean;
  skipReason: string | null;
  failed: boolean;
  error: string | null;
  committed: boolean;
  commitStatus: "committed" | "noChanges" | "skipped" | "failed" | string;
}

export interface TestAiConnectionResult {
  model: string;
  ok: boolean;
}

export interface GeneratedNoteMetadata {
  title: string;
  tags: string[];
  summary: string;
}

export interface PolishedNoteBody {
  polished_body: string;
}

export interface NoteChatContextPayload {
  noteTitle: string;
  notePath: string;
  tags: string[];
  summary: string;
  selectedText: string;
  markdown: string;
  markdownTruncated: boolean;
  tagTaxonomyContext?: string;
}

export interface NoteChatAnswer {
  answer: string;
  model: string;
}

export interface NoteTagSuggestion {
  suggestions: Array<{
    tag: string;
    confidence: number;
    reason: string;
    evidence: string;
  }>;
  ignored?: Array<{
    tag?: string;
    reason: AiTagRecommendationIgnored["reason"];
  }>;
  suggestedTags: string[];
  reason: string;
}

export interface PolishedSelectedText {
  polishedText: string;
}

export interface PolishedFullNote {
  polishedBody: string;
}

export interface PolishedAiPromptTemplate {
  polishedPrompt: string;
}

export interface NoteChatHistoryMessage {
  role: "user" | "assistant";
  text: string;
}

export interface NoteChatStreamInput {
  streamId: string;
  question: string;
  context: NoteChatContextPayload;
  chatHistory?: NoteChatHistoryMessage[];
  providerId?: string;
  modelId?: string;
  webSearchMode?: WebSearchMode;
  webSearchEnabled?: boolean;
  searchDecision?: SearchDecision;
  searchSources?: WebSearchResult[];
  localNoteSources?: LocalNoteSearchResult[];
}

export interface SearchWebSourcesInput extends WebSearchRequest {
  provider?: WebSearchConfig["provider"];
}

export interface PlanSearchQueriesInput {
  userInput: string;
  intent: SearchDecision["intent"];
  provider: WebSearchConfig["provider"];
  maxQueries?: number;
  ruleBasedQueries?: string[];
  topicKeywords?: string[];
  newsIntent?: boolean;
  recencyIntent?: boolean;
  currentDate?: string;
  currentDateText?: string;
  currentTimeZone?: string;
  locale?: string;
  recencyWindowHint?: string;
  providerId?: string;
  modelId?: string;
}

export interface SearchLocalNotesInput {
  query: string;
  problemId?: string;
  problemTitle?: string;
  algorithmKeywords?: string[];
  currentNotePath?: string;
  maxResults?: number;
  maxCharsPerResult?: number;
}

export interface LocalNoteSearchResult {
  id: string;
  title: string;
  path: string;
  relativePath: string;
  snippet: string;
  score: number;
  reason: string;
  lineStart?: number;
  lineEnd?: number;
  isCurrentNote?: boolean;
  headingPath?: string[];
  chunkIndex?: number;
  matchedTerms?: string[];
  detectedProblemIds?: string[];
  detectedAlgorithmTerms?: string[];
  diagnostics?: string;
  localCitationId?: string;
}

export interface TestWebSearchConnectionInput {
  provider: WebSearchConfig["provider"];
  apiKey?: string;
  endpoint?: string;
}

export interface TestWebSearchConnectionResult {
  ok: boolean;
  provider: WebSearchConfig["provider"];
  endpoint: string;
  query?: string;
  resultCount?: number;
  firstTitle?: string;
  diagnostics?: string;
}

export interface WebCacheStatusResult {
  exists: boolean;
  searchCacheCount: number;
  excerptCacheCount: number;
  approxSizeBytes: number;
  readable: boolean;
  writable: boolean;
  pathLabel: string;
  lastError?: string;
}

export interface LocalNoteIndexStatusResult {
  exists: boolean;
  version?: number;
  currentVersion: number;
  status: "missing" | "ready" | "building" | "stale" | "error" | string;
  noteCount: number;
  chunkCount: number;
  updatedAt?: number;
  readable: boolean;
  writable: boolean;
  approxSizeBytes: number;
  pathLabel: string;
  sampleRelativePaths: string[];
  lastError?: string;
}

export interface PromptCitationContractStatusResult {
  webAvailableIds: boolean;
  webMarkerInstruction: boolean;
  localAvailableIds: boolean;
  localMarkerInstruction: boolean;
  bareIdWarning: boolean;
}

export interface NotexSearchSelfCheckCaseResult {
  query: string;
  expectedCategory: string;
  actualIntent: string;
  searchMode: string;
  searchModeReason: string;
  modeGuards: string[];
  allowNewsRegistry: boolean;
  allowBingFallback: boolean;
  allowLocalIndex: boolean;
  preferUrlReader: boolean;
  vertical: string;
  freshness: string;
  newsRegistryTriggered: boolean;
  newsClusteringTriggered: boolean;
  companySpecificNews: boolean;
  queryFocusEntities: string[];
  focusEntitySource: string;
  entityFilterApplied: boolean;
  rejectedWrongEntityCount: number;
  queryDiversification: string[];
  droppedQueryDiversification: string[];
  selectedNewsSources: string[];
  bingFallbackPlanned: boolean;
  localSearchTriggered: boolean;
  localResultCount: number;
  displayedLocalSourceCount: number;
  hasAlgorithmTermMatchedRe: boolean;
  hasPostNavigationFalsePositive: boolean;
  explicitUrlPathUsed: boolean;
  clusterCount: number;
  selectedClusterCount: number;
  diversityApplied: boolean;
  singleClusterWarning: boolean;
  pass: boolean;
  reason: string;
  rawDiagnostics: unknown;
}

export interface NotexSearchSelfCheckResult {
  passed: number;
  total: number;
  cases: NotexSearchSelfCheckCaseResult[];
}

export interface NoteChatStreamChunkEvent {
  streamId: string;
  delta: string;
}

export interface NoteChatStreamDoneEvent {
  streamId: string;
}

export interface NoteChatStreamErrorEvent {
  streamId: string;
  message: string;
  detail?: string | null;
}

export interface PromptTemplateSummary {
  fileName: string;
  displayName: string;
}

export interface PromptTemplateContent {
  fileName: string;
  content: string;
}

export interface SyncLuoguInsightsResult {
  scannedPages: number;
  scannedCount: number;
  acCount: number;
  importedCount: number;
  skippedNoInsight: number;
  skippedExisting: number;
  failedCount: number;
  aiImportedCount: number;
  aiSkippedCount: number;
  aiFailedCount: number;
  aiModel: string | null;
  reachedLastSubmissionId: boolean;
  updatedLastSubmissionId: number | null;
  importedPaths: string[];
  message: string;
  warnings: string[];
}

export interface KnowledgeGraphNode {
  id: string;
  type: "asset" | "problem" | "topic" | "training" | "kind" | "type" | "collection" | "batch";
  title: string;
  refs: string[];
  assetType?: "fragment" | "collection" | "article" | "legacy-note" | "legacy-luogu-solution" | "legacy-problem-note";
  kind?: string;
  source?: string;
  classificationReason?: string;
  classificationConfidence?: number;
  topics?: string[];
  status?: "draft" | "active" | "archived";
  reviewPriority?: "low" | "medium" | "high" | "none";
  mastery?: "new" | "learning" | "familiar" | "mastered";
  masteryStatus?: "unknown" | "learning" | "stable" | "needs-review";
  createdAt?: string;
  updatedAt?: string;
  lastReviewedAt?: string;
}

export interface KnowledgeGraphEdge {
  from: string;
  to: string;
  type: "links_to" | "mentions" | "contains" | "related_to" | "derived_from";
  source: KnowledgeGraphEdgeSource;
  confidence: number;
  refs: string[];
}

export interface KnowledgeGraphIndexResult {
  generatedAt: string;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  assets: KnowledgeAssetRowResult[];
  suggestions: KnowledgeRelationshipSuggestionResult[];
  reviewSlices: KnowledgeReviewSliceResult[];
  batches: KnowledgeBatchHistoryEntryResult[];
}

export interface KnowledgeAssetRowResult {
  id: string;
  type: "asset";
  assetType: "fragment" | "collection" | "article" | "legacy-note" | "legacy-luogu-solution" | "legacy-problem-note";
  kind: string;
  title: string;
  date: string;
  topics: string[];
  relatedProblems: string[];
  source: string;
  createdFrom: string;
  reviewPriority: "low" | "medium" | "high" | "none" | string;
  mastery?: "new" | "learning" | "familiar" | "mastered" | string;
  status: "draft" | "active" | "archived" | string;
  path: string;
  refs: string[];
  lastModified: string;
  relationCount: number;
  missingMetadataFlags: string[];
  classificationReason: string;
  classificationConfidence: number;
  inDegree: number;
  outDegree: number;
  degree: number;
  isolated: boolean;
  componentId: number;
  lastReviewedAt: string | null;
}

export interface KnowledgeRelationshipSuggestionResult {
  id: string;
  kind: string;
  source: string;
  target: string;
  reason: string;
  refs: string[];
  preview: string;
  score: number;
}

export interface KnowledgeReviewSliceResult {
  assetId: string;
  title: string;
  path: string;
  reviewPriority: string;
  status: string;
  kind: string;
  topics: string[];
  relatedProblems: string[];
  lastReviewedAt: string | null;
  score: number;
  reasons: string[];
}

export interface KnowledgeBatchAssetRefResult {
  kind: "collection" | "fragment" | "article" | "unknown" | string;
  path: string;
  title: string | null;
  problemId: string | null;
}

export interface KnowledgeBatchHistoryEntryResult {
  batchId: string;
  sourceType: string;
  sourceLabel: string;
  createdAt: string;
  collectionPath: string;
  writtenAssets: KnowledgeBatchAssetRefResult[];
  skippedItems: string[];
  failedItems: string[];
  graphRefresh: {
    nodeCount: number;
    edgeCount: number;
    refreshedAt: string;
  };
}

export interface TrainingBatchReplayDraftResult {
  sourceBatchId: string;
  sourceCollectionPath: string;
  batch: {
    id: string;
    title: string;
    sourceType: string;
    sourceLabel: string;
    createdAt: string;
    status: string;
    itemIds: string[];
  };
  items: Array<{
    id: string;
    batchId: string;
    problemId: string;
    problemTitle: string;
    status: string;
  }>;
}

export interface LegacyMigrationDraftResult {
  sourcePath: string;
  sourceTitle: string;
  targetType: "fragment" | "collection" | string;
  targetPath: string;
  markdown: string;
  originalLink: string;
  requiresConfirmation: boolean;
  writesOriginal: boolean;
  complexity: "summary-only" | "simple" | string;
}

export interface WriteKnowledgeAssetResult {
  relativePath: string;
  written: boolean;
  skipped: boolean;
  error: string | null;
}

/**
 * 前端 API 层：封装所有 Tauri IPC invoke 调用。
 *
 * 职责：
 * 1. 为每个 Rust 命令提供类型安全的 TypeScript 包装函数
 * 2. 统一将 invoke 抛出的 unknown 错误转换为 Error 对象
 * 3. 作为未来 mock / 测试替换的单一入口点
 *
 * 所有函数均为 async，与 Tauri invoke 的 Promise 语义一致。
 */

/**
 * 列出 notes/ 目录下所有 .md 文件，按最后修改时间降序排列。
 * 对应 Rust 命令：list_notes
 */
export async function listNotes(): Promise<NoteFileInfo[]> {
  try {
    return await invoke<NoteFileInfo[]>("list_notes");
  } catch (e) {
    throw toApiError(e);
  }
}

/**
 * 读取指定笔记的完整 Markdown 内容。
 * 对应 Rust 命令：read_note
 *
 * @param relativePath - 相对于 notes/ 的路径，如 "qpow.md"
 */
export async function readNote(relativePath: string): Promise<string> {
  try {
    return await invoke<string>("read_note", { relativePath });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function searchNotes(query: string): Promise<NoteSearchResult[]> {
  try {
    return await invoke<NoteSearchResult[]>("search_notes", { query });
  } catch (e) {
    throw toApiError(e);
  }
}

/**
 * 覆盖写入指定笔记内容（若文件不存在则创建），写入前自动补全 frontmatter。
 * 对应 Rust 命令：write_note
 *
 * @param relativePath - 相对于 notes/ 的路径，如 "qpow.md"
 * @param content - 要写入的 Markdown 字符串
 * @returns null 表示正常；string 表示 frontmatter 解析失败时的警告（内容已原样写入）
 */
export async function writeNote(
  relativePath: string,
  content: string,
): Promise<string | null> {
  try {
    return await invoke<string | null>("write_note", { relativePath, content });
  } catch (e) {
    throw toApiError(e);
  }
}

export function buildMarkdownSaveDialogDefaultPath(defaultFileName: string, defaultDirectory?: string): string {
  const fileName = defaultFileName.endsWith(".md") ? defaultFileName : `${defaultFileName}.md`;
  const directory = defaultDirectory?.trim();
  if (!directory) return fileName;
  return `${directory.replace(/[\\\/]+$/, "")}\\${fileName}`;
}

export async function showSaveMarkdownDialog(defaultFileName: string, defaultDirectory?: string): Promise<string | null> {
  const result = await save({
    title: "Save Markdown File",
    defaultPath: buildMarkdownSaveDialogDefaultPath(defaultFileName, defaultDirectory),
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  return typeof result === "string" ? result : null;
}

export async function getNotesRootPath(): Promise<string> {
  try {
    return await invoke<string>("get_notes_root_path");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function classifyMarkdownSavePath(absolutePath: string): Promise<MarkdownSavePathClassification> {
  try {
    return await invoke<MarkdownSavePathClassification>("classify_markdown_save_path", { absolutePath });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function writeExternalMarkdownFile(absolutePath: string, content: string): Promise<void> {
  try {
    await invoke<void>("write_external_markdown_file", { absolutePath, content });
  } catch (e) {
    throw toApiError(e);
  }
}

/**
 * 保存粘贴图片到 notes/assets/，并返回当前笔记可用的 Markdown 链接路径。
 * 对应 Rust 命令：save_note_asset
 */
export async function saveNoteAsset(
  noteRelativePath: string,
  bytes: number[],
  mimeType: string,
): Promise<SaveNoteAssetResult> {
  try {
    return await invoke<SaveNoteAssetResult>("save_note_asset", {
      noteRelativePath,
      bytes,
      mimeType,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function resolveNoteAssetUrl(
  noteRelativePath: string,
  imageSrc: string,
): Promise<string> {
  try {
    return await invoke<string>("resolve_note_asset_url", {
      noteRelativePath,
      imageSrc,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function importLuoguInsight(
  problemId: string,
  problemTitle: string,
  submissionId: string,
  sourceCode: string,
): Promise<ImportLuoguInsightResult> {
  try {
    return await invoke<ImportLuoguInsightResult>("import_luogu_insight", {
      problemId,
      problemTitle,
      submissionId,
      sourceCode,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getLuoguConfig(): Promise<LuoguConfig> {
  try {
    return await invoke<LuoguConfig>("get_luogu_config");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function saveLuoguConfig(config: Pick<LuoguConfig, "luogu">): Promise<void> {
  try {
    await invoke<void>("save_luogu_config", { config });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function updateLuoguLastSubmissionId(
  lastSubmissionId: number | null,
): Promise<void> {
  try {
    await invoke<void>("update_luogu_last_submission_id", { lastSubmissionId });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function testLuoguConnection(): Promise<TestLuoguConnectionResult> {
  try {
    return await invoke<TestLuoguConnectionResult>("test_luogu_connection");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function readLuoguProblemContent(
  input: ReadLuoguProblemContentInput,
): Promise<ReadLuoguProblemContentResult> {
  try {
    return await invoke<ReadLuoguProblemContentResult>("read_luogu_problem_content", { input });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function readLuoguProblemSet(problemSetId: string): Promise<ReadLuoguProblemSetResult> {
  try {
    return await invoke<ReadLuoguProblemSetResult>("read_luogu_problem_set", { problemSetId });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function readLuoguContest(contestId: string): Promise<ReadLuoguContestResult> {
  try {
    return await invoke<ReadLuoguContestResult>("read_luogu_contest", { contestId });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function previewLuoguSubmissions(
  limit = 20,
): Promise<PreviewLuoguSubmissionsResult> {
  try {
    return await invoke<PreviewLuoguSubmissionsResult>("preview_luogu_submissions", { limit });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function previewLuoguSubmissionPage(
  page = 1,
): Promise<PreviewLuoguSubmissionPageResult> {
  try {
    return await invoke<PreviewLuoguSubmissionPageResult>("preview_luogu_submission_page", { page });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function importLuoguSubmission(
  submissionId: string,
  autoCommit = false,
): Promise<ImportLuoguSubmissionResult> {
  try {
    return await invoke<ImportLuoguSubmissionResult>("import_luogu_submission", {
      submissionId,
      autoCommit,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function prepareLuoguSubmissionNote(
  submissionId: string,
  rules?: LuoguPrepareRules,
): Promise<PrepareLuoguSubmissionNoteResult> {
  try {
    return await invoke<PrepareLuoguSubmissionNoteResult>("prepare_luogu_submission_note", {
      submissionId,
      rules,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function writeLuoguPreparedNote(
  relativePath: string,
  markdown: string,
  autoCommit = false,
  writeMode: "createNew" | "overwrite" = "createNew",
): Promise<WriteLuoguPreparedNoteResult> {
  try {
    return await invoke<WriteLuoguPreparedNoteResult>("write_luogu_prepared_note", {
      relativePath,
      markdown,
      autoCommit,
      writeMode,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function syncLuoguInsights(): Promise<SyncLuoguInsightsResult> {
  try {
    return await invoke<SyncLuoguInsightsResult>("sync_luogu_insights");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getKnowledgeGraph(): Promise<KnowledgeGraphIndexResult> {
  try {
    return await invoke<KnowledgeGraphIndexResult>("get_knowledge_graph");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function rebuildKnowledgeGraph(): Promise<KnowledgeGraphIndexResult> {
  try {
    return await invoke<KnowledgeGraphIndexResult>("rebuild_knowledge_graph");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getKnowledgeAssets(): Promise<KnowledgeAssetRowResult[]> {
  try {
    return await invoke<KnowledgeAssetRowResult[]>("get_knowledge_assets");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getKnowledgeLocalGraph(
  nodeId: string,
  hops = 1,
  limit = 80,
): Promise<KnowledgeGraphIndexResult> {
  try {
    return await invoke<KnowledgeGraphIndexResult>("get_knowledge_local_graph", {
      nodeId,
      hops,
      limit,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getKnowledgeRelationshipSuggestions(): Promise<KnowledgeRelationshipSuggestionResult[]> {
  try {
    return await invoke<KnowledgeRelationshipSuggestionResult[]>("get_knowledge_relationship_suggestions");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getKnowledgeReviewSlices(): Promise<KnowledgeReviewSliceResult[]> {
  try {
    return await invoke<KnowledgeReviewSliceResult[]>("get_knowledge_review_slices");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getKnowledgeBatches(): Promise<KnowledgeBatchHistoryEntryResult[]> {
  try {
    return await invoke<KnowledgeBatchHistoryEntryResult[]>("get_knowledge_batches");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function duplicateKnowledgeBatchAsDraft(
  batchId: string,
  createdAt?: string,
): Promise<TrainingBatchReplayDraftResult> {
  try {
    return await invoke<TrainingBatchReplayDraftResult>("duplicate_knowledge_batch_as_draft", {
      batchId,
      createdAt,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function writeKnowledgeAsset(
  relativePath: string,
  markdown: string,
  overwrite = false,
): Promise<WriteKnowledgeAssetResult> {
  try {
    return await invoke<WriteKnowledgeAssetResult>("write_knowledge_asset", {
      relativePath,
      markdown,
      overwrite,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function buildLegacyMigrationDraft(
  sourcePath: string,
  markdown: string,
  targetType: "fragment" | "collection",
): Promise<LegacyMigrationDraftResult> {
  try {
    return await invoke<LegacyMigrationDraftResult>("build_legacy_migration_draft", {
      sourcePath,
      markdown,
      targetType,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getTagTaxonomyConfig(): Promise<UserTagTaxonomyConfig> {
  try {
    return await invoke<UserTagTaxonomyConfig>("get_tag_taxonomy_config");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function saveTagTaxonomyConfig(config: UserTagTaxonomyConfig): Promise<void> {
  try {
    await invoke<void>("save_tag_taxonomy_config", { config });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getBlogConfig(): Promise<BlogConfig> {
  try {
    return await invoke<BlogConfig>("get_blog_config");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function saveBlogConfig(config: BlogConfig): Promise<void> {
  try {
    await invoke<void>("save_blog_config", { config });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function resetTagTaxonomyConfig(): Promise<UserTagTaxonomyConfig> {
  try {
    return await invoke<UserTagTaxonomyConfig>("reset_tag_taxonomy_config");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getAiConfig(): Promise<AiConfig> {
  try {
    return await invoke<AiConfig>("get_ai_config");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  try {
    await invoke<void>("save_ai_config", { config });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function testAiConnection(): Promise<TestAiConnectionResult> {
  try {
    return await invoke<TestAiConnectionResult>("test_ai_connection");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function saveAiProvider(provider: AiProvider): Promise<AiProviderActionResult> {
  try {
    return await invoke<AiProviderActionResult>("save_ai_provider", { provider });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function deleteAiProvider(providerId: string): Promise<AiConfig> {
  try {
    return await invoke<AiConfig>("delete_ai_provider", { providerId });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function setDefaultAiModel(providerId: string, modelId: string): Promise<AiConfig> {
  try {
    return await invoke<AiConfig>("set_default_ai_model", { providerId, modelId });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function syncAiProviderModels(providerId: string): Promise<SyncAiProviderModelsResult> {
  try {
    return await invoke<SyncAiProviderModelsResult>("sync_ai_provider_models", { providerId });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function syncAiProviderModelsDraft(provider: AiProvider): Promise<SyncAiProviderDraftModelsResult> {
  try {
    return await invoke<SyncAiProviderDraftModelsResult>("sync_ai_provider_models_draft", { provider });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function testAiProvider(providerId: string): Promise<TestAiProviderResult> {
  try {
    return await invoke<TestAiProviderResult>("test_ai_provider", { providerId });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function testAiProviderDraft(provider: AiProvider): Promise<TestAiProviderResult> {
  try {
    return await invoke<TestAiProviderResult>("test_ai_provider_draft", { provider });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function addAiProviderModel(providerId: string, modelId: string): Promise<AiProviderActionResult> {
  try {
    return await invoke<AiProviderActionResult>("add_ai_provider_model", { providerId, modelId });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function deleteAiProviderModel(providerId: string, modelId: string): Promise<AiProviderActionResult> {
  try {
    return await invoke<AiProviderActionResult>("delete_ai_provider_model", { providerId, modelId });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function searchWebSources(input: SearchWebSourcesInput): Promise<WebSearchResult[]> {
  try {
    return await invoke<WebSearchResult[]>("search_web_sources", { request: input });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function planSearchQueries(input: PlanSearchQueriesInput): Promise<AiSearchQueryPlan> {
  try {
    return await invoke<AiSearchQueryPlan>("plan_search_queries", { input });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function fetchWebSourceExcerpts(input: WebSourceExcerptRequest & { cacheEnabled?: boolean }): Promise<WebSourceExcerptResult[]> {
  try {
    return await invoke<WebSourceExcerptResult[]>("fetch_web_source_excerpts", { input });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function searchLocalNotes(input: SearchLocalNotesInput): Promise<LocalNoteSearchResult[]> {
  try {
    return await invoke<LocalNoteSearchResult[]>("search_local_notes", { input });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function clearWebCache(): Promise<void> {
  try {
    await invoke("clear_web_cache");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function testWebSearchConnection(
  input: TestWebSearchConnectionInput,
): Promise<TestWebSearchConnectionResult> {
  try {
    return await invoke<TestWebSearchConnectionResult>("test_web_search_connection", { input });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getWebCacheStatus(): Promise<WebCacheStatusResult> {
  try {
    return await invoke<WebCacheStatusResult>("get_web_cache_status");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getLocalNoteIndexStatus(): Promise<LocalNoteIndexStatusResult> {
  try {
    return await invoke<LocalNoteIndexStatusResult>("get_local_note_index_status");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function rebuildLocalNoteIndex(): Promise<LocalNoteIndexStatusResult> {
  try {
    return await invoke<LocalNoteIndexStatusResult>("rebuild_local_note_index");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getPromptCitationContractStatus(): Promise<PromptCitationContractStatusResult> {
  try {
    return await invoke<PromptCitationContractStatusResult>("get_prompt_citation_contract_status");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function runNotexSearchSelfCheck(): Promise<NotexSearchSelfCheckResult> {
  try {
    return await invoke<NotexSearchSelfCheckResult>("run_notex_search_self_check");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function generateNoteMetadata(
  relativePath: string,
  markdownContent: string,
  tagTaxonomyContext?: string,
): Promise<GeneratedNoteMetadata> {
  try {
    return await invoke<GeneratedNoteMetadata>("generate_note_metadata", {
      relativePath,
      markdownContent,
      tagTaxonomyContext,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function polishNoteBody(
  relativePath: string,
  markdownContent: string,
): Promise<PolishedNoteBody> {
  try {
    return await invoke<PolishedNoteBody>("polish_note_body", {
      relativePath,
      markdownContent,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function chatWithCurrentNote(
  question: string,
  context: NoteChatContextPayload,
  providerId?: string,
  modelId?: string,
): Promise<NoteChatAnswer> {
  try {
    return await invoke<NoteChatAnswer>("chat_with_current_note", {
      question,
      context,
      providerId,
      modelId,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function suggestNoteTags(
  context: NoteChatContextPayload,
  providerId?: string,
  modelId?: string,
): Promise<NoteTagSuggestion> {
  try {
    return await invoke<NoteTagSuggestion>("suggest_note_tags", {
      context,
      providerId,
      modelId,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function polishSelectedText(
  context: NoteChatContextPayload,
  providerId?: string,
  modelId?: string,
): Promise<PolishedSelectedText> {
  try {
    return await invoke<PolishedSelectedText>("polish_selected_text", {
      context,
      providerId,
      modelId,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function polishFullNote(
  context: NoteChatContextPayload,
  instruction: string,
  providerId?: string,
  modelId?: string,
): Promise<PolishedFullNote> {
  try {
    return await invoke<PolishedFullNote>("polish_full_note", {
      context,
      instruction,
      providerId,
      modelId,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function startCurrentNoteChatStream(input: NoteChatStreamInput): Promise<void> {
  try {
    await invoke<void>("chat_with_current_note_stream", { input });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function listAiPrompts(): Promise<PromptTemplateSummary[]> {
  try {
    return await invoke<PromptTemplateSummary[]>("list_ai_prompts");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function readAiPrompt(fileName: string): Promise<PromptTemplateContent> {
  try {
    return await invoke<PromptTemplateContent>("read_ai_prompt", { fileName });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function saveAiPrompt(fileName: string, content: string): Promise<void> {
  try {
    await invoke<void>("save_ai_prompt", { fileName, content });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function resetAiPromptToDefault(fileName: string): Promise<PromptTemplateContent> {
  try {
    return await invoke<PromptTemplateContent>("reset_ai_prompt_to_default", { fileName });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function polishAiPromptTemplate(
  fileName: string,
  content: string,
): Promise<PolishedAiPromptTemplate> {
  try {
    return await invoke<PolishedAiPromptTemplate>("polish_ai_prompt_template", { fileName, content });
  } catch (e) {
    throw toApiError(e);
  }
}

/**
 * 删除指定笔记文件。
 * 对应 Rust 命令：delete_note
 *
 * @param relativePath - 相对于 notes/ 的路径，如 "qpow.md"
 */
export async function deleteNote(relativePath: string): Promise<void> {
  try {
    await invoke<void>("delete_note", { relativePath });
  } catch (e) {
    throw toApiError(e);
  }
}

/**
 * 重命名笔记文件。原子操作（fs::rename）。
 * 对应 Rust 命令：rename_note
 *
 * @param oldRelativePath - 原相对路径，如 "qpow.md"
 * @param newRelativePath - 新相对路径，如 "fast-pow.md"
 */
export async function renameNote(
  oldRelativePath: string,
  newRelativePath: string,
): Promise<void> {
  try {
    await invoke<void>("rename_note", {
      oldRelativePath,
      newRelativePath,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function createNoteFolder(relativePath: string): Promise<void> {
  try {
    await invoke<void>("create_note_folder", { relativePath });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function renameNoteFolder(
  oldRelativePath: string,
  newRelativePath: string,
): Promise<void> {
  try {
    await invoke<void>("rename_note_folder", {
      oldRelativePath,
      newRelativePath,
    });
  } catch (e) {
    throw toApiError(e);
  }
}

export async function deleteNoteFolder(relativePath: string): Promise<void> {
  try {
    await invoke<void>("delete_note_folder", { relativePath });
  } catch (e) {
    throw toApiError(e);
  }
}

/**
 * 在默认浏览器中打开本地博客。
 * 对应 Rust 命令：open_blog
 */
export async function openBlog(): Promise<void> {
  try {
    await invoke<void>("open_blog");
  } catch (e) {
    throw toApiError(e);
  }
}

/**
 * 确保后台本地博客服务正在运行。
 * 对应 Rust 命令：restart_blog_server
 */
export async function restartBlogServer(): Promise<void> {
  try {
    await invoke<void>("restart_blog_server");
  } catch (e) {
    throw toApiError(e);
  }
}

/**
 * 打开当前实际 notes 目录。
 * 开发模式对应仓库 notes/，release 对应 app data notes/。
 * 对应 Rust 命令：open_notes_folder
 */
export async function openNotesFolder(): Promise<void> {
  try {
    await invoke<void>("open_notes_folder");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function hideMainWindow(): Promise<void> {
  try {
    await invoke<void>("hide_main_window");
  } catch (e) {
    throw toApiError(e);
  }
}
