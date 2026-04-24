import { invoke } from "@tauri-apps/api/core";
import type { NoteFileInfo } from "@/types/note";

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
 * 覆盖写入指定笔记内容（若文件不存在则创建）。
 * 对应 Rust 命令：write_note
 *
 * @param relativePath - 相对于 notes/ 的路径，如 "qpow.md"
 * @param content - 要写入的 Markdown 字符串
 */
export async function writeNote(
  relativePath: string,
  content: string,
): Promise<void> {
  try {
    await invoke<void>("write_note", { relativePath, content });
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
