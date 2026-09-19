import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@zivvvo/content": path.resolve(__dirname, "packages/content/src/index.ts"),
      "@zivvvo/learning-engine": path.resolve(__dirname, "packages/learning-engine/src/index.ts"),
      "@zivvvo/assessment-engine": path.resolve(__dirname, "packages/assessment-engine/src/index.ts"),
      "@zivvvo/ai-gateway": path.resolve(__dirname, "packages/ai-gateway/src/index.ts"),
      "@zivvvo/ai-tutor-language": path.resolve(__dirname, "packages/ai-tutor-language/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "apps/web/src/**/*.test.ts"],
  },
});