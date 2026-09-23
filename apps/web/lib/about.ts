/**
 * Conteúdo da página pública `/o-que-e` — FONTE ÚNICA do texto visível E do JSON-LD (FAQPage + SoftwareApplication).
 * Funções/dados PUROS (sem JSX/DOM), para o teste poder conferir que tudo que o JSON-LD declara existe no texto da página.
 *
 * Cada fato vem do código ou dos docs (nada inventado):
 *  - preços/limites: `lib/plans.ts` (importado, nunca digitado aqui);
 *  - espécies/raças: `@genbreedai/shared` (SPECIES_INFO, BREEDS, DOG_BREEDS) + o pool por tier de `plans.ts`/ADR-0016;
 *  - motor: docs/gene-bank/*.md, packages/engine e ADRs 0002, 0013–0018, 0012/0014 (ver comentários por item).
 * Regra de manutenção: fato novo entra aqui SÓ com fonte; espécie/recurso não implementado NUNCA entra.
 */
import { BREEDS, DOG_BREEDS, SPECIES_INFO } from "@genbreedai/shared";
import { PLANS, fmtBRL, type PlanInfo } from "./plans";
// ADR-0021/0025: prazos vêm da tabela da web (espelho de apps/api/src/incubator/gestation-time.ts, com teste de igualdade).
import { FIRST_GESTATION_MINUTES, GESTATION_MIN_HOURS, GESTATION_MAX_HOURS } from "./gestation";

export const ABOUT_PATH = "/o-que-e";
export const ABOUT_ORIGIN = "https://genbreed.com.br";
export const ABOUT_URL = `${ABOUT_ORIGIN}${ABOUT_PATH}`;
/** Imagem que já existe em `public/` (a mesma do hero e do fallback de `/f/[id]`); dimensões não declaradas de propósito. */
export const ABOUT_OG_IMAGE = `${ABOUT_ORIGIN}/hero-tigre-albino.jpg`;
export const ABOUT_TITLE = "O que é o GenBreedAI — simulador de genética animal online";

/** Primeira frase da página e da meta description: já responde "existe simulador de genética online?". */
export const ABOUT_LEAD = "O GenBreedAI é um simulador de genética animal jogável, no navegador, com herança mendeliana real.";
export const ABOUT_DESCRIPTION =
  `${ABOUT_LEAD} Cruze gatos, felinos selvagens e cães e veja o que a genética permite nascer.`;

export interface AboutItem { title?: string; text: string }
export interface AboutSection {
  id: string;
  /** Subtítulo (h2). */
  heading: string;
  paragraphs?: string[];
  items?: AboutItem[];
}
export interface AboutFaq { question: string; answer: string }

// ── espécies (derivadas do catálogo — nada digitado) ─────────────────────────────────────────────────────────────────

const wildFelineNames = (): string[] =>
  Object.values(SPECIES_INFO).filter((s) => s.poolGroup === "WILD_FELINE").map((s) => s.common);

const listPt = (xs: string[]): string => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);

const catBreeds = (): number => Object.keys(BREEDS).length;
const dogBreeds = (): number => Object.keys(DOG_BREEDS).length;

const plan = (id: PlanInfo["id"]): PlanInfo => PLANS.find((p) => p.id === id)!;

/** Uma linha de preço por plano, direto de `plans.ts` (mesmos textos e números do plano exibido na landing). */
export function planLine(p: PlanInfo): string {
  const price = p.month === 0
    ? "R$ 0"
    : `${fmtBRL(p.month)} por mês ou ${fmtBRL(p.year ?? p.month * 11)} por ano`;
  return `${price} — ${p.crosses}; ${p.images}.`;
}

// ── seções (na ordem pedida) ─────────────────────────────────────────────────────────────────────────────────────────

