/** 单个笔记文件的元信息，与 Rust NoteFileInfo 结构一一对应（camelCase）。 */
export interface NoteFileInfo {
  /** 文件名（含扩展名），如 "qpow.md"。始终是纯文件名，不含路径前缀。 */
  name: string;
  /** 相对于 notes/ 的完整路径，统一正斜杠，如 "tricks/qpow.md" 或 "note.md"（顶层）。 */
  path: string;
  /** ISO 8601 / RFC 3339 格式的最后修改时间，如 "2026-04-24T10:00:00+00:00" */
  modified: string;
  /** true 表示这是 notes/ 下的目录节点，用于文件树展示和文件夹操作。 */
  isDirectory?: boolean;
  displayTitle?: string;
}
