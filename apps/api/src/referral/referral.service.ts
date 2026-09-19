/**
 * Motor de indicação (viralização — TDD ReferralLink, ADR-0024). Os marcos
 * são SEMPRE server-side — nunca por chamada do cliente (a antiga rota
 * pública POST /referral/event foi removida em 14/09 justamente porque
 * permitia crédito infinito variando o id do indicado):
 *
 *  - `linkReferred` — chamado por `AuthService` dentro do registro de um
 *    usuário NOVO que chegou com um código válido. SÓ grava o vínculo
 *    indicador → indicado (e conta o cadastro): NÃO paga nada — cadastro é
 *    barato/farmável (sem verificação de e-mail).
 *  - `recordConversion` — chamado por `BillingService` no webhook do Stripe
 *    quando a assinatura do indicado fica ativa. Recompensa ao INDICADOR
 *    conforme o plano assinado: JUNIOR +15 créditos · SENIOR +30 créditos ·
 *    PHD 1 mês grátis do plano do indicador (FREE ganha 1 mês de JUNIOR), via
 *    `granted_tiers` com expiração em 30 dias.
 *
 *  - `recordPackPurchase` — chamado por `BillingService` quando uma compra de
 *    PACOTE DE CRÉDITOS do indicado é confirmada (webhook do Stripe). Acumula
 *    POR INDICADO e POR TAMANHO de pacote: a cada 3 pacotes iguais comprados
 *    pelo MESMO indicado, o indicador ganha 2 (pacote de 10), 5 (de 30) ou 10
 *    (de 60) créditos; o resto (1 ou 2 pacotes) fica acumulado para o próximo
 *    trio, sem limite de vezes. Baldes independentes por tamanho; compras de
 *    indicados diferentes NUNCA se somam.
 *
 * Só recompensa quando o indicado GASTA (assinatura ou pacote de créditos):
 * indicado que fica no Free nunca gera crédito. Os marcos D1/D7 foram CANCELADOS
 * (ADR-0024, rev. 2) — as colunas `d1`/`d7` seguem no schema só até uma
 * migração futura de DROP, sem nenhum escritor nem leitor.
 *
 * Idempotência (claim ATÔMICO, nunca select-depois-update): um indicado tem
 * UMA linha em `referral_referred` (atribuição única, mesmo que apareça com
 * outro código) e cada marco é reivindicado uma só vez por indicado. Falha
 * ao creditar desfaz a reivindicação e propaga o erro (o webhook devolve 500
 * e o Stripe reenvia). Compra de pacote: idempotente POR PAGAMENTO (`payment_id`
 * é a PK de `referral_pack_purchases`) e cada trio é reivindicado com um UPDATE
 * condicional — reenvio do webhook nunca conta duas vezes nem paga duas vezes.
 */
import { Injectable } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Tier } from "@genbreedai/shared";
import { referralLinks, referralReferred, referralPackPurchases, referralPackTrios } from "../db/schema";
import { createDb } from "../db/client";
import { WalletService } from "../economy/wallet.service";
import { GrantedTiersRepository } from "../billing/granted-tiers.repository";
import { TierService } from "../billing/tier.service";
import { CREDIT_PACKS } from "../billing/credit-packs";
import type { PaidTier } from "../billing/subscription-plans";
import { Clock } from "../common/clock";

export const CONVERT_CREDITS: Readonly<Record<"JUNIOR" | "SENIOR", number>> = { JUNIOR: 15, SENIOR: 30 };
export const REFERRAL_GRANT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Quantos pacotes IGUAIS, do MESMO indicado, fecham um trio. */
export const PACK_TRIO_SIZE = 3;
/** Créditos ao INDICADOR por trio fechado, por tamanho de pacote (ids de `credit-packs.ts`). Sem limite de vezes. */
export const PACK_TRIO_REWARD: Readonly<Record<string, number>> = { "pack-10": 2, "pack-30": 5, "pack-60": 10 };
/** Teto de segurança de trios pagos numa única chamada (um webhook nunca fecha mais que 1, exceto recuperação de falha). */
const MAX_TRIOS_PER_CALL = 1000;

