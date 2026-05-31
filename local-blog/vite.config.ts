import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/local-blog/",
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4321",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
