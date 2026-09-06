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
| **S** | KIT (manchas brancas) | `S` (bicolor/malhas) > `s` | `S_` = manchas brancas (bicolor/piebald) |

**QTL felinos (contínuos):** `porte`, `vigor`, `beleza`, `rosetas` (intensidade
do padrão — "marcas fantasma"). Herdabilidade conforme TDD §4.1.

## Ordem de expressão (epistasia)
1. **W_** (branco dominante) → animal **branco**, mascara cor e padrão.
2. **C**: `cc`/`c^a` → **albino** (branco/creme, olhos claros); `c^s` → corpo
   claro com **extremidades pigmentadas** (pointed).
3. **A_** (melanismo) → base escura; padrão vira "marcas fantasma".
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
