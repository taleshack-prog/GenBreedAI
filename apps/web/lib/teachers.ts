/**
 * Conteúdo da página pública `/professores` (ADR-0040) — FONTE ÚNICA do texto visível, do JSON-LD (FAQPage) e do trecho do
 * `/llms.txt`. Funções/dados PUROS (sem JSX), no mesmo padrão de `lib/about.ts`.
 *
 * Cada roteiro usa um casal de FUNDADORES reais de `felis-catus` (plano Free, ADR-0016) e cada número declarado aqui é
 * recalculado no motor por `lib/__tests__/teachers.test.ts` (enumerateOffspring/materializeCross/wrightF sobre os
 * `founderSeeds()` da API). Mudou genótipo de fundador ou regra do motor? O teste falha antes de a página mentir.
 *
 * Fontes: docs/gene-bank/felinos-genetica.md (loci, "Portadores ocultos por fundador", "Fundadores de COR" e o casal da
 * herança cruzada), ADR-0013 (X), ADR-0025 (1ª gestação de 5 min), ADR-0036 (fundadores de cor), fertility.ts (F > 0,15).
 *
 * De propósito FORA dos roteiros: o comprimento do pelo (Fl). No motor `Fl^l` (longo) é dominante; no gato real o pelo longo
 * é recessivo — ensinar com ele passaria a regra trocada (registrado no ADR-0040). Também fora: espécies dos planos pagos,
 * porque o professor precisa poder repetir tudo na conta gratuita.
 */
import { FIRST_GESTATION_MINUTES } from "./gestation";
import { ABOUT_ORIGIN, ABOUT_PUBLISHER, type JsonLdGraph } from "./about";

export const TEACHERS_PATH = "/professores";
export const TEACHERS_URL = `${ABOUT_ORIGIN}${TEACHERS_PATH}`;
export const TEACHERS_TITLE = "GenBreedAI para professores — roteiros de aula de genética";
export const TEACHERS_LEAD =
  "O GenBreedAI pode ser usado em aula de genética: o professor cruza gatos na própria conta, projeta o laboratório e a turma confere no jogo a previsão que fez no papel.";
export const TEACHERS_DESCRIPTION =
  `${TEACHERS_LEAD} Quatro roteiros prontos, no plano gratuito: 3:1, dois genes, herança ligada ao X e endogamia.`;

/** Fundador usado num roteiro: id real (`founderSeeds()`), nome que o jogo mostra e sexo. */
export interface LessonParent { id: string; name: string; sex: "M" | "F" }
/** Resultado esperado: rótulo + probabilidade em % (uma casa, como a incubadora mostra). `pct` null = regra sem número. */
export interface LessonOutcome { label: string; pct: number | null }
export interface Lesson {
  id: string;
  number: number;
  title: string;
  concept: string;
  sire: LessonParent;
  dam: LessonParent;
  /** O que o professor mostra/pergunta antes de cruzar. */
  setup: string;
  /** A previsão que a turma faz no papel. */
  prediction: string;
  /** O que aparece no jogo — os números de `outcomes`. */
  inGame: string;
  outcomes: LessonOutcome[];
  /** Pergunta para fechar a aula. */
  discussion: string;
  /** Precisa de nascimento? (decide o aviso de tempo). */
  needsBirth: boolean;
}

const pct = (n: number): string => `${n.toFixed(1).replace(".", ",")}%`;