export interface PackPurchaseResult {
  /** Créditos dados ao indicador por esta chamada (0 se nenhum trio fechou, ou se o comprador não tem indicador). */
  credited: number;
  /** Trios pagos por esta chamada. */
  triosPaid: number;
}
const PACK_NONE: PackPurchaseResult = { credited: 0, triosPaid: 0 };

/** Progresso de UM tamanho de pacote, somando todos os indicados de um indicador (tela do Perfil). */
export interface PackTrioProgress {
  packId: string;
  /** Créditos do pacote (10 / 30 / 60). */
  credits: number;
  label: string;
  /** Créditos que o indicador ganha por trio fechado. */
  reward: number;
  /** Pacotes deste tamanho comprados por TODOS os indicados (soma). */
  purchased: number;
  /** Trios já pagos (soma). */
  triosPaid: number;
  /** 0..2 — o quanto o indicado mais adiantado já acumulou rumo ao próximo trio (compras de indicados diferentes não se somam). */
  bestProgress: number;
  /** Quantos pacotes faltam, para esse indicado, fechar o próximo trio (`PACK_TRIO_SIZE - bestProgress`). */
  missing: number;
}

export interface ConversionResult {
  /** Créditos dados ao indicador (0 em PHD, que dá tier, e em qualquer não-crédito). */
  credited: number;
  /** Tier concedido ao indicador por `granted_tiers` (só no plano PHD do indicado). */
  grantedTier: Tier | null;
}
const NONE: ConversionResult = { credited: 0, grantedTier: null };

/** `installCredited` (nome herdado do schema) = "vínculo gravado no cadastro" — nunca significou pagamento aqui. */
interface ReferredRow { code: string; referredId: string; installCredited: boolean; convertCredited: boolean }

/** Códigos são gerados em minúsculas (`genCode`); aceita qualquer caixa/espaço vindo da URL. */
function normalizeCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const c = code.trim().toLowerCase();
  return /^[a-z0-9_-]{3,64}$/.test(c) ? c : null;
}

@Injectable()
export class ReferralService {
  private db: ReturnType<typeof createDb>["db"] | null = null;
  private memLinks = new Map<string, any>();
  private memRef = new Map<string, ReferredRow & { firstSeen: string }>();
  /** Sem banco: compras de pacote por pagamento, e trios pagos por `indicado|pacote`. */
  private memPurchases = new Map<string, { referredId: string; packId: string }>();
  private memTrios = new Map<string, number>();
  constructor(
    private readonly wallet: WalletService,
    private readonly grants: GrantedTiersRepository,
    private readonly tiers: TierService,
    private readonly clock: Clock,
  ) {
    const url = process.env.DATABASE_URL; if (url) this.db = createDb(url).db;
  }

  private genCode(owner: string): string {
    return (owner.slice(0, 3) + Math.random().toString(36).slice(2, 8)).toLowerCase();
  }

  async getOrCreateLink(owner: string) {
    if (this.db) {
      const rows = await this.db.select().from(referralLinks).where(eq(referralLinks.ownerId, owner));
      if (rows[0]) return rows[0];
      const code = this.genCode(owner);
      await this.db.insert(referralLinks).values({ ownerId: owner, code }).onConflictDoNothing({ target: referralLinks.ownerId });
      const again = await this.db.select().from(referralLinks).where(eq(referralLinks.ownerId, owner));
      return again[0];
    }
    if (!this.memLinks.has(owner)) this.memLinks.set(owner, { ownerId: owner, code: this.genCode(owner), clicks: 0, installs: 0, conversions: 0, creditsEarned: 0 });
    return this.memLinks.get(owner);
  }

  async byCode(rawCode: string) {
    const code = normalizeCode(rawCode);
    if (!code) return null;
    if (this.db) { const r = await this.db.select().from(referralLinks).where(eq(referralLinks.code, code)); return r[0] ?? null; }
    for (const l of this.memLinks.values()) if (l.code === code) return l;
    return null;
  }

