import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only. They run offline: Qloo and the model provider are never called.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
