/**
 * Cliente da API GenBreedAI. O browser chama /api/v1/* (mesma origem) e o Next
 * repassa à API NestJS (ver next.config rewrites), evitando CORS.
 *
 * Autenticação (dev): cabeçalhos x-user-id / x-user-tier — mesma convenção do
 * AuthGuard da API. Na Fase 1c isto vira sessão Auth.js.
 */

import type { Genotype } from "@genbreedai/shared";
import { nextAvailableLabel } from "./quota-format";
import type { ReferralPackProgress } from "./referral-packs";
import type { SubscriptionNotice } from "./subscription-banner";

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
  /** Miniatura do retrato (ADR-0037). A lista de espécimes hoje não a envia — o card a obtém de `getImage`; campo opcional para quando enviar. */
  thumbUrl?: string | null;
  status?: "ALIVE" | "FROZEN";
  sex: "M" | "F" | null;
  fertility: number | null;
  haldaneStatus: "NONE" | "STERILE" | "REDUCED" | null;
  /**
   * ADR-0019 (retrato incluído no cruzamento) — SUPERSEDIDO pela ADR-0021:
   * nascer agora GERA o retrato na hora (a vaga de gestação já pagou por
   * ele), então todo espécime que nasce pela incubadora já sai com isto
   * `false`. Campo mantido (nunca populado `true` nos fluxos que a web usa)
   * só pra não quebrar `reveal/[id]/page.tsx`, que ainda checa (sempre
   * falso, então sempre cai no caminho normal de buscar a imagem já
   * existente).
   */
  includedPortrait?: boolean;
}

type ApiPhenotype = { loci: Record<string, string>; qtl: Record<string, number>; viable: boolean; epistasis: string[]; hasMutation: boolean };

/**
 * ADR-0020/0021: uma descrição de fenótipo recém-criada na incubadora — o
 * que POST /api/v1/cross devolve por opção enumerada (livre, sem cota, sem
 * espécime nenhum ainda). Campos mínimos que o Laboratório mostra logo
 * após cruzar (probabilidade/aura/fenótipo/genótipo/sexo); a entrada
 * completa (com estado NA_INCUBADORA/GESTANDO/NASCIDO) só existe na
 * listagem da incubadora — ver `IncubatorEntry`.
 */
export interface IncubatorDescription {
  id: string;
  genotype: Genotype;
  phenotype: ApiPhenotype;
  prob: number;
  aura: number;
  sex: "M" | "F";
}
/** `discardedForCap` (ADR-0023): quantas entradas NÃO gestadas antigas foram apagadas pra caber no teto de 200 — 0 na maioria das vezes. */
export interface CrossResult { crossId: string; entries: IncubatorDescription[]; discardedForCap: number; }

// Usuário-demo do scaffold (dono dos fundadores semeados na API).
export type Tier = "FREE" | "JUNIOR" | "SENIOR" | "PHD";
// Removido o seletor de "tier de teste" (localStorage "gb:tier" + cabeçalho
// x-user-tier) — a web nunca mais escolhe o tier: quem gateia é sempre o
// TierService no backend (ver getMyTier()). Limpa a chave antiga, se existir,
// pra nenhuma sessão salva continuar mandando um tier "de teste" arbitrário.
if (typeof window !== "undefined") localStorage.removeItem("gb:tier");
/**
 * Sempre inclui `content-type: application/json` — por isso TODA chamada de
 * `fetch` que usa `demoHeaders()` com método POST/DELETE precisa mandar um
 * `body` não-vazio junto (mesmo sem nada pra enviar, `body: "{}"`). Fastify
 * recusa uma requisição que declara esse content-type sem corpo nenhum
 * ("body cannot be empty when content-type is set to 'application/json'",
 * `FST_ERR_CTP_EMPTY_JSON_BODY`) — bug real em produção em `gestateEntry`/
 * `bornEntry`/`discardEntry`, que mandavam o header sem body. Ver teste
 * `__tests__/api-request-body.test.ts`, que cobre TODAS as funções desta
 * lista contra essa combinação.
 */
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

/**
 * ADR-0020/0021: cruzar é LIVRE e sem custo — não recebe mais `choiceKey`
 * (ninguém escolhe UMA opção pra sintetizar; todas as opções enumeradas
 * viram descrições na incubadora) nem devolve espécime — devolve as
 * descrições (`entries`), que ficam na incubadora até o jogador gestar.
 * 429 aqui é só o limite TÉCNICO anti-abuso (60/hora, igual pra todo tier,
 * sem `nextAvailableAt` — não é vaga de jogo), nunca `birthQuota`.
 */
