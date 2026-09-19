/**
 * Tela de indicação (ADR-0024, rev. 2): textos e linhas de progresso por tamanho de pacote — lógica
 * pura, sem DOM. Só assinatura e compra de pacotes de créditos recompensam; D1/D7 não existem mais.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  REFERRAL_INTRO, REFERRAL_SUBSCRIPTION_RULE, referralPackRule, packRewardsText, referralPackLine, nextTrioText, missingText,
  type ReferralPackProgress,
} from "../referral-packs";

const pack = (credits: number, reward: number, over: Partial<ReferralPackProgress> = {}): ReferralPackProgress => ({
  packId: `pack-${credits}`, credits, label: `${credits} créditos`, reward,
  purchased: 0, triosPaid: 0, bestProgress: 0, missing: 3, ...over,
});
const PACKS = [pack(10, 2), pack(30, 5), pack(60, 10)];

describe("regras em texto", () => {
  it("só GASTAR recompensa: assinatura ou pacotes de créditos; cadastro e Free não rendem nada", () => {
    expect(REFERRAL_INTRO).toMatch(/GASTA/);
    expect(REFERRAL_INTRO).toMatch(/assinando um plano ou comprando pacotes de créditos/);
    expect(REFERRAL_INTRO).toMatch(/Só se cadastrar/);
    expect(REFERRAL_INTRO).toMatch(/Free/);
    expect(REFERRAL_SUBSCRIPTION_RULE).toMatch(/Junior \+15/);
    expect(REFERRAL_SUBSCRIPTION_RULE).toMatch(/Senior \+30/);
    expect(REFERRAL_SUBSCRIPTION_RULE).toMatch(/PhD 1 mês grátis/);
  });

  it("os trios saem dos valores da API: 3 × 10 → +2 · 3 × 30 → +5 · 3 × 60 → +10", () => {
    expect(packRewardsText(PACKS)).toBe("3 × 10 → +2 · 3 × 30 → +5 · 3 × 60 → +10");
    const rule = referralPackRule(PACKS);
    expect(rule).toContain("3 × 10 → +2");
    expect(rule).toMatch(/MESMO indicado/);
    expect(rule).toMatch(/Cada tamanho conta à parte/);
    expect(rule).toMatch(/acumulado/);
    expect(rule).toMatch(/não há limite/);
  });

  it("se a API mudar o valor de um trio, o texto acompanha (sem tabela paralela na web)", () => {
    expect(packRewardsText([pack(10, 3)])).toBe("3 × 10 → +3");
  });
});

describe("progresso por tamanho de pacote", () => {
  it("nada comprado: 0 comprados, 0 trios, faltam 3 pacotes do mesmo indicado", () => {
    const l = referralPackLine(pack(10, 2));
    expect(l.title).toBe("Pacote de 10 créditos");
    expect(l.stats).toBe("0 comprados pelos indicados · 0 trios pagos (+0 créditos)");
    expect(l.next).toBe("próximo trio: faltam 3 pacotes do mesmo indicado");
  });

  it("6 comprados, 1 trio pago: mostra os créditos ganhos e quanto falta para o indicado mais adiantado", () => {
    const l = referralPackLine(pack(10, 2, { purchased: 6, triosPaid: 1, bestProgress: 2, missing: 1 }));
    expect(l.stats).toBe("6 comprados pelos indicados · 1 trio pago (+2 créditos)");
    expect(l.next).toBe("próximo trio: o indicado mais adiantado tem 2 de 3 — falta 1 pacote");
  });

  it("créditos do trio = trios pagos × recompensa do tamanho (60 → +10 cada)", () => {
    expect(referralPackLine(pack(60, 10, { purchased: 9, triosPaid: 3 })).stats).toBe("9 comprados pelos indicados · 3 trios pagos (+30 créditos)");
    expect(referralPackLine(pack(30, 5, { purchased: 1, triosPaid: 0, bestProgress: 1, missing: 2 })).stats).toBe("1 comprado pelos indicados · 0 trios pagos (+0 créditos)");
  });

  it("singular e plural de 'falta'/'faltam'", () => {
    expect(missingText(1)).toBe("falta 1 pacote");
    expect(missingText(2)).toBe("faltam 2 pacotes");
    expect(missingText(3)).toBe("faltam 3 pacotes");
    expect(nextTrioText(pack(10, 2, { bestProgress: 1, missing: 2 }))).toBe("próximo trio: o indicado mais adiantado tem 1 de 3 — faltam 2 pacotes");
  });
});

describe("D1/D7 saíram da tela e do tipo", () => {
  const web = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));

  it("nenhum texto/contador de D1 ou D7 (nem 'em breve' de indicação) na tela do Perfil, no cliente da API ou nos textos", () => {
    for (const f of ["app/app/profile/page.tsx", "lib/api.ts", "lib/referral-packs.ts"]) {
      const src = readFileSync(web(f), "utf8");
      // comentários que EXPLICAM o cancelamento podem citar "D1/D7"; o que não pode existir é campo/contador/texto ativo
      const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(code, f).not.toMatch(/\bd1\b|\bd7\b/);
      expect(code, f).not.toMatch(/"D1"|"D7"|Retorno em D1|em breve/);
    }
  });
});
