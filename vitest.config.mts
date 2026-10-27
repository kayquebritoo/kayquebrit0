import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Só o alias `@/` do tsconfig: permite testar os Route Handlers (`@/app/api/...`) direto.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
