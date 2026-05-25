const DEBUG_KEY = "oi-notebook.debugTagManager";
export const DEBUG_LOG_KEY = "oi-notebook.debugTagManagerLog";
const DEBUG_LOG_LIMIT = 300;

export function isDebugEnabled(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

function recordDebugEvent(event: string, payload?: unknown): void {
  if (!isDebugEnabled()) return;
  try {
    const raw = window.localStorage.getItem(DEBUG_LOG_KEY) ?? "";
    const entries = raw.split("\n").filter(Boolean);
    entries.push(JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      payload,
    }));
    window.localStorage.setItem(DEBUG_LOG_KEY, entries.slice(-DEBUG_LOG_LIMIT).join("\n"));
  } catch {
    // Debug logging must not affect application behavior.
  }
}

export function debugEvent(event: string, payload?: unknown): void {
  recordDebugEvent(event, payload);
}
