/**
 * Backfill de miniaturas (ADR-0027): lista TODAS as páginas antes de decidir
 * (ListObjectsV2 devolve ≤1000 objetos por chamada), só é candidato o `.png`
 * sem `_thumb.jpg`, a contagem é SEMPRE impressa (inclusive com zero faltando),
 * progresso visível, falha não derruba o lote, nunca gera imagem nova nem toca
 * no original. Listagem simulada (sem R2 nem `sharp`); os testes de disco usam
 * pasta temporária. Não importa `main.ts` nem o CLI (nada de `.env`/R2 reais).
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseArgs, currentBucket, runBackfill, classifyNames, inventoryLines, PROGRESS_EVERY, type BackfillDeps,
} from "../src/images/backfill-thumbnails";
import { collectAllPages, statThumb, stat, store, type ListPage } from "../src/images/storage";
import { setThumbnailEncoderForTesting } from "../src/images/thumbnail";

const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;
let tmp: string;
let savedEnv: Record<string, string | undefined>;
let warn: MockInstance<typeof console.warn>;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genbreedai-backfill-"));
  savedEnv = { IMAGE_STORAGE_DIR: process.env.IMAGE_STORAGE_DIR };
  for (const k of R2_VARS) savedEnv[k] = process.env[k];
  process.env.IMAGE_STORAGE_DIR = tmp;
  for (const k of R2_VARS) delete process.env[k];
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  warn.mockRestore();
  setThumbnailEncoderForTesting(null);
  for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await rm(tmp, { recursive: true, force: true });
});

const png = (k: string) => `${k}.png`;
const thumb = (k: string) => `${k}_thumb.jpg`;
const keys = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(4, "0")}`);

/** Deps falsas: listagem paginada simulada + leitura/miniatura/gravação sem I/O. `stored` registra o que foi gravado. */
function fakeDeps(pages: string[][], over: Partial<BackfillDeps> = {}) {
  const stored: string[] = [];
  const fetchCalls: (string | undefined)[] = [];
  const deps: BackfillDeps = {
    list: () => collectAllPages(async (token): Promise<ListPage> => {
      fetchCalls.push(token);
      const i = token === undefined ? 0 : Number(token);
      return { keys: pages[i]!, nextToken: i + 1 < pages.length ? String(i + 1) : undefined };
    }).then((r) => ({ names: r.keys, pages: r.pages })),
    readOriginal: async (k) => Buffer.from(`png-${k}`),
    makeThumbnail: async (b) => Buffer.from(`jpeg-${b.toString()}`),
    storeThumbnail: async (k) => { stored.push(k); },
    ...over,
  };
  return { deps, stored, fetchCalls };
}
/**
 * Coleta a saída COMO O TERMINAL MOSTRA: uma chamada de `log("\nGERADAS: …")` vira DUAS linhas
 * ("" e "GERADAS: …"). Sem isso, `toContain` (igualdade de elemento) nunca casaria com uma
 * linha que o código emite precedida de "\n" — as asserções abaixo continuam exatas, por linha.
 */
const collect = () => {
  const lines: string[] = [];
  return { lines, log: (l: string) => { for (const part of l.split("\n")) lines.push(part); } };
};

describe("parseArgs / currentBucket", () => {
  it("dry-run por padrão; --apply, --confirm-bucket e --max lidos (como antes)", () => {
    expect(parseArgs([])).toEqual({ apply: false, confirmBucket: undefined, max: undefined, maxRaw: undefined });
    expect(parseArgs(["--apply", "--confirm-bucket=genbreed-images", "--max=5"])).toEqual({
      apply: true, confirmBucket: "genbreed-images", max: 5, maxRaw: "5",
    });
  });
  it("sem R2 configurado o bucket é 'local'", () => { expect(currentBucket()).toBe("local"); });
});

describe("collectAllPages — pagina até o fim", () => {
  it("mais de 1000 objetos em duas páginas → devolve TODOS (1000 + 200), 2 páginas, 2ª chamada com o token da 1ª", async () => {
    const p1 = keys("a", 1000), p2 = keys("b", 200);
    const seenTokens: (string | undefined)[] = [];
    const r = await collectAllPages(async (token) => {
      seenTokens.push(token);
      return token === undefined ? { keys: p1, nextToken: "TOKEN-1" } : { keys: p2 };
    });
    expect(r.keys.length).toBe(1200);
    expect(r.pages).toBe(2);
    expect(r.keys[0]).toBe("a0000");
    expect(r.keys[1199]).toBe("b0199");
    expect(seenTokens).toEqual([undefined, "TOKEN-1"]);
  });

  it("página única e página vazia funcionam", async () => {
    expect((await collectAllPages(async () => ({ keys: ["x"] }))).keys).toEqual(["x"]);
    expect(await collectAllPages(async () => ({ keys: [] }))).toEqual({ keys: [], pages: 1 });
  });

  it("token repetido (laço) LANÇA — nunca fica girando nem termina com um subconjunto em silêncio", async () => {
    await expect(collectAllPages(async () => ({ keys: ["x"], nextToken: "MESMO" }))).rejects.toThrow(/laço|repetido/);
  });

  it("erro numa página propaga (a listagem NÃO devolve lista parcial)", async () => {
    let n = 0;
    await expect(collectAllPages(async () => { if (n++ === 1) throw new Error("R2 fora do ar"); return { keys: ["x"], nextToken: `t${n}` }; }))
      .rejects.toThrow("R2 fora do ar");
  });
});

