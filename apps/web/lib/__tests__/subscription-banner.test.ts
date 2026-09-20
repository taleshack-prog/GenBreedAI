/**
 * Faixa de aviso de assinatura (ADR-0030): a API decide e manda o texto; a web só lembra o que foi dispensado (por aviso e
 * por período), decide quando buscar de novo e o tom. Lógica pura, sem DOM.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  readDismissed, isDismissed, dismissNotice, shouldShowBanner, shouldRefetch, bannerTone,
  DISMISSED_STORAGE_KEY, MAX_DISMISSED, BANNER_REFETCH_MIN_MS, BANNER_LINK_LABEL, type SubscriptionNotice,
} from "../subscription-banner";
import type { StorageLike } from "../referral-capture";

function memoryStorage(initial?: Record<string, string>): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
}
const notice = (over: Partial<SubscriptionNotice> = {}): SubscriptionNotice => ({
  kind: "EXPIRING", subscriptionId: "sub_1", tier: "SENIOR", periodEnd: "2026-10-01T12:00:00.000Z",
  title: "Sua assinatura vence em 3 dias", body: "Seu plano Senior…", dismissKey: "EXPIRING:sub_1:2026-10-01T12:00:00.000Z", url: "/app/planos", ...over,
});

describe("dispensar a faixa", () => {
  it("dispensou → não mostra mais ESTE aviso; sem dispensar, mostra; sem aviso, nada", () => {
    const s = memoryStorage();
    expect(shouldShowBanner(notice(), s)).toBe(true);
    dismissNotice(s, notice().dismissKey);
    expect(isDismissed(s, notice().dismissKey)).toBe(true);
    expect(shouldShowBanner(notice(), s)).toBe(false);
    expect(shouldShowBanner(null, s)).toBe(false);
  });

  it("dispensar vale só para ESTE aviso deste período: outro tipo, outra assinatura ou outro período (renovou e vai vencer de novo) reaparece", () => {
    const s = memoryStorage();
    dismissNotice(s, notice().dismissKey);
    expect(shouldShowBanner(notice({ kind: "PAST_DUE", dismissKey: "PAST_DUE:sub_1:2026-10-01T12:00:00.000Z" }), s)).toBe(true);
    expect(shouldShowBanner(notice({ dismissKey: "EXPIRING:sub_1:2026-11-01T12:00:00.000Z", periodEnd: "2026-11-01T12:00:00.000Z" }), s)).toBe(true);
    expect(shouldShowBanner(notice({ dismissKey: "EXPIRING:sub_2:2026-10-01T12:00:00.000Z" }), s)).toBe(true);
  });

  it("dispensar de novo não duplica; só guarda as últimas MAX_DISMISSED chaves", () => {
    const s = memoryStorage();
    dismissNotice(s, "k1"); dismissNotice(s, "k1");
    expect(readDismissed(s)).toEqual(["k1"]);
    for (let i = 0; i < MAX_DISMISSED + 5; i++) dismissNotice(s, `k${i + 10}`);
    const kept = readDismissed(s);
    expect(kept).toHaveLength(MAX_DISMISSED);
    expect(kept[kept.length - 1]).toBe(`k${MAX_DISMISSED + 5 + 9}`); // a mais recente está lá
    expect(kept).not.toContain("k1");                                 // a mais antiga saiu
  });

  it("storage com lixo, ou que lança, NUNCA quebra: lista vazia / só não lembra", () => {
    expect(readDismissed(memoryStorage({ [DISMISSED_STORAGE_KEY]: "isto não é json" }))).toEqual([]);
    expect(readDismissed(memoryStorage({ [DISMISSED_STORAGE_KEY]: JSON.stringify({ a: 1 }) }))).toEqual([]);
    expect(readDismissed(memoryStorage({ [DISMISSED_STORAGE_KEY]: JSON.stringify(["ok", 3, null, "também"]) }))).toEqual(["ok", "também"]);
    const throwing: StorageLike = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); }, removeItem: () => {} };
    expect(readDismissed(throwing)).toEqual([]);
    expect(() => dismissNotice(throwing, "k")).not.toThrow();
    expect(shouldShowBanner(notice(), throwing)).toBe(true); // sem storage, a faixa aparece (dispensável só na sessão)
  });
});

describe("quando buscar de novo e o tom", () => {
  it("nunca buscou → busca; antes de 1 minuto → não; a partir de 1 minuto → busca", () => {
    expect(shouldRefetch(null, 1_000)).toBe(true);
    expect(shouldRefetch(1_000, 1_000 + BANNER_REFETCH_MIN_MS - 1)).toBe(false);
    expect(shouldRefetch(1_000, 1_000 + BANNER_REFETCH_MIN_MS)).toBe(true);
    expect(BANNER_REFETCH_MIN_MS).toBe(60_000);
  });

  it("tom: pagamento falhou e voltou-ao-gratuito pedem ação (crit); vence em breve é aviso (warn)", () => {
    expect(bannerTone("EXPIRING")).toBe("warn");
    expect(bannerTone("PAST_DUE")).toBe("crit");
    expect(bannerTone("DROPPED")).toBe("crit");
  });
});

describe("a faixa está ligada ao app", () => {
  const web = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
  it("o layout de /app/* renderiza a faixa (aparece em QUALQUER tela do jogo)", () => {
    expect(readFileSync(web("app/app/layout.tsx"), "utf8")).toMatch(/<SubscriptionBanner\s*\/>/);
  });
  it("a faixa busca /me/subscription-notice, leva ao `url` que a API manda (planos) e tem o botão de dispensar", () => {
    const comp = readFileSync(web("components/SubscriptionBanner.tsx"), "utf8");
    expect(comp).toMatch(/getSubscriptionNotice/);
    expect(comp).toMatch(/href=\{notice\.url\}/);
    expect(comp).toMatch(/dismissNotice/);
    expect(BANNER_LINK_LABEL).toBe("Ver planos");
    expect(readFileSync(web("lib/api.ts"), "utf8")).toMatch(/\/api\/v1\/me\/subscription-notice/);
  });
});
