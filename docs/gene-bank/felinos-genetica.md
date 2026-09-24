# Gene-Bank Felino — Extensão de Genética (completa o TDD §3/§4)

**Status:** fonte de verdade (aprovado para implementação) · **Data:** 2026-09-06
**Motivo:** o TDD/Gene-Bank original só documentava o loco **A (melanismo)** para
felinos (arco Pumajaguar). Este documento estende a genética felina com **loci
reais de cor/padrão de felídeos**, para suportar o catálogo completo (onças,
puma, tigres, leopardo, guepardo, leão, serval, jaguatirica, gato doméstico e
raças). Nada aqui é inventado: cada loco corresponde a um gene documentado da
biologia felina. Compatível com o arco Pumajaguar existente (o loco A é mantido).

## Loci felinos (todos os felídeos compartilham este conjunto)

| Loco | Gene real | Alelos (dominância) | Efeito |
|---|---|---|---|
| **A** | ASIP/MC1R (melanismo) | `A` (melanístico, dom.) > `a` (não-melanístico) | `A_` = pelagem escura/melânica com padrão em "marcas fantasma"; `aa` = padrão plenamente visível. (Gene-Bank original) |
| **P** | Taqpep (tabby/padrão) | `P^r` > `P^m` > `P^s` > `P^t` (dom. completa) | Tipo de padrão: `P^r` rosetas (onça/leopardo), `P^m` mackerel/listras (tigre), `P^s` pintas (guepardo/serval), `P^t` ticked/uniforme (puma/leão) |
| **B** | TYRP1 (marrom) | `B` (preto) > `b` (chocolate) > `b^l` (canela) | Cor da eumelanina |
| **C** | TYR (série albino) | `C` > `c^b` (sépia) > `c^s` (pontos/siamês) > `c^a` (albino olhos-azuis) > `c` (albino olhos-vermelhos) | `cc`/`c^a` = albino; `c^s` = extremidades pigmentadas (pointed) |
| **D** | MLPH (diluição) | `D` (denso) > `d` (diluído) | `dd` = azul/creme (diluído) |
| **W** | KIT (branco dominante) | `W` (branco dominante) > `w` | `W_` = animal totalmente branco (mascara todos os demais) — ex.: tigre-branco/leão-branco/gato-branco |
| **Hr** | Ausência de pelo (KRT71 — Sphynx) | `Hr`(com pelo) > `hr`(pelado, recessivo) | `hr/hr` = sem pelo (Sphynx) |
| **Fl** | Comprimento do pelo (FGF5) | `Fl^l`(longo) > `Fl^s`(curto) (dom. completa) | `Fl^l/_` = pelo longo (persa, maine-coon, leopardo-das-neves); `Fl^s/Fl^s` = pelo curto |
| **Bd** | Cor de fundo da pelagem (feomelanina/eumelanina base) | `Bd^a`(âmbar) > `Bd^d`(dourado) > `Bd^s`(areia) > `Bd^g`(cinza) (dom. completa) | Tom de fundo sobre o qual o padrão aparece |
| **He** | Formato da cabeça/crânio | `He^b`(larga) > `He^a`(angular) > `He^r`(arredondada) (dom. incompleta → intermediários em híbridos) | Estrutura craniana |
| **Ec** | Orelhas | `Ec^t`(tufadas, tipo lince) > `Ec^l`(grandes, tipo serval) > `Ec^n`(normais) (dom. completa) | Forma/tamanho das orelhas |
| **Ma** | Juba (poligênico, dependente de andrógenos — simplificado) | `Ma` > `ma` (dominância INCOMPLETA) | `Ma/Ma` = juba completa (leão); `Ma/ma` = juba parcial/menor (híbrido tipo lígre); `ma/ma` = sem juba |
| **S** | KIT (manchas brancas) | `S` (bicolor/malhas) > `s` | `S_` = manchas brancas (bicolor/piebald) |

## Locus ligado ao X — O (laranja)

**Adição (ADR-0013).** O gene real do laranja em felinos é **ligado ao
cromossomo X** — não se comporta como os loci autossômicos acima (um par de
alelos por indivíduo, dominância simples). Por isso fica documentado à parte.

