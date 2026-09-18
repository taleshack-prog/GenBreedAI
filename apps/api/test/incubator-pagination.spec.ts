/**
 * Paginação da incubadora (ADR-0021, item 2 desta rodada): `limit`/`cursor`,
 * ordenado por `createdAt` desc, `nextCursor`, contagem por estado COMPLETA
 * (independe da página), filtro por estado aplicado na LISTAGEM em si (não
 * mais recortado no cliente). Testado no adapter in-memory (`InMemory
 * IncubatorRepository`) — mesma porta que o Drizzle implementa, ver
 * `drizzle.repository.ts`.
 */
import { describe, it, expect } from "vitest";
import { InMemoryIncubatorRepository } from "../src/incubator/in-memory.repository";
import type { Genotype, Phenotype } from "@genbreedai/shared";

const genotype: Genotype = { loci: { A: ["a", "a"] }, qtl: {} };
const phenotype: Phenotype = { loci: { A: "não-melanístico" }, qtl: {}, viable: true, epistasis: [], hasMutation: false };

function entryInput(owner: string, aura = 3) {
  return {
    ownerId: owner, crossId: "cx", sireId: "s", damId: "d", method: "F1" as const,
    pack: "feline" as const, species: "felis-catus",
    genotype, phenotype, prob: 1, fPedigree: 0, fixationIndex: 0, aura, generation: 1,
    sex: "M" as const, fertility: null, haldaneStatus: null,
  };
}

describe("IncubatorRepository.listByOwner — paginação por cursor", () => {
  it("percorrendo todas as páginas (limit menor que o total): nextCursor some no fim, nenhuma entrada repete, todas aparecem uma vez", async () => {
    const repo = new InMemoryIncubatorRepository();
    const owner = "pag-user-1";
    const now = new Date();
    const created = [];
    for (let i = 0; i < 9; i++) created.push(await repo.create(entryInput(owner)));

    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page = await repo.listByOwner(owner, { limit: 4, cursor, now });
      for (const e of page.entries) {
        expect(seen.has(e.id), `entrada ${e.id} repetida entre páginas`).toBe(false);
        seen.add(e.id);
      }
      pages++;
      expect(pages).toBeLessThan(10); // trava contra loop infinito se nextCursor não avançar de verdade
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen.size).toBe(9);
    expect(pages).toBe(3); // 4 + 4 + 1
    expect([...seen]).toEqual(expect.arrayContaining(created.map((e) => e.id)));
  });

  it("limit maior ou igual ao total: 1 página só, nextCursor null", async () => {
    const repo = new InMemoryIncubatorRepository();
    const owner = "pag-user-2";
    for (let i = 0; i < 3; i++) await repo.create(entryInput(owner));
    const page = await repo.listByOwner(owner, { limit: 24, now: new Date() });
    expect(page.entries.length).toBe(3);
    expect(page.nextCursor).toBeNull();
  });

  it("cursor de uma entrada que não existe mais (descartada) → página vazia, nunca reinicia do topo", async () => {
    const repo = new InMemoryIncubatorRepository();
    const owner = "pag-user-3";
    await repo.create(entryInput(owner));
    const page = await repo.listByOwner(owner, { limit: 10, cursor: "incu_nao-existe", now: new Date() });
    expect(page.entries).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("filtro por estado + paginação: só entradas do estado pedido, sem repetir, sem vazar de outro estado", async () => {
    const repo = new InMemoryIncubatorRepository();
    const owner = "pag-user-4";
    const now = new Date();
    for (let i = 0; i < 4; i++) await repo.create(entryInput(owner)); // NA_INCUBADORA
    const gestando = [];
    for (let i = 0; i < 5; i++) gestando.push(await repo.create(entryInput(owner)));
    for (const e of gestando) await repo.claimGestation(e.id, now, new Date(now.getTime() + 3600_000)); // termina em 1h — GESTANDO agora

    const seen = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      const page = await repo.listByOwner(owner, { limit: 2, cursor, state: "GESTANDO", now });
      for (const e of page.entries) {
        expect(seen.has(e.id)).toBe(false);
        seen.add(e.id);
        expect(gestando.some((g) => g.id === e.id)).toBe(true); // nunca uma NA_INCUBADORA
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen.size).toBe(5);
  });

  it("contagem por estado (countByState) é COMPLETA — independe de limit/cursor da página pedida", async () => {
    const repo = new InMemoryIncubatorRepository();
    const owner = "pag-user-5";
    const now = new Date();
    for (let i = 0; i < 7; i++) await repo.create(entryInput(owner));

    const countsDireto = await repo.countByState(owner, now);
    expect(countsDireto).toEqual({ NA_INCUBADORA: 7, GESTANDO: 0, PRONTO: 0, NASCIDO: 0 });

    // Pede só uma página pequena — a contagem continua cheia, não vira 2.
    const page = await repo.listByOwner(owner, { limit: 2, now });
    expect(page.entries.length).toBe(2);
    const countsDepois = await repo.countByState(owner, now);
    expect(countsDepois.NA_INCUBADORA).toBe(7);
  });

  it("PRONTO conta separado de GESTANDO quando o prazo já passou", async () => {
    const repo = new InMemoryIncubatorRepository();
    const owner = "pag-user-6";
    const now = new Date();
    const stillGestating = await repo.create(entryInput(owner));
    await repo.claimGestation(stillGestating.id, now, new Date(now.getTime() + 3600_000)); // termina daqui 1h
    const ready = await repo.create(entryInput(owner));
    await repo.claimGestation(ready.id, new Date(now.getTime() - 7200_000), new Date(now.getTime() - 3600_000)); // terminou há 1h

    const counts = await repo.countByState(owner, now);
    expect(counts.GESTANDO).toBe(1);
    expect(counts.PRONTO).toBe(1);
  });
});
