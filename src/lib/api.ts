import { invoke } from "@tauri-apps/api/core";
import type { NoteFileInfo } from "@/types/note";

export type CommitNoteStatus = "committed" | "noChanges";

export interface SaveNoteAssetResult {
  markdownPath: string;
  assetRelativePath: string;
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
export async function commitDeletedNote(relativePath: string): Promise<void> {
  try {
    await invoke<void>("commit_deleted_note", { relativePath });
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
