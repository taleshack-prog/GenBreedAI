/**
 * Serviço de cruzamento (TDD §4.4). ANTI-P2W: probabilidades idênticas em todos
 * os tiers. Seleção fenotípica: Free/Junior = sorteio; Senior escolhe top-6; PhD
 * escolhe top-12. Escolher NÃO muda probabilidade — só materializa a opção.
 */
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  cross as crossEngine, enumerateOffspring, materializeCross,
  CANINE_PACK, FELINE_PACK, SexMismatchError, SterileParentError, type OffspringOption,
} from "@genbreedai/engine";
import { biologicalSpecies, normalizeBiologicalSpecies } from "@genbreedai/shared";
import type { BreedingMethod, Genotype, CrossResult, Tier } from "@genbreedai/shared";
import { SpecimenRepository, type StoredSpecimen } from "../specimens/in-memory.repository";
import { assertTierAllows, specimenVisibleAtTier } from "../common/tier-access";
import { classifyCross, type CrossClassification } from "@genbreedai/engine";
import { WalletService } from "../economy/wallet.service";
import { ImageService } from "../images/image.service";
import type { CrossDto } from "./dto/cross.dto";

/** Nome da linhagem (slugs crus). Biologia NUNCA por este valor — usar isInterspecific/biologicalComponents. */
/** Une espécies de híbrido sem repetir ancestrais. */
function combineSpecies(a: string, b: string) { if (a === b) return a; return [...new Set([...a.split("×"), ...b.split("×")])].join("×"); }

/**
 * Componentes biológicos de um `species` (possivelmente híbrido, unido por
 * "×" via `combineSpecies`) — cada componente já normalizado. Usado por
 * `isInterspecific` pra nunca comparar slug cru (achado crítico pós-commit
 * 7c89ca0: comparar `sire.species !== dam.species` cru marcava
 * incorretamente raças caninas entre si, e morfos de cor felinos como
 * tigre-de-bengala×tigre-branco, como interespecíficos).
 *
 * Canino: mantém o colapso INCONDICIONAL via `biologicalSpecies(pack, c)`
 * (sempre "canis-familiaris", MESMO pra raça fora de `SPECIES_INFO`) — NÃO
 * dá pra trocar por `normalizeBiologicalSpecies()` sozinho aqui, porque essa
 * função só normaliza pelo catálogo (`SPECIES_INFO`) e a maioria das raças
 * caninas só existe em `DOG_BREEDS`; usar só `normalizeBiologicalSpecies()`
 * deixaria duas raças caninas não-cadastradas (ex. "collie" × "dogo-
 * argentino") com strings DIFERENTES, marcando-as como interespecíficas.
 * Felino (e demais packs): usa `normalizeBiologicalSpecies()` — mesma tabela
 * de `biologicalSpecies()`, já cobrindo morfo + decomposição de híbrido "×".
 */
function biologicalComponents(pack: string, species: string): Set<string> {
  if (pack === "canine") return new Set(species.split("×").map((c) => biologicalSpecies(pack, c)));
  return new Set(normalizeBiologicalSpecies(species).split("×"));
}

/**
 * Cruzamento genuinamente interespecífico (ADR-0015/ADR-0016) — NUNCA por
 * slug cru:
 *   - se QUALQUER um dos dois parentais já é ele mesmo um híbrido de mais de
 *     uma espécie biológica (`biologicalComponents(...).size > 1`), o
 *     cruzamento conta como interespecífico, seja lá qual for o outro lado;
 *   - senão (os dois "puros", 1 componente cada), compara as
 *     `biologicalSpecies` dos dois.
 * Corrige: raça canina × raça canina (ambas "canis-familiaris") deixa de
 * marcar interespecífico; tigre-de-bengala × tigre-branco (mesma
 * biologicalSpecies "panthera-tigris") também deixa de marcar.
 */
