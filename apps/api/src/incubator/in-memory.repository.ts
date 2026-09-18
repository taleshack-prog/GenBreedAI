/**
 * Porta de persistência da incubadora (ADR-0020, campos de gestação ADR-
 * 0021, paginação ADR-0021 item 2 desta rodada) — mesmo padrão de
 * `specimens/in-memory.repository.ts` (porta assíncrona + adapter in-memory
 * para dev/testes sem DB; `drizzle.repository.ts` implementa a MESMA porta
 * pra Postgres, ver ADR-0006).
 */
import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Genotype, Phenotype, BreedingMethod, Sex, FertilityResult } from "@genbreedai/shared";

export type PackId = "feline" | "canine";

export interface StoredIncubatorEntry {
  id: string;
  ownerId: string;
  crossId: string;
  sireId: string;
  damId: string;
  method: BreedingMethod;
  pack: PackId;
  species: string;
  genotype: Genotype;
  phenotype: Phenotype;
  prob: number;
  fPedigree: number;
  fixationIndex: number;
  aura: number;
  generation: number;
  sex: Sex;
  fertility: number | null;
  haldaneStatus: FertilityResult["haldaneStatus"] | null;
  /** Gestação (ADR-0021) — ambas `null` = "na incubadora". Ver `claimGestation`. */
  gestationStartedAt: Date | null;
  gestationEndsAt: Date | null;
  bornSpecimenId: string | null;
  /**
   * ADR-0021 item 5: órfão — sem escritor desde que `POST /:id/freeze` saiu
   * (não existe mais "congelar" no modelo de gestação). Mantido só porque o
   * item 5 não o listou como candidato a remoção (ao contrário de
   * `imageCacheKey`/`revealedAt`); ver nota equivalente em `db/schema.ts`.
   */
  frozen: boolean;
  createdAt: Date;
}

/**
 * Estado de uma entrada (ADR-0021 item 6, "PRONTO" adicionado nesta rodada,
 * item 2: a contagem por estado pedida inclui "pronto" como bucket próprio,
 * então passou a ser um estado de verdade — calculado, nunca gravado —
 * junto de GESTANDO, não mais um recorte só do lado do cliente).
 */
export type IncubatorState = "NA_INCUBADORA" | "GESTANDO" | "PRONTO" | "NASCIDO";

/** Único lugar que decide o estado de uma entrada — usado pelo adapter in-memory E pelo service (`toView`), nunca duplicado. */
export function incubatorStateOf(e: Pick<StoredIncubatorEntry, "bornSpecimenId" | "gestationStartedAt" | "gestationEndsAt">, now: Date): IncubatorState {
  if (e.bornSpecimenId !== null) return "NASCIDO";
  if (e.gestationStartedAt !== null) {
    return e.gestationEndsAt !== null && e.gestationEndsAt.getTime() <= now.getTime() ? "PRONTO" : "GESTANDO";
  }
  return "NA_INCUBADORA";
}

export interface IncubatorListOptions {
  /** Já validado/clampado pelo service (1-60) antes de chegar aqui. */
  limit: number;
  /** id da última entrada da página anterior — próxima página começa DEPOIS dela (ADR-0021 item 2). */
  cursor?: string;
  state?: IncubatorState;
  /** "Agora" pro cálculo de PRONTO — vem do `Clock` do service, nunca `new Date()` aqui. */
  now: Date;
}
export interface IncubatorListResult {
  entries: StoredIncubatorEntry[];
  /** `null` = não há próxima página. */
  nextCursor: string | null;
}
export type IncubatorStateCounts = Record<IncubatorState, number>;

export abstract class IncubatorRepository {
  abstract create(entry: Omit<StoredIncubatorEntry, "id" | "createdAt" | "gestationStartedAt" | "gestationEndsAt" | "bornSpecimenId" | "frozen">): Promise<StoredIncubatorEntry>;
  abstract get(id: string): Promise<StoredIncubatorEntry | undefined>;
  /** Paginado (ADR-0021 item 2) — ordenado por `createdAt` desc, `id` desc como desempate estável. */
  abstract listByOwner(ownerId: string, opts: IncubatorListOptions): Promise<IncubatorListResult>;
  /** Contagem COMPLETA por estado (ADR-0021 item 2) — independe de `limit`/`cursor`, nunca só da página atual. */
  abstract countByState(ownerId: string, now: Date): Promise<IncubatorStateCounts>;
  /**
   * Reivindica a vaga de gestação — atômico: só grava `gestationStartedAt`/
   * `gestationEndsAt` se a entrada ainda não estiver gestando nem nascida
   * (`gestationStartedAt === null && bornSpecimenId === null`); devolve
   * `null` se já estava (chamador responde 400, ADR-0021 item 3).
   */
  abstract claimGestation(id: string, startedAt: Date, endsAt: Date): Promise<StoredIncubatorEntry | null>;
  /** Órfão (ver nota em `frozen` acima) — mantido só pra não quebrar quem ainda o chame; nenhuma rota chama mais isto. */
  abstract markFrozen(id: string): Promise<StoredIncubatorEntry | null>;
  /** Marca `bornSpecimenId` — só quem já checou o prazo de gestação chama isto (gate no service). */
  abstract markBorn(id: string, specimenId: string): Promise<StoredIncubatorEntry | null>;
  abstract delete(id: string): Promise<void>;
  /**
   * Ciclo de vida (limpeza preguiçosa, `incubator-lifecycle.ts`) — pares
   * (id da entrada, id do espécime) de toda entrada NASCIDA do dono, pra
   * checar expiração pelo `createdAt` do espécime (nenhuma coluna de data de
   * nascimento própria — ver nota em `StoredSpecimen.createdAt`).
   */
  abstract listBornSpecimenIds(ownerId: string): Promise<Array<{ id: string; bornSpecimenId: string }>>;
  /**
   * Ids das entradas NÃO GESTADAS (`gestationStartedAt === null` — por
   * construção nunca nascida também) do dono ALÉM das `cap` mais recentes
   * (`createdAt` desc) — exatamente as que o teto de 200 (item 2 do pedido)
   * manda apagar. Nunca inclui entrada em gestação nem nascida.
   */
  abstract listOldestNonGestatedBeyondCap(ownerId: string, cap: number): Promise<string[]>;
  /** Apaga várias de uma vez (ciclo de vida) — devolve quantas de fato existiam e foram apagadas. */
  abstract deleteMany(ids: string[]): Promise<number>;
}

