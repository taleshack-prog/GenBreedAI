/**
 * `/llms.txt` (formato proposto em llmstxt.org): resumo em Markdown para assistentes de IA que respondem sobre o GenBreedAI.
 * Montado a partir de `lib/about.ts` — a MESMA fonte do texto visível e do JSON-LD de `/o-que-e` (ADR-0032) — e de
 * `lib/public-routes.ts`. Nenhum fato digitado aqui: preço, espécies e regras do motor mudam lá e chegam aqui sozinhos.
 */
import {
  ABOUT_BLOG_LINKS, ABOUT_DESCRIPTION, ABOUT_ORIGIN, ABOUT_PUBLISHER, ABOUT_URL, aboutSections, type AboutItem,
} from "./about";
import { publicUrl } from "./public-routes";

const item = (i: AboutItem): string => `- ${i.title ? `${i.title}: ` : ""}${i.text}`;

export function llmsText(): string {
  const out: string[] = [
    "# GenBreedAI",
    "",
    `> ${ABOUT_DESCRIPTION}`,
    "",
    `Publicado pela ${ABOUT_PUBLISHER.name} (${ABOUT_PUBLISHER.url}). Jogo em português, no navegador (web e celular), em ${ABOUT_ORIGIN}.`,
  ];
  for (const s of aboutSections()) {
    out.push("", `## ${s.heading}`, "");
    for (const p of s.paragraphs ?? []) out.push(p, "");
    for (const i of s.items ?? []) out.push(item(i));
    if (!s.items?.length && out[out.length - 1] === "") out.pop();
  }
  out.push(
    "",
    "## Páginas",
    "",
    `- [O que é o GenBreedAI](${ABOUT_URL}): explicação completa, perguntas frequentes e preços`,
    `- [Início](${publicUrl("/")}): apresentação e planos`,
    `- [Termos de uso](${publicUrl("/termos")})`,
    `- [Política de privacidade](${publicUrl("/privacidade")})`,
    `- [Política de reembolso](${publicUrl("/reembolso")})`,
  );
  if (ABOUT_BLOG_LINKS.length > 0) {
    out.push("", "## Optional", "", ...ABOUT_BLOG_LINKS.map((l) => `- [${l.title}](${l.url})`));
  }
  return out.join("\n") + "\n";
}