describe("classifyNames — só é candidato o .png SEM o _thumb.jpg correspondente", () => {
  it("separa retratos, miniaturas, órfãs e outros, independente da ordem", () => {
    const inv = classifyNames([thumb("a"), png("a"), png("b"), thumb("orfa"), "leia-me.txt", png("c"), thumb("c")], 2);
    expect(inv.retratos).toEqual(["a", "b", "c"]);
    expect(inv.comMiniatura).toBe(2);
    expect(inv.faltam).toEqual(["b"]);
    expect(inv.miniaturasSemOriginal).toBe(1);
    expect(inv.outros).toBe(1);
    expect(inv.objetos).toBe(7);
    expect(inv.paginas).toBe(2);
  });

  it("um cacheKey que termina em '_thumb' não é confundido com miniatura (extensão .png)", () => {
    const inv = classifyNames(["abc_thumb.png"], 1);
    expect(inv.retratos).toEqual(["abc_thumb"]);
    expect(inv.faltam).toEqual(["abc_thumb"]);
  });
});

describe("runBackfill — paginação (o bug: 852+ objetos, 1ª página cheia de miniaturas)", () => {
  // Estado parecido com o real: 478 retratos, 374 miniaturas, faltam 104. A 1ª página (1000) vem só com
  // itens que JÁ têm miniatura (500 .png + 500 _thumb.jpg); os que FALTAM estão na 2ª página.
  const okKeys = keys("ok", 500);
  const missingKeys = keys("falta", 104);
  const page1 = [...okKeys.map(png), ...okKeys.map(thumb)];
  const page2 = missingKeys.map(png);

  it("DRY-RUN: enxerga as DUAS páginas e conta corretamente — sem gravar nada", async () => {
    const { deps, stored, fetchCalls } = fakeDeps([page1, page2]);
    const { lines, log } = collect();
    const s = await runBackfill({ apply: false }, log, deps);

    expect(fetchCalls.length).toBe(2); // pediu a 2ª página
    expect(s.inventory.retratos.length).toBe(604);
    expect(s.inventory.comMiniatura).toBe(500);
    expect(s.inventory.faltam.length).toBe(104);
    expect(stored).toEqual([]);
    const text = lines.join("\n");
    expect(text).toContain("Retratos (.png): 604");
    expect(text).toContain("Sem miniatura: 104");
    expect(text).toContain("2 página(s)");
  });

  it("--apply processa os que faltam da 2ª página (e só esses)", async () => {
    const { deps, stored } = fakeDeps([page1, page2]);
    const { lines, log } = collect();
    const s = await runBackfill({ apply: true }, log, deps);
    expect(s).toMatchObject({ processados: 104, gerados: 104 });
    expect(s.falhas).toEqual([]);
    expect([...stored].sort()).toEqual([...missingKeys].sort());
    expect(lines).toContain("GERADAS: 104 | FALHAS: 0");
  });

  it("faltantes espalhados nas DUAS páginas são todos processados", async () => {
    const a = keys("pa", 5), b = keys("pb", 7);
    const { deps, stored } = fakeDeps([[...a.map(png), ...keys("t", 990).map(thumb)], b.map(png)]);
    const s = await runBackfill({ apply: true }, () => {}, deps);
    expect(s.gerados).toBe(12);
    expect([...stored].sort()).toEqual([...a, ...b].sort());
  });
});

describe("runBackfill — nunca termina em silêncio", () => {
  it("NENHUM faltando: a contagem é impressa mesmo assim (dry-run e apply)", async () => {
    const k = keys("k", 3);
    const pages = [[...k.map(png), ...k.map(thumb)]];
    for (const apply of [false, true]) {
      const { deps } = fakeDeps(pages);
      const { lines, log } = collect();
      const s = await runBackfill({ apply }, log, deps);
      const text = lines.join("\n");
      expect(text).toContain("Retratos (.png): 3");
      expect(text).toContain("Já têm miniatura: 3");
      expect(text).toContain("Sem miniatura: 0");
      expect(s.inventory.faltam).toEqual([]);
      if (apply) expect(lines).toContain("GERADAS: 0 | FALHAS: 0");
    }
  });

  it("storage vazio: imprime a contagem zerada (não fica mudo)", async () => {
    const { deps } = fakeDeps([[]]);
    const { lines, log } = collect();
    await runBackfill({ apply: false }, log, deps);
    expect(lines.join("\n")).toContain("Retratos (.png): 0");
    expect(lines.join("\n")).toContain("Sem miniatura: 0");
  });

  it("FALHA na listagem: runBackfill REJEITA (o CLI imprime o erro e sai com 1) — nunca devolve contagem falsa", async () => {
    const { deps } = fakeDeps([[]], { list: async () => { throw new Error("R2: AccessDenied"); } });
    await expect(runBackfill({ apply: false }, () => {}, deps)).rejects.toThrow("R2: AccessDenied");
  });

  it("inventoryLines sempre traz as 4 linhas de contagem", () => {
    const lines = inventoryLines(classifyNames([], 1));
    expect(lines.filter((l) => /Objetos listados|Retratos \(\.png\)|Já têm miniatura|Sem miniatura/.test(l)).length).toBe(4);
  });
});

