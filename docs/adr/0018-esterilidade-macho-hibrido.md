# ADR-0018 — Esterilidade de macho híbrido além do F1

- **Status:** aceito · **Data:** 2026-09-16 · **Substitui:** a regra provisória documentada em `apps/api/src/db/backfill-sex.ts` (sem ADR até aqui)

## Contexto

A Regra de Haldane (ADR-0015) só é aplicada por `fertilityScore()` no ramo
`F1`: um macho F1 interespecífico sai sempre `score=0, haldaneStatus=
"STERILE"`; nos demais métodos (`BC1`, `F2`, `LINE`, `INBREED`, `OUTCROSS`),
`fertilityScore()` cai no `base` genérico do método, **mesmo quando o
espécime ainda é geneticamente um híbrido** (ex.: um BC1 cuja mãe é F1
"puma×panthera-onca" e cujo pai é "panthera-onca" — o filho continua tendo
ascendência mista, só que via retrocruzamento). Isso é uma pendência real do
ADR-0015: a nota do item 4 já registrava "BC1 60–80 era incorreto para
machos" sem resolver o caso.

Esse gap foi descoberto operacionalmente durante o backfill de dados
legados (`apps/api/src/db/backfill-sex.ts`): vários machos não-F1 com
ascendência híbrida ficariam com fertilidade calculada > 0 pelo motor,
biologicamente implausível. Uma regra **provisória** foi aplicada só no
script de backfill, com o cabeçalho explicitamente marcando que o motor
precisava da mesma regra antes de qualquer merge. Esta ADR formaliza e
substitui essa provisão.

## Evidência biológica

**Híbrido Savannah** (*Felis catus* × *Leptailurus serval*): machos híbridos
são documentadamente estéreis não só na F1, mas tipicamente até ~F4/F5 —
a fertilidade masculina só é restaurada (parcialmente, via retrocruzamentos
sucessivos ao *Felis catus*) muitas gerações depois, quando a proporção de
genoma de serval já caiu bastante. Evidência **GRADE baixo** (relatos de
criadores e literatura de hibridização felina, não um estudo controlado
formal) — suficiente para justificar uma regra conservadora de jogo, não
para modelar a curva exata de retorno de fertilidade.

## Decisão

### 1. Regra

**Macho cuja ascendência mistura mais de uma espécie biológica é estéril,
em qualquer método** (F1, BC1, F2, LINE, INBREED, OUTCROSS — não só F1).

Implementado em `packages/engine/src/cross.ts`, dentro de `finalizeSpecimen()`
(logo depois da chamada a `fertilityScore()` — não em `fertilityScore()`
em si, pra não mudar a assinatura dessa função nem sua unidade de
responsabilidade, que continua sendo só o cálculo "base" por método):

```ts
let fertility = fertilityScore(method, fPedigree, { sex, hybridClass: hybridClass(parentA, parentB, ctx.pack), rng });
const biologicalComponents = new Set([...parentA.species.split("×"), ...parentB.species.split("×")]);
if (sex === "M" && biologicalComponents.size > 1) {
  fertility = {
    ...fertility,
    score: 0,
    haldaneStatus: "STERILE",
    haldaneSterile: true,
    notes: [...fertility.notes, "Macho híbrido estéril (Regra de Haldane estendida além do F1 — ADR-0018)."],
  };
}
```

- **Componentes biológicos da prole** = união de `parentA.species.split("×")`
  e `parentB.species.split("×")`, deduplicada (`Set`). `species` já chega
  **normalizado pelo chamador** (apps/api) — o motor nunca consulta o
  catálogo de espécies (mesma regra de sempre, ADR-0015).
- Aplicado **depois** do cálculo de `fertilityScore()`, só sobrescrevendo o
  resultado — **nenhum sorteio novo**, mesma ordem de consumo de RNG de
  antes desta ADR (o zigoto/genótipo sai idêntico com ou sem a regra
  ligada).
- **Fêmeas**: sem mudança nenhuma (Haldane, biológica e narrativamente, é
  assimetria de sexo — fêmeas híbridas continuam na faixa do método).
- **Intraespécie** (1 componente só, ex.: `"panthera-onca"` × `"panthera-onca"`):
  sem mudança — a regra só dispara com ascendência genuinamente mista.

### 2. Simplificação conservadora (deliberada)

- **Esterilidade PERMANENTE**: o retorno de fertilidade masculina em
  gerações tardias (o que a Savannah real mostra, ~F4/F5 em diante) **não é
  modelado**. Um macho BC3/BC4 com um componente residual de espécie
  selvagem continua `score=0` por esta regra, para sempre, enquanto
  `parentA.species`/`parentB.species` carregarem mais de um componente.
