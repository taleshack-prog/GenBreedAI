/** Pacotes de créditos de imagem (economia — markup 2,5–3,6× sobre custo fal). */
export interface CreditPack { id: string; credits: number; priceBRL: number; label: string; }
export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack-10", credits: 10, priceBRL: 5.0, label: "10 créditos" },
  { id: "pack-50", credits: 50, priceBRL: 20.0, label: "50 créditos" },
  { id: "pack-100", credits: 100, priceBRL: 35.0, label: "100 créditos" },
];
export function findPack(id: string): CreditPack | undefined { return CREDIT_PACKS.find((p) => p.id === id); }