describe("runBackfill — progresso, falhas e --max", () => {
  it(`progresso a cada ${PROGRESS_EVERY} processados e na última`, async () => {
    const { deps } = fakeDeps([keys("p", 25).map(png)]);
    const { lines, log } = collect();
    await runBackfill({ apply: true }, log, deps);
    const progress = lines.filter((l) => l.includes("progresso:"));
    expect(progress.map((l) => /(\d+)\/25/.exec(l)![1])).toEqual(["10", "20", "25"]);
    expect(lines).toContain("GERADAS: 25 | FALHAS: 0");
  });

  it("uma falha não derruba o lote: vira falha registrada, listada no fim, e os outros seguem", async () => {
    const { deps, stored } = fakeDeps([["ok-1.png", "ruim.png", "ok-2.png"]], {
      makeThumbnail: async (b) => { if (b.toString() === "png-ruim") throw new Error("imagem ilegível"); return Buffer.from("jpeg"); },
    });
    const { lines, log } = collect();
    const s = await runBackfill({ apply: true }, log, deps);
    expect(s.gerados).toBe(2);
    expect(s.falhas).toEqual([{ cacheKey: "ruim", message: "imagem ilegível" }]);
    expect(stored.sort()).toEqual(["ok-1", "ok-2"]);
    expect(lines).toContain("GERADAS: 2 | FALHAS: 1");
    expect(lines).toContain("  ruim: imagem ilegível"); // listada no resumo final
  });

  it("original que sumiu entre a listagem e a leitura vira falha (não exceção)", async () => {
    const { deps } = fakeDeps([["x.png"]], { readOriginal: async () => null });
    const s = await runBackfill({ apply: true }, () => {}, deps);
    expect(s.falhas[0]).toMatchObject({ cacheKey: "x" });
    expect(s.gerados).toBe(0);
  });

  it("--max limita a rodada (e diz quantos processa de quantos faltam)", async () => {
    const { deps, stored } = fakeDeps([keys("m", 30).map(png)]);
    const { lines, log } = collect();
    const s = await runBackfill({ apply: true, max: 12 }, log, deps);
    expect(s).toMatchObject({ processados: 12, gerados: 12 });
    expect(stored.length).toBe(12);
    expect(s.inventory.faltam.length).toBe(30);
    expect(lines.join("\n")).toContain("Processando 12 de 30 (--max=12)");
  });
});

describe("runBackfill — disco local (dependências reais, pasta temporária)", () => {
  /** Grava originais SEM miniatura (como os retratos anteriores à ADR-0027): o codificador falha de propósito. */
  async function seedOldPortraits(ks: string[]) {
    setThumbnailEncoderForTesting(async () => { throw new Error("sem miniatura (retrato antigo)"); });
    for (const k of ks) await store(k, Buffer.from(`png-${k}`));
    setThumbnailEncoderForTesting(null);
  }

  it("DRY-RUN conta e não grava nada", async () => {
    await seedOldPortraits(["k1", "k2", "k3"]);
    const s = await runBackfill({ apply: false }, () => {});
    expect(s.inventory).toMatchObject({ retratos: ["k1", "k2", "k3"], comMiniatura: 0, faltam: ["k1", "k2", "k3"] });
    for (const k of ["k1", "k2", "k3"]) expect(await statThumb(k)).toBeNull();
  });

  it("--apply gera só as que faltam, NÃO toca nos originais e é idempotente", async () => {
    await seedOldPortraits(["k1", "k2"]);
    setThumbnailEncoderForTesting(async () => Buffer.from("jpeg-fake"));
    await store("k3", Buffer.from("png-k3")); // este já nasce com miniatura
    const before = await stat("k1");

    const s = await runBackfill({ apply: true }, () => {});
    expect(s).toMatchObject({ processados: 2, gerados: 2 });
    for (const k of ["k1", "k2", "k3"]) expect(await statThumb(k)).not.toBeNull();
    expect(await readFile(join(tmp, "k1.png"))).toEqual(Buffer.from("png-k1"));
    expect((await stat("k1"))!.version).toBe(before!.version);

    const again = await runBackfill({ apply: true }, () => {});
    expect(again.inventory.faltam).toEqual([]);
    expect(again.processados).toBe(0);
  });

  it("pasta inexistente: zero retratos, sem exceção", async () => {
    await rm(tmp, { recursive: true, force: true });
    const s = await runBackfill({ apply: false }, () => {});
    expect(s.inventory.retratos).toEqual([]);
  });
});
