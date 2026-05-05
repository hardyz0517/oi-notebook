import { defineConfig } from "astro/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { resolveNotesDir } from "./notes-path.mjs";
import { rehypeNoteAssets, remarkNoteAssets } from "./rehype-note-assets.mjs";

const isGithubPages = process.env.GITHUB_PAGES === "true";
const basePath = isGithubPages ? "/oi-notebook" : "";

function watchExternalNotes() {
  const notesDir = resolveNotesDir();

  return {
    name: "watch-external-notes",
    hooks: {
      "astro:server:setup"({ server, logger, refreshContent }) {
        let refreshTimer;

        const isNoteMarkdown = (filePath) => {
          const absolutePath = path.resolve(filePath);
          const relativePath = path.relative(notesDir, absolutePath);

          return (
            relativePath &&
            !relativePath.startsWith("..") &&
            !path.isAbsolute(relativePath) &&
            path.extname(absolutePath).toLowerCase() === ".md"
          );
        };

        const refreshNotes = () => {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(async () => {
            if (refreshContent) {
              await refreshContent({});
            }
            server.ws.send({ type: "full-reload" });
          }, 150);
        };

        server.watcher.add(notesDir);
        server.watcher.on("add", (filePath) => {
          if (isNoteMarkdown(filePath)) refreshNotes();
        });
        server.watcher.on("change", (filePath) => {
          if (isNoteMarkdown(filePath)) refreshNotes();
        });
        server.watcher.on("unlink", (filePath) => {
          if (isNoteMarkdown(filePath)) refreshNotes();
        });

        logger.info(`Watching external notes: ${notesDir}`);
      },
    },
  };
}

function copyNoteAssets() {
  const notesDir = resolveNotesDir();
  const sourceDir = path.join(notesDir, "assets");

  return {
    name: "copy-note-assets",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        let sourceStats;

        try {
          sourceStats = await fs.stat(sourceDir);
        } catch (error) {
          if (error?.code === "ENOENT") {
            logger.info(`No note assets directory found, skipping: ${sourceDir}`);
            return;
          }
          throw error;
        }

        if (!sourceStats.isDirectory()) {
          logger.warn(`Note assets path is not a directory, skipping: ${sourceDir}`);
          return;
        }

        const targetDir = path.join(fileURLToPath(dir), "assets");
        await fs.cp(sourceDir, targetDir, { recursive: true, force: true });
        logger.info(`Copied note assets from ${sourceDir} to ${targetDir}`);
      },
    },
  };
}

export default defineConfig({
  site: isGithubPages ? "https://hardyz0517.github.io" : "http://localhost:4321",
  ...(isGithubPages ? { base: basePath } : {}),
  integrations: [watchExternalNotes(), copyNoteAssets()],
  markdown: {
    remarkPlugins: [[remarkNoteAssets, { basePath }], remarkMath],
    rehypePlugins: [[rehypeNoteAssets, { basePath }], rehypeKatex],
    shikiConfig: {
      theme: "github-light",
    },
  },
});
