/**
 * Ciclo de vida das entradas da incubadora (ADR-0023): cruzar é livre e cada
 * cruzamento grava até 6 entradas (`optionCount`, `cross.service.ts`) — sem
 * limpeza, a tabela cresce sem limite. Não existe processo agendado na API
 * (nenhum cron/job/fila — tudo roda por requisição, ver relatório da
 * rodada), então a limpeza é PREGUIÇOSA: roda dentro de `GET /incubator`
 * (`IncubatorService.list`) e ao gravar um cruzamento novo (`POST /cross`,
 * `CrossController.create`), antes de responder — nunca num timer.
 *
 * Duas regras independentes (ambas por dono):
 *
 * 1. `pruneExpiredBorn` — entrada NASCIDA há mais de `BORN_RETENTION_DAYS`
 *    dias corridos é apagada. O ESPÉCIME nunca é afetado (fica no Gene Bank
 *    pra sempre) — só a ENTRADA da incubadora (a descrição/link) some. "Há
 *    mais de N dias" usa `specimens.createdAt` do espécime já nascido
 *    (`bornSpecimenId`) como o instante do nascimento — é o MESMO instante
 *    gravado por `specimens.save()` dentro de `IncubatorService.born()`,
 *    então nenhuma coluna nova precisou ser criada em `incubator_entries`
 *    (item 5 do pedido: nenhuma mudança de schema).
 *
 * 2. `enforceNonGestatedCap` — só roda ao GRAVAR um cruzamento novo (nunca
 *    no GET, item 2 do pedido). Se o dono passar de `NON_GESTATED_CAP`
 *    entradas NÃO GESTADAS (`gestationStartedAt === null` — por construção
 *    nunca nascida também), apaga as mais ANTIGAS até caber. Nunca apaga
 *    entrada em gestação nem nascida — o filtro "não gestada" já as exclui
 *    por definição, não precisa de exceção explícita.
 */
import type { IncubatorRepository } from "./in-memory.repository";
import type { SpecimenRepository } from "../specimens/in-memory.repository";

export const BORN_RETENTION_DAYS = 7;
export const NON_GESTATED_CAP = 200;

/** Apaga entradas NASCIDAS há mais de `BORN_RETENTION_DAYS` dias (pelo `createdAt` do espécime) — devolve quantas. */
export async function pruneExpiredBorn(
  repo: IncubatorRepository,
  specimens: SpecimenRepository,
  ownerId: string,
  now: Date,
): Promise<number> {
  const born = await repo.listBornSpecimenIds(ownerId);
  if (born.length === 0) return 0;
  const cutoffMs = now.getTime() - BORN_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const createdAtById = await specimens.getCreatedAtBatch(born.map((b) => b.bornSpecimenId));
  const expiredIds = born
    .filter((b) => {
      const createdAt = createdAtById.get(b.bornSpecimenId);
      // Sem `createdAt` resolvível (espécime não encontrado — não deveria
      // acontecer, mas nunca apaga por suposição) → mantém a entrada.
      return createdAt !== undefined && createdAt.getTime() < cutoffMs;
    })
    .map((b) => b.id);
  if (expiredIds.length === 0) return 0;
  return repo.deleteMany(expiredIds);
}

/** Ao gravar um cruzamento novo: se o dono passar do teto de não-gestadas, apaga as mais antigas até caber — devolve quantas. */
export async function enforceNonGestatedCap(
  repo: IncubatorRepository,
  ownerId: string,
  cap: number = NON_GESTATED_CAP,
): Promise<number> {
  const overflowIds = await repo.listOldestNonGestatedBeyondCap(ownerId, cap);
  if (overflowIds.length === 0) return 0;
  return repo.deleteMany(overflowIds);
}
