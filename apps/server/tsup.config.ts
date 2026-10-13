import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  clean: true,
  // The shared workspace package ships TypeScript source, so bundle it in.
  noExternal: ["@travel/shared"],
});
