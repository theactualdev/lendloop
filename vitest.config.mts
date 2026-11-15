import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The same "@/..." alias as tsconfig.json, so UI helpers in lib/ can be tested.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    passWithNoTests: true,
  },
});
