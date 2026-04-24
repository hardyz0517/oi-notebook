/** 单个笔记文件的元信息，与 Rust NoteFileInfo 结构一一对应（camelCase）。 */
export interface NoteFileInfo {
  /** 文件名（含扩展名），如 "qpow.md" */
  name: string;
  /** 相对于 notes/ 的路径，如 "qpow.md"；未来子目录支持后如 "tricks/qpow.md" */
  path: string;
  /** ISO 8601 / RFC 3339 格式的最后修改时间，如 "2026-04-24T10:00:00+00:00" */
  modified: string;
}
