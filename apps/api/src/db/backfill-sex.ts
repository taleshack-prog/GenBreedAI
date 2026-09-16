/**
 * Migração de DADOS (não-schema) — preenche `sex` (todos os legados) e
 * `fertility`/`haldane_status` (só NÃO fundadores) pra espécimes que ainda
 * não têm. IDEMPOTENTE: só toca `sex IS NULL` / `fertility IS NULL`; rodar
 * de novo depois de aplicado não altera nada (zero linhas elegíveis).
 *
 * Modo padrão = DRY-RUN (só lê e imprime — NADA é gravado). Só grava com a
 * flag `--apply`, dentro de UMA transação, com verificação pós-escrita
 * (rollback automático se sobrar `sex IS NULL`).
 *
 * === Regras de SEXO (só linhas com sex IS NULL), NESTA ORDEM ===
 *   a) id presente em FOUNDER_SEX → sex = FOUNDER_SEX[id] (inalterado).
 *   b) id aparece como sire_id de algum espécime no banco → "M".
 *   c) id aparece como dam_id de algum espécime no banco → "F".
 *   d) aparece como sire_id de ALGUM registro E como dam_id de OUTRO —
 *      conflito: NÃO grava sexo pra esse id, e o script INTEIRO aborta
 *      (antes de abrir a transação), listando todos os ids em conflito.
 *      Achado que motivou a regra: um espécime não pode ter sido usado como
 *      pai numa cruza e como mãe noutra — dado ambíguo demais pra resolver
 *      sem revisão humana (ex.: spec_d19, F1 leopardo-das-neves×tigre-
 *      albino, tinha virado F pelo hash mas era sire de 6 F2 — hoje a
 *      regra (b) resolve isso ANTES do hash, e só cairia aqui se também
 *      fosse dam de outro registro).
 *   e) nenhuma das anteriores → derivado do hash: primeiro byte de
 *      sha256(id) par → "M", ímpar → "F" (fallback quando não há nenhum
 *      vínculo de pedigree nem cadastro de fundador).
 *
 * === Regra de FERTILIDADE (só NÃO fundadores com fertility IS NULL) ===
 * Reusa EXATAMENTE o motor — nenhuma lógica é reimplementada:
 *   - RNG: `createPrng(seed: string): Rng`
 *     (packages/engine/src/rng.ts:53), reexportado por
 *     packages/engine/src/index.ts. Chamado aqui como
 *     `createPrng(\`backfill:${id}\`)`.
 *   - hybridClass: `hybridClass(parentA: ParentInput, parentB: ParentInput,
 *     pack: SpeciesPack): HybridClass` (packages/engine/src/cross.ts) — lê
 *     SÓ o campo `.species` dos dois parâmetros, então um objeto com esse
 *     único campo basta. `apps/api/src/cross/cross.service.ts` NUNCA chama
 *     hybridClass() diretamente — é o motor (finalizeSpecimen) quem chama,
 *     usando o `species` que cross.service.ts já normalizou ao montar o
 *     ParentInput, via um helper local NÃO-exportado (`engineSpecies()`):
 *     canino sempre "canis-familiaris"; felino (e demais) via
 *     `normalizeBiologicalSpecies(species)` (@genbreedai/shared, essa sim
 *     exportada). Como `engineSpecies()` em si não é exportável daqui, este
 *     script reproduz só a parte trivial e documentada dela (canino =
 *     constante fixa, ADR-0015) e REUSA `normalizeBiologicalSpecies()` de
 *     verdade pro resto — a normalização em si nunca é reimplementada.
 *   - fertilityScore(method, fPedigree, { sex, hybridClass, rng }) —
 *     packages/engine/src/fertility.ts, reexportada pelo índice do pacote.
 *     Grava `fertility = result.score` e `haldane_status =
 *     result.haldaneStatus`.
 *   - fPedigree: usa o `f_pedigree` JÁ GRAVADO na própria linha (calculado
 *     no cruzamento original via wrightF) — não reconstrói pedigree aqui.
 *   - Se sire_id ou dam_id do registro não existir no banco (ou a linha não
 *     tiver sexo resolvido): não calcula fertilidade pra essa linha, e o
 *     script INTEIRO aborta (antes da transação), listando os ids afetados.
 *   - Fundadores: fertility e haldane_status continuam NULL, sempre.
 *
 * === Machos híbridos além do F1 — ADR-0018 ===
 * Regra: macho cuja ascendência mistura mais de uma espécie biológica é
 * estéril, em qualquer method (F1, BC1, F2, LINE, INBREED, OUTCROSS...).
 * Documentada e MOTIVADA em docs/adr/0018-esterilidade-macho-hibrido.md
 * (motivo: o motor só implementava Haldane no ramo F1, ADR-0015, deixando
 * BC1/F2/... indevidamente férteis pra machos híbridos; evidência biológica
 * Savannah — Felis catus × Leptailurus serval — machos estéreis por várias
 * gerações após o F1, GRADE baixo). O motor (packages/engine/src/cross.ts,
 * finalizeSpecimen) já implementa a MESMA regra desde a ADR-0018 — este
 * backfill deixa de ser um remendo provisório sem ADR e passa a ser a
 * aplicação da regra JÁ FORMALIZADA sobre os dados legados que o motor não
 * viu nascer. Lógica abaixo inalterada por esta atualização de comentário:
 * depois de calcular a fertilidade com o motor (acima), se `sex === "M"` E
 * o species normalizado do PRÓPRIO espécime (não dos pais) —
 * `engineSpeciesOf(pack, species)` — tiver mais de 1 componente separado
 * por "×", força `fertility = 0` e `haldaneStatus = "STERILE"`,
 * independente do `method`. Fêmeas híbridas mantêm o valor calculado pelo
 * motor. F1 macho interespecífico já sai STERILE pelo motor sozinho — esta
 * regra não muda esse caso, só cobre o que o motor não cobria antes da
 * ADR-0018 (BC1/F2/... em diante).
 *
 * === TRAVA DE GRAVAÇÃO — --confirm-host ===
 * Motivo: uma gravação anterior neste banco não teve origem identificada
 * (nenhuma execução deste script, nem de outro comando, foi registrada por
 * quem a fez). Pra reduzir o risco de `--apply` disparar contra o host
 * errado (ex.: variável de ambiente apontando pro banco de produção sem
 * querer), `--apply` só grava se TAMBÉM vier `--confirm-host=<host>`, com
 * `<host>` EXATAMENTE igual ao host de `DATABASE_URL` (ex.:
 * `--confirm-host=ep-withered-boat-aydha3cc-pooler.c-5.us-east-2.aws.neon.tech`).
 * Sem a flag, ou com um host diferente do real: imprime o host real e sai
 * com código 1 ANTES de qualquer leitura/escrita no banco — nunca chega a
 * abrir conexão. DRY-RUN nunca precisa da flag (nunca grava).
 *
 * Uso: pnpm --filter @genbreedai/api db:backfill-sex                                      (dry-run, sem flag)
 *      pnpm --filter @genbreedai/api db:backfill-sex --apply --confirm-host=<host-real>    (grava)
 */
