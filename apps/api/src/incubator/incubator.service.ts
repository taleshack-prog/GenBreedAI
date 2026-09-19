/**
 * Incubadora (ADR-0020, modelo de gestação ADR-0021): descrições de
 * fenótipo vivem aqui de graça, sem prazo, até o jogador GESTAR (consome a
 * vaga de `birthQuota` — é aqui que o único custo real, a imagem de IA, é
 * comprometido) e, depois do prazo pela aura, fazer NASCER (gera a imagem,
 * cria o espécime, grátis — a vaga já foi paga na gestação). Descartar
 * (DELETE) apaga a entrada — o "perder" é decisão/aviso da WEB, a API só
 * executa.
 *
 * "Agora" (início/fim da gestação, checagem do prazo) vem de `Clock`
 * (injetado, `../common/clock.ts`), nunca de `new Date()`/`Date.now()`
 * direto — testes e2e (via `app.inject()`) avançam `SystemClock.
 * setForTesting()` em vez de `vi.useFakeTimers()` global, que trava a
 * resposta simulada do Fastify indefinidamente (bugfix: era a causa dos
 * timeouts de 5s em `incubator.e2e.spec.ts`).
 */
import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import type { Tier } from "@genbreedai/shared";
import {
  IncubatorRepository, incubatorStateOf, type StoredIncubatorEntry,
  type IncubatorState, type IncubatorStateCounts,
} from "./in-memory.repository";
import { SpecimenRepository, type StoredSpecimen } from "../specimens/in-memory.repository";
import { ImageService, cacheKeyOf } from "../images/image.service";
import { stat, publicUrl } from "../images/storage";
import { QuotaService } from "../quota/quota.service";
import { WalletService } from "../economy/wallet.service";
import { tierPolicy } from "../common/tiers";
import { Clock } from "../common/clock";
import { UserRepository } from "../auth/user.repository";
import { gestationEndFor, gestationHoursForAura, firstGestationEndFor } from "./gestation-time";
import { pruneExpiredBorn, BORN_RETENTION_DAYS } from "./incubator-lifecycle";

export interface IncubatorEntryView {
  id: string; crossId: string; sireId: string; damId: string; method: string;
  pack: string; species: string; genotype: StoredIncubatorEntry["genotype"]; phenotype: StoredIncubatorEntry["phenotype"];
  prob: number; fPedigree: number; fixationIndex: number; aura: number; generation: number;
  sex: string; fertility: number | null; haldaneStatus: string | null;
  imageUrl: string | null;
  /**
   * ADR-0021 item 6 — "PRONTO" (prazo de gestação já vencido, mas ainda não
   * nasceu) virou estado de verdade nesta rodada (item 2: a contagem por
   * estado pedida tem "pronto" como bucket próprio) — antes era um recorte
   * só do lado do cliente (`GESTANDO` + comparar `gestationEndsAt` com
   * `Date.now()` na hora de renderizar); agora o server já resolve, com o
   * mesmo `Clock` usado em `gestate()`/`born()`.
   */
  state: IncubatorState;
  gestationEndsAt: string | null;
  /** Tempo previsto pela TABELA de aura (item 6) — sempre presente, independe do estado. A 1ª gestação da conta é a exceção de 5 min (`firstGestation`, ADR-0025). */
  gestationHours: number;
  /**
   * ADR-0025 — `true` quando a gestação desta entrada foi a PRIMEIRA da conta
   * (cortesia de 5 min). Só faz sentido depois de gestar; `false` antes e nas
   * demais. Deduzido comparando o id da entrada com `users.first_gestation_entry_id`
   * (gravado no claim de `gestate()`), sem coluna na entrada.
   */
  firstGestation: boolean;
  bornSpecimenId: string | null;
  createdAt: string;
  /**
   * Ciclo de vida (ADR-0023) — só entradas NASCIDAS têm valor (`null` pra
   * qualquer outro estado, ou se o `createdAt` do espécime não puder ser
   * resolvido). Quando a entrada some da incubadora (7 dias corridos desde
   * o nascimento, ver `incubator-lifecycle.ts`) — o ESPÉCIME em si nunca é
   * afetado, continua no Gene Bank pra sempre.
   */
  expiresAt: string | null;
}

export interface IncubatorListPage {
  entries: IncubatorEntryView[];
  /** `null` = não há próxima página (ADR-0021 item 2). */
  nextCursor: string | null;
  /** Contagem COMPLETA por estado — sempre as 4, independe de `limit`/`cursor`/`state` do pedido. */
  counts: IncubatorStateCounts;
}