  /** Dono do link, ou `null` se o código não existe/é inválido (o cadastro nunca quebra por causa disso). */
  async ownerOfCode(code: string): Promise<string | null> {
    return (await this.byCode(code))?.ownerId ?? null;
  }

  async recordClick(rawCode: string) {
    const code = normalizeCode(rawCode);
    if (!code) return;
    if (this.db) { await this.db.update(referralLinks).set({ clicks: sql`${referralLinks.clicks} + 1` }).where(eq(referralLinks.code, code)); return; }
    const l = await this.byCode(code); if (l) l.clicks++;
  }

  private async findReferredRow(referredId: string): Promise<ReferredRow | null> {
    if (this.db) {
      const rows = await this.db.select().from(referralReferred).where(eq(referralReferred.referredId, referredId));
      const r = rows[0];
      return r ? { code: r.code, referredId: r.referredId, installCredited: r.installCredited, convertCredited: r.convertCredited } : null;
    }
    for (const r of this.memRef.values()) if (r.referredId === referredId) return r;
    return null;
  }

  private async bump(code: string, counter: "installs" | "conversions", credits: number) {
    if (this.db) {
      const col = counter === "installs" ? referralLinks.installs : referralLinks.conversions;
      await this.db.update(referralLinks)
        .set({ [counter]: sql`${col} + 1`, creditsEarned: sql`${referralLinks.creditsEarned} + ${credits}` } as any)
        .where(eq(referralLinks.code, code));
      return;
    }
    const link = await this.byCode(code);
    if (link) { link[counter]++; link.creditsEarned += credits; }
  }

  /**
   * "Cadastrou": GRAVA o vínculo indicador → indicado (sem ele não há como
   * pagar na conversão) e conta o cadastro — NÃO credita nada (ADR-0024,
   * correção: sem verificação de e-mail, qualquer um cria contas com o
   * próprio link; a indicação só paga quando o indicado ASSINA). Uma vez por
   * indicado (atribuição única). Auto-indicação (mesmo id) e código inválido →
   * `linked: false`. Quem chama (AuthService) também barra mesmo e-mail/alias
   * — aqui só existe o id.
   */
  async linkReferred(rawCode: string, referredId: string): Promise<{ linked: boolean }> {
    const code = normalizeCode(rawCode);
    if (!code || !referredId) return { linked: false };
    const link = await this.byCode(code);
    if (!link || link.ownerId === referredId) return { linked: false };
    if (await this.findReferredRow(referredId)) return { linked: false }; // atribuição única por indicado

    let claimed: boolean;
    const firstSeen = this.clock.now().toISOString();
    if (this.db) {
      const ins = await this.db.insert(referralReferred)
        .values({ code, referredId, firstSeen, installCredited: true })
        .onConflictDoNothing()
        .returning({ referredId: referralReferred.referredId });
      claimed = ins.length > 0;
    } else {
      const k = `${code}|${referredId}`;
      claimed = !this.memRef.has(k);
      if (claimed) this.memRef.set(k, { code, referredId, installCredited: true, convertCredited: false, firstSeen });
    }
    if (!claimed) return { linked: false };

    try {
      await this.bump(code, "installs", 0); // contador informativo — sem crédito
    } catch (e) {
      await this.releaseInstall(code, referredId);
      throw e;
    }
    return { linked: true };
  }

