import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const content = resolve(import.meta.dirname, "../content");

export default defineConfig({
  plugins: [
    { enforce: "pre", ...mdx({ providerImportSource: "@mdx-js/react" }) },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@content": content } },
  // Module prose lives outside web/ so the server can read the same tree.
  server: { fs: { allow: [".."] }, proxy: { "/api": "http://localhost:3000" } },
});
