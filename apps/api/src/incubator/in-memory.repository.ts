/**
 * Porta de persistência da incubadora (ADR-0020, campos de gestação ADR-
 * 0021) — mesmo padrão de `specimens/in-memory.repository.ts` (porta
 * assíncrona + adapter in-memory para dev/testes sem DB; `drizzle.
 * repository.ts` implementa a MESMA porta pra Postgres, ver ADR-0006).
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

export abstract class IncubatorRepository {
  abstract create(entry: Omit<StoredIncubatorEntry, "id" | "createdAt" | "gestationStartedAt" | "gestationEndsAt" | "bornSpecimenId" | "frozen">): Promise<StoredIncubatorEntry>;
  abstract get(id: string): Promise<StoredIncubatorEntry | undefined>;
  abstract listByOwner(ownerId: string): Promise<StoredIncubatorEntry[]>;
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
}

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

  async listByOwner(ownerId: string): Promise<StoredIncubatorEntry[]> {
    return [...this.store.values()].filter((e) => e.ownerId === ownerId);
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
}