  /**
   * Marco "converteu": chamado quando a assinatura do INDICADO fica ativa.
   * Liga o assinante ao indicador pela linha de `referral_referred` (criada
   * no cadastro). Reivindica a conversão UMA vez por indicado — webhook
   * repetido ou uma 2ª assinatura do mesmo usuário não creditam de novo.
   */
  async recordConversion(referredId: string, sub: { id: string; tier: PaidTier }): Promise<ConversionResult> {
    const row = await this.findReferredRow(referredId);
    if (!row) return NONE; // usuário não veio de indicação
    const link = await this.byCode(row.code);
    if (!link || link.ownerId === referredId) return NONE;
    if (!(await this.claimConvert(row.code, referredId))) return NONE;

    try {
      if (sub.tier === "PHD") {
        const current = await this.tiers.resolve(link.ownerId);
        const grantTier: Tier = current === "FREE" ? "JUNIOR" : current;
        await this.grants.grant({
          id: `refconv_${referredId}`,
          userId: link.ownerId,
          tier: grantTier,
          expiresAt: new Date(this.clock.now().getTime() + REFERRAL_GRANT_DAYS * DAY_MS),
          reason: `REFERRAL_PHD:${referredId}:${sub.id}`,
        });
        await this.bump(row.code, "conversions", 0);
        return { credited: 0, grantedTier: grantTier };
      }
      const credits = CONVERT_CREDITS[sub.tier];
      await this.wallet.creditImageCredits(link.ownerId, credits);
      await this.bump(row.code, "conversions", credits);
      return { credited: credits, grantedTier: null };
    } catch (e) {
      await this.releaseConvert(row.code, referredId);
      throw e;
    }
  }

  /**
   * Compra de PACOTE de créditos do indicado (ADR-0024, rev. 2) — chamado pelo `BillingService` quando
   * o pagamento é confirmado. `paymentId` = id do pagamento no gateway (sessão Stripe). Passos:
   *  1. registra a compra (idempotente por `paymentId`);
   *  2. paga TODOS os trios que já fecharam e ainda não foram pagos — deste tamanho e dos outros tamanhos do
   *     MESMO indicado —, um por vez, cada um reivindicado atomicamente (a contagem vem das compras
   *     registradas; o resto 1-2 fica acumulado). Um trio que ficou pendente é pago pela próxima compra.
   * O passo 2 roda SEMPRE — inclusive num reenvio do webhook — então uma falha no meio (registrou a compra,
   * mas o crédito falhou) se recupera no retry sem pagar em dobro e sem perder o trio. Comprador sem
   * indicador, auto-indicação ou pacote desconhecido: não faz nada e não quebra nada. Falha ao creditar
   * DESFAZ a reivindicação do trio e propaga o erro (o webhook responde 500 e o Stripe reenvia).
   */
  async recordPackPurchase(referredId: string, packId: string, paymentId: string): Promise<PackPurchaseResult> {
    const reward = PACK_TRIO_REWARD[packId];
    if (reward === undefined || !referredId || !paymentId) return PACK_NONE;
    const row = await this.findReferredRow(referredId);
    if (!row) return PACK_NONE; // usuário não veio de indicação
    const link = await this.byCode(row.code);
    if (!link || link.ownerId === referredId) return PACK_NONE;

    await this.insertPurchase(paymentId, referredId, packId);

    // Paga o que estiver devido: primeiro o tamanho desta compra, depois os OUTROS tamanhos deste mesmo indicado.
    // Assim um trio que ficou pendente (crédito falhou, ou uma compra concorrente não o enxergou) é pago pela
    // PRÓXIMA compra do mesmo indicado — de qualquer tamanho — e nunca fica perdido.
    let triosPaid = 0;
    let credited = 0;
    for (const id of [packId, ...Object.keys(PACK_TRIO_REWARD).filter((k) => k !== packId)]) {
      const r = await this.settleTrios(link.ownerId, row.code, referredId, id);
      triosPaid += r.triosPaid;
      credited += r.credited;
    }
    return { credited, triosPaid };
  }

