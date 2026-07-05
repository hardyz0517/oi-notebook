import type { ResearchCacheManager } from "./cacheManager";
import type { EvidenceStore } from "./evidenceStore";
import type { ResearchExtractor } from "./extractor";
import type { ResearchReaderProvider } from "./readerProvider";
import type { ResearchSearchProvider } from "./searchProvider";

export type ResearchPipelineBoundary = {
  searchProvider: ResearchSearchProvider;
  readerProvider: ResearchReaderProvider;
  extractor: ResearchExtractor;
  evidenceStore: EvidenceStore;
  cacheManager: ResearchCacheManager;
};

export const createResearchPipelineBoundary = (boundary: ResearchPipelineBoundary): ResearchPipelineBoundary => boundary;