| Loco | Gene real | Alelos | Ligação | Genótipos possíveis |
|---|---|---|---|---|
| **O** | Laranja/feomelanina (ligado ao X) | `O` (laranja) / `o` (não-laranja) | Ligado ao X | Macho (XY): **hemizigoto** — `O` ou `o` (um alelo só, nunca os dois). Fêmea (XX): `O/O`, `O/o` ou `o/o`. |

**Interações do O:**
- **O mascara A**: laranja é pigmento feomelanina, uma via diferente da que
  `A` controla (eumelanina) — com `O` presente e ativo, a cor de base vai pra
  laranja independente do genótipo em `A`.
- **O NÃO mascara P**: o tipo de padrão (rosetas/listras/pintas/uniforme)
  continua vindo de `P` normalmente — só a COR do padrão muda pra laranja.
- **Fêmea O/o = MOSAICO** (tartaruga): por inativação aleatória do X
  (lyonização), cada região da pele expressa só um dos dois X — o resultado é
  um mosaico de manchas laranja e manchas na cor que `A` determinaria. Não é
  um terceiro alelo — é o efeito biológico já esperado de heterozigose num
  loco ligado ao X.
- **d/d (diluição, já existente) dilui o laranja → creme.**
- **B não altera a cor do laranja** — `B` (TYRP1) só afeta a via eumelanina;
  gatos `O` ficam laranja/creme independentemente do alelo em `B`.
- **c^s (pontos, já existente) + O → colorpoint ruivo** (extremidades numa cor
  laranja/creme mais escura sobre corpo mais claro).
- **W (branco dominante, já existente) mascara tudo**, `O` incluso — mesma
  regra que já mascara `P`/`B` hoje.
- **S (manchas brancas, já existente) + fêmea O/o → calico** (mosaico +
  manchas brancas).

**Restrição biológica real:** a mutação `O` só é modelada em **Felis catus**
(raças de gato doméstico) — felinos selvagens (onça, tigre, leão etc.) ficam
fixados em `o` (não-laranja); "laranja" nesses casos continua vindo só da
combinação `a/a` + tom de `Bd`, como hoje. Aneuploidias (ex.: macho XXY
tartaruga, condição real porém rara) estão fora do escopo — ver ADR-0013.

**QTL felinos (contínuos, HERDÁVEIS como média parental — TDD §4.1):** `porte` (tamanho/robustez do animal no retrato: 0=pequeno … 1=muito grande), `vigor` (musculatura), `beleza` (acabamento/simetria da pelagem), `rosetas` (intensidade
do padrão — "marcas fantasma"). Herdabilidade conforme TDD §4.1.

**Nota biológica:** a juba é herdável (poligênica/andrógeno-dependente). Modelada aqui como um loco de dominância incompleta para reproduzir a juba INTERMEDIÁRIA de híbridos (ex.: o lígre macho tem juba menor que a do leão). Leão = Ma/Ma; demais felinos = ma/ma.

## Ordem de expressão (epistasia)
1. **W_** (branco dominante) → animal **branco**, mascara cor e padrão.
2. **C**: `cc`/`c^a` → **albino** (branco/creme, olhos claros); `c^s` → corpo
   claro com **extremidades pigmentadas** (pointed).
3. **A_** (melanismo) ou **O** (laranja, ligado ao X — ver seção própria acima)
   definem a via de pigmento: eumelanina (`A`) vs. feomelanina (`O`). Macho `O`
   ou fêmea `O/O` → laranja, `A` deixa de se expressar. Fêmea `O/o` → MOSAICO
   (regiões laranja + regiões conforme `A`). Sem `O` (macho `o`, fêmea `o/o`),
   a via segue só por `A`: base escura, padrão vira "marcas fantasma".
4. **B**+**D** definem o tom da eumelanina (preto/chocolate/canela × denso/diluído).
5. **P** define o tipo de padrão (rosetas/listras/pintas/ticked), modulado por
   `rosetas` (QTL).
6. **S_** adiciona manchas brancas (bicolor).

## Catálogo de espécies felinas (presets alélicos)

Todas as espécies pertencem à **família FELINO** (tier Free — intraespécie).
Cruzamentos entre espécies distintas são **interespecíficos** (tier Junior+).
Raças de **gato doméstico** compartilham a espécie `felis-catus` (cruzáveis entre
si no Free) e diferem apenas no genótipo.

