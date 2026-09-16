/**
 * Migração de DADOS (não-schema) — preenche `sex` para espécimes legados
 * cujo `sex` está NULL (ADR-0013/0015/0016: o motor exige sexo pra cruzar).
 * IDEMPOTENTE: só toca linhas com `sex IS NULL`; rodar de novo depois de já
 * aplicado não altera nada (zero linhas elegíveis na 2ª execução).
 *
 * Modo padrão = DRY-RUN (só lê e imprime — NADA é gravado). Só grava com a
 * flag `--apply`, dentro de UMA transação, com verificação pós-escrita
 * (rollback automático se sobrar alguma linha com sex IS NULL).
 *
 * Regras (só linhas com sex IS NULL):
 *   a) id presente em FOUNDER_SEX → sex = FOUNDER_SEX[id].
 *   b) demais: sex derivado deterministicamente do id — primeiro byte de
 *      sha256(id) par → "M", ímpar → "F" (provenance_hash é null nos
 *      legados; o id é o único dado estável disponível).
 *   c) fertility/haldane_status NUNCA são preenchidos aqui — ficam null.
 *   d) só RECALCULA cache_key se: (i) row.cache_key NÃO é null, E (ii) o
 *      espécime tem algum locus com `sexExpression` no pack (hoje só Ma no
 *      pack felino, ADR-0017), E (iii) computeCacheKey(genotype, pack, sex)
 *      dá um valor DIFERENTE do atual. cache_key NULL nunca é tocado aqui —
 *      é o caso de todo fundador (S() grava cache_key: null sempre); o
 *      fallback `cacheKeyOf()` da API já recalcula on-the-fly considerando o
 *      sexo (ADR-0017), então gravar aqui seria desnecessário — e, sem a
 *      checagem (i), `recomputed !== null` é sempre verdadeiro, gravando
 *      cache_key em TODO felino com o locus Ma presente (a esmagadora
 *      maioria, mesmo ma/ma — ter o locus não é o mesmo que ele mudar de
 *      aparência por sexo) sem necessidade nenhuma.
 *
 * Uso: pnpm --filter @genbreedai/api db:backfill-sex          (dry-run)
 *      pnpm --filter @genbreedai/api db:backfill-sex --apply  (grava)
 */
import "dotenv/config";
import { eq, isNull, isNotNull } from "drizzle-orm";
import { createDb } from "./client";
import { specimens } from "./schema";
import { FOUNDER_SEX } from "../specimens/in-memory.repository";
import { FELINE_PACK, CANINE_PACK, computeCacheKey, sha256 } from "@genbreedai/engine";
import type { SpeciesPack } from "@genbreedai/engine";
import type { Genotype, Sex } from "@genbreedai/shared";

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

interface Plan {
  id: string;
  sex: Sex;
  rule: "a" | "b";
  newCacheKey: string | null;
  cacheKeyWasNull: boolean;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente (veja .env.example).");
  const { db, pool } = createDb(url);

  const nullRows = await db.select().from(specimens).where(isNull(specimens.sex));
  const alreadySetRows = await db.select({ id: specimens.id }).from(specimens).where(isNotNull(specimens.sex));
  const alreadySetCount = alreadySetRows.length;

  const plans: Plan[] = nullRows.map((row) => {
    const byFounderTable = FOUNDER_SEX[row.id];
    const sex: Sex = byFounderTable ?? deriveSexFromId(row.id);
    const rule: "a" | "b" = byFounderTable ? "a" : "b";
    const pack = packOf(row.pack);
    const genotype = row.genotype as Genotype;
    const cacheKeyWasNull = row.cacheKey === null;
    let newCacheKey: string | null = null;
    // Só recalcula se já havia uma cache_key real (não null) pra comparar —
    // cache_key NULL nunca é tocado aqui (fallback da API resolve).
    if (!cacheKeyWasNull && hasSexLimitedLocus(genotype, pack)) {
      const recomputed = computeCacheKey(genotype, pack, sex);
      if (recomputed !== row.cacheKey) newCacheKey = recomputed;
    }
    return { id: row.id, sex, rule, newCacheKey, cacheKeyWasNull };
  });

  const ruleACount = plans.filter((p) => p.rule === "a").length;
  const ruleBCount = plans.filter((p) => p.rule === "b").length;
  const mCount = plans.filter((p) => p.sex === "M").length;
  const fCount = plans.filter((p) => p.sex === "F").length;
  const cacheKeyChanges = plans.filter((p) => p.newCacheKey !== null);
  const cacheKeyNullCount = plans.filter((p) => p.cacheKeyWasNull).length;

  // eslint-disable-next-line no-console
  console.log(`[db:backfill-sex] Modo: ${apply ? "APPLY (grava)" : "DRY-RUN (só leitura, nada gravado)"}`);
  // eslint-disable-next-line no-console
  console.log(`Total lido (sex IS NULL): ${plans.length}`);
  // eslint-disable-next-line no-console
  console.log(`  Regra (a) — id em FOUNDER_SEX: ${ruleACount}`);
  // eslint-disable-next-line no-console
  console.log(`  Regra (b) — derivado por sha256(id): ${ruleBCount}`);
  // eslint-disable-next-line no-console
  console.log(`  Sexo resultante: M=${mCount} F=${fCount}`);
  // eslint-disable-next-line no-console
  console.log(`  cache_key mudaria em ${cacheKeyChanges.length} espécime(s): ${cacheKeyChanges.map((p) => p.id).join(", ") || "(nenhum)"}`);
  // eslint-disable-next-line no-console
  console.log(`  cache_key NULL (não tocado, fallback resolve): ${cacheKeyNullCount}`);
  // eslint-disable-next-line no-console
  console.log(`Linhas já com sex definido (ignoradas): ${alreadySetCount}`);

  if (!apply) {
    // eslint-disable-next-line no-console
    console.log("Dry-run — nada foi gravado. Rode com --apply para gravar.");
    await pool.end();
    return;
  }

  if (plans.length === 0) {
    // eslint-disable-next-line no-console
    console.log("Nada a gravar (0 linhas elegíveis).");
    await pool.end();
    return;
  }

  await db.transaction(async (tx) => {
    for (const p of plans) {
      const set: { sex: Sex; cacheKey?: string } = { sex: p.sex };
      if (p.newCacheKey !== null) set.cacheKey = p.newCacheKey;
      await tx.update(specimens).set(set).where(eq(specimens.id, p.id));
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

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