export async function postCross(input: {
  sireId: string;
  damId: string;
  method: string;
  seed?: string;
}): Promise<CrossResult> {
  const res = await fetch("/api/v1/cross", {
    method: "POST",
    headers: demoHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await apiErrorFrom(res, `Cruzamento falhou (${res.status}).`);
  return res.json();
}

export interface ImageResult {
  cacheKey: string; status: string; imageUrl: string | null; model: string; cached: boolean; prompt: string;
  /** Miniatura 600×600 JPEG do mesmo retrato (ADR-0037) — `null`/ausente: use `imageUrl`. Só as LISTAS a preferem. */
  thumbUrl?: string | null;
}
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

export interface Wallet { catalisadores: number; biomassa: number; lastDaily?: string | null; lastBiweekly?: string | null; imageCredits?: number; }
export async function getWallet(): Promise<Wallet> {
  const res = await fetch("/api/v1/wallet", { headers: demoHeaders(), cache: "no-store" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao carregar carteira.");
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

/**
 * Incubadora (ADR-0021 — gestação, substitui revelar/congelar da ADR-0020):
 * descrições de fenótipo de todo cruzamento vivem aqui, de graça e sem
 * prazo, até o jogador GESTAR (consome `birthQuota` — é aqui que o único
 * custo real, a imagem, é comprometido) e, depois do prazo pela aura,
 * NASCER (grátis, gera a imagem agora). Não existe mais revelar avulso nem
 * congelar descrição.
 */
/** "PRONTO" (prazo de gestação já vencido, mas ainda não nasceu) é estado do SERVIDOR desde esta rodada — não mais um recorte calculado no cliente. */
export type IncubatorState = "NA_INCUBADORA" | "GESTANDO" | "PRONTO" | "NASCIDO";
export type IncubatorStateCounts = Record<IncubatorState, number>;

export interface IncubatorEntry extends IncubatorDescription {
  crossId: string; sireId: string; damId: string; method: string; pack: PackId; species: string;
  fPedigree: number; fixationIndex: number; generation: number;
  fertility: number | null; haldaneStatus: "NONE" | "STERILE" | "REDUCED" | null;
  imageUrl: string | null;
  /** Miniatura do retrato (ADR-0037) — a lista da incubadora a prefere; `null`/ausente: cai em `imageUrl`. */
  thumbUrl?: string | null;
  state: IncubatorState;
  /** ISO — `null` fora de gestação. */
  gestationEndsAt: string | null;
  /** Tempo total (h) previsto pela aura — sempre presente, mesmo antes de gestar. */
  gestationHours: number;
  /** ADR-0025 — `true` quando a gestação desta entrada foi a 1ª da conta (cortesia de 5 min). `false` antes de gestar e nas demais. */
  firstGestation: boolean;
  bornSpecimenId: string | null;
  createdAt: string;
  /** ADR-0023 — só entradas NASCIDAS têm valor: quando a entrada some da incubadora (7 dias corridos do nascimento). O espécime NUNCA é afetado, fica no Gene Bank pra sempre. */
  expiresAt: string | null;
}

/** Uma página de `GET /incubator` — paginação por cursor + contagem COMPLETA por estado (nunca só da página atual). */
export interface IncubatorPage {
  entries: IncubatorEntry[];
  /** `null` = não há próxima página. */
  nextCursor: string | null;
  counts: IncubatorStateCounts;
}

/**
 * `limit` (padrão 24, máx. 60 — a API clampa se vier maior), `cursor` (id
 * da última entrada da página JÁ carregada — pra pedir a PRÓXIMA) e `state`
 * (filtro aplicado no SERVIDOR, nunca mais no cliente).
 */
export async function listIncubator(opts: { limit?: number; cursor?: string; state?: IncubatorState } = {}): Promise<IncubatorPage> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.state) params.set("state", opts.state);
  const qs = params.toString();
  const res = await fetch(`/api/v1/incubator${qs ? `?${qs}` : ""}`, { headers: demoHeaders(), cache: "no-store" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao carregar a incubadora.");
  return res.json();
}
/**
 * Inicia a gestação de uma descrição — consome `birthQuota` (ou 1 crédito de
 * imagem no fallback); já gestando ou já nascida → 400. 429 aqui É vaga de
 * jogo (diferente do 429 de POST /cross, que é só limite técnico) — a API
 * devolve `nextAvailableAt`.
 */
export async function gestateEntry(id: string): Promise<IncubatorEntry> {
  const res = await fetch(`/api/v1/incubator/${id}/gestate`, { method: "POST", headers: demoHeaders(), body: "{}" });
  if (!res.ok) {
    if (res.status === 429) {
      const body = await res.json().catch(() => null) as { message?: string; nextAvailableAt?: string | null } | null;
      const when = body?.nextAvailableAt ? nextAvailableLabel(body.nextAvailableAt) : null;
      throw new ApiError(429, when ?? body?.message ?? "Sem vaga de gestação nem créditos.");
    }
    throw await apiErrorFrom(res, `Falha ao gestar (${res.status}).`);
  }
  return res.json();
}
/** Materializa o espécime depois do prazo de gestação — grátis, gera a imagem agora (a vaga já foi paga em gestar). Antes do prazo → 400. */
export async function bornEntry(id: string): Promise<{ specimen: ApiSpecimen }> {
  const res = await fetch(`/api/v1/incubator/${id}/born`, { method: "POST", headers: demoHeaders(), body: "{}" });
  if (!res.ok) throw await apiErrorFrom(res, `Falha ao fazer nascer (${res.status}).`);
  return res.json();
}
/** Descarta a descrição (perde, sem volta) — a confirmação é responsabilidade de quem chama. */
export async function discardEntry(id: string): Promise<void> {
  const res = await fetch(`/api/v1/incubator/${id}`, { method: "DELETE", headers: demoHeaders(), body: "{}" });
  if (!res.ok) throw await apiErrorFrom(res, `Falha ao descartar (${res.status}).`);
}

/** Faixa de aviso de assinatura (ADR-0030): `notice: null` = nada a mostrar (inclusive quando a assinatura voltou a ficar ativa). A API decide e manda o texto pronto. */
export async function getSubscriptionNotice(): Promise<SubscriptionNotice | null> {
  const res = await fetch("/api/v1/me/subscription-notice", { headers: demoHeaders(), cache: "no-store" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao consultar o aviso de assinatura.");
  const body = await res.json() as { notice: SubscriptionNotice | null };
  return body.notice ?? null;
}

/** Web Push (ADR-0028): a API só liga o recurso com as chaves VAPID — sem elas `enabled` é `false` e a web esconde o botão. Rota pública. */
export async function getPushConfig(): Promise<{ enabled: boolean }> {
  const res = await fetch("/api/v1/push/config", { cache: "no-store" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao consultar as notificações.");
  return res.json();
}
/** Forma de `PushSubscription.toJSON()` que a API grava (uma linha por dispositivo). */
export interface PushSubscriptionJson { endpoint: string; keys: { p256dh: string; auth: string } }
/** Grava (ou atualiza) a assinatura deste aparelho. 503 = recurso desligado no servidor. */
export async function subscribePush(sub: PushSubscriptionJson): Promise<void> {
  const res = await fetch("/api/v1/push/subscribe", { method: "POST", headers: demoHeaders(), body: JSON.stringify(sub) });
  if (!res.ok) throw await apiErrorFrom(res, `Falha ao ativar os avisos (${res.status}).`);
}
/** Remove a assinatura deste aparelho (só a dele). */
export async function unsubscribePush(endpoint: string): Promise<void> {
  const res = await fetch("/api/v1/push/subscribe", { method: "DELETE", headers: demoHeaders(), body: JSON.stringify({ endpoint }) });
  if (!res.ok) throw await apiErrorFrom(res, `Falha ao desativar os avisos (${res.status}).`);
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

/**
 * ADR-0024 (rev. 2): indicação só recompensa quando o indicado GASTA (assinatura ou pacotes de créditos).
 * D1/D7 foram cancelados — não existem mais nesta resposta. `packs`/`trioSize` opcionais: uma API antiga
 * (deploy da web antes da API) não os manda, e a tela simplesmente não mostra o bloco de pacotes.
 */
export interface Referral {
  code: string; clicks: number; installs: number; conversions: number; creditsEarned: number;
  trioSize?: number; packs?: ReferralPackProgress[];
}
export async function getReferral(): Promise<Referral> {
  const res = await fetch("/api/v1/referral", { headers: demoHeaders(), cache: "no-store" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao carregar indicação.");
  return res.json();
}
/** Bônus QUINZENAL de crédito (1 crédito = 1 nascimento extra, ADR-0021 — era semanal, ADR-0019). */
export async function claimBiweekly(): Promise<{ claimed: boolean; wallet: Wallet }> {
  const res = await fetch("/api/v1/wallet/biweekly", { method: "POST", headers: demoHeaders(), body: "{}" });
  if (!res.ok) throw await apiErrorFrom(res, "Falha ao coletar bônus quinzenal.");
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

export interface BirthQuotaInfo {
  limit: number;
  window: "rolling7d" | "day";
  used: number;
  /** null = tem vaga agora; senão, instante ISO em que volta a ter (ADR-0021). */
  nextAvailableAt: string | null;
}
export interface MyTier {
  tier: Tier; birthQuota: BirthQuotaInfo; monthlyExtraImages: number; biweeklyBonus: boolean;
  /** ADR-0025 — a 1ª gestação da conta (5 min) ainda não foi usada. Opcional: API antiga (deploy web antes da API) = ausente = não promete a cortesia. */
  firstGestationAvailable?: boolean;
}
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
