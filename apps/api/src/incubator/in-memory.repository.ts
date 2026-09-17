/**
 * Porta de persistência da incubadora (ADR-0020) — mesmo padrão de
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
  imageCacheKey: string | null;
  revealedAt: Date | null;
  bornSpecimenId: string | null;
  frozen: boolean;
  createdAt: Date;
}

export abstract class IncubatorRepository {
  abstract create(entry: Omit<StoredIncubatorEntry, "id" | "createdAt" | "imageCacheKey" | "revealedAt" | "bornSpecimenId" | "frozen">): Promise<StoredIncubatorEntry>;
  abstract get(id: string): Promise<StoredIncubatorEntry | undefined>;
  abstract listByOwner(ownerId: string): Promise<StoredIncubatorEntry[]>;
  /**
   * Reivindica a revelação — atômico: só marca `revealedAt`/`imageCacheKey`
   * se `revealedAt` ainda for `null` (nunca cobra duas vezes por corrida
   * concorrente); devolve `null` se já estava revelada (chamador então só
   * lê o que já existe e devolve sem cobrar, ADR-0020 item 4).
   */
  abstract claimReveal(id: string, imageCacheKey: string): Promise<StoredIncubatorEntry | null>;
  /** Marca `frozen = true` — só quem já checou "revelada e não nascida" chama isto (gate no service). */
  abstract markFrozen(id: string): Promise<StoredIncubatorEntry | null>;
  /** Marca `bornSpecimenId` — só quem já checou "revelada e não nascida" chama isto (gate no service). */
  abstract markBorn(id: string, specimenId: string): Promise<StoredIncubatorEntry | null>;
  abstract delete(id: string): Promise<void>;
}

@Injectable()
export class InMemoryIncubatorRepository extends IncubatorRepository {
  private readonly store = new Map<string, StoredIncubatorEntry>();

  async create(entry: Omit<StoredIncubatorEntry, "id" | "createdAt" | "imageCacheKey" | "revealedAt" | "bornSpecimenId" | "frozen">): Promise<StoredIncubatorEntry> {
    const id = `incu_${randomUUID()}`;
    const full: StoredIncubatorEntry = {
      ...entry, id, imageCacheKey: null, revealedAt: null, bornSpecimenId: null, frozen: false, createdAt: new Date(),
    };
    this.store.set(id, full);
    return full;
  }

  async get(id: string): Promise<StoredIncubatorEntry | undefined> { return this.store.get(id); }

  async listByOwner(ownerId: string): Promise<StoredIncubatorEntry[]> {
    return [...this.store.values()].filter((e) => e.ownerId === ownerId);
  }

  /** Sem `await` entre ler e escrever — atômico por construção (JS single-thread). */
  async claimReveal(id: string, imageCacheKey: string): Promise<StoredIncubatorEntry | null> {
    const e = this.store.get(id);
    if (!e || e.revealedAt !== null) return null;
    const updated: StoredIncubatorEntry = { ...e, revealedAt: new Date(), imageCacheKey };
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
}
