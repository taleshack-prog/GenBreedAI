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
// crosses/images: ADR-0020 — cruzar é LIVRE (sem cota nenhuma; o limite de
// 60/hora é só proteção técnica anti-abuso, invisível no jogo, nunca
// aparece como vantagem de plano). Quem tem cota agora é REVELAR (gerar o
// retrato de uma descrição) — rolling7d no FREE/JUNIOR, day em
// America/Sao_Paulo no SENIOR/PHD — e "N para regenerar" é a cota mensal
// de retratos EXTRAS (regenerar um já revelado), separada da revelação.
// tools: nº de descrições de fenótipo por cruzamento (enumerateOffspring) —
// não é mais "sorteio vs escolher": todo tier vê e decide sobre todas as
// descrições na incubadora, só a QUANTIDADE por cruzamento muda.
export const PLANS: PlanInfo[] = [
  { id: "FREE", label: "Free", month: 0, year: null, crosses: "Cruzamentos ilimitados", images: "Revelações: 1 a cada 7 dias", tools: "6 descrições por cruzamento", pool: "Gatos domésticos (Felis catus) — cruzamentos entre raças", accent: "#9E9E9E" },
  { id: "JUNIOR", label: "Junior", month: 19.9, year: 218.9, crosses: "Cruzamentos ilimitados", images: "Revelações: 3 a cada 7 dias", tools: "6 descrições por cruzamento", pool: "+ Felinos selvagens (onça, leão, tigre, serval…) e cruzamentos entre espécies", accent: "#00F0FF" },
  { id: "SENIOR", label: "Senior", month: 39.9, year: 438.9, crosses: "Cruzamentos ilimitados", images: "Revelações: 1 por dia + 15 para regenerar", tools: "6 descrições por cruzamento", pool: "+ Caninos", accent: "#BF00FF", featured: true },
  { id: "PHD", label: "PhD", month: 89.9, year: 988.9, crosses: "Cruzamentos ilimitados", images: "Revelações: 3 por dia + 20 para regenerar", tools: "12 descrições por cruzamento", pool: "Todas as espécies do catálogo (gatos, felinos selvagens e cães)", accent: "#F5C542" },
];

export function fmtBRL(v: number): string {
  return v === 0 ? "R$ 0" : `R$ ${v.toFixed(2).replace(".", ",")}`;
}

export function isPaidPlan(id: PlanId): id is Exclude<PlanId, "FREE"> {
  return id !== "FREE";
}