import "dotenv/config";
import { eq, isNull } from "drizzle-orm";
import { createDb } from "./client";
import { specimens } from "./schema";
import { FOUNDER_SEX } from "../specimens/in-memory.repository";
import {
  FELINE_PACK, CANINE_PACK, computeCacheKey, sha256,
  createPrng, hybridClass, fertilityScore,
  type ParentInput,
} from "@genbreedai/engine";
import type { SpeciesPack } from "@genbreedai/engine";
import { normalizeBiologicalSpecies } from "@genbreedai/shared";
import type { Genotype, Sex, BreedingMethod } from "@genbreedai/shared";

/** Primeiro byte de sha256(id) — par → M, ímpar → F. Determinístico, sem RNG. */
function deriveSexFromId(id: string): Sex {
  const hex = sha256(id);
  const firstByte = parseInt(hex.slice(0, 2), 16);
  return firstByte % 2 === 0 ? "M" : "F";
}

function packOf(pack: string): SpeciesPack {
  return pack === "canine" ? CANINE_PACK : FELINE_PACK;
}

/** Algum locus PRESENTE no genótipo tem `sexExpression` declarado no pack? */
function hasSexLimitedLocus(genotype: Genotype, pack: SpeciesPack): boolean {
  return Object.keys(genotype.loci).some((locus) => pack.loci[locus]?.sexExpression !== undefined);
}

/**
 * Espécie normalizada pro `ParentInput.species` do motor — mesma regra de
 * `engineSpecies()` (cross.service.ts, não-exportado): canino sempre
 * "canis-familiaris"; demais via `normalizeBiologicalSpecies()` (reusada).
 */
function engineSpeciesOf(pack: string, species: string): string {
  return pack === "canine" ? "canis-familiaris" : normalizeBiologicalSpecies(species);
}

interface SexPlan {
  id: string;
  sex: Sex;
  rule: "a" | "b" | "c" | "e";
}