  /**
   * Paga TODOS os trios pendentes de UM balde (indicado + tamanho), em laço: cada iteração reivindica UM trio
   * atomicamente (`claimTrio`) e o credita. Só sai quando não há mais nenhum devido — nunca paga a mais (a
   * condição `(pagos + 1) * 3 <= compras` é reavaliada a cada reivindicação) e nunca deixa pendente o que já
   * está comprado. Falha ao creditar devolve o trio e propaga o erro.
   */
  private async settleTrios(ownerId: string, code: string, referredId: string, packId: string): Promise<PackPurchaseResult> {
    const reward = PACK_TRIO_REWARD[packId];
    if (reward === undefined) return PACK_NONE;
    let triosPaid = 0;
    for (let i = 0; i < MAX_TRIOS_PER_CALL; i++) {
      if (!(await this.claimTrio(referredId, packId))) break;
      try {
        await this.wallet.creditImageCredits(ownerId, reward);
      } catch (e) {
        await this.releaseTrio(referredId, packId); // o trio volta a ficar devido; a próxima compra (ou o retry) paga
        throw e;
      }
      triosPaid++;
      // Contador informativo: se falhar, NÃO desfaz o trio (o crédito já foi dado — desfazer pagaria de novo no retry).
      await this.addCredits(code, reward).catch(() => {});
    }
    return { credited: triosPaid * reward, triosPaid };
  }

  /**
   * Progresso por tamanho de pacote, somando os indicados deste indicador — pra tela do Perfil.
   * `bestProgress` é do indicado MAIS ADIANTADO (compras de indicados diferentes não se somam).
   */
  async getPackProgress(ownerId: string): Promise<PackTrioProgress[]> {
    const link = await this.getOrCreateLink(ownerId);
    const referredIds = await this.referredIdsOf(link.code);
    const bought = new Map<string, number>(); // `indicado|pacote` → pacotes comprados
    const paid = new Map<string, number>();   // `indicado|pacote` → trios pagos
    if (referredIds.length > 0) {
      if (this.db) {
        const purchases = await this.db
          .select({ referredId: referralPackPurchases.referredId, packId: referralPackPurchases.packId, n: sql<number>`count(*)::int` })
          .from(referralPackPurchases)
          .where(inArray(referralPackPurchases.referredId, referredIds))
          .groupBy(referralPackPurchases.referredId, referralPackPurchases.packId);
        for (const r of purchases) bought.set(`${r.referredId}|${r.packId}`, Number(r.n));
        const trios = await this.db.select().from(referralPackTrios).where(inArray(referralPackTrios.referredId, referredIds));
        for (const r of trios) paid.set(`${r.referredId}|${r.packId}`, r.triosPaid);
      } else {
        const ids = new Set(referredIds);
        for (const p of this.memPurchases.values()) {
          if (!ids.has(p.referredId)) continue;
          const k = `${p.referredId}|${p.packId}`;
          bought.set(k, (bought.get(k) ?? 0) + 1);
        }
        for (const [k, n] of this.memTrios) if (ids.has(k.split("|")[0]!)) paid.set(k, n);
      }
    }
    return CREDIT_PACKS.filter((p) => PACK_TRIO_REWARD[p.id] !== undefined).map((p) => {
      let purchased = 0, triosPaid = 0, best = 0;
      for (const id of referredIds) {
        const n = bought.get(`${id}|${p.id}`) ?? 0;
        purchased += n;
        triosPaid += paid.get(`${id}|${p.id}`) ?? 0;
        best = Math.max(best, n % PACK_TRIO_SIZE);
      }
      return { packId: p.id, credits: p.credits, label: p.label, reward: PACK_TRIO_REWARD[p.id]!, purchased, triosPaid, bestProgress: best, missing: PACK_TRIO_SIZE - best };
    });
  }

  private async referredIdsOf(code: string): Promise<string[]> {
    if (this.db) {
      const rows = await this.db.select({ referredId: referralReferred.referredId }).from(referralReferred).where(eq(referralReferred.code, code));
      return rows.map((r) => r.referredId);
    }
    return [...this.memRef.values()].filter((r) => r.code === code).map((r) => r.referredId);
  }

  /** Registra a compra (idempotente por `paymentId`) e garante a linha do balde de trios. */
  private async insertPurchase(paymentId: string, referredId: string, packId: string): Promise<void> {
    if (this.db) {
      await this.db.insert(referralPackPurchases).values({ paymentId, referredId, packId }).onConflictDoNothing({ target: referralPackPurchases.paymentId });
      await this.db.insert(referralPackTrios).values({ referredId, packId }).onConflictDoNothing();
      return;
    }
    if (!this.memPurchases.has(paymentId)) this.memPurchases.set(paymentId, { referredId, packId });
    const k = `${referredId}|${packId}`;
    if (!this.memTrios.has(k)) this.memTrios.set(k, 0);
  }