const DEFAULT_PAGE_LIMIT = 24;
const MAX_PAGE_LIMIT = 60;

@Injectable()
export class IncubatorService {
  constructor(
    private readonly repo: IncubatorRepository,
    private readonly specimens: SpecimenRepository,
    private readonly images: ImageService,
    private readonly quota: QuotaService,
    private readonly wallet: WalletService,
    private readonly clock: Clock,
    private readonly users: UserRepository,
  ) {}

  /** `StoredIncubatorEntry` → objeto no formato `StoredSpecimen` que o pipeline de imagem (buildPrompt/generateForSpecimen) já entende. */
  private asFakeSpecimen(e: StoredIncubatorEntry): StoredSpecimen {
    return {
      id: e.id, ownerId: e.ownerId, pack: e.pack, species: e.species,
      genotype: e.genotype, phenotype: e.phenotype, generation: e.generation,
      sireId: e.sireId, damId: e.damId, method: e.method,
      fPedigree: e.fPedigree, fixationIndex: e.fixationIndex, aura: e.aura, cacheKey: null,
      sex: e.sex, fertility: e.fertility, haldaneStatus: e.haldaneStatus,
    };
  }

  private async getOwned(id: string, ownerId: string): Promise<StoredIncubatorEntry> {
    const e = await this.repo.get(id);
    if (!e || e.ownerId !== ownerId) throw new NotFoundException(`Descrição ${id} não encontrada.`);
    return e;
  }

  /** `bornAt` = `createdAt` do espécime já nascido (só quando resolvível) — usado pra `expiresAt` (ciclo de vida, ADR-0023). */
  private toView(
    e: StoredIncubatorEntry, imageUrl: string | null, now: Date, bornAt: Date | null = null,
    firstGestationEntryId: string | null = null,
  ): IncubatorEntryView {
    const state = incubatorStateOf(e, now);
    // Por ID da entrada (gravado no claim), nunca por instante: dois pedidos no
    // mesmo milissegundo teriam o mesmo `gestationStartedAt` e ambos "ganhariam".
    const firstGestation = firstGestationEntryId !== null && e.id === firstGestationEntryId;
    const expiresAt = bornAt ? new Date(bornAt.getTime() + BORN_RETENTION_DAYS * 24 * 60 * 60 * 1000) : null;
    return {
      id: e.id, crossId: e.crossId, sireId: e.sireId, damId: e.damId, method: e.method,
      pack: e.pack, species: e.species, genotype: e.genotype, phenotype: e.phenotype,
      prob: e.prob, fPedigree: e.fPedigree, fixationIndex: e.fixationIndex, aura: e.aura, generation: e.generation,
      sex: e.sex, fertility: e.fertility, haldaneStatus: e.haldaneStatus,
      imageUrl, state, gestationEndsAt: e.gestationEndsAt ? e.gestationEndsAt.toISOString() : null,
      gestationHours: gestationHoursForAura(e.aura), firstGestation,
      bornSpecimenId: e.bornSpecimenId, createdAt: e.createdAt.toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    };
  }