export function isInterspecific(sire: StoredSpecimen, dam: StoredSpecimen): boolean {
  const sireComponents = biologicalComponents(sire.pack, sire.species);
  const damComponents = biologicalComponents(dam.pack, dam.species);
  if (sireComponents.size > 1 || damComponents.size > 1) return true;
  const [sireSpecies] = sireComponents;
  const [damSpecies] = damComponents;
  return sireSpecies !== damSpecies;
}

/**
 * `species` normalizado pronto pra virar `ParentInput.species` do motor
 * (ADR-0015) — reusa `biologicalComponents` (mesma fonte de verdade do gate
 * acima) e rejunta por "×", preservando o colapso incondicional canino e a
 * normalização por catálogo/morfo felina.
 */
function engineSpecies(pack: string, species: string): string {
  return [...biologicalComponents(pack, species)].sort().join("×");
}

const PACK_BY_FAMILY: Record<string, typeof CANINE_PACK> = { feline: FELINE_PACK, canine: CANINE_PACK };

/** Quantas opções o tier vê para escolher (analítico; não altera probabilidade). */
function optionCount(tier: Tier): number { return tier === "PHD" ? 12 : 6; }
/** A partir de Senior o jogador ESCOLHE o fenótipo. */
function canChoose(tier: Tier): boolean { return tier === "SENIOR" || tier === "PHD"; }

export interface CrossResponse { specimen: StoredSpecimen; cacheKey: string; engine: CrossResult["specimen"]; }
export interface OptionsResponse {
  canChoose: boolean; maxOptions: number;
  options: Array<{
    key: string; prob: number; fixationIndex: number; aura: number; variants: number;
    phenotype: OffspringOption["phenotype"]; genotype: Genotype;
    sexDimorphic: boolean; phenotypeBySex?: OffspringOption["phenotypeBySex"];
    /** ADR-0018: machos desta opção nascerão estéreis (aviso na prévia). */
    maleSterile: boolean;
  }>;
}

@Injectable()
export class CrossService {
  /**
   * `images` é OPCIONAL de propósito: muitos testes existentes instanciam
   * `new CrossService(repo, wallet)` (2 args) sem se importar com imagem —
   * exigir `ImageService` quebraria todos eles. Em produção o Nest injeta
   * sempre a instância real (CrossModule importa ImageModule); só quando
   * ausente (instanciação direta em teste) o retrato incluído do cruzamento
   * (ADR-0019) simplesmente não dispara — sem erro, sem afetar o cruzamento.
   */
  constructor(
    private readonly repo: SpecimenRepository,
    private readonly wallet: WalletService,
    private readonly images?: ImageService,
  ) {}

  private async resolve(dto: CrossDto, tier: Tier) {
    const sire = await this.repo.get(dto.sireId);
    const dam = await this.repo.get(dto.damId);
    if (!sire) throw new NotFoundException(`Sire "${dto.sireId}" não encontrado.`);
    if (!dam) throw new NotFoundException(`Dam "${dto.damId}" não encontrado.`);
    // Pool de espécie (ADR-0016) — ANTES de qualquer outra validação: um
    // espécime fora do pool do tier atual é tratado como se NÃO EXISTISSE
    // (404, mesma mensagem/formato de "não encontrado"), nunca 403 — sem
    // cadeado, sem revelar que existe. Cobre "não vê" (specimens.controller)
    // e "não cruza" (aqui).
    if (!specimenVisibleAtTier(tier, sire.pack, sire.species)) throw new NotFoundException(`Sire "${dto.sireId}" não encontrado.`);
    if (!specimenVisibleAtTier(tier, dam.pack, dam.species)) throw new NotFoundException(`Dam "${dto.damId}" não encontrado.`);
    if (sire.status === "FROZEN") throw new BadRequestException(`"${sire.id}" está congelado — descongele antes de cruzar.`);
    if (dam.status === "FROZEN") throw new BadRequestException(`"${dam.id}" está congelado — descongele antes de cruzar.`);
    if (sire.pack !== dam.pack) throw new BadRequestException(`Famílias distintas (${sire.pack} × ${dam.pack}).`);
    const pack = PACK_BY_FAMILY[sire.pack];
    if (!pack) throw new BadRequestException(`Família sem pack: ${sire.pack}.`);
    // Sexo é OBRIGATÓRIO pro motor (ParentInput.sex — ADR-0013/0015): espécime
    // legado sem migração de dados (sex=null) não pode ser sire nem dam. Nunca
    // inventa sexo. Checado ANTES de montar a/b — o motor nem chega a ser chamado.
    if (sire.sex === null || dam.sex === null) {
      throw new BadRequestException("Espécime sem sexo definido; aguarde a migração de dados.");
    }
    const interspecific = isInterspecific(sire, dam);
    const pedigree = await this.repo.buildPedigree([sire.id, dam.id]);
    const a = {
      id: sire.id, genotype: sire.genotype, generation: sire.generation,
      sex: sire.sex, species: engineSpecies(sire.pack, sire.species),
      fertility: sire.fertility ?? undefined,
    };
    const b = {
      id: dam.id, genotype: dam.genotype, generation: dam.generation,
      sex: dam.sex, species: engineSpecies(dam.pack, dam.species),
      fertility: dam.fertility ?? undefined,
      // Porte adulto da MÃE (ADR-0014) — só importa no papel de dam (parentB).
      adultPorte: dam.phenotype?.porteAdulto,
    };
    const ctx = { pack, pedigree, interspecific, targetLoci: dto.targetLoci, generationsUnderSelection: dto.generationsUnderSelection };
    return { sire, dam, a, b, ctx, interspecific };
  }