| Espécie (slug) | Nome | Genótipo-base (loci relevantes) |
|---|---|---|
| `panthera-onca` | Onça-pintada | `aa · P^r · BB · CC · DD · ww · ss` (fulvo, rosetas) |
| `panthera-onca-negra` | Onça-negra | `Aa · P^r · BB · CC · DD · ww · ss` (melanística) |
| `puma` | Puma / Suçuarana | `aa · P^t · BB · CC · DD · ww · ss` (fulvo uniforme) |
| `panthera-tigris` | Tigre-de-bengala | `aa · P^m · BB · CC · DD · ww · ss` (laranja, listras) |
| `panthera-tigris-branco` | Tigre-branco | `aa · P^m · BB · c^s c^s · DD · ww · ss` (branco+listras, pointed) |
| `panthera-tigris-albino` | Tigre-albino | `aa · P^m · BB · cc · DD · ww · ss` (albino, listras fantasma) |
| `panthera-pardus` | Leopardo | `aa · P^r · BB · CC · DD · ww · ss` (rosetas menores) |
| `acinonyx-jubatus` | Guepardo | `aa · P^s · BB · CC · DD · ww · ss` (pintas sólidas) |
| `panthera-leo` | Leão | `aa · P^t · BB · CC · DD · ww · ss` (fulvo uniforme) |
| `leptailurus-serval` | Serval | `aa · P^s · BB · CC · DD · ww · ss` (pintas e barras) |
| `leopardus-pardalis` | Jaguatirica | `aa · P^r · BB · CC · DD · ww · ss` (rosetas alongadas) |
| `felis-catus` | Gato doméstico | variável por raça (todos os loci segregam) |

**Gato doméstico (Felis catus)** é a espécie-estrela do Free intraespécie: carrega
variedade em **todos os loci** (tabby/mackerel/spotted, cores B/D, pontos/albino C,
branco W, manchas S), permitindo o jogo mendeliano completo dentro da espécie.

## Portadores ocultos por fundador

**Motivo:** até esta decisão, 9 dos 12 fundadores de `felis-catus` eram
homozigotos em **todo** loco — cruzar fundador × fundador (o único cruzamento
possível na primeira semana de um jogador Free) sempre dava **1 única**
combinação de fenótipo possível (nenhuma variação de Mendel pra ver, nenhuma
escolha real entre as 6 opções da incubadora, nenhum Punnett interessante).
Isso contradizia o parágrafo acima ("carrega variedade em todos os loci"),
que já era a intenção documentada desde a ADR-0010 — só nunca foi
implementada por completo.

**Regra seguida em toda escolha abaixo:** o alelo NOVO entra sempre do lado
**recessivo** do ranking de dominância daquele loco, atrás do alelo que já
define a raça — o fundador continua parecendo EXATAMENTE igual (portador é
invisível por definição; nenhum loco de dominância INCOMPLETA — `He`, `Ma`
— foi tocado, porque nesses todo heterozigoto já é um fenótipo visível
próprio, nunca "oculto"). Prova formal: `apps/api/test/founder-carriers.
spec.ts` compara `expressPhenotype()` de cada um dos 12 fundadores, ANTES
(genótipo antigo hardcoded no teste) e DEPOIS (genótipo atual) — os dois
batem `loci` por `loci`.

| Fundador | Loco(s) alterado(s) | Genótipo antes → depois | Alelo recessivo carregado | Por quê |
|---|---|---|---|---|
| gato-tabby | P, C | P^m/P^m → **P^m/P^t** · C/C → **C/c^b** | uniforme (ticked) · sépia | Gato de rua/mestiço descende de linhagens muito misturadas — plausível carregar padrão e cor recessivos sem nunca expressá-los |
| gato-siames | Bd | Bd^s/Bd^s → **Bd^s/Bd^g** | fundo cinza | Tom de fundo é independente do padrão pontos (C); ancestralidade cruzada plausível |
| gato-preto | A | A/A → **A/a** | não-melanístico | Gato preto sólido é classicamente heterozigoto na vida real — raramente "puro"; A/a continua preto porque A é dominante |
| gato-maine-coon | Ec, Fl | Ec^t/Ec^t → **Ec^t/Ec^n** · Fl^l/Fl^l → **Fl^l/Fl^s** | orelhas normais · pelo curto | Raça originada de gatos de celeiro de pelo/orelha mistos na Nova Inglaterra — carregar as versões recessivas é histórico/plausível |
| gato-persa | Fl | Fl^l/Fl^l → **Fl^l/Fl^s** | pelo curto | Raças de pelo longo historicamente cruzadas com shorthair |
| gato-bengala | P | P^s/P^s → **P^s/P^t** | uniforme (ticked) | Origem documentada da raça inclui cruzas com linhagens ticked (Abyssinian) |
| gato-sphynx | Ec | Ec^l/Ec^l → **Ec^l/Ec^n** | orelhas normais | Tamanho de orelha nunca foi tão fixado quanto a calvície (Hr) na origem da raça — `Hr` continua `hr/hr`, define a raça, nunca mexido |
| gato-mau-egipcio | P | P^s/P^s → **P^s/P^t** | uniforme (ticked) | Relatos de ancestralidade ticked na origem da raça |
| gato-abissinio | Bd | Bd^a/Bd^a → **Bd^a/Bd^d** | fundo dourado | Abyssinian tem variantes de tom documentadas (ruddy/sorrel/blue/fawn) |

