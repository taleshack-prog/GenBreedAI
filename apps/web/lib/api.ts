/**
 * Cliente da API GenBreedAI. O browser chama /api/v1/* (mesma origem) e o Next
 * repassa à API NestJS (ver next.config rewrites), evitando CORS.
 *
 * Autenticação (dev): cabeçalhos x-user-id / x-user-tier — mesma convenção do
 * AuthGuard da API. Na Fase 1c isto vira sessão Auth.js.
 */

import type { Genotype } from "@genbreedai/shared";

export type PackId = "feline" | "canine" | "saurian";

export interface ApiSpecimen {
  id: string;
  ownerId: string;
  pack: PackId;
  species: string;
  genotype: Genotype;
  generation: number;
  sireId: string | null;
  damId: string | null;
  method: string;
  fPedigree: number;
  fixationIndex: number;
  aura: number;
  cacheKey: string | null;
  imageUrl?: string | null;
  status?: "ALIVE" | "FROZEN";
  sex: "M" | "F" | null;
  fertility: number | null;
  haldaneStatus: "NONE" | "STERILE" | "REDUCED" | null;
}

export interface CrossResponse {
  specimen: ApiSpecimen;
  cacheKey: string;
  engine: {
    genotype: Genotype;
    phenotype: {
      loci: Record<string, string>;
      qtl: Record<string, number>;
      viable: boolean;
      epistasis: string[];
      hasMutation: boolean;
    };
    fPedigree: number;
    fertility: { score: number; inviabilityRisk: number; haldaneSterile: boolean; notes: string[] };
    fixationIndex: number;
    aura: number;
    generation: number;
    method: string;
  };
}

// Usuário-demo do scaffold (dono dos fundadores semeados na API).
export type Tier = "FREE" | "JUNIOR" | "SENIOR" | "PHD";
// Removido o seletor de "tier de teste" (localStorage "gb:tier" + cabeçalho
// x-user-tier) — a web nunca mais escolhe o tier: quem gateia é sempre o
// TierService no backend (ver getMyTier()). Limpa a chave antiga, se existir,
// pra nenhuma sessão salva continuar mandando um tier "de teste" arbitrário.
if (typeof window !== "undefined") localStorage.removeItem("gb:tier");
function demoHeaders(): Record<string, string> {
  const base: Record<string, string> = { "content-type": "application/json" };
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("gb:token");
    if (token) { base["authorization"] = `Bearer ${token}`; return base; }
  }
  // Fallback DEV (sem login): só id de teste, tier fixo em FREE no AuthGuard
  // a menos que haja assinatura/concessão real para "demo". Requer
  // AUTH_DEV_HEADERS=true na API; nunca aceito em produção.
  base["x-user-id"] = "demo";
  return base;
}

/**
 * Erro de resposta não-2xx da API — SEMPRE lançado (nunca devolvido como se
 * fosse sucesso). `status` = HTTP status; `message` = `body.message` da API
 * quando presente, senão um fallback específico da função. Quem chama decide
 * a UI (ex.: status===403 de imagem → link "Ver créditos").
 */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
/** Monta o ApiError de uma resposta não-2xx, lendo `{message}` do corpo quando houver. */
async function apiErrorFrom(res: Response, fallback: string): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  const message = body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
    ? (body as { message: string }).message
    : fallback;
  return new ApiError(res.status, message);
}

export async function listSpecimens(): Promise<ApiSpecimen[]> {
  const res = await fetch("/api/v1/specimens", { headers: demoHeaders(), cache: "no-store" });
  if (!res.ok) throw await apiErrorFrom(res, `Falha ao listar espécimes (${res.status}).`);
  return res.json();
}

