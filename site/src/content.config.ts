import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const optionalDate = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.date().optional(),
);

const notes = defineCollection({
  loader: glob({
    base: "../notes",
    pattern: "**/*.md",
  }),
  schema: z.object({
    title: z.string().optional().default(""),
    tags: z.array(z.string()).optional().default([]),
    difficulty: z.string().optional().default(""),
    source: z.string().optional().default(""),
    created: optionalDate,
    updated: optionalDate,
    summary: z.string().optional().default(""),
    draft: z.boolean().optional().default(false),
  }),
});

export const collections = { notes };
