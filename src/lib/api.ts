import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { SearchDecision, WebSearchConfig, WebSearchMode, WebSearchRequest, WebSearchResult } from "@/lib/aiWebSearch";
import type { NoteFileInfo } from "@/types/note";

export type CommitNoteStatus = "committed" | "noChanges";

export interface SaveNoteAssetResult {
  markdownPath: string;
  assetRelativePath: string;
}

export async function openExternalUrl(url: string): Promise<void> {
  await openUrl(url);
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

export interface LuoguConfig {
  luogu: {
    uid: string;
    client_id: string;
    last_submission_id: number | null;
  };
  ai: AiConfig;
}

export interface AiConfig {
  base_url: string;
  api_key: string;
  model: string;
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
}

export interface NoteChatAnswer {
  answer: string;
  model: string;
}

export interface NoteTagSuggestion {
  suggestedTags: string[];
  reason: string;
}

export interface PolishedSelectedText {
  polishedText: string;
}

export interface PolishedFullNote {
  polishedBody: string;
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
}

export interface SearchWebSourcesInput extends WebSearchRequest {
  provider?: WebSearchConfig["provider"];
}

export interface TestWebSearchConnectionInput {
  provider: WebSearchConfig["provider"];
  apiKey: string;
  endpoint?: string;
}

export interface TestWebSearchConnectionResult {
  ok: boolean;
  provider: WebSearchConfig["provider"];
  endpoint: string;
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

/** 将 invoke 抛出的 unknown 值统一转成 Error */
function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === "string") return new Error(e);
  return new Error(String(e));
}

/**
 * 列出 notes/ 目录下所有 .md 文件，按最后修改时间降序排列。
 * 对应 Rust 命令：list_notes
 */
export async function listNotes(): Promise<NoteFileInfo[]> {
  try {
    return await invoke<NoteFileInfo[]>("list_notes");
  } catch (e) {
    throw toError(e);
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
    throw toError(e);
  }
}

export async function searchNotes(query: string): Promise<NoteSearchResult[]> {
  try {
    return await invoke<NoteSearchResult[]>("search_notes", { query });
  } catch (e) {
    throw toError(e);
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
    throw toError(e);
  }
}

/**
 * 自动提交刚保存的单个 notes 文件。
 * 对应 Rust 命令：commit_note
 *
 * @param relativePath - 相对于 notes/ 的路径，如 "tricks/qpow.md"
 */
export async function commitNote(
  relativePath: string,
  extraPaths?: string[],
): Promise<CommitNoteStatus> {
  try {
    return await invoke<CommitNoteStatus>("commit_note", { relativePath, extraPaths });
  } catch (e) {
    throw toError(e);
  }
}

/**
 * 自动提交已经删除的单个 notes 文件。
 * 对应 Rust 命令：commit_deleted_note
 */
export async function commitDeletedNote(relativePath: string): Promise<CommitNoteStatus> {
  try {
    return await invoke<CommitNoteStatus>("commit_deleted_note", { relativePath });
  } catch (e) {
    throw toError(e);
  }
}

/**
 * 自动提交已经重命名的单个 notes 文件。
 * 对应 Rust 命令：commit_renamed_note
 */
export async function commitRenamedNote(
  oldPath: string,
  newPath: string,
): Promise<void> {
  try {
    await invoke<void>("commit_renamed_note", { oldPath, newPath });
  } catch (e) {
    throw toError(e);
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
    throw toError(e);
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
    throw toError(e);
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
    throw toError(e);
  }
}

export async function getLuoguConfig(): Promise<LuoguConfig> {
  try {
    return await invoke<LuoguConfig>("get_luogu_config");
  } catch (e) {
    throw toError(e);
  }
}

export async function saveLuoguConfig(config: Pick<LuoguConfig, "luogu">): Promise<void> {
  try {
    await invoke<void>("save_luogu_config", { config });
  } catch (e) {
    throw toError(e);
  }
}

export async function updateLuoguLastSubmissionId(
  lastSubmissionId: number | null,
): Promise<void> {
  try {
    await invoke<void>("update_luogu_last_submission_id", { lastSubmissionId });
  } catch (e) {
    throw toError(e);
  }
}

export async function testLuoguConnection(): Promise<TestLuoguConnectionResult> {
  try {
    return await invoke<TestLuoguConnectionResult>("test_luogu_connection");
  } catch (e) {
    throw toError(e);
  }
}

export async function previewLuoguSubmissions(
  limit = 20,
): Promise<PreviewLuoguSubmissionsResult> {
  try {
    return await invoke<PreviewLuoguSubmissionsResult>("preview_luogu_submissions", { limit });
  } catch (e) {
    throw toError(e);
  }
}

export async function previewLuoguSubmissionPage(
  page = 1,
): Promise<PreviewLuoguSubmissionPageResult> {
  try {
    return await invoke<PreviewLuoguSubmissionPageResult>("preview_luogu_submission_page", { page });
  } catch (e) {
    throw toError(e);
  }
}

export async function importLuoguSubmission(
  submissionId: string,
  autoCommit = true,
): Promise<ImportLuoguSubmissionResult> {
  try {
    return await invoke<ImportLuoguSubmissionResult>("import_luogu_submission", {
      submissionId,
      autoCommit,
    });
  } catch (e) {
    throw toError(e);
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
    throw toError(e);
  }
}

export async function writeLuoguPreparedNote(
  relativePath: string,
  markdown: string,
  autoCommit = true,
): Promise<WriteLuoguPreparedNoteResult> {
  try {
    return await invoke<WriteLuoguPreparedNoteResult>("write_luogu_prepared_note", {
      relativePath,
      markdown,
      autoCommit,
    });
  } catch (e) {
    throw toError(e);
  }
}

