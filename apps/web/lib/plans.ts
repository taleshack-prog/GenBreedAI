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
// crosses/images: ADR-0021 (era ADR-0020) — cruzar é LIVRE (sem cota
// nenhuma; o limite de 60/hora é só proteção técnica anti-abuso, invisível
// no jogo, nunca aparece como vantagem de plano). Quem tem vaga agora é o
// NASCIMENTO — GESTAR consome a vaga, o retrato só é gerado quando a
// gestação termina e o filhote NASCE — rolling7d no FREE/JUNIOR, day em
// America/Sao_Paulo no SENIOR/PHD. Texto exato pedido nesta rodada (sem
// prefixo "Nascimentos:" — a rodada anterior tinha esse prefixo, este
// pedido pediu só a frase solta).
//
// tools: nº de descrições de fenótipo por cruzamento (enumerateOffspring) —
// CONFERIDO contra o código desta rodada (cross.service.ts#incubate,
// optionCount()): 6 pra FREE/JUNIOR/SENIOR, 12 pro PHD — contagem batia e
// continua batendo, não mudou nada aqui.
//
// DISCREPÂNCIA REPORTADA (não corrigida, por não inventar regra que o
// código não impõe): o pedido descreve "fenótipo sorteado no Free e Junior"
// vs. "escolhe entre N opções" no Senior/PhD. O código ATUAL não tem mais
// essa trava — `CrossService.incubate()` (usado por POST /cross desde a
// ADR-0020/incubadora) materializa as N opções pra TODO tier na incubadora,
// e `IncubatorService.gestate()` não tem nenhum gate de "canChoose": todo
// tier pode gestar QUALQUER uma das suas N descrições, livremente. Não há
// sorteio que restrinja Free/Junior a uma única opção pré-escolhida. Por
// isso o campo `tools` abaixo continua descrevendo só a CONTAGEM (fato
// verificável), sem alegar "sorteio" nem "você escolhe" pra nenhum tier —
// ver docs/adr/0020-incubadora-e-cota-de-revelacao.md pro histórico dessa
// mudança de comportamento (era sorteio/escolha explícitos na ADR-0019).
export const PLANS: PlanInfo[] = [
  { id: "FREE", label: "Free", month: 0, year: null, crosses: "Cruzamentos ilimitados", images: "1 nascimento a cada 7 dias", tools: "6 descrições por cruzamento", pool: "Gatos domésticos (Felis catus) — cruzamentos entre raças", accent: "#9E9E9E" },
  { id: "JUNIOR", label: "Junior", month: 19.9, year: 218.9, crosses: "Cruzamentos ilimitados", images: "3 nascimentos a cada 7 dias", tools: "6 descrições por cruzamento", pool: "+ Felinos selvagens (onça, leão, tigre, serval…) e cruzamentos entre espécies", accent: "#00F0FF" },
  { id: "SENIOR", label: "Senior", month: 39.9, year: 438.9, crosses: "Cruzamentos ilimitados", images: "1 nascimento por dia", tools: "6 descrições por cruzamento", pool: "+ Caninos", accent: "#BF00FF", featured: true },
  { id: "PHD", label: "PhD", month: 89.9, year: 988.9, crosses: "Cruzamentos ilimitados", images: "3 nascimentos por dia", tools: "12 descrições por cruzamento", pool: "Todas as espécies do catálogo (gatos, felinos selvagens e cães)", accent: "#F5C542" },
];

/** Linha comum a todo plano (item 3 do pedido) — igual em todos, não entra em `PlanInfo` pra não duplicar 4×. */
export const GESTATION_NOTE = "Gestação de 12h a 48h conforme a raridade do filhote.";

export function fmtBRL(v: number): string {
  return v === 0 ? "R$ 0" : `R$ ${v.toFixed(2).replace(".", ",")}`;
}

export function isPaidPlan(id: PlanId): id is Exclude<PlanId, "FREE"> {
  return id !== "FREE";
}