  /** Opções de prole para o tier (Senior/PhD podem escolher). */
  async options(tier: Tier, dto: CrossDto): Promise<OptionsResponse> {
    const { sire, dam, a, b, ctx, interspecific } = await this.resolve(dto, tier);
    assertTierAllows(tier, sire.pack, dam.pack, interspecific);
    const opts = enumerateOffspring(a, b, ctx, optionCount(tier));
    return {
      canChoose: canChoose(tier), maxOptions: optionCount(tier),
      options: opts.map((o) => ({
        key: o.key, prob: o.prob, fixationIndex: o.fixationIndex, aura: o.aura, variants: o.variants,
        phenotype: o.phenotype, genotype: o.genotype,
        sexDimorphic: o.sexDimorphic, phenotypeBySex: o.phenotypeBySex,
        maleSterile: o.maleSterile,
      })),
    };
  }

  /** Resolve a opção escolhida em um "espécime de preview" (não persistido). */
  async resolveChoice(tier: Tier, dto: CrossDto): Promise<{ pack: string; species: string; genotype: Genotype }> {
    const { sire, dam, a, b, ctx, interspecific } = await this.resolve(dto, tier);
    assertTierAllows(tier, sire.pack, dam.pack, interspecific);
    const opts = enumerateOffspring(a, b, ctx, optionCount(tier));
    const chosen = dto.choiceKey ? opts.find((o) => o.key === dto.choiceKey) : opts[0];
    if (!chosen) throw new BadRequestException("Opção de fenótipo inválida.");
    return { pack: sire.pack, species: combineSpecies(sire.species, dam.species), genotype: chosen.genotype };
  }

  /** Sugere o tipo de cruzamento (classificador determinístico) a partir dos pais. */
  async classify(dto: { sireId: string; damId: string }): Promise<CrossClassification> {
    const sire = await this.repo.get(dto.sireId);
    const dam = await this.repo.get(dto.damId);
    if (!sire) throw new NotFoundException(`Sire "${dto.sireId}" não encontrado.`);
    if (!dam) throw new NotFoundException(`Dam "${dto.damId}" não encontrado.`);
    const pedigree = await this.repo.buildPedigree([sire.id, dam.id]);
    return classifyCross({
      sireId: sire.id, damId: dam.id,
      sireSpecies: sire.species, damSpecies: dam.species,
      sireGeneration: sire.generation, damGeneration: dam.generation,
      sireFPedigree: sire.fPedigree, damFPedigree: dam.fPedigree,
      pedigree,
    });
  }