  /**
   * Reivindica UM trio: só se `(pagos + 1) * 3 <= compras`. `UPDATE ... RETURNING` atômico — duas
   * chamadas simultâneas nunca pagam o mesmo trio (a segunda reavalia a condição depois do lock).
   */
  private async claimTrio(referredId: string, packId: string): Promise<boolean> {
    if (this.db) {
      const rows = await this.db.update(referralPackTrios)
        .set({ triosPaid: sql`${referralPackTrios.triosPaid} + 1` })
        .where(and(
          eq(referralPackTrios.referredId, referredId),
          eq(referralPackTrios.packId, packId),
          sql`(${referralPackTrios.triosPaid} + 1) * ${PACK_TRIO_SIZE} <= (SELECT count(*)::int FROM ${referralPackPurchases} WHERE ${referralPackPurchases.referredId} = ${referredId} AND ${referralPackPurchases.packId} = ${packId})`,
        ))
        .returning({ triosPaid: referralPackTrios.triosPaid });
      return rows.length > 0;
    }
    const k = `${referredId}|${packId}`;
    let purchased = 0;
    for (const p of this.memPurchases.values()) if (p.referredId === referredId && p.packId === packId) purchased++;
    const paid = this.memTrios.get(k) ?? 0;
    if ((paid + 1) * PACK_TRIO_SIZE > purchased) return false;
    this.memTrios.set(k, paid + 1);
    return true;
  }

  private async releaseTrio(referredId: string, packId: string): Promise<void> {
    if (this.db) {
      await this.db.update(referralPackTrios)
        .set({ triosPaid: sql`GREATEST(${referralPackTrios.triosPaid} - 1, 0)` })
        .where(and(eq(referralPackTrios.referredId, referredId), eq(referralPackTrios.packId, packId)));
      return;
    }
    const k = `${referredId}|${packId}`;
    this.memTrios.set(k, Math.max((this.memTrios.get(k) ?? 0) - 1, 0));
  }

  /** Soma `credits` em `credits_earned` do link (contador informativo; não mexe em installs/conversions). */
  private async addCredits(code: string, credits: number): Promise<void> {
    if (this.db) {
      await this.db.update(referralLinks).set({ creditsEarned: sql`${referralLinks.creditsEarned} + ${credits}` }).where(eq(referralLinks.code, code));
      return;
    }
    const link = await this.byCode(code);
    if (link) link.creditsEarned += credits;
  }

  private async claimConvert(code: string, referredId: string): Promise<boolean> {
    if (this.db) {
      const rows = await this.db.update(referralReferred)
        .set({ convertCredited: true })
        .where(and(eq(referralReferred.code, code), eq(referralReferred.referredId, referredId), eq(referralReferred.convertCredited, false)))
        .returning({ referredId: referralReferred.referredId });
      return rows.length > 0;
    }
    const r = this.memRef.get(`${code}|${referredId}`);
    if (!r || r.convertCredited) return false;
    r.convertCredited = true;
    return true;
  }

  private async releaseConvert(code: string, referredId: string): Promise<void> {
    if (this.db) {
      await this.db.update(referralReferred).set({ convertCredited: false })
        .where(and(eq(referralReferred.code, code), eq(referralReferred.referredId, referredId)));
      return;
    }
    const r = this.memRef.get(`${code}|${referredId}`);
    if (r) r.convertCredited = false;
  }

  private async releaseInstall(code: string, referredId: string): Promise<void> {
    if (this.db) {
      await this.db.delete(referralReferred)
        .where(and(eq(referralReferred.code, code), eq(referralReferred.referredId, referredId)));
      return;
    }
    this.memRef.delete(`${code}|${referredId}`);
  }
}