const ENGINE_ITEMS: AboutItem[] = [
  // dominância: docs/gene-bank/caninos-genetica.md:18-19,32-42 e felinos-genetica.md:24-26 (loci COMPLETE/INCOMPLETE).
  { title: "Dominância completa", text: "Um alelo esconde o outro: quem carrega os dois só mostra o dominante, mas ainda pode passar o escondido adiante." },
  { title: "Dominância incompleta", text: "O heterozigoto sai intermediário, como o crânio e as orelhas dos cães e a juba dos felinos." },
  // codominância: único locus CODOMINANT = O (laranja) — packages/engine/src/data/feline.ts:66; fêmea O/o = mosaico (felinos-genetica.md:45).
  { title: "Codominância", text: "Os dois alelos aparecem juntos: na gata, o laranja e o não-laranja dão o mosaico tartaruga." },
  // epistasia: feline.ts:70-71 (branco dominante mascara cor e padrão); canine.ts:59 (H sobre M = arlequim).
  { title: "Epistasia", text: "Um gene manda em outro: o branco dominante do gato esconde cor e padrão, e no cão o arlequim vem de um gene que age sobre o merle." },
  // ligada ao sexo: ADR-0013 (O ligado ao X, macho hemizigoto); ADR-0017 (juba limitada ao sexo, fêmea nunca expressa).
  { title: "Herança ligada ao sexo", text: "O laranja do gato fica no cromossomo X (o macho tem um só alelo), e a juba só aparece no macho — a leoa a transmite, mas nunca a mostra." },
  // letais: canine.ts:61 (duplo-merle) — felinos não têm letal declarado (feline.ts:84).
  { title: "Letais em homozigose", text: "Alguns pares de alelos não sobrevivem: nos cães, o duplo-merle (dois alelos merle) é letal." },
  // Wright: packages/engine/src/wright.ts:80 (F sobre o pedigree); fertility.ts:9-11 (depressão endogâmica F > 0,15).
  { title: "Coeficiente de Wright", text: "A endogamia é calculada de verdade a partir da genealogia; acima de F = 0,15 a fertilidade sofre penalidade." },
  // Haldane: fertility.ts:4-8 e ADR-0015; ADR-0018 (macho de ascendência mista estéril em qualquer geração).
  { title: "Fertilidade pela regra de Haldane", text: "Em cruzamentos entre espécies o macho híbrido nasce estéril e a fêmea com fertilidade reduzida." },
  // efeito materno: ADR-0014 (Walton & Hammond 1938) — QTL porte.
  { title: "Efeito materno", text: "O porte do filhote depende também da mãe (ambiente uterino), separado da herança dos genes." },
  // QTL: cross.ts:322-324 (porte, vigor, beleza, temperamento, rosetas) — ADR-0012.
  { title: "QTL com herdabilidade", text: "Traços contínuos (porte, vigor, beleza, temperamento e rosetas) herdam a média dos pais mais uma variação, escalada pela herdabilidade de cada traço." },
];

export function aboutSections(): AboutSection[] {
  const wild = wildFelineNames();
  return [
    {
      id: "o-que-e",
      heading: "O que é o GenBreedAI", // h1 da página (subtítulo do bloco 1)
      paragraphs: [
        ABOUT_LEAD,
        "Você escolhe dois animais, cruza e o motor calcula os genótipos e fenótipos possíveis dos filhotes com regras de genética de verdade. Dá para tentar fixar uma característica ao longo de gerações — ou falhar tentando.",
      ],
    },
    {
      id: "para-quem-serve",
      heading: "Para quem serve",
      items: [
        { title: "Curioso", text: "Quer ver na prática como a herança funciona, com retratos dos animais, sem precisar ler um livro de genética." },
        { title: "Criador", text: "Gosta de montar linhagens, escolher o que nasce e acompanhar a genealogia de cada animal." },
        { title: "Quem quer ver a herança mendeliana funcionando", text: "Analisa tabelas de dominância, coeficientes de endogamia e traços quantitativos em cada cruzamento." },
      ],
    },
    {
      id: "especies",
      heading: "Quais espécies existem hoje",
      items: [
        { title: "Free", text: `Gatos domésticos (Felis catus), com ${catBreeds()} raças, cruzando entre raças.` },
        { title: "Junior", text: `Além dos gatos, felinos selvagens: ${listPt(wild)}. Também cruzamentos entre espécies.` },
        { title: "Senior", text: `Além dos anteriores: cães, com ${dogBreeds()} raças.` },
        { title: "PhD", text: plan("PHD").pool + "." },
      ],
    },
    {
      id: "calcula",
      heading: "O que calcula de verdade",
      items: ENGINE_ITEMS,
    },
    {
      id: "nao-e-bichinho-virtual",
      heading: "Por que não é um jogo de bichinho virtual",
      paragraphs: [
        "A genética é calculada: as opções de cada cruzamento e as probabilidades vêm da conta mendeliana (quadro de Punnett), não de uma tabela de sorte. O sorteio só escolhe entre resultados que a genética permite, sob uma semente determinística.",
        "O motor é determinístico: com os mesmos pais, o mesmo método e a mesma semente, o resultado é sempre o mesmo. No jogo cada novo cruzamento usa uma semente nova, por isso cruzar de novo mostra outras possibilidades.",
        "As probabilidades não mudam com o plano pago: o motor nem recebe o plano do jogador. O plano define limites e acesso (nascimentos por período, espécies disponíveis), nunca o resultado genético.",
      ],
    },
    {
      id: "preco",
      heading: "Quanto custa",
      paragraphs: [
        "Há um plano gratuito e três pagos. O plano anual equivale a 11 meses: 1 mês grátis.",
      ],
      items: PLANS.map((p) => ({ title: p.label, text: planLine(p) })),
    },
    {
      id: "na-pratica",
      heading: "Como funciona na prática",
      items: [
        { title: "1. Cruzar", text: `Escolha dois animais. Cruzar é ilimitado em todos os planos.` },
        { title: "2. Escolher o fenótipo", text: plan("FREE").tools + "." },
        { title: "3. Gestar", text: `Gestar usa um nascimento do seu plano. A primeira gestação da conta leva ${FIRST_GESTATION_MINUTES} minutos; as seguintes levam de ${GESTATION_MIN_HOURS}h a ${GESTATION_MAX_HOURS}h, conforme a raridade do filhote.` },
        { title: "4. Nascer", text: "Terminada a gestação, o filhote nasce com um retrato gerado por IA e fica no seu Gene Bank." },
      ],
    },
  ];
}

