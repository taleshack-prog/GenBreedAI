/**
 * Scripts de linha de comando NÃO passam pelo boot da API HTTP (ADR-0031, adendo).
 *
 * As validações `assert…ForBoot()` (AUTH_SECRET, DATABASE_URL, R2) só valem para o processo que serve HTTP (`buildApp()` em
 * `main.ts`). Os scripts rodam em serviços com um conjunto MENOR de variáveis — o cron `push-cron` do Railway, por exemplo, tem só
 * `DATABASE_URL`, `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` (sem `FAL_KEY`, sem `R2_*`, sem `AUTH_SECRET`), com `NODE_ENV=production`.
 * Se um script passasse a importar `main.ts`/`app.module.ts` (ou um módulo de guarda), o cron quebraria no deploy, em silêncio.
 *
 * Este teste é ESTÁTICO: caminha pelo grafo de imports (em tempo de execução, sem `import type`) de cada script declarado no
 * `package.json` e garante que nenhum deles alcança o boot HTTP nem os módulos de guarda; e que as chamadas `assert…ForBoot()`
 * existem só em `main.ts`. Script novo no `package.json` é coberto automaticamente.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url))); // pacote é ESM: sem __dirname
const SRC = join(API_ROOT, "src");

/** Módulos que NUNCA podem estar no grafo de um script: o boot HTTP e os guardas de variável. */
const FORBIDDEN = [
  "main.ts",
  "app.module.ts",
  "common/auth-secret.ts",
  "common/database-url.ts",
  "common/r2-config.ts",
  "auth/auth.service.ts", // chama resolveAuthSecret() (exige AUTH_SECRET em produção) ao assinar/verificar JWT
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Especificadores RELATIVOS importados em tempo de execução (ignora `import type`/`export type`). */
function runtimeRelativeImports(file: string): string[] {
  const code = stripComments(readFileSync(file, "utf8"));
  const specs: string[] = [];
  const staticRe = /\b(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/g;
  const dynamicRe = /\bimport\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
  for (const re of [staticRe, dynamicRe]) for (const m of code.matchAll(re)) specs.push(m[1]!);
  return specs;
}

function resolveModule(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const cand of [base, `${base}.ts`, join(base, "index.ts")]) {
    if (cand.endsWith(".ts") && existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

/** Todos os arquivos (do `src/`) alcançáveis a partir de `entry`, com o caminho de importação que levou a cada um. */
function reachable(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const spec of runtimeRelativeImports(cur)) {
      const next = resolveModule(cur, spec);
      if (next && !seen.has(next)) { seen.set(next, [...seen.get(cur)!, next]); queue.push(next); }
    }
  }
  return seen;
}

const rel = (p: string) => relative(SRC, p).split("\\").join("/");

/** Scripts de linha de comando = entradas do `package.json` que executam um `src/**.ts` que não é o `main.ts` (dev/start/start:prod). */
function cliScripts(): { name: string; file: string }[] {
  const pkg = JSON.parse(readFileSync(join(API_ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
  const out: { name: string; file: string }[] = [];
  for (const [name, cmd] of Object.entries(pkg.scripts)) {
    const m = /(?:^|\s)(src\/\S+\.ts)(?:\s|$)/.exec(cmd);
    if (m && m[1] !== "src/main.ts") out.push({ name, file: join(API_ROOT, m[1]!) });
  }
  return out;
}

function allTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? allTsFiles(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("scripts de linha de comando não passam pelo boot da API HTTP", () => {
  const scripts = cliScripts();

  it("descobre os scripts do package.json (inclui o cron push:dispatch e os de banco/imagem)", () => {
    const names = scripts.map((s) => s.name);
    for (const n of ["push:dispatch", "images:backfill-thumbs", "images:regenerate-founders", "images:seed", "db:backfill-sex", "db:seed", "db:migrate", "db:reset"]) {
      expect(names, `script ${n} não encontrado no package.json`).toContain(n);
    }
    for (const s of scripts) expect(existsSync(s.file), `${s.name} → ${s.file}`).toBe(true);
  });

  it.each(cliScripts().map((s) => [s.name, s.file] as const))(
    "%s: o grafo de imports não alcança main.ts, app.module.ts nem os módulos de guarda (AUTH_SECRET/DATABASE_URL/R2)",
    (_name, file) => {
      const graph = reachable(file);
      const hits = FORBIDDEN.map((f) => join(SRC, f)).filter((f) => graph.has(f));
      const detail = hits.map((h) => `${rel(h)} ← ${graph.get(h)!.map(rel).join(" → ")}`).join("\n");
      expect(hits, `o script passaria a exigir variável que não usa:\n${detail}`).toEqual([]);
    },
  );

  it("as chamadas assert…ForBoot() existem SÓ em main.ts (nenhum script nem serviço as chama)", () => {
    const callers: string[] = [];
    for (const f of allTsFiles(SRC)) {
      const code = stripComments(readFileSync(f, "utf8"));
      const calls = [...code.matchAll(/(?<!function\s)\bassert\w*ForBoot\s*\(/g)];
      if (calls.length > 0) callers.push(rel(f));
    }
    expect(callers).toEqual(["main.ts"]);
  });

  it("o grafo do cron push:dispatch é o esperado (sanidade do caminhador: alcança o banco e o VAPID, mas não o boot)", () => {
    const cron = scripts.find((s) => s.name === "push:dispatch")!;
    const graph = new Set([...reachable(cron.file).keys()].map(rel));
    expect(graph.has("db/client.ts")).toBe(true);
    expect(graph.has("common/vapid.ts")).toBe(true);
    expect(graph.has("push/dispatch-ready.ts")).toBe(true);
    expect(graph.has("main.ts")).toBe(false);
  });
});

describe("com o ambiente do push-cron (produção, só DATABASE_URL + VAPID_*), os módulos do script carregam sem exigir mais nada", () => {
  const KEYS = ["NODE_ENV", "DATABASE_URL", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "AUTH_SECRET", "FAL_KEY",
    "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@127.0.0.1:5432/genbreed_test";
    process.env.VAPID_PUBLIC_KEY = "chave-publica-de-teste";
    process.env.VAPID_PRIVATE_KEY = "chave-privada-de-teste";
  });
  afterEach(() => {
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  it("importar storage, tier.service, push.service, push-sender e dispatch-ready em produção sem AUTH_SECRET/FAL_KEY/R2_* não lança", async () => {
    await expect(import("../src/images/storage")).resolves.toBeDefined();
    await expect(import("../src/billing/tier.service")).resolves.toBeDefined();
    await expect(import("../src/push/push.service")).resolves.toBeDefined();
    await expect(import("../src/push/push-sender")).resolves.toBeDefined();
    await expect(import("../src/push/dispatch-ready")).resolves.toBeDefined();
  });
});
