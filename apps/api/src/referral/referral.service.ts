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
 * D1/D7 NÃO existem ainda (precisam de tarefa agendada — ver ADR-0024); as
 * colunas `d1`/`d7` seguem no schema, sem escritor.
 *
 * Idempotência (claim ATÔMICO, nunca select-depois-update): um indicado tem
 * UMA linha em `referral_referred` (atribuição única, mesmo que apareça com
 * outro código) e cada marco é reivindicado uma só vez por indicado. Falha
 * ao creditar desfaz a reivindicação e propaga o erro (o webhook devolve 500
 * e o Stripe reenvia).
 */
import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { Tier } from "@genbreedai/shared";
import { referralLinks, referralReferred } from "../db/schema";
import { createDb } from "../db/client";
import { WalletService } from "../economy/wallet.service";
import { GrantedTiersRepository } from "../billing/granted-tiers.repository";
import { TierService } from "../billing/tier.service";
import type { PaidTier } from "../billing/subscription-plans";
import { Clock } from "../common/clock";

export const CONVERT_CREDITS: Readonly<Record<"JUNIOR" | "SENIOR", number>> = { JUNIOR: 15, SENIOR: 30 };
export const REFERRAL_GRANT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

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
    if (!this.memLinks.has(owner)) this.memLinks.set(owner, { ownerId: owner, code: this.genCode(owner), clicks: 0, installs: 0, d1: 0, d7: 0, conversions: 0, creditsEarned: 0 });
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
