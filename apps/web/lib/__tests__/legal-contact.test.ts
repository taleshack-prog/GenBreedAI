/**
 * Páginas legais: o contato para exercer direitos (LGPD) e pedir reembolso é o e-mail da Hack Tech Farm, o mesmo do rodapé
 * (components/EcosystemFooter.tsx). O texto provisório "[E-MAIL DE CONTATO]" ficou em produção até 26/11/2026 — não volta.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const web = (rel: string) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");
const EMAIL = "hacktechfarm@proton.me";

describe("contato das páginas legais", () => {
  it.each(["app/privacidade/page.tsx", "app/reembolso/page.tsx", "app/termos/page.tsx"])("%s não tem e-mail provisório", (f) => {
    expect(web(f)).not.toMatch(/\[E-?MAIL[^\]]*\]/i);
  });

  it.each(["app/privacidade/page.tsx", "app/reembolso/page.tsx"])("%s indica o e-mail da Hack Tech Farm, com link", (f) => {
    expect(web(f)).toContain(`href="mailto:${EMAIL}"`);
  });

  it("a política de privacidade não tem nenhum campo provisório entre colchetes (controlador, CNPJ, endereço)", () => {
    expect(web("app/privacidade/page.tsx")).not.toMatch(/\[[A-ZÀ-Ú][A-ZÀ-Ú -]{2,}\]/);
    expect(web("app/privacidade/page.tsx")).toContain("Hack Tech Farm");
  });

  it("é o mesmo e-mail do rodapé", () => {
    const [user, domain] = EMAIL.split("@");
    expect(web("components/EcosystemFooter.tsx")).toContain(`["${user}", "${domain}"]`);
  });
});
