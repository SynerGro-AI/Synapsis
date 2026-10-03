import { build } from "vite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  configFile: false,
  mode: "production",
  root,
  publicDir: false,
  logLevel: "warn",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    emptyOutDir: false,
    outDir: join(root, "public"),
    lib: {
      entry: join(root, "src", "react-sandbox-runtime.ts"),
      name: "SynapsisReactRuntime",
      formats: ["iife"],
      fileName: () => "react-runtime.js",
    },
  },
});