// ── FAQ (perguntas de verdade; respostas = trechos do texto visível) ─────────────────────────────────────────────────

const sectionById = (id: string): AboutSection => aboutSections().find((s) => s.id === id)!;

export function aboutFaq(): AboutFaq[] {
  const especies = sectionById("especies").items!;
  const engine = sectionById("calcula").items!;
  const preco = sectionById("preco").items!;
  return [
    {
      question: "Existe simulador de genética online?",
      answer: `Sim. ${ABOUT_LEAD}`,
    },
    {
      question: "O que o GenBreedAI calcula de verdade?",
      answer: engine.map((i) => `${i.title}: ${i.text}`).join(" "),
    },
    {
      question: "Quais espécies existem no GenBreedAI?",
      answer: especies.map((i) => `${i.title}: ${i.text}`).join(" "),
    },
    {
      question: "O GenBreedAI é um jogo de bichinho virtual?",
      answer: "Não. " + sectionById("nao-e-bichinho-virtual").paragraphs![0]!,
    },
    {
      question: "O plano pago muda a probabilidade da genética?",
      answer: sectionById("nao-e-bichinho-virtual").paragraphs![2]!,
    },
    {
      question: "Quanto custa o GenBreedAI?",
      answer: `Há um plano gratuito e três pagos. ${preco.map((i) => `${i.title}: ${i.text}`).join(" ")}`,
    },
    {
      question: "Como funciona um cruzamento no GenBreedAI?",
      answer: sectionById("na-pratica").items!.map((i) => `${i.title}. ${i.text}`).join(" "),
    },
  ];
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface JsonLdGraph { "@context": "https://schema.org"; "@graph": Record<string, unknown>[] }

/**
 * FAQPage + SoftwareApplication num só `@graph`. Tudo o que é declarado aqui está no texto visível: nome, descrição (= lead),
 * `featureList` (= títulos da seção "O que calcula de verdade"), `offers` (= linhas de preço) e as perguntas/respostas do FAQ.
 */
export function buildAboutJsonLd(): JsonLdGraph {
  const features = sectionById("calcula").items!.map((i) => i.title!);
  const offers = PLANS.flatMap((p) => {
    if (p.month === 0) return [{ "@type": "Offer", name: `${p.label} (gratuito)`, price: "0", priceCurrency: "BRL" }];
    return [
      { "@type": "Offer", name: `${p.label} (mensal)`, price: p.month.toFixed(2), priceCurrency: "BRL" },
      { "@type": "Offer", name: `${p.label} (anual)`, price: (p.year ?? p.month * 11).toFixed(2), priceCurrency: "BRL" },
    ];
  });
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${ABOUT_URL}#app`,
        name: "GenBreedAI",
        url: ABOUT_ORIGIN,
        description: ABOUT_LEAD,
        applicationCategory: "GameApplication", // visível: "jogável" (ABOUT_LEAD)
        operatingSystem: "Web", // visível: "no navegador" (ABOUT_LEAD)
        inLanguage: "pt-BR",
        featureList: features,
        offers,
      },
      {
        "@type": "FAQPage",
        "@id": `${ABOUT_URL}#faq`,
        url: ABOUT_URL,
        inLanguage: "pt-BR",
        mainEntity: aboutFaq().map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      },
    ],
  };
}

/** Serialização segura para `<script type="application/ld+json">` (evita fechar a tag por engano). */
export function serializeJsonLd(data: JsonLdGraph): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Todo o texto visível da página, em uma string (o que o teste compara contra o JSON-LD). */
export function aboutVisibleText(): string {
  const parts: string[] = [ABOUT_TITLE];
  for (const s of aboutSections()) {
    parts.push(s.heading, ...(s.paragraphs ?? []));
    for (const i of s.items ?? []) parts.push(...(i.title ? [i.title] : []), i.text);
  }
  for (const f of aboutFaq()) parts.push(f.question, f.answer);
  // Preços "R$ x,xx" aparecem nas linhas de plano (fmtBRL): o JSON-LD os declara em número e o teste os reconstrói.
  return parts.join("\n");
}