export const LESSONS: readonly Lesson[] = [
  {
    id: "portador-oculto",
    number: 1,
    title: "Portador oculto: a proporção 3:1",
    concept: "Dominância completa, heterozigoto e cruzamento de dois heterozigotos (monoibridismo).",
    sire: { id: "gato-preto", name: "Gato Preto", sex: "M" },
    dam: { id: "gato-preto-femea", name: "Gato Preto", sex: "F" },
    setup: "Selecione os dois Gatos Pretos no laboratório e pergunte: dois pais pretos podem ter um filhote que não é preto? Depois abra o genótipo de cada um: os dois são A/a no gene do melanismo, em que A (escuro) é dominante sobre a.",
    prediction: "No quadro de Punnett 2×2 saem AA, Aa, Aa e aa: três filhotes escuros para um em que o padrão do pelo aparece por inteiro.",
    inGame: "O laboratório desenha o mesmo quadro, e a incubadora lista as duas descrições com a probabilidade exata:",
    outcomes: [
      { label: "melanístico (escuro)", pct: 75 },
      { label: "não-melanístico (padrão visível)", pct: 25 },
    ],
    discussion: "O alelo a estava nos dois pais sem aparecer. Por que um em cada quatro filhotes o mostra, e por que isso não quer dizer que de quatro filhotes um será assim?",
    needsBirth: false,
  },
  {
    id: "dois-genes",
    number: 2,
    title: "Dois genes ao mesmo tempo: 1:1:1:1 e a regra do produto",
    concept: "Segregação independente e multiplicação de probabilidades (di e triibridismo).",
    sire: { id: "gato-abissinio-azul", name: "Abissínio Azul", sex: "M" },
    dam: { id: "gato-abissinio-sorrel", name: "Abissínio Sorrel", sex: "F" },
    setup: "Mostre dois genes no genótipo. Cor (B): o macho é B/bˡ e a fêmea bˡ/bˡ, em que B (preto) domina bˡ (canela). Diluição (D): o macho é d/d e a fêmea D/d, em que D (denso) domina d (diluído).",
    prediction: "Cada gene dá metade e metade, e os dois são independentes: quatro cores de 25% cada (preto, preto diluído, canela e canela diluída).",
    inGame: "Na incubadora os números não são 25%, porque um terceiro gene também segrega: o fundo da pelagem (Bd). Os dois pais são Bdᵃ/Bdᵈ, então 3/4 dos filhotes saem com fundo âmbar e 1/4 com fundo dourado. Cada cor com fundo âmbar vale 25% × 75%:",
    outcomes: [
      { label: "cada uma das 4 cores com fundo âmbar", pct: 18.75 },
      { label: "cada uma das 4 cores com fundo dourado", pct: 6.25 },
    ],
    discussion: "A incubadora mostra só as 6 descrições mais prováveis. Quais são as duas que faltam, e quanto elas somam com as outras seis?",
    needsBirth: false,
  },
  {
    id: "ligada-ao-x",
    number: 3,
    title: "Herança ligada ao X: a gata tartaruga",
    concept: "Gene no cromossomo X, macho hemizigoto, mosaico por inativação do X e herança cruzada.",
    sire: { id: "gato-tartaruga-macho", name: "Gato Preto (linhagem Tartaruga)", sex: "M" },
    dam: { id: "gato-laranja-femea", name: "Gato Laranja", sex: "F" },
    setup: "O gene do laranja (O) fica no cromossomo X. O macho tem um X só: este carrega o (não-laranja). A fêmea tem dois X, os dois com O (laranja).",
    prediction: "Toda filha recebe o X do pai (o) e um X da mãe (O): sai O/o, o mosaico tartaruga. Todo filho recebe o X só da mãe: sai laranja. O filho puxa a mãe, a filha mistura os dois.",
    inGame: "Cada descrição da incubadora já vem com o sexo sorteado. Confira em todas, no campo O:",
    outcomes: [
      { label: "fêmeas: mosaico (tartaruga)", pct: null },
      { label: "machos: laranja", pct: null },
    ],
    discussion: `Por que quase toda gata tartaruga é fêmea? Para ver o retrato, gestar uma das descrições: a primeira gestação de uma conta leva ${FIRST_GESTATION_MINUTES} minutos, o que cabe na aula, e o filhote nascido é usado no roteiro 4.`,
    needsBirth: true,
  },
  {
    id: "endogamia",
    number: 4,
    title: "Endogamia e o coeficiente de Wright",
    concept: "Parentesco, coeficiente de endogamia F e depressão endogâmica.",
    sire: { id: "gato-tartaruga-macho", name: "Gato Preto (linhagem Tartaruga)", sex: "M" },
    dam: { id: "gato-laranja-femea", name: "Gato Laranja", sex: "F" },
    setup: "Use o filhote que nasceu no roteiro 3. Se for fêmea, selecione-a com o pai; se for macho, com a mãe. Antes de cruzar, peça à turma para calcular F com F = Σ (½)^(n₁+n₂+1) · (1 + F_A).",
    prediction: "Pai e filha têm um ancestral comum (o próprio pai), a uma geração de distância: F = (½)² = 0,25. Pais sem parentesco dão F = 0.",
    inGame: "O laboratório mostra o coeficiente de endogamia do casal assim que os dois são escolhidos, antes de cruzar:",
    outcomes: [
      { label: "filhote × pai ou mãe", pct: 25 },
      { label: "os dois fundadores do roteiro 3", pct: 0 },
    ],
    discussion: "No jogo, acima de F = 0,15 a fertilidade do filhote cai. Por que criadores evitam cruzar parentes, e o que isso tem a ver com o tigre-branco dos zoológicos?",
    needsBirth: true,
  },
];

