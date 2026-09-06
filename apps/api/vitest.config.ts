import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// NestJS depende de emitDecoratorMetadata → usamos SWC no pipeline de teste.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  resolve: {
    alias: {
      "@genbreedai/shared": new URL("../../packages/shared/src/index.ts", import.meta.url).pathname,
      "@genbreedai/engine": new URL("../../packages/engine/src/index.ts", import.meta.url).pathname,
    },
  },
  test: { include: ["test/**/*.spec.ts"], environment: "node", globals: true },
});