interface FertilityPlan {
  id: string;
  fertility: number;
  haldaneStatus: "NONE" | "STERILE" | "REDUCED";
  provisionalRuleApplied: boolean;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente (veja .env.example).");

  const host = (() => { try { return new URL(url).host; } catch { return "(host inválido)"; } })();
  // Primeira coisa impressa em QUALQUER modo — sem exceção, mesmo quando a
  // trava abaixo vai abortar.
  // eslint-disable-next-line no-console
  console.log(`HOST: ${host}`);
  // eslint-disable-next-line no-console
  console.log(`MODO: ${apply ? "APPLY" : "DRY-RUN"}`);

  // TRAVA DE GRAVAÇÃO (ver cabeçalho) — só se aplica quando --apply está
  // presente; DRY-RUN nunca escreve, então nunca precisa da flag. Checado
  // ANTES de abrir qualquer conexão com o banco (createDb abaixo).
  if (apply) {
    const confirmArg = process.argv.find((a) => a.startsWith("--confirm-host="));
    const confirmHost = confirmArg?.slice("--confirm-host=".length);
    if (confirmHost !== host) {
      // eslint-disable-next-line no-console
      console.error(
        "[db:backfill-sex] ABORTADO — trava de gravação: --apply exige --confirm-host=<host> IGUAL ao host real " +
        `de DATABASE_URL.\nHost real: ${host}\n` +
        (confirmHost ? `--confirm-host recebido: ${confirmHost} (não bate)\n` : "--confirm-host não informado.\n") +
        `Rode de novo com: --apply --confirm-host=${host}`,
      );
      process.exit(1);
    }
  }

  const { db, pool } = createDb(url);

  const allRows = await db.select().from(specimens);
  const byId = new Map(allRows.map((r) => [r.id, r]));
  const sireIdsReferenced = new Set(allRows.map((r) => r.sireId).filter((x): x is string => x !== null));
  const damIdsReferenced = new Set(allRows.map((r) => r.damId).filter((x): x is string => x !== null));

  const nullSexRows = allRows.filter((r) => r.sex === null);
  const alreadySetCount = allRows.length - nullSexRows.length;

  // ── SEXO ──────────────────────────────────────────────────────────────
  const sexConflicts: string[] = [];
  const sexPlans: SexPlan[] = [];
  for (const row of nullSexRows) {
    const byFounderTable = FOUNDER_SEX[row.id];
    if (byFounderTable) { sexPlans.push({ id: row.id, sex: byFounderTable, rule: "a" }); continue; }
    const isSire = sireIdsReferenced.has(row.id);
    const isDam = damIdsReferenced.has(row.id);
    if (isSire && isDam) { sexConflicts.push(row.id); continue; }
    if (isSire) { sexPlans.push({ id: row.id, sex: "M", rule: "b" }); continue; }
    if (isDam) { sexPlans.push({ id: row.id, sex: "F", rule: "c" }); continue; }
    sexPlans.push({ id: row.id, sex: deriveSexFromId(row.id), rule: "e" });
  }

