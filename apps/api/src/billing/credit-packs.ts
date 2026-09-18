/**
 * Pacotes de créditos (1 crédito = 1 nascimento extra, sem vaga do tier —
 * ou 1 retrato extra além da cota mensal de regeneração).
 * `stripeLookupKey` referencia o Price no catálogo Stripe por lookup_key —
 * nunca hardcode price_id, porque o ID muda entre sandbox e produção.
 *
 * Catálogo `_v2` (produtos novos criados e ativos no Stripe; os antigos —
 * pack_10/pack_50/pack_100 — foram arquivados). `pack-50`/`pack-100` saíram
 * do catálogo; `pack-10` mudou de preço e de chave; `pack-30`/`pack-60` são
 * novos.
 */
export interface CreditPack { id: string; credits: number; priceBRL: number; label: string; stripeLookupKey: string; }
export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack-10", credits: 10, priceBRL: 5.9, label: "10 créditos", stripeLookupKey: "pack_10_v2" },
  { id: "pack-30", credits: 30, priceBRL: 14.9, label: "30 créditos", stripeLookupKey: "pack_30_v2" },
  { id: "pack-60", credits: 60, priceBRL: 29.9, label: "60 créditos", stripeLookupKey: "pack_60_v2" },
];
export function findPack(id: string): CreditPack | undefined { return CREDIT_PACKS.find((p) => p.id === id); }