  /**
   * GET /api/v1/incubator — tudo que a web precisa: descrição completa +
   * estado, PAGINADO (ADR-0021 item 2, rodada de paginação). `limit`
   * clampado em [1, 60] (padrão 24); `cursor` = id da última entrada da
   * página anterior; `state` filtra no SERVIDOR (nunca mais no cliente). A
   * contagem por estado (`counts`) é sempre COMPLETA — nunca só da página
   * atual, senão a UI não saberia quantas entradas existem em cada estado
   * além do que já carregou.
   *
   * Só entradas NASCIDAS têm imagem (não existe imagem antes do nascimento
   * neste modelo, ADR-0021) — derivada do espécime já nascido
   * (`bornSpecimenId`), nunca de uma `imageCacheKey` própria da entrada (essa
   * coluna saiu do schema, ver ADR-0021 item 5).
   */
  async list(ownerId: string, opts: { limit?: number; cursor?: string; state?: IncubatorState } = {}): Promise<IncubatorListPage> {
    const limit = Math.min(Math.max(Math.floor(opts.limit ?? DEFAULT_PAGE_LIMIT), 1), MAX_PAGE_LIMIT);
    const now = this.clock.now();
    // Limpeza preguiçosa (ADR-0023, item 1 do pedido — sem processo agendado
    // na API): apaga as entradas NASCIDAS há mais de 7 dias deste dono ANTES
    // de listar/contar, senão elas ainda apareceriam nesta mesma resposta.
    await pruneExpiredBorn(this.repo, this.specimens, ownerId, now);
    const [page, counts] = await Promise.all([
      this.repo.listByOwner(ownerId, { limit, cursor: opts.cursor, state: opts.state, now }),
      this.repo.countByState(ownerId, now),
    ]);
    const firstGestationEntryId = (await this.users.getFirstGestation(ownerId))?.entryId ?? null;
    const entries: IncubatorEntryView[] = [];
    for (const e of page.entries) {
      let imageUrl: string | null = null;
      let bornAt: Date | null = null;
      if (e.bornSpecimenId) {
        const specimen = await this.specimens.get(e.bornSpecimenId);
        if (specimen) {
          bornAt = specimen.createdAt ?? null;
          const cacheKey = specimen.cacheKey ?? cacheKeyOf(specimen);
          const st = await stat(cacheKey);
          if (st) imageUrl = publicUrl(cacheKey, st.version);
        }
      }
      entries.push(this.toView(e, imageUrl, now, bornAt, firstGestationEntryId));
    }
    return { entries, nextCursor: page.nextCursor, counts };
  }

