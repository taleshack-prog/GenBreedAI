# ADR-0011 — Loci morfológicos caninos (Cph/Ec/Cl/Ct/Tl) + diluição D

- **Status:** aceito (reconstruído a partir do código em produção) · **Data original:** 2026-09-07 · **Data deste registro:** 2026-09-15

## Contexto

`docs/gene-bank/caninos-genetica.md` já cita "ADR-0011" no cabeçalho desde
2026-09-07 e `CANINE_PACK` (`packages/engine/src/data/canine.ts`) já implementa
tudo o que ele descreve — mas o arquivo desta ADR nunca chegou a ser criado em
`docs/adr/`. Este registro fecha essa lacuna, reconstruindo a decisão **a
partir do código atualmente em produção** (não do plano original), sem alterar
nenhuma linha de código.

O pack canino original (`B/K/A/E/S/R/F/C/M/H`) cobre só cor e padrão de
pelagem — nada o que diferencia raças pela FORMA do animal (porte, crânio,
orelhas, pelo, cauda). Sem isso, um Chihuahua e um São Bernardo só diferiam no
QTL `porte`, sem herdabilidade discreta de estrutura.

## Decisão

Estender `CANINE_PACK` com os mesmos princípios já usados no pack felino
(ADR-0010): loci mendelianos simplificados, mapeados em genes/traços reais,
nunca inventados. Implementado hoje:

| Loco | Traço | Alelos (dominância) | Efeito |
|---|---|---|---|
| **D** | Diluição (MLPH) | `D` (denso) > `d` (diluído) | `dd` = azul/isabela (preto→azul, liver→isabela) |
| **Cph** | Formato do crânio | `Cph^b` (braquicefálico) > `Cph^m` (mesocefálico) > `Cph^d` (dolicocefálico) — dominância **INCOMPLETA** | Focinho curto/médio/longo; cruzas entre conformações distintas geram focinho intermediário |
| **Ec** | Orelhas | `Ec^e` (eretas) > `Ec^s` (semieretas) > `Ec^d` (caídas) — dominância **INCOMPLETA** | Cruzas entre eretas × caídas geram semieretas |
| **Cl** | Comprimento do pelo | `Cl^l` (longo) > `Cl^s` (curto) — dominância completa | Pelo longo vs. curto |
| **Ct** | Tipo do pelo | `Ct^w` (áspero/wire) > `Ct^c` (cacheado/curly) > `Ct^n` (liso/normal) — dominância completa | Textura do pelo |
| **Tl** | Cauda | `Tl^l` (longa) > `Tl^c` (enrolada) > `Tl^b` (curta/bob) — dominância completa | Formato da cauda |

`Cph` e `Ec` usam dominância INCOMPLETA de propósito — espelha `Bd`/`He` no pack
felino (ADR-0010): cruzar raças com conformações opostas produz um intermediário
plausível, em vez de uma das duas dominar por completo. Os demais (`Cl`, `Ct`,
`Tl`, `D`) usam dominância completa, mesmo padrão dos loci de cor originais.

Os presets de raça (Onda 1 — 12 raças) e o catálogo completo ficam documentados
em `docs/gene-bank/caninos-genetica.md`, que permanece a fonte de verdade
operacional; esta ADR só formaliza a decisão de design.

## Consequências

- Raças ficam distinguíveis e HERDÁVEIS por estrutura, não só por cor/QTL.
- Loci de cor/padrão originais (`B/K/A/E/S/R/F/C/M/H`) e a epistasia existente
  (Harlequin `H` sobre Merle `M`) permanecem intocados.
- Nenhum golden test (`goldendoodle`, `boerpointer`, `danecollie`) referencia
  `Cph`/`Ec`/`Cl`/`Ct`/`Tl` — a extensão não tem efeito sobre eles.
- Anti-P2W, determinismo e Regra de Haldane inalterados.

## Alternativas consideradas

- **QTL contínuo único para "porte/estrutura"** — rejeitado: perderia a
  herdabilidade discreta e reconhecível (ex.: cruzar orelhas eretas × caídas
  sempre dar semieretas), que é o padrão já estabelecido pelo pack felino.
