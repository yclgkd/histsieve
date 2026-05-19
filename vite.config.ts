import { fileURLToPath } from "node:url";
import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifest from "./src/manifest.config";

export default defineConfig({
  plugins: [crx({ manifest })],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: process.env.HISTSIEVE_RELEASE !== "1",
    emptyOutDir: true,
  },
});