export async function syncLuoguInsights(): Promise<SyncLuoguInsightsResult> {
  try {
    return await invoke<SyncLuoguInsightsResult>("sync_luogu_insights");
  } catch (e) {
    throw toError(e);
  }
}

export async function getAiConfig(): Promise<AiConfig> {
  try {
    return await invoke<AiConfig>("get_ai_config");
  } catch (e) {
    throw toError(e);
  }
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  try {
    await invoke<void>("save_ai_config", { config });
  } catch (e) {
    throw toError(e);
  }
}

export async function testAiConnection(): Promise<TestAiConnectionResult> {
  try {
    return await invoke<TestAiConnectionResult>("test_ai_connection");
  } catch (e) {
    throw toError(e);
  }
}

export async function saveAiProvider(provider: AiProvider): Promise<AiProviderActionResult> {
  try {
    return await invoke<AiProviderActionResult>("save_ai_provider", { provider });
  } catch (e) {
    throw toError(e);
  }
}

export async function deleteAiProvider(providerId: string): Promise<AiConfig> {
  try {
    return await invoke<AiConfig>("delete_ai_provider", { providerId });
  } catch (e) {
    throw toError(e);
  }
}

export async function setDefaultAiModel(providerId: string, modelId: string): Promise<AiConfig> {
  try {
    return await invoke<AiConfig>("set_default_ai_model", { providerId, modelId });
  } catch (e) {
    throw toError(e);
  }
}

export async function syncAiProviderModels(providerId: string): Promise<SyncAiProviderModelsResult> {
  try {
    return await invoke<SyncAiProviderModelsResult>("sync_ai_provider_models", { providerId });
  } catch (e) {
    throw toError(e);
  }
}

export async function syncAiProviderModelsDraft(provider: AiProvider): Promise<SyncAiProviderDraftModelsResult> {
  try {
    return await invoke<SyncAiProviderDraftModelsResult>("sync_ai_provider_models_draft", { provider });
  } catch (e) {
    throw toError(e);
  }
}

export async function testAiProvider(providerId: string): Promise<TestAiProviderResult> {
  try {
    return await invoke<TestAiProviderResult>("test_ai_provider", { providerId });
  } catch (e) {
    throw toError(e);
  }
}

export async function testAiProviderDraft(provider: AiProvider): Promise<TestAiProviderResult> {
  try {
    return await invoke<TestAiProviderResult>("test_ai_provider_draft", { provider });
  } catch (e) {
    throw toError(e);
  }
}

export async function addAiProviderModel(providerId: string, modelId: string): Promise<AiProviderActionResult> {
  try {
    return await invoke<AiProviderActionResult>("add_ai_provider_model", { providerId, modelId });
  } catch (e) {
    throw toError(e);
  }
}

export async function deleteAiProviderModel(providerId: string, modelId: string): Promise<AiProviderActionResult> {
  try {
    return await invoke<AiProviderActionResult>("delete_ai_provider_model", { providerId, modelId });
  } catch (e) {
    throw toError(e);
  }
}

export async function searchWebSources(input: SearchWebSourcesInput): Promise<WebSearchResult[]> {
  try {
    return await invoke<WebSearchResult[]>("search_web_sources", { request: input });
  } catch (e) {
    throw toError(e);
  }
}

export async function testWebSearchConnection(
  input: TestWebSearchConnectionInput,
): Promise<TestWebSearchConnectionResult> {
  try {
    return await invoke<TestWebSearchConnectionResult>("test_web_search_connection", { input });
  } catch (e) {
    throw toError(e);
  }
}

export async function generateNoteMetadata(
  relativePath: string,
  markdownContent: string,
): Promise<GeneratedNoteMetadata> {
  try {
    return await invoke<GeneratedNoteMetadata>("generate_note_metadata", {
      relativePath,
      markdownContent,
    });
  } catch (e) {
    throw toError(e);
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
    throw toError(e);
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
    throw toError(e);
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
    throw toError(e);
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
    throw toError(e);
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
    throw toError(e);
  }
}

export async function startCurrentNoteChatStream(input: NoteChatStreamInput): Promise<void> {
  try {
    await invoke<void>("chat_with_current_note_stream", { input });
  } catch (e) {
    throw toError(e);
  }
}

export async function listAiPrompts(): Promise<PromptTemplateSummary[]> {
  try {
    return await invoke<PromptTemplateSummary[]>("list_ai_prompts");
  } catch (e) {
    throw toError(e);
  }
}

export async function readAiPrompt(fileName: string): Promise<PromptTemplateContent> {
  try {
    return await invoke<PromptTemplateContent>("read_ai_prompt", { fileName });
  } catch (e) {
    throw toError(e);
  }
}

export async function saveAiPrompt(fileName: string, content: string): Promise<void> {
  try {
    await invoke<void>("save_ai_prompt", { fileName, content });
  } catch (e) {
    throw toError(e);
  }
}

/**
 * 手动执行 git push origin main。
 * 对应 Rust 命令：push_git
 */
export async function pushGit(): Promise<void> {
  try {
    await invoke<void>("push_git");
  } catch (e) {
    throw toError(e);
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
    throw toError(e);
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
    throw toError(e);
  }
}

/**
 * 在默认浏览器中打开本地 Astro 博客。
 * 对应 Rust 命令：open_blog
 */
export async function openBlog(): Promise<void> {
  try {
    await invoke<void>("open_blog");
  } catch (e) {
    throw toError(e);
  }
}

/**
 * 重启后台 Astro dev server。
 * 对应 Rust 命令：restart_blog_server
 */
export async function restartBlogServer(): Promise<void> {
  try {
    await invoke<void>("restart_blog_server");
  } catch (e) {
    throw toError(e);
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
    throw toError(e);
  }
}