- **`species` (nome de linhagem, via `combineSpecies()` em
  `cross.service.ts`) NUNCA dilui**: mesmo depois de N retrocruzamentos, o
  nome continua listando todos os ancestrais distintos (dedupe, não
  "esquece" o componente selvagem por causa da baixa proporção genômica) —
  então a condição "mais de 1 componente" permanece verdadeira indefinidamente
  pra essa linhagem, reforçando a esterilidade permanente acima.
- Revisão futura (curva de retorno de fertilidade por geração, ou diluição
  do nome de linhagem) **exige uma nova ADR** — não é escopo desta.

## Consequências

- **Golden tests**: ver seção "Impacto nos goldens" abaixo.
- Comportamento de jogo muda: machos BC1/F2/... de ascendência mista deixam
  de ser cruzáveis (gate de fertilidade em `validateBreedingConstraints`
  rejeita `fertility===0`) — coerente com a Savannah real.

## Impacto nos goldens

Confirmado (rodado após a implementação): dos 5 goldens
(`goldendoodle`/`boerpointer`/`danecollie`/`pumajaguar`/`tortoiseshell`), só
`pumajaguar` foi afetado — e só num campo.

- **`pumajaguar`, seed `"pj-01"` (BC1, `negra` × `delta`)**: a prole dessa
  seed é **macho**. `negra` = `"panthera-onca"` (1 componente), `delta` =
  `"puma×panthera-onca"` (2 componentes) — união = 2 componentes → a ADR-0018
  se aplica. A expectativa de fertilidade do it() "BC1 sob depressão..."
  passou de `haldaneStatus: "NONE"` para `"STERILE"` (e `haldaneSterile:
  false → true`, `fertility.score` de indefinido/sob-depressão para `0`).
  **Consequência direta e aprovada da regra, não um bug** — o teste foi
  atualizado (não revertido) pra afirmar isso.
- **Valores genéticos inalterados**: `F_pedigree=0.25`, `IF=0.857143`,
  genótipo do locus A (`A/A`, homozigoto) — nenhum desses depende de
  `fertility`/Haldane, e a regra não consome RNG (ver "Aplicado depois",
  acima), então o zigoto sai bit-a-bit idêntico ao de antes da ADR-0018.
- **Cobertura da depressão endogâmica na fertilidade** (o que o título
  antigo "BC1 sob depressão" cobria pro caso não-estéril) **foi movida** pra
  `packages/engine/src/__tests__/hybridization-haldane.test.ts` — usando o
  MESMO par/ctx do golden (`negra`/`delta`/`PUMAJAGUAR_PEDIGREE`), procurando
  deterministicamente a primeira seed `"pj-f-0".."pj-f-49"` cuja prole seja
  **fêmea** (a ADR-0018 só afeta machos) — e ali afirmando `haldaneStatus:
  "NONE"` e a faixa de fertilidade sob depressão (`fertility.score` em
  `[48, 64]` — base BC1 `[60,80]` × penalidade de depressão endogâmica
  `×0.8` pra `F=0.25`).

## Coerência com `apps/api/src/db/backfill-sex.ts`

O backfill de dados legados aplicava a mesma regra como remendo provisório
(cabeçalho do script, seção "REGRA PROVISÓRIA — machos híbridos além do F1
(SEM ADR ainda)"), com o aviso explícito de que o motor precisava da mesma
regra antes do merge. Esta ADR fecha essa pendência — o cabeçalho do script
foi atualizado para referenciar esta ADR (lógica do script inalterada: ela
já implementava exatamente esta regra).

## Alternativas consideradas

- **Modelar a curva de retorno de fertilidade por geração** (ex.: BC3+
  volta a ter `score>0`): rejeitada por agora — exigiria dados quantitativos
  (curva real de recuperação, não só "estéril até ~F4/F5") que não temos
  com evidência melhor que GRADE baixo; a simplificação conservadora
  (permanente) é mais segura que inventar uma curva sem base.
- **Diluir o `species`/nome de linhagem por geração** (ex.: parar de listar
  o componente selvagem depois de N retrocruzamentos): rejeitada — mudaria
  `combineSpecies()` (apps/api) e a lógica de proveniência/exibição de
  linhagem, escopo muito maior que esta ADR; também removeria o sinal que
  ESTA regra depende para funcionar.
- **Aplicar dentro de `fertilityScore()` em vez de `finalizeSpecimen()`**:
  rejeitada — mudaria a assinatura de `fertilityScore()` (precisaria
  receber `parentA.species`/`parentB.species`, não só `hybridClass`),
  espalhando a responsabilidade de "ler ascendência" pra dentro de uma
  função hoje só sobre método+sexo+classe; `finalizeSpecimen()` já tem
  `parentA`/`parentB` completos à mão e é o lugar natural pra um
  pós-processamento que só lê dados já resolvidos.
