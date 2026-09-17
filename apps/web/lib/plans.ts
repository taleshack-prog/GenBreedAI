/** Catálogo de planos — fonte única usada pela landing (/) e pelo pós-cadastro (/signup). */
export type PlanId = "FREE" | "JUNIOR" | "SENIOR" | "PHD";
export type PlanInterval = "month" | "year";

export interface PlanInfo {
  id: PlanId; label: string; month: number; year: number | null;
  crosses: string; images: string; tools: string; pool: string; accent: string; featured?: boolean;
}

// pool: texto alinhado ao ADR-0016 (docs/adr/0016-pool-de-especies-por-tier.md)
// — FREE=DOMESTIC_CAT só intraespécie; JUNIOR=+WILD_FELINE e interespecífico
// entre felinos; SENIOR=+DOG (todo o catálogo canino atual); PHD não tem
// espécie exclusiva além do Senior (mesmo pool completo) — "grandes animais"
// NÃO tem fundador nem poolGroup no catálogo ainda (tier-access.ts,
// FAMILY_MIN_TIER "large"=3 é só um placeholder de tipo), então nem eles nem
// qualquer outra espécie futura entram no texto do plano.
// crosses/images: ADR-0019 — cota de cruzamento (rolling7d no FREE/JUNIOR,
// day em America/Sao_Paulo no SENIOR/PHD) e retratos EXTRAS por mês (todo
// cruzamento, em qualquer plano, já inclui 1 retrato — não é mais parte da
// cota de imagens).
export const PLANS: PlanInfo[] = [
  { id: "FREE", label: "Free", month: 0, year: null, crosses: "1 cruzamento a cada 7 dias", images: "Retrato em todo cruzamento", tools: "Sorteio de fenótipo", pool: "Gatos domésticos (Felis catus) — cruzamentos entre raças", accent: "#9E9E9E" },
  { id: "JUNIOR", label: "Junior", month: 19.9, year: 218.9, crosses: "3 cruzamentos a cada 7 dias", images: "Retrato em todo cruzamento", tools: "Sorteio de fenótipo", pool: "+ Felinos selvagens (onça, leão, tigre, serval…) e cruzamentos entre espécies", accent: "#00F0FF" },
  { id: "SENIOR", label: "Senior", month: 39.9, year: 438.9, crosses: "1 por dia", images: "Retrato em todo cruzamento + 15 para regenerar", tools: "Escolhe entre 6 opções de fenótipo", pool: "+ Caninos", accent: "#BF00FF", featured: true },
  { id: "PHD", label: "PhD", month: 89.9, year: 988.9, crosses: "3 por dia", images: "Retrato em todo cruzamento + 20 para regenerar", tools: "Escolhe entre 12 opções de fenótipo", pool: "Todas as espécies do catálogo (gatos, felinos selvagens e cães)", accent: "#F5C542" },
];

export function fmtBRL(v: number): string {
  return v === 0 ? "R$ 0" : `R$ ${v.toFixed(2).replace(".", ",")}`;
}

export function isPaidPlan(id: PlanId): id is Exclude<PlanId, "FREE"> {
  return id !== "FREE";
}