/** Texto de cada resultado como aparece na página: "rótulo: 18,8%" (F do roteiro 4 em decimal: "F = 0,25"). */
export function outcomeText(l: Lesson, o: LessonOutcome): string {
  if (o.pct === null) return o.label;
  if (l.id === "endogamia") return `${o.label}: F = ${(o.pct / 100).toFixed(2).replace(".", ",")}`;
  return `${o.label}: ${pct(o.pct)}`;
}

export interface TeachersSection { id: string; heading: string; paragraphs: string[] }

export function teachersIntro(): TeachersSection[] {
  return [
    {
      id: "como-usar",
      heading: "Como usar em sala",
      paragraphs: [
        "Os roteiros foram pensados para o professor conduzir com a própria conta, com a tela projetada; os alunos fazem a previsão no papel antes de cada cruzamento. Todos usam gatos domésticos, que estão no plano gratuito.",
        `Cruzar é ilimitado e não gasta nada: a incubadora devolve até 6 descrições de filhote, cada uma com a probabilidade calculada. Os roteiros 1 e 2 não precisam de nascimento. O roteiro 3 termina com um nascimento: a primeira gestação de uma conta leva ${FIRST_GESTATION_MINUTES} minutos, e no plano gratuito há um nascimento a cada 7 dias.`,
        "Para cada casal o laboratório mostra o genótipo dos dois pais, o quadro de Punnett com a porcentagem de cada combinação (até dois genes por vez) e o coeficiente de endogamia do casal.",
      ],
    },
    {
      id: "o-que-simplifica",
      heading: "O que o jogo simplifica",
      paragraphs: [
        "Os genes do jogo são modelos de genes reais de felinos, simplificados para caber num cruzamento. A juba, por exemplo, depende de vários genes na natureza e aqui é um gene só, que nunca aparece na fêmea.",
        "Casos raros ficam de fora: o macho tartaruga de verdade existe (com dois cromossomos X e um Y), mas o jogo não o produz.",
      ],
    },
  ];
}

export const TEACHERS_CONTACT =
  "Quer usar com a turma inteira, com conta para cada aluno? Escreva para o contato no rodapé desta página.";

export interface TeachersFaq { question: string; answer: string }

export function teachersFaq(): TeachersFaq[] {
  const [como] = teachersIntro();
  return [
    { question: "Dá para usar o GenBreedAI em aula de genética?", answer: `Sim. ${TEACHERS_LEAD}` },
    { question: "Precisa pagar para usar os roteiros?", answer: "Não. Todos usam gatos domésticos, que estão no plano gratuito." },
    { question: "Os alunos precisam criar conta?", answer: como!.paragraphs[0]! },
    {
      question: "Quais conteúdos de genética os roteiros cobrem?",
      answer: LESSONS.map((l) => `${l.title}: ${l.concept}`).join(" "),
    },
  ];
}

export function buildTeachersJsonLd(): JsonLdGraph {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "@id": `${TEACHERS_URL}#faq`,
        url: TEACHERS_URL,
        inLanguage: "pt-BR",
        publisher: { "@type": "Organization", name: ABOUT_PUBLISHER.name, url: ABOUT_PUBLISHER.url },
        mainEntity: teachersFaq().map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      },
    ],
  };
}

/** Linha de casal como aparece na página: "Gato Preto (macho) × Gato Preto (fêmea)". */
export function coupleText(l: Lesson): string {
  return `${l.sire.name} (macho) × ${l.dam.name} (fêmea)`;
}

/** Todo o texto visível da página, em uma string (o que o teste compara contra o JSON-LD). */
export function teachersVisibleText(): string {
  const parts: string[] = [TEACHERS_TITLE, TEACHERS_LEAD];
  for (const s of teachersIntro()) parts.push(s.heading, ...s.paragraphs);
  for (const l of LESSONS) {
    parts.push(l.title, l.concept, coupleText(l), l.setup, l.prediction, l.inGame, ...l.outcomes.map((o) => outcomeText(l, o)), l.discussion);
  }
  for (const f of teachersFaq()) parts.push(f.question, f.answer);
  parts.push(TEACHERS_CONTACT);
  return parts.join("\n");
}
