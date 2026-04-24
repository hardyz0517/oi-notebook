/**
 * 将 ISO 8601 时间字符串格式化为人类友好的相对时间描述。
 *
 * 规则（以"现在"为基准）：
 * - < 1 分钟        → "刚刚"
 * - < 60 分钟       → "N 分钟前"
 * - 今天内          → "HH:mm"
 * - 昨天            → "昨天 HH:mm"
 * - < 7 天          → "N 天前"
 * - 今年内（7天外） → "MM-DD"
 * - 去年及更早      → "YYYY-MM-DD"
 *
 * @param iso - ISO 8601 格式的时间字符串，如 "2026-04-24T10:00:00+00:00"
 * @returns 格式化后的相对时间字符串
 */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();

  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  // < 1 分钟
  if (diffMinutes < 1) return "刚刚";

  // < 60 分钟
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;

  // 判断是否是"今天"（按本地日历日期）
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  // 判断是否是"昨天"
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  // 今天内：显示 HH:mm
  if (isToday) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  // 昨天：显示 "昨天 HH:mm"
  if (isYesterday) {
    const time = date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `昨天 ${time}`;
  }

  // < 7 天：显示 "N 天前"
  if (diffDays < 7) return `${diffDays} 天前`;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  // 今年内：显示 MM-DD
  if (year === now.getFullYear()) return `${month}-${day}`;

  // 去年及更早：显示 YYYY-MM-DD
  return `${year}-${month}-${day}`;
}