**gato-branco (`W/w`), gato-birmania (`S/s`) e gato-ragdoll (`S/s`)** já eram
portadores **antes** desta decisão (não fazem parte da mudança desta rodada,
mas são exatamente o padrão que os outros 9 passaram a seguir).

**Combinações resultantes (conferido em teste, não só calculado à mão):**
ragdoll × maine-coon passa a gerar mais de 4 combinações distintas de
fenótipo; gato-tabby × gato-siames (o par que causou o bug em produção —
sempre dava 1 combinação só) passa a gerar mais de 1.

### Caninos — portadores JÁ existentes, nunca documentados (não alterados nesta rodada)

O pack canino **já tinha** portadores ocultos desde antes desta decisão —
nunca registrados aqui. Achados nesta investigação, listados só pra
constar (nenhum genótipo canino foi tocado — ver `docs/gene-bank/
caninos-genetica.md`, que também não os documentava):

- **dobermann**: `B/b` (chocolate oculto) + `D/d` (diluído/azul oculto) — bate com genética real de Dobermann (chocolate e azul são cores reconhecidas da raça).
- **pastor-alemao**: `Cl^l/Cl^s` (pelo longo oculto) — bate com o "long-haired GSD", variante recessiva real e documentada da raça.
- **dogue-arlequim**: `M/m` (merle) + `H/h` (harlequin) — intencional, produz o padrão "arlequim" via a regra de epistasia H-sobre-M já existente no pack; `M/M` é letal (`lethals`), risco genético real já modelado.
- **braco-alemao**: `E/e` (creme/vermelho oculto atrás de extensão normal).
- **Onda 2** (não documentada em `caninos-genetica.md`): `K^br/k^y` (brindle oculto) em presa-canaria, cimarron, pit-bull e bulldog-ingles; `Cl^l/Cl^s` (pelo longo oculto) em pastor-pampeano.

## Fundadores de COR (ADR-0036) — 16 novos de `felis-catus`

Cada raça de gato tinha UM fundador homozigoto em tudo (Persa × Persa dava sempre o mesmo filhote), mas em várias raças a cor é livre e o que define a
raça é a morfologia. Com B, D (ADR-0034) e O (ADR-0035) destravados, entram 16 fundadores de **cor**: só os loci de cor mudam; `Ma`, `He`, `Ec`, `Fl`, `Hr`
(inclusive os portadores de forma) e o QTL são os do fundador da raça — Persa e Maine Coon mantêm `Fl^l/Fl^s`. Cada base tem um gêmeo de sexo oposto; o X do
gêmeo segue a regra do ADR-0035 (fêmea `O/O` → macho `[O]`; **fêmea `O/o` → macho `[o]`**; macho `[O]` → fêmea `[O,O]`). Portadores `B/b`, `D/d` entram do lado
recessivo (regra do ADR-0010). O sexo do base é fixo: tartaruga/calico **sempre fêmea**, laranja macho.