  if (sexConflicts.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      "[db:backfill-sex] ABORTADO — regra (d): id aparece como sire_id de um registro E como dam_id de outro " +
      "(dado ambíguo demais pra resolver sem revisão humana). Nenhum sexo foi gravado. Ids em conflito:\n  " +
      sexConflicts.join(", "),
    );
    await pool.end();
    process.exit(1);
  }

  const sexById = new Map(sexPlans.map((p) => [p.id, p]));
  const ruleACount = sexPlans.filter((p) => p.rule === "a").length;
  const ruleBCount = sexPlans.filter((p) => p.rule === "b").length;
  const ruleCCount = sexPlans.filter((p) => p.rule === "c").length;
  const ruleECount = sexPlans.filter((p) => p.rule === "e").length;

  // ── cache_key (ADR-0017) — só se já havia cache_key REAL (não null) e o
  // locus limitado ao sexo muda o fenótipo entre os sexos. ────────────────
  const cacheKeyPlans = new Map<string, string>(); // id -> novo cacheKey
  for (const p of sexPlans) {
    const row = byId.get(p.id)!;
    if (row.cacheKey === null) continue;
    const pack = packOf(row.pack);
    const genotype = row.genotype as Genotype;
    if (!hasSexLimitedLocus(genotype, pack)) continue;
    const recomputed = computeCacheKey(genotype, pack, p.sex);
    if (recomputed !== row.cacheKey) cacheKeyPlans.set(p.id, recomputed);
  }
  const cacheKeyNullCount = sexPlans.filter((p) => byId.get(p.id)!.cacheKey === null).length;

  // ── FERTILIDADE (só não-fundadores, fertility IS NULL) ──────────────────
  const fertilityMissingParent: string[] = [];
  const fertilityPlans: FertilityPlan[] = [];
  const nonFounderFertilityNullRows = allRows.filter((r) => r.method !== "FOUNDER" && r.fertility === null);
  for (const row of nonFounderFertilityNullRows) {
    const sireRow = row.sireId ? byId.get(row.sireId) : undefined;
    const damRow = row.damId ? byId.get(row.damId) : undefined;
    const effectiveSex: Sex | undefined = (row.sex as Sex | null) ?? sexById.get(row.id)?.sex;
    if (!row.sireId || !sireRow || !row.damId || !damRow || !effectiveSex) {
      const why = !effectiveSex ? "sem sexo resolvido" :
        `sire_id=${row.sireId ?? "null"}${row.sireId && !sireRow ? " ausente" : ""}, dam_id=${row.damId ?? "null"}${row.damId && !damRow ? " ausente" : ""}`;
      fertilityMissingParent.push(`${row.id} (${why})`);
      continue;
    }
    const pack = packOf(row.pack);
    const sireSpecies = engineSpeciesOf(sireRow.pack, sireRow.species);
    const damSpecies = engineSpeciesOf(damRow.pack, damRow.species);
    const hClass = hybridClass({ species: sireSpecies } as ParentInput, { species: damSpecies } as ParentInput, pack);
    const rng = createPrng(`backfill:${row.id}`);
    const result = fertilityScore(row.method as BreedingMethod, row.fPedigree, { sex: effectiveSex, hybridClass: hClass, rng });
    // REGRA PROVISÓRIA (ver cabeçalho) — macho cujo PRÓPRIO species
    // normalizado é multi-componente (híbrido), em QUALQUER method: o motor
    // só cobre isso no F1; até existir ADR, força estéril aqui.
    const ownSpeciesNormalized = engineSpeciesOf(row.pack, row.species);
    const provisionalRuleApplied = effectiveSex === "M" && ownSpeciesNormalized.split("×").length > 1;
    fertilityPlans.push({
      id: row.id,
      fertility: provisionalRuleApplied ? 0 : result.score,
      haldaneStatus: provisionalRuleApplied ? "STERILE" : result.haldaneStatus,
      provisionalRuleApplied,
    });
  }

  if (fertilityMissingParent.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      "[db:backfill-sex] ABORTADO — pai ou mãe ausente no banco (ou sem sexo resolvido) pra calcular " +
      "fertilidade. Nenhuma fertilidade foi gravada. Registros afetados:\n  " + fertilityMissingParent.join("\n  "),
    );
    await pool.end();
    process.exit(1);
  }

  const fertilityById = new Map(fertilityPlans.map((p) => [p.id, p]));

  // ── RELATÓRIO ─────────────────────────────────────────────────────────
  // eslint-disable-next-line no-console
  console.log(`[db:backfill-sex] Modo: ${apply ? "APPLY (grava)" : "DRY-RUN (só leitura, nada gravado)"}`);
  // eslint-disable-next-line no-console
  console.log(`Total lido (sex IS NULL): ${sexPlans.length}`);
  // eslint-disable-next-line no-console
  console.log(`  Regra (a) — id em FOUNDER_SEX: ${ruleACount}`);
  // eslint-disable-next-line no-console
  console.log(`  Regra (b) — id é sire_id de algum registro: ${ruleBCount}`);
  // eslint-disable-next-line no-console
  console.log(`  Regra (c) — id é dam_id de algum registro: ${ruleCCount}`);
  // eslint-disable-next-line no-console
  console.log(`  Regra (e) — derivado por sha256(id): ${ruleECount}`);
  // eslint-disable-next-line no-console
  console.log(`  Sexo resultante: M=${sexPlans.filter((p) => p.sex === "M").length} F=${sexPlans.filter((p) => p.sex === "F").length}`);
  // eslint-disable-next-line no-console
  console.log(`  cache_key mudaria em ${cacheKeyPlans.size} espécime(s): ${[...cacheKeyPlans.keys()].join(", ") || "(nenhum)"}`);
  // eslint-disable-next-line no-console
  console.log(`  cache_key NULL (não tocado, fallback resolve): ${cacheKeyNullCount}`);
  // eslint-disable-next-line no-console
  console.log(`Linhas já com sex definido (ignoradas): ${alreadySetCount}`);

  // eslint-disable-next-line no-console
  console.log(`\nFertilidade calculada (não-fundadores, fertility IS NULL): ${fertilityPlans.length}`);

  // eslint-disable-next-line no-console
  console.log("\nPor espécime não fundador (id·8, method, sex, regra do sexo, fertility, haldaneStatus, regra provisória aplicada):");
  const nonFounderIds = new Set<string>([
    ...sexPlans.filter((p) => byId.get(p.id)!.method !== "FOUNDER").map((p) => p.id),
    ...fertilityPlans.map((p) => p.id),
  ]);
  for (const id of nonFounderIds) {
    const row = byId.get(id)!;
    const sexPlan = sexById.get(id);
    const sex = sexPlan?.sex ?? row.sex ?? "—";
    const rule = sexPlan?.rule ?? "já tinha sex";
    const fp = fertilityById.get(id);
    const fertility = fp ? fp.fertility : (row.fertility ?? "—");
    const haldaneStatus = fp ? fp.haldaneStatus : (row.haldaneStatus ?? "—");
    const provisional = fp ? (fp.provisionalRuleApplied ? "sim" : "não") : "não";
    // eslint-disable-next-line no-console
    console.log(`  ${id.slice(0, 8)} · ${row.method} · sex=${sex} (${rule}) · fertility=${fertility} · haldaneStatus=${haldaneStatus} · regra provisória: ${provisional}`);
  }

  const provisionalSterilized = fertilityPlans.filter((p) => p.provisionalRuleApplied).map((p) => p.id);
  // eslint-disable-next-line no-console
  console.log(`\nMachos híbridos esterilizados pela regra provisória (pendente ADR): ${provisionalSterilized.join(", ") || "(nenhum)"}`);

  // Inclui tanto STERILE do motor (F1 macho interespecífico) quanto os
  // esterilizados pela regra provisória acima — ambos têm fertility===0.
  const sterileHistoricalParents = fertilityPlans
    .filter((p) => p.fertility === 0 && (sireIdsReferenced.has(p.id) || damIdsReferenced.has(p.id)))
    .map((p) => p.id);
  // eslint-disable-next-line no-console
  console.log(`\nPais históricos agora estéreis (registro mantido, não cruzam mais): ${sterileHistoricalParents.join(", ") || "(nenhum)"}`);

  if (!apply) {
    // eslint-disable-next-line no-console
    console.log("\nDry-run — nada foi gravado. Rode com --apply para gravar.");
    await pool.end();
    return;
  }

  if (sexPlans.length === 0 && fertilityPlans.length === 0) {
    // eslint-disable-next-line no-console
    console.log("Nada a gravar (0 linhas elegíveis).");
    // eslint-disable-next-line no-console
    console.log("GRAVADAS: 0 linhas (sexo)");
    // eslint-disable-next-line no-console
    console.log("GRAVADAS: 0 linhas (cache_key)");
    // eslint-disable-next-line no-console
    console.log("GRAVADAS: 0 linhas (fertilidade)");
    await pool.end();
    return;
  }

  await db.transaction(async (tx) => {
    for (const p of sexPlans) {
      const set: { sex: Sex; cacheKey?: string } = { sex: p.sex };
      const newCk = cacheKeyPlans.get(p.id);
      if (newCk !== undefined) set.cacheKey = newCk;
      await tx.update(specimens).set(set).where(eq(specimens.id, p.id));
    }
    for (const p of fertilityPlans) {
      await tx.update(specimens).set({ fertility: p.fertility, haldaneStatus: p.haldaneStatus }).where(eq(specimens.id, p.id));
    }
    const remaining = await tx.select({ id: specimens.id }).from(specimens).where(isNull(specimens.sex));
    if (remaining.length > 0) {
      throw new Error(
        `[db:backfill-sex] Verificação pós-escrita falhou: ${remaining.length} linha(s) ainda com sex IS NULL ` +
        `(${remaining.map((r) => r.id).join(", ")}). Revertendo (rollback).`,
      );
    }
    // eslint-disable-next-line no-console
    console.log("Gravado e verificado: 0 linhas com sex IS NULL restantes.");
  });

  // eslint-disable-next-line no-console
  console.log(`GRAVADAS: ${sexPlans.length} linhas (sexo)`);
  // eslint-disable-next-line no-console
  console.log(`GRAVADAS: ${cacheKeyPlans.size} linhas (cache_key)`);
  // eslint-disable-next-line no-console
  console.log(`GRAVADAS: ${fertilityPlans.length} linhas (fertilidade)`);

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
