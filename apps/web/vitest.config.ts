import { defineConfig } from "vitest/config";

/**
 * Config mínima (sem @vitejs/plugin-react de propósito): os testes daqui
 * exercitam lógica PURA em `lib/*.ts` (sem JSX/DOM), mesmo padrão de
 * `apps/api/vitest.config.ts` (environment "node", sem jsdom).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@genbreedai/shared": new URL("../../packages/shared/src/index.ts", import.meta.url).pathname,
      "@genbreedai/engine": new URL("../../packages/engine/src/index.ts", import.meta.url).pathname,
    },
  },
  test: { include: ["lib/**/__tests__/*.test.ts"], environment: "node", globals: true },
});
