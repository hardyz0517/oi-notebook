export type ResearchCacheNamespace =
  | "search"
  | "read"
  | "extract"
  | "evidence"
  | "workspace";

export type ResearchCacheEntry<T = unknown> = {
  key: string;
  namespace: ResearchCacheNamespace;
  value: T;
  cachedAt: number;
  ttlMs?: number;
  staleAt?: number;
};

export type ResearchCacheSetInput<T = unknown> = {
  key: string;
  namespace: ResearchCacheNamespace;
  value: T;
  ttlMs?: number;
};

export interface ResearchCacheManager {
  get<T = unknown>(key: string): ResearchCacheEntry<T> | undefined;
  set<T = unknown>(input: ResearchCacheSetInput<T>): ResearchCacheEntry<T>;
  delete(key: string): boolean;
  clear(namespace?: ResearchCacheNamespace): void;
  snapshot(): {
    entryCount: number;
    namespaces: Record<ResearchCacheNamespace, number>;
  };
}

const now = (): number => Date.now();

const emptyNamespaceCounts = (): Record<ResearchCacheNamespace, number> => ({
  search: 0,
  read: 0,
  extract: 0,
  evidence: 0,
  workspace: 0,
});

export const deriveResearchCacheKey = (
  namespace: ResearchCacheNamespace,
  parts: string[],
): string => `${namespace}:${parts.map((part) => part.trim()).filter(Boolean).join(":")}`;

export const createInMemoryResearchCacheManager = (): ResearchCacheManager => {
  const entries = new Map<string, ResearchCacheEntry>();

  return {
    get<T = unknown>(key: string): ResearchCacheEntry<T> | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      return entry as ResearchCacheEntry<T>;
    },
    set<T = unknown>(input: ResearchCacheSetInput<T>): ResearchCacheEntry<T> {
      const entry: ResearchCacheEntry<T> = {
        key: input.key,
        namespace: input.namespace,
        value: input.value,
        cachedAt: now(),
        ttlMs: input.ttlMs,
        staleAt: input.ttlMs ? now() + input.ttlMs : undefined,
      };
      entries.set(entry.key, entry);
      return entry;
    },
    delete(key: string): boolean {
      return entries.delete(key);
    },
    clear(namespace?: ResearchCacheNamespace): void {
      if (!namespace) {
        entries.clear();
        return;
      }
      for (const [key, entry] of entries.entries()) {
        if (entry.namespace === namespace) {
          entries.delete(key);
        }
      }
    },
    snapshot(): { entryCount: number; namespaces: Record<ResearchCacheNamespace, number> } {
      const namespaces = emptyNamespaceCounts();
      for (const entry of entries.values()) {
        namespaces[entry.namespace] += 1;
      }
      return {
        entryCount: entries.size,
        namespaces,
      };
    },
  };
};
