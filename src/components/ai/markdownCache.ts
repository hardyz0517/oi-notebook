const MAX_MARKDOWN_CACHE_ENTRIES = 160;

type MarkdownCacheEntry = {
  key: string;
  html: string;
  lastUsedAt: number;
};

const markdownRenderCache = new Map<string, MarkdownCacheEntry>();

export const hashMarkdownContent = (content: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const getMarkdownRenderCacheKey = ({
  messageId,
  content,
  theme,
  citationSignature = "",
}: {
  messageId: string;
  content: string;
  theme: string;
  citationSignature?: string;
}): string => [
  messageId,
  hashMarkdownContent(content),
  theme,
  citationSignature,
].join(":");

export const readMarkdownRenderCache = (key: string): string | null => {
  const entry = markdownRenderCache.get(key);
  if (!entry) return null;
  entry.lastUsedAt = Date.now();
  return entry.html;
};

export const writeMarkdownRenderCache = (key: string, html: string): void => {
  markdownRenderCache.set(key, { key, html, lastUsedAt: Date.now() });
  if (markdownRenderCache.size <= MAX_MARKDOWN_CACHE_ENTRIES) return;

  const entries = Array.from(markdownRenderCache.values()).sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  for (const entry of entries.slice(0, Math.max(1, markdownRenderCache.size - MAX_MARKDOWN_CACHE_ENTRIES))) {
    markdownRenderCache.delete(entry.key);
  }
};