const EMPTY_COUNTS = (): IncubatorStateCounts => ({ NA_INCUBADORA: 0, GESTANDO: 0, PRONTO: 0, NASCIDO: 0 });

@Injectable()
export class InMemoryIncubatorRepository extends IncubatorRepository {
  private readonly store = new Map<string, StoredIncubatorEntry>();

  async create(entry: Omit<StoredIncubatorEntry, "id" | "createdAt" | "gestationStartedAt" | "gestationEndsAt" | "bornSpecimenId" | "frozen">): Promise<StoredIncubatorEntry> {
    const id = `incu_${randomUUID()}`;
    const full: StoredIncubatorEntry = {
      ...entry, id, gestationStartedAt: null, gestationEndsAt: null, bornSpecimenId: null, frozen: false, createdAt: new Date(),
    };
    this.store.set(id, full);
    return full;
  }

  async get(id: string): Promise<StoredIncubatorEntry | undefined> { return this.store.get(id); }

  /**
   * Ordena por `createdAt` desc — `Array.sort` é estável (ES2019+), então
   * empates de `createdAt` (comum em teste, `new Date()` no mesmo ms) caem
   * de volta na ordem de inserção do Map; ainda assim, desempata
   * explicitamente por `id` desc, pra bater byte-a-byte com o `ORDER BY
   * created_at DESC, id DESC` do adapter Drizzle (mesma ordem nos dois).
   */
  async listByOwner(ownerId: string, opts: IncubatorListOptions): Promise<IncubatorListResult> {
    let all = [...this.store.values()].filter((e) => e.ownerId === ownerId);
    if (opts.state) all = all.filter((e) => incubatorStateOf(e, opts.now) === opts.state);
    all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));

    let startIdx = 0;
    if (opts.cursor) {
      const idx = all.findIndex((e) => e.id === opts.cursor);
      // Cursor não encontrado (entrada descartada entre páginas) — melhor
      // devolver página vazia do que reiniciar do topo (evitaria repetir
      // entradas já vistas).
      startIdx = idx === -1 ? all.length : idx + 1;
    }
    const entries = all.slice(startIdx, startIdx + opts.limit);
    const hasMore = startIdx + opts.limit < all.length;
    return { entries, nextCursor: hasMore ? (entries[entries.length - 1]?.id ?? null) : null };
  }

  async countByState(ownerId: string, now: Date): Promise<IncubatorStateCounts> {
    const counts = EMPTY_COUNTS();
    for (const e of this.store.values()) {
      if (e.ownerId !== ownerId) continue;
      counts[incubatorStateOf(e, now)]++;
    }
    return counts;
  }

  /** Sem `await` entre ler e escrever — atômico por construção (JS single-thread). */
  async claimGestation(id: string, startedAt: Date, endsAt: Date): Promise<StoredIncubatorEntry | null> {
    const e = this.store.get(id);
    if (!e || e.gestationStartedAt !== null || e.bornSpecimenId !== null) return null;
    const updated: StoredIncubatorEntry = { ...e, gestationStartedAt: startedAt, gestationEndsAt: endsAt };
    this.store.set(id, updated);
    return updated;
  }

  async markFrozen(id: string): Promise<StoredIncubatorEntry | null> {
    const e = this.store.get(id);
    if (!e) return null;
    const updated = { ...e, frozen: true };
    this.store.set(id, updated);
    return updated;
  }

  async markBorn(id: string, specimenId: string): Promise<StoredIncubatorEntry | null> {
    const e = this.store.get(id);
    if (!e) return null;
    const updated = { ...e, bornSpecimenId: specimenId };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> { this.store.delete(id); }

  async listBornSpecimenIds(ownerId: string): Promise<Array<{ id: string; bornSpecimenId: string }>> {
    const out: Array<{ id: string; bornSpecimenId: string }> = [];
    for (const e of this.store.values()) {
      if (e.ownerId === ownerId && e.bornSpecimenId !== null) out.push({ id: e.id, bornSpecimenId: e.bornSpecimenId });
    }
    return out;
  }

  /** Mesma ordem desc (`createdAt`, id como desempate) de `listByOwner` — as `cap` primeiras são "mantidas", o resto é overflow. */
  async listOldestNonGestatedBeyondCap(ownerId: string, cap: number): Promise<string[]> {
    const nonGestated = [...this.store.values()]
      .filter((e) => e.ownerId === ownerId && e.gestationStartedAt === null && e.bornSpecimenId === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
    return nonGestated.slice(cap).map((e) => e.id);
  }

  async deleteMany(ids: string[]): Promise<number> {
    let n = 0;
    for (const id of ids) if (this.store.delete(id)) n++;
    return n;
  }
}
