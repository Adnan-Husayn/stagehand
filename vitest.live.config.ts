import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Live model check only. Run it with `npm run live:check`. The normal `npm test` never loads this file
// and its config only includes src/**/*.test.ts, so the live check cannot run by accident.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["scripts/**/*.live.test.ts"],
    // A full check paces requests several seconds apart, so allow up to 40 minutes.
    testTimeout: 40 * 60 * 1000,
    // Let the trace print straight to the terminal.
    disableConsoleIntercept: true,
    fileParallelism: false,
  },
});
