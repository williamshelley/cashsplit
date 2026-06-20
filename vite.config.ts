import { defineConfig } from "vite";

// Project-pages base path: served from https://<user>.github.io/cashsplit/
export default defineConfig({
  base: "/cashsplit/",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