  /** Calcula o resultado do cruzamento (resolve+gate+motor) SEM persistir. */
  async computeResult(tier: Tier, dto: CrossDto): Promise<{ result: CrossResult; sire: StoredSpecimen; dam: StoredSpecimen; species: string; pack: string }> {
    const { sire, dam, a, b, ctx, interspecific } = await this.resolve(dto, tier);
    assertTierAllows(tier, sire.pack, dam.pack, interspecific);
    const seed = dto.seed ?? `${dto.method}:${[sire.id, dam.id].sort().join("x")}`;
    let result: CrossResult;
    try {
      if (dto.choiceKey && canChoose(tier)) {
        const opts = enumerateOffspring(a, b, ctx, optionCount(tier));
        const chosen = opts.find((o) => o.key === dto.choiceKey);
        if (!chosen) throw new BadRequestException("Opção de fenótipo inválida (não está entre as prováveis).");
        result = materializeCross(a, b, dto.method as BreedingMethod, seed, ctx, chosen.genotype);
      } else {
        result = crossEngine(a, b, dto.method as BreedingMethod, seed, ctx);
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      // Mensagens de erro pro CLIENTE nunca revelam detalhe interno/comando
      // de operação (perigoso em produção — vazava "rode db:reset"). Detalhe
      // completo só no log do servidor.
      if (e instanceof SexMismatchError) throw new BadRequestException("Cruzamento exige pai macho e mãe fêmea.");
      if (e instanceof SterileParentError) throw new BadRequestException("Espécime estéril não pode reproduzir.");
      // eslint-disable-next-line no-console
      console.error("[CrossService.computeResult] erro do motor:", e);
      throw new BadRequestException("Genótipo incompatível com o pack atual.");
    }
    return { result, sire, dam, species: combineSpecies(sire.species, dam.species), pack: sire.pack };
  }

  async execute(ownerId: string, tier: Tier, dto: CrossDto): Promise<CrossResponse> {
    const { result, sire, dam, species, pack } = await this.computeResult(tier, dto);
    const stored = await this.repo.save({
      id: "", ownerId, pack: pack as "feline" | "canine", species,
      genotype: result.specimen.genotype as Genotype, generation: result.specimen.generation,
      sireId: sire.id, damId: dam.id, method: dto.method,
      fPedigree: result.specimen.fPedigree, fixationIndex: result.specimen.fixationIndex,
      aura: result.specimen.aura, cacheKey: result.cacheKey, status: "ALIVE",
      sex: result.specimen.sex,
      fertility: result.specimen.fertility.score,
      haldaneStatus: result.specimen.fertility.haldaneStatus,
      phenotype: result.specimen.phenotype,
      includedPortrait: true, // ADR-0019: todo cruzamento já inclui 1 retrato de IA, sem cota/crédito.
    });
    await this.wallet.rewardForCross(ownerId, result.specimen.aura).catch(() => {}); // fonte: fixação
    // Retrato incluído (ADR-0019) — dispara em segundo plano, NUNCA atrasa
    // nem desfaz o cruzamento: falha aqui só vira log (o web faz polling em
    // /specimens/:id/image; sem imagem ainda, o usuário pode pedir de novo
    // pelo endpoint manual, que tenta o retrato incluído de novo enquanto
    // `includedPortrait` continuar true). `skipQuota=true` sempre — é de
    // graça, não é a cota/crédito do usuário.
    if (this.images) {
      void this.images.generateForSpecimen(stored, ownerId, tier, true)
        .then(async (r) => {
          // Só "gasta" o retrato incluído se saiu imagem de verdade — sem
          // FAL_KEY (modo procedural) não conta como o retrato ter sido
          // usado, fica disponível pra quando uma geração real acontecer.
          if (r.imageUrl) await this.repo.claimIncludedPortrait(stored.id);
        })
        .catch((e) => { console.error(`[cross] retrato incluído (espécime "${stored.id}") falhou:`, (e as Error).message); });
    }
    return { specimen: stored, cacheKey: result.cacheKey, engine: result.specimen };
  }
}
