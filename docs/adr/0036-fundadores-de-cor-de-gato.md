# ADR-0036 — 16 fundadores de cor de gato (laranja, tartaruga, calico e cores de raça)

- **Status:** aceito · **Data:** 2026-09-24
- **Depende de** ADR-0034 (B e D destravados), ADR-0035 (locus O, gêmeo com X, `cacheKey` com X) e ADR-0033 adendo 2 (campo `breed`).
- **Não muda** motor, cotas, tiers nem o genótipo dos 27 fundadores felinos e 47 caninos existentes.

## Contexto

Cada raça de gato tinha UM fundador homozigoto em quase tudo: Persa × Persa dava sempre o mesmo filhote. Em várias raças a cor é livre (o que define a
raça é a morfologia), e o jogador nunca via um gato laranja, tartaruga ou calico. Os cães já seguem o modelo certo (o Dogue Alemão tem 6 fundadores, um por cor).
O par tartaruga × laranja demonstra herança ligada ao sexo — o tema do artigo de blog mais forte do projeto.

## Decisão

**16 fundadores base novos** (32 espécimes com os gêmeos; 74 → 90 bases, 148 → 180 espécimes), só de cor: os loci `Ma`, `He`, `Ec`, `Fl`, `Hr`, `Bd` (exceto o
Bengala Snow) e o QTL são os do fundador da raça; Persa e Maine Coon mantêm `Fl^l/Fl^s`. Tabela locus a locus em `docs/gene-bank/felinos-genetica.md`
§"Fundadores de COR" e em `founderSeeds()`.

| Grupo | Fundadores |
|---|---|
| Gato doméstico (sem raça) | `gato-laranja` (M `[O]`), `gato-tartaruga` (F `[O,o]`), `gato-calico` (F `[O,o]`, S/s) |
| Persa | `-branco`, `-colorpoint` (himalaio), `-chocolate`, `-laranja`, `-tartaruga` |
| Maine Coon | `-preto`, `-branco`, `-laranja`, `-tartaruga` |
| Abissínio | `-sorrel` (`b^l/b^l`), `-azul` (`d/d`) — portadores cruzados |
| Ragdoll / Bengala | `gato-ragdoll-blue`, `gato-bengala-snow` |

Decisões do dono: calico incluído (o gêmeo macho sai preto liso porque o S ainda não aparece no prompt fora da família laranja); portadores `D/d` e `B/b` como
propostos; Fl `l/s` mantido; **gêmeo da tartaruga `[o]`** (dá a herança cruzada); **o `gato-persa-preto` NÃO existe** — o gêmeo macho da Persa Tartaruga
(`[o]`, `A/a`) já é o persa preto, e um fundador separado sairia visualmente idêntico.

**Sexo do base** (`BASE_FOUNDER_SEX`): tartaruga e calico sempre fêmea (só fêmea é mosaico); laranja macho — assim tartaruga F × laranja M funciona direto entre os dois BASES, e
o par de gêmeos (macho `[o]` × fêmea `O/O`) dá a herança cruzada.

**O que foi preenchido além do genótipo:** `BASE_FOUNDER_SEX` (16 linhas); `BREEDS` (16 entradas com descritor **sem cor** — a cor vem do fenótipo); a tabela
`CAT_FOUNDER_COLOUR_VARIANTS` (variante → raça; `null` para as variedades do doméstico) usada por `founderBreed`, para Persa Branco × Persa Laranja nascer "Persian" e
Gato Laranja × Gato Tartaruga nascer sem raça; `catBreedIds()` (as "12 raças de gato" da página `/o-que-e` não viram 28); docs do gene bank.

## Consequências

- **Segregação:** nenhum par de fundadores é geneticamente idêntico e todo base × gêmeo gera ≥ 2 pelagens (teste com 300 filhotes por linha). Sem visibilidade no F1 (genéticos
  diferentes, fenótipo igual): Sorrel × Ruddy atual, Ragdoll Blue × Ragdoll seal, Bengala Snow × Bengala marrom quanto ao snow (só no F2).
- **Retratos:** 20 (não 32). 9 linhas sem X (gêmeo compartilha a `cacheKey`), 3 laranjas (`[O]` e `[O,O]` têm a mesma chave), 3 tartarugas × 2 e o calico × 2 (o gêmeo `[o]` é
  outro gato). A R$ 0,155: **R$ 3,10**. Nenhuma `cacheKey` existente muda; nenhuma colide com fundador antigo (teste).
- **Aplicar:** `db:seed` (aditivo, `onConflictDoNothing`; sem migração) e `images:seed` (`FAL_KEY`, gera os retratos). Sem os retratos os fundadores aparecem sem imagem.
- **Free** passa de 12 para 28 gatos na galeria (56 espécimes com os gêmeos).
- **Limites do prompt (inalterados):** S só na família laranja (o gêmeo do calico sai preto liso); a tartaruga diz sempre "black"; sorrel/azul saem "solid"; corpo do
  colorpoint/snow no tom de fundo; sem face achatada do Persa, prata/smoke/mink; o prompt de fundador diz "a purebred Gato Laranja cat" (mesma estranheza do "Gato Rajado").
- Testes: `apps/api/test/color-founders.spec.ts` (novo; casal tartaruga × laranja com 2.000 filhotes por cruzamento); `founder-carriers.spec.ts`, `feline-colour-prompt.spec.ts`,
  `feline-orange-prompt.spec.ts` restritos aos fundadores originais; `breed-field.spec.ts` e `about.test.ts` atualizados.

## Alternativas consideradas

- *Um fundador `gato-persa-preto`:* rejeitada — visualmente idêntico ao gêmeo da Persa Tartaruga.
- *Gêmeo da tartaruga `[O]`:* rejeitada — a herança cruzada (pai preto × mãe laranja → filhas tartaruga, filhos laranja) deixaria de existir.
- *Fl `l/l` nos Persas e Maine Coons novos:* rejeitada — só a cor muda.
