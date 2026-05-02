import { defineConfig } from "astro/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

function watchExternalNotes() {
  const notesDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../notes",
  );

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

export default defineConfig({
  site: "http://localhost:4321",
  integrations: [watchExternalNotes()],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});
