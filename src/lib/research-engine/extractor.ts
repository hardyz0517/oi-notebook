import type {
  ExcerptBuildResult,
  ExtractedDocument,
  ReaderQualityEvaluation,
  UrlReaderResult,
} from "./readerTypes";

export type ResearchExtractorContext = {
  readerResult: UrlReaderResult;
  quality: ReaderQualityEvaluation;
};

export type ResearchExtractorResult = {
  extractedDocument?: ExtractedDocument;
  excerpt?: ExcerptBuildResult;
  warnings: string[];
  errors: string[];
};

export interface ResearchExtractor {
  readonly name: string;
  extract(input: ResearchExtractorContext): ResearchExtractorResult;
}

export const createEmptyExtractorResult = (): ResearchExtractorResult => ({
  warnings: [],
  errors: [],
});

export const createManualExtractor = (): ResearchExtractor => ({
  name: "manual",
  extract(input: ResearchExtractorContext): ResearchExtractorResult {
    if (!input.readerResult.document) {
      return {
        warnings: ["manual_reader_missing_document"],
        errors: ["manual_reader_missing_document"],
      };
    }

    return {
      extractedDocument: input.readerResult.document,
      warnings: [...input.quality.warnings],
      errors: [],
    };
  },
});