  /**
   * POST /incubator/:id/gestate (ADR-0021, item 3). É AQUI que a vaga de
   * `birthQuota` é consumida (reserva atômica, mesmo padrão do antigo
   * `reveal()`, ADR-0020: sem vaga usa 1 crédito — 1 crédito = 1 nascimento
   * extra; sem nenhum dos dois, 429 com `nextAvailableAt`). Nenhuma imagem é
   * gerada aqui — só marca
   * `gestationStartedAt`/`gestationEndsAt` (prazo pela aura, `gestation-
   * time.ts`; a PRIMEIRA gestação da conta dura 5 min, qualquer aura —
   * ADR-0025). Entrada já em gestação ou já nascida → 400.
   */
  async gestate(id: string, ownerId: string, tier: Tier): Promise<IncubatorEntryView> {
    const entry = await this.getOwned(id, ownerId);
    if (entry.bornSpecimenId !== null) throw new BadRequestException("Esta descrição já nasceu.");
    if (entry.gestationStartedAt !== null) throw new BadRequestException("Esta descrição já está gestando.");

    const policy = tierPolicy(tier).birthQuota;
    const reservationId = await this.quota.reserve("birth", ownerId, policy);
    let usedCredit = false;
    if (!reservationId) {
      usedCredit = await this.wallet.consumeImageCredit(ownerId);
      if (!usedCredit) {
        const nextAt = await this.quota.nextAvailableAt("birth", ownerId, policy);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: "Sem vaga de gestação nem créditos. Indique amigos, colete o bônus quinzenal, ou compre créditos.",
            error: "Too Many Requests",
            nextAvailableAt: nextAt ? nextAt.toISOString() : null,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const refund = async () => {
      if (reservationId) await this.quota.release("birth", reservationId);
      else if (usedCredit) await this.wallet.creditImageCredits(ownerId, 1);
    };

    // ADR-0025: a marca da 1ª gestação só é reivindicada DEPOIS de a vaga/crédito
    // estar garantida (429 nunca queima a cortesia) e é desfeita se a gestação
    // não chegar a acontecer (erro ou corrida na mesma entrada).
    const startedAt = this.clock.now();
    let firstGestation = false;
    const releaseFirst = async () => { if (firstGestation) await this.users.releaseFirstGestation(ownerId, id).catch(() => {}); };

    let claimed: StoredIncubatorEntry | null;
    try {
      firstGestation = await this.users.claimFirstGestation(ownerId, startedAt, id);
      const endsAt = firstGestation ? firstGestationEndFor(startedAt) : gestationEndFor(entry.aura, startedAt);
      claimed = await this.repo.claimGestation(id, startedAt, endsAt);
    } catch (e) {
      await releaseFirst();
      await refund();
      throw e;
    }
    if (!claimed) {
      // Corrida: outro pedido reivindicou a gestação desta MESMA entrada
      // entre o getOwned() e agora — estorna o que acabou de cobrar (nunca
      // cobra 2x pela mesma vaga) e responde 400 (item 3).
      await releaseFirst();
      await refund();
      throw new BadRequestException("Esta descrição já está gestando.");
    }
    if (reservationId) await this.quota.confirm("birth", reservationId);
    return this.toView(claimed, null, this.clock.now(), null, firstGestation ? id : null);
  }

  /**
   * POST /incubator/:id/born (ADR-0021, item 4) — só depois do prazo de
   * gestação (`gestationEndsAt` já passado); antes disso, 400 com o tempo
   * restante. Gera a imagem AGORA (sem consumir vaga nem crédito — já foram
   * pagos na gestação), cria o espécime com os campos já gravados na entrada
   * (genótipo, fenótipo, sexo, fertilidade, F, IF, aura), SEM recalcular
   * nada, e marca `bornSpecimenId`.
   */
  async born(id: string, ownerId: string, tier: Tier): Promise<{ specimen: StoredSpecimen }> {
    const entry = await this.getOwned(id, ownerId);
    if (entry.bornSpecimenId !== null) throw new BadRequestException("Esta descrição já nasceu.");
    if (entry.gestationStartedAt === null || entry.gestationEndsAt === null) {
      throw new BadRequestException("Inicie a gestação antes de fazer nascer.");
    }
    const now = this.clock.now().getTime();
    const endsAtMs = entry.gestationEndsAt.getTime();
    if (endsAtMs > now) {
      const remainingMin = Math.ceil((endsAtMs - now) / 60000);
      throw new BadRequestException(`Gestação ainda não terminou. Faltam ${remainingMin} minuto(s).`);
    }

    // LIMITAÇÃO CONHECIDA (não resolvida aqui, reportada no resumo): duas
    // chamadas a born() na MESMA entrada, exatamente após o prazo, podem
    // ambas passar do check `bornSpecimenId === null` acima antes de
    // qualquer uma marcar — image.service já não duplica CUSTO (cache por
    // cacheKey), mas `specimens.save()` pode criar 2 espécimes. Sem proteção
    // atômica dedicada (tipo `claimGestation`) porque não é o mesmo tipo de
    // simultaneidade pedido no item 9 ("gestações simultâneas: sem teto" é
    // sobre entradas DIFERENTES gestando ao mesmo tempo, não uma corrida na
    // MESMA entrada) e o `born()` antigo (ADR-0020) nunca teve essa proteção.
    //
    // Nenhum custo aqui — skipQuota=true sempre: a vaga já foi paga em
    // GESTAR (ADR-0021 item 3); `generateForSpecimen` não cobra de novo.
    const fake = this.asFakeSpecimen(entry);
    const result = await this.images.generateForSpecimen(fake, ownerId, tier, true);
    const stored = await this.specimens.save({
      id: "", ownerId, pack: entry.pack, species: entry.species,
      genotype: entry.genotype, phenotype: entry.phenotype, generation: entry.generation,
      sireId: entry.sireId, damId: entry.damId, method: entry.method,
      fPedigree: entry.fPedigree, fixationIndex: entry.fixationIndex, aura: entry.aura,
      cacheKey: result.cacheKey, status: "ALIVE",
      sex: entry.sex, fertility: entry.fertility, haldaneStatus: entry.haldaneStatus,
      // O retrato já foi gerado (e pago, via a vaga de gestação) agora mesmo
      // — nenhum "vale" de retrato incluído (ADR-0019) faz sentido de novo.
      includedPortrait: false,
      // ADR-0023: instante do NASCIMENTO — usado pelo ciclo de vida da
      // incubadora (`incubator-lifecycle.ts`) pra decidir quando a ENTRADA
      // expira (7 dias corridos). Via `Clock` (nunca `new Date()` direto),
      // senão testes não conseguiriam simular o prazo sem esperar de verdade
      // (adapter Drizzle ignora isto — usa `defaultNow()` do Postgres, que
      // já é o instante real do INSERT).
      createdAt: this.clock.now(),
    });
    await this.repo.markBorn(id, stored.id);
    // Mesma recompensa por fixação que `CrossService.execute()` já dava
    // (aura alta rende catalisadores/biomassa) — só que agora no NASCIMENTO,
    // que é quando o espécime de fato passa a existir.
    await this.wallet.rewardForCross(ownerId, entry.aura).catch(() => {});
    return { specimen: stored };
  }

  /** DELETE /api/v1/incubator/:id — descarta a entrada. Só a web avisa antes; a API só executa. */
  async discard(id: string, ownerId: string): Promise<void> {
    await this.getOwned(id, ownerId);
    await this.repo.delete(id);
  }
}
