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

## Compatibilidade com o TDD existente
- O loco **A** mantém o significado do arco Pumajaguar (melanismo dominante); os
  golden tests do TDD §4.5 (que usam só A) permanecem válidos e verdes.
- Regra Anti-P2W, determinismo e Regra de Haldane (F1 interespecífico) inalterados.
- Registrado em ADR-0010.
- Sexo cromossômico (XX/XY) e o loco ligado ao X **O** (laranja) estendem o
  pack FELINE sem alterar `A`, `P` ou `Bd`, nem o arco Pumajaguar — Wright F
  segue autossômico, sexo não entra na `cacheKey`. Registrado em ADR-0013.
