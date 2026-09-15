# ADR-0013 — Sexo cromossômico XX/XY e locus O ligado ao X no pack FELINE

- **Status:** aceito · **Data:** 2026-09-15

## Contexto

Foi pedida a "regra do ruivo" em `expressPhenotype` (gato com pigmento laranja).
Investigação prévia (ver histórico) constatou que:

- Não existe loco `O` (laranja) em lugar nenhum — nem em `FELINE_PACK`
  (`packages/engine/src/data/feline.ts`), nem em `docs/gene-bank/felinos-genetica.md`
  (fonte de verdade, ADR-0010). "Laranja" aparece uma única vez no gene-bank,
  como comentário solto no genótipo do tigre — não é um mecanismo.
- O gene real do laranja em felinos é **ligado ao cromossomo X**. Isso não é um
  detalhe cosmético: é o motivo biológico de gato tartaruga (mosaico laranja +
  não-laranja) ser quase sempre fêmea — resultado da inativação aleatória de um
  dos dois X em cada célula (lyonização) numa fêmea heterozigota `O/o`. Um macho
  (hemizigoto, um X só) nunca pode ser `O/o` — só `O` ou `o`.
- O engine hoje não tem NENHUM conceito de sexo cromossômico nem de ligação ao
  X — `Genotype.loci` é uma lista plana de pares autossômicos.
- Tales decidiu, entre as alternativas levantadas: **opção (a)** — modelar sexo
  cromossômico de verdade (XX/XY) e o loco `O` genuinamente ligado ao X. Não um
  loco autossômico simplificado; não um alelo novo em `Bd`.

Esta ADR registra essa decisão ANTES de qualquer código (Etapa 1 de um plano em
5 etapas; Etapas 2-5 — engine, golden tortoiseshell, prompt, dados — vêm depois,
cada uma em commit próprio).

## Evidência científica

A ligação ao X do laranja felino era conhecida desde os anos 1900 pela
segregação clássica (tartaruga ≈ só fêmeas), mas o gene causador só foi
identificado em 2025:

- Toh, H. et al., **"A deletion at the X-linked ARHGAP36 gene locus…"**,
  *Current Biology* 35(12), jun/2025.
- Kaelin, C. B. et al., **"Molecular and genetic characterization of
  sex-linked orange…"**, *Current Biology* 35(12), jun/2025.

**Mecanismo:** uma deleção regulatória no loco `ARHGAP36` (ligado ao X) causa
sua **expressão ectópica em melanócitos** — `ARHGAP36` normalmente não se
expressa ali. Essa expressão fora do lugar **suprime a produção de eumelanina**
na via de pigmentação, deslocando o melanócito pra produzir só feomelanina
(laranja). É esse o mecanismo molecular por trás de "`O` mascara `A`" na
Decisão abaixo — não é dominância genética clássica sobre o loco `A`, é
supressão de uma via de pigmento inteira por um gene de outro cromossomo.

## Decisão

1. Todo zigoto felino passa a ter um **sexo cromossômico** — XX (fêmea) ou XY
   (macho) — sorteado deterministicamente pelo RNG da seed no momento da
   fecundação (mesmo genótipo + mesma seed = mesmo sexo, sempre).
2. O pack FELINE ganha um grupo de loci **ligados ao X** (`xLoci`), começando
   pelo loco `O` (laranja / feomelanina): alelos `O` (laranja) e `o`
   (não-laranja). Por ligação ao X: **macho hemizigoto** carrega 1 alelo só
   (`O` ou `o`, nunca os dois); **fêmea** carrega 2 (`O/O`, `O/o` ou `o/o`).
3. Fêmea `O/o` expressa **MOSAICO** (tartaruga) por inativação aleatória do X —
   isso é o efeito biológico já esperado de heterozigose num loco ligado ao X,
   não um terceiro alelo inventado.
4. Interações do `O`, documentadas em `docs/gene-bank/felinos-genetica.md`:
   - `O` mascara `A` (a via de melanismo/eumelanina) — laranja é pigmento
     feomelanina, uma via diferente da que `A` controla.
   - `O` **NÃO** mascara `P` — o tipo de padrão (rosetas/listras/pintas/
     uniforme) continua vindo de `P`; só a COR do padrão muda pra laranja.
   - `d/d` (diluição, já existente) dilui laranja → creme.
   - `B` (TYRP1, já existente) não altera a cor do laranja — `B` só afeta a
     via eumelanina.
   - `c^s` (pontos, já existente) + `O` → colorpoint ruivo.
   - `W` (branco dominante, já existente) mascara tudo, `O` incluso — mesma
     regra que já mascara `P`/`B` hoje.
   - `S` (manchas brancas, já existente) + fêmea `O/o` → calico.
5. A mutação `O` só é modelada em **Felis catus** — felinos selvagens (onça,
   tigre, leão etc.) ficam fixados em `o`; seus retratos não mudam.
6. **Fora de escopo:** aneuploidia XXY (macho tartaruga — condição real, porém
   rara). Todo macho no engine é hemizigoto XY; não há cariótipo anômalo.
7. **Wright F continua autossômico.** O cálculo de endogamia (`wrightF`,
   `packages/engine/src/wright.ts`) não muda — a definição clássica de F usada
   aqui não distingue ligação ao X, e nada nesta ADR pede que distinga.
8. **Sexo NÃO entra na `cacheKey`** da imagem. A arte é definida pelo
   genótipo/fenótipo visual — `xLoci` (o alelo em si) entra na `cacheKey` como
   qualquer outro loco, mas o campo `sex` (M/F) não. `CURRENT_ART_VERSION` não
   muda nesta etapa.

## Consequências

- `cross()` passa a exigir `sire` macho e `dam` fêmea, com erro tipado caso
  contrário — muda o contrato de uso do engine (efeito de código na Etapa 2;
  esta ADR já autoriza a mudança).
- Os 4 golden tests existentes (goldendoodle, boerpointer, danecollie,
  pumajaguar) recebem sexo nos fixtures (M/F), mas **nenhum valor esperado
  pode mudar** — isso é condição de aceite da Etapa 2, não uma mudança de
  comportamento aberta por esta ADR.
- `A`, `P`, `Bd` e o arco Pumajaguar (que usa só `A`) permanecem intocados.
- Abre caminho para o loco `O` existir em felinos selvagens no futuro, mas
  isso fica fora desta ADR — aqui a mutação é restrita a Felis catus.
- A generalização de "sexo" para os demais packs (canino — todo animal tem
  sexo, biologicamente) é prevista mas **não** decidida por esta ADR, que é
  titulada e escopada ao pack FELINE; uma decisão futura cobre a extensão.

## Alternativas consideradas

- **Loco autossômico simplificado para laranja** — rejeitado por Tales: não
  seria honesto biologicamente. O gene laranja real é ligado ao X; um loco
  autossômico simplificado perderia o fenômeno mais reconhecível da genética
  felina popular (gato tartaruga = quase sempre fêmea) e contradiz a regra do
  projeto de não inventar biologia fora do que é real.
- **Alelo novo em `Bd`** para representar laranja/creme — rejeitado: `Bd` já
  tem 4 alelos documentados (âmbar/dourado/areia/cinza), todos tons da via
  eumelanina; laranja é feomelanina, um processo fisiológico diferente. Somar
  os dois no mesmo loco confundiria "tom de fundo eumelanina" com "presença de
  pigmento laranja".