export async function postCross(input: {
  sireId: string;
  damId: string;
  method: string;
  seed?: string;
  choiceKey?: string;
}): Promise<CrossResponse> {
  const res = await fetch("/api/v1/cross", {
    method: "POST",
    headers: demoHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const fallback = res.status === 429 ? "Cota diária de cruzamentos esgotada para este tier." : `Cruzamento falhou (${res.status}).`;
    throw await apiErrorFrom(res, fallback);
  }
  return res.json();
}

export interface ImageResult { cacheKey: string; status: string; imageUrl: string | null; model: string; cached: boolean; prompt: string; }
/**
 * Checagem silenciosa de cache (usada em polling — CapsuleCard). Não-2xx
 * SEMPRE lança ApiError (mesma regra de toda função aqui); quem só quer "sem
 * imagem ainda" trata com `.catch(() => {})`, como já faz o único chamador.
 */
export async function getImage(id: string): Promise<ImageResult | null> {
  const res = await fetch(`/api/v1/specimens/${id}/image`, { headers: demoHeaders(), cache: "no-store" });
  if (!res.ok) throw await apiErrorFrom(res, `Falha ao consultar imagem (${res.status}).`);
  return res.json();
}
export async function generateImage(id: string, force = false): Promise<ImageResult> {
  const res = await fetch(`/api/v1/specimens/${id}/image`, { method: "POST", headers: demoHeaders(), body: JSON.stringify({ force }) });
  if (!res.ok) throw await apiErrorFrom(res, `Falha ao gerar (${res.status}).`);
  return res.json();
}

type ApiPhenotype = { loci: Record<string, string>; qtl: Record<string, number>; viable: boolean; epistasis: string[]; hasMutation: boolean };
export interface OffspringOption {
  key: string; prob: number; fixationIndex: number; aura: number; variants: number;
  phenotype: ApiPhenotype; genotype: Genotype;
  /** O sexo (sorteado só na síntese) muda a aparência deste genótipo? (ADR-0017/0018) */
  sexDimorphic: boolean;
  /** Só presente quando sexDimorphic — fenótipo por sexo (ex.: juba/sem juba). */
  phenotypeBySex?: { M: ApiPhenotype; F: ApiPhenotype };
  /** ADR-0018: machos desta opção nascerão estéreis. */
  maleSterile: boolean;
}
export interface OptionsResponse { canChoose: boolean; maxOptions: number; options: OffspringOption[]; }
export async function getCrossOptions(input: { sireId: string; damId: string; method: string }): Promise<OptionsResponse> {
  const res = await fetch("/api/v1/cross/options", { method: "POST", headers: demoHeaders(), body: JSON.stringify(input) });
  if (!res.ok) throw await apiErrorFrom(res, `Falha ao obter opções (${res.status}).`);
  return res.json();
}

/**
 * `sex` OPCIONAL — só pra pedir o retrato de UM dos lados de uma opção
 * sex-dimórfica (preview.controller.ts repassa pro fenótipo do retrato).
 * NUNCA usado na síntese de verdade (postCross/synthesizeAndFreeze não têm
 * esse campo) — o sexo real continua sorteado pela seed só ao sintetizar.
 */
export async function previewImage(input: { sireId: string; damId: string; method: string; choiceKey: string; force?: boolean; sex?: "M" | "F" }): Promise<ImageResult> {
  const res = await fetch("/api/v1/cross/preview", { method: "POST", headers: demoHeaders(), body: JSON.stringify(input) });
  if (!res.ok) throw await apiErrorFrom(res, `Falha ao gerar preview (${res.status}).`);
  return res.json();
}

export interface LineageNode { id: string; species: string; generation: number; method: string; genotype: Genotype; aura: number; fPedigree: number; sire: LineageNode | null; dam: LineageNode | null; }
export interface WrightPath { ancestor: string; n1: number; n2: number; fAncestor: number; contribution: number; }
export interface GenomeResponse {
  specimen: ApiSpecimen;
  phenotype: { loci: Record<string, string>; qtl: Record<string, number>; viable: boolean; epistasis: string[]; hasMutation: boolean };
  lineage: LineageNode | null;
  fExplain: { total: number; paths: WrightPath[]; note: string };
  alleleSources: { locus: string; allele: string; sources: string[] }[];
  depth: number;
}
export async function getGenome(id: string): Promise<GenomeResponse> {
  const res = await fetch(`/api/v1/specimens/${id}/genome`, { headers: demoHeaders(), cache: "no-store" });
  if (!res.ok) throw await apiErrorFrom(res, `Falha ao carregar genoma (${res.status}).`);
  return res.json();
}

export interface Wallet { catalisadores: number; biomassa: number; lastDaily?: string | null; lastWeekly?: string | null; imageCredits?: number; }
export async function getWallet(): Promise<Wallet> {
  const res = await fetch("/api/v1/wallet", { headers: demoHeaders(), cache: "no-store" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao carregar carteira.");
  return res.json();
}
export async function freezeOption(input: { sireId: string; damId: string; method: string; choiceKey: string }): Promise<{ specimen: ApiSpecimen; wallet: Wallet }> {
  const res = await fetch("/api/v1/gene-bank/freeze-option", { method: "POST", headers: demoHeaders(), body: JSON.stringify(input) });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao congelar.");
  return res.json();
}
export async function freezeSpecimen(id: string): Promise<{ specimen: ApiSpecimen; wallet: Wallet }> {
  const res = await fetch(`/api/v1/gene-bank/freeze/${id}`, { method: "POST", headers: demoHeaders(), body: "{}" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao congelar.");
  return res.json();
}
export async function thawSpecimen(id: string): Promise<{ specimen: ApiSpecimen; wallet: Wallet }> {
  const res = await fetch(`/api/v1/gene-bank/thaw/${id}`, { method: "POST", headers: demoHeaders(), body: "{}" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao descongelar.");
  return res.json();
}

export interface SynthesizeResult { specimen: ApiSpecimen; frozen: ApiSpecimen[]; frozenCount: number; skipped: number; wallet: Wallet; }
export async function synthesizeAndFreeze(input: { sireId: string; damId: string; method: string; choiceKey?: string; freezeKeys: string[] }): Promise<SynthesizeResult> {
  const res = await fetch("/api/v1/gene-bank/synthesize", { method: "POST", headers: demoHeaders(), body: JSON.stringify(input) });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao sintetizar.");
  return res.json();
}

export async function claimDaily(): Promise<{ claimed: boolean; gain?: { catalisadores: number; biomassa: number }; wallet: Wallet }> {
  const res = await fetch("/api/v1/wallet/daily", { method: "POST", headers: demoHeaders(), body: "{}" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao coletar diário.");
  return res.json();
}

export interface ImageQuota { limit: number; used: number; remaining: number; }
export async function getImageQuota(): Promise<ImageQuota> {
  const res = await fetch("/api/v1/image-quota", { headers: demoHeaders(), cache: "no-store" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao carregar cota de imagens.");
  return res.json();
}

export interface Referral { code: string; clicks: number; installs: number; d1: number; d7: number; conversions: number; creditsEarned: number; }
export async function getReferral(): Promise<Referral> {
  const res = await fetch("/api/v1/referral", { headers: demoHeaders(), cache: "no-store" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao carregar indicação.");
  return res.json();
}
export async function claimWeekly(): Promise<{ claimed: boolean; wallet: Wallet }> {
  const res = await fetch("/api/v1/wallet/weekly", { method: "POST", headers: demoHeaders(), body: "{}" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao coletar bônus semanal.");
  return res.json();
}
export async function recordReferralClick(code: string): Promise<void> {
  try { await fetch("/api/v1/referral/click", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }); } catch { /* silencioso */ }
}
export function referralUrl(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/?ref=${code}`;
}

export interface CreditPack { id: string; credits: number; priceBRL: number; label: string; }
export async function getCreditPacks(): Promise<CreditPack[]> {
  const res = await fetch("/api/v1/billing/packs", { headers: demoHeaders(), cache: "no-store" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao carregar pacotes.");
  return res.json();
}
export interface CheckoutIntent { id: string; status: string; amountBRL: number; packId: string; checkoutUrl?: string; }
export type BuyCreditsResult =
  | { redirected: true }
  | { redirected: false; status: string; creditsAdded: number; wallet: Wallet };

/**
 * Cria a cobrança. Com gateway real (Stripe), o checkout traz `checkoutUrl` —
 * o pagamento só acontece lá, então redireciona e NÃO chama /confirm aqui
 * (quem confirma é o retorno do Stripe / webhook). Sem `checkoutUrl`
 * (StubPaymentProvider em dev), confirma na hora como antes.
 */
export async function buyCredits(packId: string): Promise<BuyCreditsResult> {
  const co = await fetch("/api/v1/billing/checkout", { method: "POST", headers: demoHeaders(), body: JSON.stringify({ packId }) });
  if (!co.ok) throw await apiErrorFrom(co, "Falha no checkout.");
  const intent: CheckoutIntent = await co.json();
  if (intent.checkoutUrl) {
    window.location.href = intent.checkoutUrl;
    return { redirected: true };
  }
  const cf = await fetch("/api/v1/billing/confirm", { method: "POST", headers: demoHeaders(), body: JSON.stringify({ intentId: intent.id }) });
  if (!cf.ok) throw await apiErrorFrom(cf, "Falha ao confirmar pagamento.");
  const r = await cf.json();
  return { redirected: false, ...r };
}

export interface SubscriptionInfo { tier: Tier; interval: "MONTH" | "YEAR"; status: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; }
/** Assinatura mais recente do usuário (qualquer status), ou null se nunca assinou. */
export async function getSubscription(): Promise<SubscriptionInfo | null> {
  const res = await fetch("/api/v1/billing/subscription", { headers: demoHeaders(), cache: "no-store" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao carregar assinatura.");
  return res.json();
}
/**
 * ATENÇÃO — considera SÓ a assinatura Stripe, ignora granted_tiers: alguém com
 * tier concedido (sem assinatura) aparece como FREE aqui. NÃO usar pra gatear
 * UI por tier — pra isso é `getMyTier()` (GET /api/v1/me/tier, TierService de
 * verdade). Existe só pra telas que precisam de dado ESPECÍFICO de assinatura
 * Stripe (ex.: "seu plano vigente é X, renova em Y").
 */
export function effectiveTierFromSubscription(sub: SubscriptionInfo | null): Tier {
  if (!sub) return "FREE";
  if (sub.status === "ACTIVE") return sub.tier;
  if (sub.status === "PAST_DUE" && new Date(sub.currentPeriodEnd).getTime() > Date.now()) return sub.tier;
  return "FREE";
}

/** Cria a Checkout Session de assinatura (mode=subscription) e retorna o checkoutUrl. */
export async function subscribeToPlan(tier: Exclude<Tier, "FREE">, interval: "month" | "year"): Promise<{ checkoutUrl: string }> {
  const res = await fetch("/api/v1/billing/subscribe", {
    method: "POST", headers: demoHeaders(),
    body: JSON.stringify({ tier, interval: interval === "year" ? "YEAR" : "MONTH" }),
  });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao iniciar assinatura.");
  return res.json();
}

export interface MyTier { tier: Tier; dailyCrosses: number; monthlyImages: number; }
/**
 * Tier EFETIVO do usuário logado (GET /api/v1/me/tier) — TierService.resolve()
 * no backend (assinatura → concessão em granted_tiers → FREE). Única fonte de
 * tier na web: nunca reconstruir a partir de localStorage/headers aqui.
 */
export async function getMyTier(): Promise<MyTier> {
  const res = await fetch("/api/v1/me/tier", { headers: demoHeaders(), cache: "no-store" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao carregar tier.");
  return res.json();
}

export interface CrossClassification { method: string; kinship: number; reason: string; inbreedingRisk: boolean; }
export async function classifyCross(input: { sireId: string; damId: string }): Promise<CrossClassification> {
  const res = await fetch("/api/v1/cross/classify", { method: "POST", headers: demoHeaders(), body: JSON.stringify(input) });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao classificar cruzamento.");
  return res.json();
}
