# ADR-0022 — Loco S canino: dominância COMPLETA → INCOMPLETA

- **Status:** aceito · **Data:** 2026-09-18

## Contexto

O loco S (malhado branco, `S`/`s^p`) do pack CANINO (`packages/engine/src/data/
canine.ts`) era declarado com dominância **COMPLETA** (`dominanceRank:
["S","s^p"]`), então `S/s^p` (heterozigoto) expressava exatamente o mesmo
fenótipo de `S/S`: `"sólido"`. Um cão heterozigoto (portador de `s^p`, capaz de
gerar filhotes piebald com outro portador ou com um `s^p/s^p`) não tinha
NENHUM sinal visual dessa condição — indistinguível de um `S/S` que nunca
poderia gerar piebald.

Levantamento antes da mudança (packs em vigor até esta ADR):
- **Nenhum dos 47 fundadores caninos** (94 espécimes com os gêmeos; o "74"
  anterior era o total dos dois packs) era `S/s^p` — todos são `S/S` ou
  `s^p/s^p` homozigotos (`apps/api/src/specimens/in-memory.repository.ts`).
  Logo, nenhum fundador muda de fenótipo visível com esta mudança.
- 3 fixtures do motor (`packages/engine/src/__tests__/fixtures.ts`:
  `BOERPOINTER_F1`, `OMEGA_II`, `DANECOLLIE_BETA`) já usam `S: ["S","s^p"]`,
  mas nenhum golden test (`__tests__/golden/boerpointer.test.ts`,
  `danecollie.test.ts`) lê o TEXTO do fenótipo de S — só `genotypeProbability`/
  `jointGenotypeProbability` (probabilidade de alelos, indiferente à
  dominância) e `wrightF`/`cross().viable`. **Nenhum golden test muda de
  valor.**
- Em cães reais (ex.: Beagle, Boxer, Corgi), o heterozigoto do loco S
  costuma mostrar branco residual (peito, patas, ponta da cauda) — a
  dominância completa era uma simplificação que escondia essa pista real.

## Decisão

`S` no pack CANINO passa a `dominance: "INCOMPLETE"`, com
`heteroPhenotype: { "S|s^p": "branco residual" }`:

| Genótipo | Fenótipo |
|---|---|
| `S/S` | sólido (inalterado) |
| `S/s^p` | **branco residual** (peito, patas, ponta da cauda) — novo |
| `s^p/s^p` | piebald (inalterado) |

Efeitos em cadeia, todos no mesmo espírito de outros loci INCOMPLETE do pack
(`F`, `C`, `M`, `Cph`, `Ec`):
- `apps/api/src/images/prompt.ts` (`coatCanine`): novo branch
  `loci.S === "branco residual"` → `"with small white markings on chest,
  paws and tail tip"`, sem alterar os descritores de `S/S` nem `s^p/s^p`.
- `apps/web/lib/phenotype-summary.ts` (`phenoSummary`, fixed-list de rótulos
  curtos — não deriva de `.includes()`, ver comentário no próprio arquivo):
  novo branch `loci.S === "branco residual"` → `"branco residual"` no
  rótulo. Sem esse branch, o novo valor cairia no `else` implícito (nada
  no rótulo) — o mesmo silêncio que `"sólido"` sempre teve, mas agora
  incorretamente também para o heterozigoto.
- Rótulo longo (genótipo cru), árvore genealógica e descrição da incubadora
  (`IncubatorDescription.phenotype.loci.S`, ADR-0020) usam `expressPhenotype()`
  direto — herdam o novo texto automaticamente, nenhuma lista fixa a tocar.
- Golden tests: **nenhum muda de valor** (ver levantamento acima).

## Consequências

- **Portadores ficam visíveis**: um cão `S/s^p` agora sinaliza no retrato e
  no texto que carrega piebald — jogador pode planejar cruzamentos de
  fixação com essa informação, igual já acontece com merle (`M/m`) e outros
  loci INCOMPLETE.
- **Retratos existentes ficam desatualizados para espécimes já nascidos com
  genótipo `S/s^p`** (ver achado do pedido, seção "Retratos a regenerar"):
  a cacheKey do retrato é function do GENÓTIPO (alelos), não do texto do
  fenótipo (`computeCacheKey`, `image.service.ts`) — trocar só a dominância
  no pack NÃO invalida a cacheKey de espécimes já existentes. Um `S/s^p` que
  já tinha retrato gerado ANTES desta ADR continua mostrando um cão "sólido"
  sem nenhuma marca branca, embora o texto do fenótipo (gerado ao vivo por
  `expressPhenotype()`) já diga "branco residual" a partir de agora — até
  alguém regenerar esse retrato especificamente (`force=true`, só o dono).
  Nenhum fundador é afetado (nenhum é `S/s^p`); o volume de espécimes de
  jogadores afetados não pôde ser determinado sem consultar o banco (fora do
  escopo desta rodada — só edição de arquivo, sem rodar comando).
- **Nenhum impacto em anti-P2W**: a mudança é de METADADO do pack (dominância
  + descritor), igual pra todo tier — não altera probabilidade nenhuma.
- **Pack FELINO não foi tocado**: tem um loco S homônimo (`S`/`s`,
  `phenotypeByAllele: {S:"bicolor", s:"sólido"}`), mas com convenção de
  dominância OPOSTA (lá `S`, não `s`, é o dominante/visível) e COM
  fundadores reais heterozigotos hoje (`gato-birmania`, `gato-ragdoll`,
  ambos `S/s` → hoje expressam `"bicolor"`). Tornar esse loco INCOMPLETE
  mudaria a aparência desses 2 fundadores (de `"bicolor"` pra um novo
  descritor intermediário) — decisão de escopo maior, deixada para uma ADR
  própria caso o time confirme que também é desejada no felino.

## Alternativas consideradas

- **Manter dominância COMPLETA e só ajustar o PROMPT/rótulo por fora
  (heurística fora do motor)**: rejeitada — violaria a fonte única de
  verdade do motor (o texto do fenótipo em si continuaria "sólido"; só a
  imagem "mentiria" mostrando manchas que o dado genético não expressa).
- **CODOMINANT em vez de INCOMPLETE**: o motor trata as duas de forma
  idêntica na prática (mesmo branch de `heteroPhenotype`, ver
  `phenotype.ts`/`punnett.ts`) — `INCOMPLETE` foi escolhido por ser o rótulo
  já usado nos outros loci de padrão/mancha do pack canino (`F`, `C`, `M`).
- **Migrar todos os `S/s^p` existentes no banco para uma cacheKey nova de
  uma vez (regeneração em massa)**: fora de escopo desta rodada (só edição
  de arquivo, sem rodar comando/migração); registrado como consequência
  pendente acima.
