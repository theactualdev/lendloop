import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The same "@/..." alias as tsconfig.json, so UI helpers in lib/ can be tested.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    passWithNoTests: true,
    // The first convex-test call in a file loads the Convex functions and
    // components: about 1 s alone, but over 5 s (Vitest's default limit) when
    // every file runs at once on a busy or slower machine. 20 s keeps that from
    // failing a run while still catching a test that hangs.
    testTimeout: 20_000,
  },
});