| Fundador (base) | Sexo | Loci de cor (A · P · B · C · D · W · S) | X | Pelagem no prompt |
|---|---|---|---|---|
| `gato-laranja` | M | a/a · P^m/P^m · B/B · C/C · **D/d** · w/w · s/s | `[O]` | ginger-orange com listras |
| `gato-tartaruga` | F | **A/a** · P^m/P^t · B/B · C/C · D/d · w/w · s/s | `[O,o]` | tortoiseshell (gêmeo `[o]`: preto) |
| `gato-calico` | F | igual à tartaruga com **S/s** | `[O,o]` | calico (gêmeo `[o]`: preto liso — o S ainda não aparece fora da família laranja) |
| `gato-persa-branco` | M | a/a · P^t/P^t · B/B · C/C · D/D · **W/w** · s/s | — | branco |
| `gato-persa-colorpoint` | M | a/a · P^t/P^t · **B/b** · **c^s/c^s** · **D/d** · w/w · s/s | — | pontos (seal; segrega chocolate/blue/lilac) |
| `gato-persa-chocolate` | F | a/a · P^t/P^t · **b/b** · C/C · **D/d** · w/w · s/s | — | chocolate (segrega lilás) |
| `gato-persa-laranja` | M | a/a · P^t/P^t · B/B · C/C · D/d · w/w · s/s | `[O]` | ginger-orange (tabby fantasma) |
| `gato-persa-tartaruga` | F | A/a · P^t/P^t · B/B · C/C · D/d · w/w · s/s | `[O,o]` | tortoiseshell (o gêmeo `[o]` já é o persa preto) |
| `gato-maine-coon-preto` | F | **A/a** · P^m/P^m · B/B · C/C · D/D · w/w · s/s | — | preto |
| `gato-maine-coon-branco` | M | a/a · P^m/P^m · B/B · C/C · D/D · **W/w** · s/s | — | branco |
| `gato-maine-coon-laranja` | M | a/a · P^m/P^m · B/B · C/C · D/d · w/w · s/s | `[O]` | ginger-orange com listras |
| `gato-maine-coon-tartaruga` | F | A/a · P^m/P^m · B/B · C/C · D/d · w/w · s/s | `[O,o]` | tortoiseshell |
| `gato-abissinio-sorrel` | F | a/a · P^t/P^t · **b^l/b^l** · C/C · D/d · w/w · s/s | — | cinnamon |
| `gato-abissinio-azul` | M | a/a · P^t/P^t · B/b^l · C/C · **d/d** · w/w · s/s | — | blue-grey (sorrel × azul: 4 fenótipos, inclusive fawn) |
| `gato-ragdoll-blue` | M | a/a · P^t/P^t · B/b · **c^s/c^s** · **d/d** · w/w · S/s | — | pontos blue (segrega lilac) |
| `gato-bengala-snow` | F | a/a · P^s/P^t · B/B · **c^s/c^s** · D/D · w/w · s/s · **Bd^s/Bd^s** | — | snow lynx point |

**Casal do artigo (herança ligada ao sexo):** `gato-tartaruga` (F) × `gato-laranja` (M) → filhas 50% laranja / 50% tartaruga, filhos 50% laranja / 50% não-laranja;
**herança cruzada** com os gêmeos: `gato-tartaruga-macho` `[o]` (preto) × `gato-laranja-femea` `O/O` → 100% das filhas tartaruga e 100% dos filhos laranja
(`apps/api/test/color-founders.spec.ts`, 2.000 filhotes por cruzamento). O gato doméstico laranja/tartaruga/calico e as demais variedades de cor de uma raça
herdam o campo `breed` da raça (`CAT_FOUNDER_COLOUR_VARIANTS`); laranja/tartaruga/calico do doméstico não têm raça (`breed` nulo), como tabby/preto/branco.
**Limites do prompt:** S (bicolor) só aparece na família laranja; a tartaruga diz sempre "black"; sorrel/azul saem "solid" (sem o ticking do Abissínio); o corpo do
colorpoint/snow segue o tom de fundo `Bd`.

## Compatibilidade com o TDD existente
- O loco **A** mantém o significado do arco Pumajaguar (melanismo dominante); os
  golden tests do TDD §4.5 (que usam só A) permanecem válidos e verdes.
- Regra Anti-P2W, determinismo e Regra de Haldane (F1 interespecífico) inalterados.
- Registrado em ADR-0010.
- Sexo cromossômico (XX/XY) e o loco ligado ao X **O** (laranja) estendem o
  pack FELINE sem alterar `A`, `P` ou `Bd`, nem o arco Pumajaguar — Wright F
  segue autossômico, sexo não entra na `cacheKey`. Registrado em ADR-0013.
