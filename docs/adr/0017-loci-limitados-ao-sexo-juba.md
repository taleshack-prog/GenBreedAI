# ADR-0017 — Loci limitados ao sexo (juba)

- **Status:** aceito · **Data:** 2026-09-15

## Contexto

O locus `Ma` (juba, pack felino — TDD/Gene-Bank) é resolvido hoje pela mesma
lógica de dominância genérica de qualquer outro locus autossômico:
`Ma/Ma` → "juba completa", `Ma/ma` → "juba parcial", `ma/ma` → "sem juba",
**independente do sexo do indivíduo**. Isso é biologicamente errado: juba é
um caractere sexual secundário dependente de testosterona — leoas nunca
desenvolvem juba, mesmo carregando o(s) alelo(s) `Ma` e transmitindo-o(s)
normalmente aos filhotes. O sintoma concreto: uma leoa `Ma/Ma` (ou mesmo o
prompt de imagem gerado para ela) mostrava "juba completa"/"the male has a
full thick lion-like mane", e o `cacheKey` (logo a imagem cacheada) era
idêntico entre um leão e uma leoa de mesmo genótipo — nunca havia sinal de
que o sexo pudesse mudar a aparência.

O tipo `SexExpression` (`"BOTH" | "SEX_LIMITED_F" | "SEX_LIMITED_M" |
"SEX_INFLUENCED"`) e o campo `LocusDef.sexExpression?` já existiam
(`packages/engine/src/types.ts`), preparados desde uma etapa anterior — mas
nenhum locus de nenhum pack os declarava, e `expressPhenotype()` não os
consultava («só tipo, não consultado na resolução ainda»).

Investigação prévia (sem código) confirmou dois pontos-chave antes de
qualquer mudança:
1. O sexo do zigoto já está resolvido em `finalizeSpecimen()` (via
   `combineXGametes`, usando o RNG próprio `${seed}|x`) **antes** da chamada
   a `expressPhenotype()` — não é necessário reordenar nada nem consumir
   RNG extra para ter o sexo disponível ali.
2. Nenhum dos 4 golden tests usa o locus `Ma` em seu zigoto (Pumajaguar só
   usa `A`; os 3 arcos caninos usam `CANINE_PACK`, que não tem `Ma`) — logo
   nenhum golden é afetado pela nova lógica.

## Decisão

### 1. `expressPhenotype(zygote, pack, sex?)` — sexo agora é um parâmetro OPCIONAL

Terceiro parâmetro `sex?: Sex`, opcional e **retrocompatível** (os 4 golden
tests e `danecollie.test.ts` continuam chamando com 2 argumentos, sem
mudança de comportamento). Quando informado, para cada locus com
`sexExpression` declarado:

- `SEX_LIMITED_M` + sexo `F` → fenótipo forçado ao do alelo **mais
  recessivo** de `dominanceRank` (o "estado desligado"), **independente do
  genótipo real**.
- `SEX_LIMITED_F` + sexo `M` → idem, invertido.
- `SEX_INFLUENCED` → **não implementado** nesta ADR (fora de escopo; o tipo
  continua existindo pra uso futuro).

O genótipo **nunca muda** — só a expressão. Uma leoa `Ma/Ma` continua
`Ma/Ma` no banco de dados e transmite `Ma` normalmente aos filhos (ver teste
"filho macho de leão ma/ma × leoa Ma/Ma pode expressar juba").

Convenção do "estado desligado" (alelo mais recessivo de `dominanceRank`):
deliberadamente genérica — não hardcoda a string "sem juba" em código do
motor (que não conhece espécies) — e generaliza pra qualquer futuro locus
`SEX_LIMITED_*` de qualquer pack, sem precisar de um campo novo por locus.

### 2. `FELINE_PACK`: `Ma.sexExpression = "SEX_LIMITED_M"`

Único locus alterado. Nenhum outro pack/locus é tocado.

### 3. `cacheKey` condicional ao sexo

`finalizeSpecimen()` só inclui o sexo no `cacheKey` quando o fenótipo
**realmente difere** entre os sexos para aquele zigoto específico —
verificado reexpressando o MESMO zigoto com o sexo oposto e comparando
`phenotype.loci` (não um mero "o pack tem algum locus SEX_LIMITED"):

```ts
const oppositeSex = sex === "M" ? "F" : "M";
const sexAffectsAppearance =
  JSON.stringify(phenotype.loci) !== JSON.stringify(expressPhenotype(zygoteWithX, ctx.pack, oppositeSex).loci);
const cacheKey = sha256(
  hashGenotype(zygote) + "|" + ctx.pack.id + "|" + CURRENT_ART_VERSION + (sexAffectsAppearance ? "|" + sex : "")
);
```

**Errata (2026-09-16)**: essa lógica ficava embutida (não exportada) dentro
de `finalizeSpecimen()`. `apps/api/src/images/image.service.ts::cacheKeyOf()`
**reimplementava a mesma fórmula por conta própria** (fallback pra fundadores,
cujo `cacheKey` gravado é sempre `null`) — SEM a regra de sexo, porque
copiou a fórmula ANTIGA. Resultado real observado em produção: `leao` e
`leao-femea` caíam na mesma chave; a leoa herdava o retrato do macho, COM
juba. Extraída pra `computeCacheKey(genotype, pack, sex?)`, exportada do
motor — ver seção "Errata" ao final deste documento.

Quando `sexAffectsAppearance` é falso, a string de entrada do hash é
**byte-idêntica** à fórmula anterior — o `cacheKey` não muda em nenhum caso
que já existia antes desta ADR. `expressPhenotype()` é pura (não consome
RNG), então esta chamada extra não perturba nenhum stream de sorteio.

Resultado: dois indivíduos de mesmo genótipo sem `Ma` expresso em nenhum
sexo (ex.: onça `ma/ma`) reusam o mesmo `cacheKey`/imagem, sexo M ou F; um
leão e uma leoa `Ma/Ma` (juba muda a aparência) recebem `cacheKey`s
diferentes.

### 4. Prompt de imagem (`apps/api/src/images/prompt.ts`)

- `coatFeline()`: descritor de juba aparece **só** quando o fenótipo diz
  juba (`"juba completa"`/`"juba parcial"`) — removida a menção fixa "the
  male has", que presumia sexo incorretamente; quando `Ma` é "sem juba",
  nada é dito (mesmo comportamento de silêncio que já existia pros demais
  casos "sem trait").
- `traitVector()`/`buildPrompt()` agora passam `s.sex` pra `expressPhenotype()`.
- **Achado à parte, corrigido localmente**: o descritor ESTÁTICO de
  `panthera-leo` em `SPECIES_INFO` (`packages/shared/src/species.ts`) é fixo
  para o macho ("adult male African lion ... full thick brown mane") —
  nenhuma espécie tem variante por sexo. Corrigido com um pequeno override
  **local ao prompt** (`lionessAwareDescriptor`, só pra panthera-leo fêmea),
  em vez de mudar a assinatura de `speciesInfo()`/`SPECIES_INFO` (afetaria
  todo chamador do pacote — fora de escopo desta ADR; ver Consequências).

## Consequências

- Comportamento de jogo muda: leoas (e qualquer fêmea `Ma`-portadora) deixam
  de mostrar juba na ficha/imagem — biologicamente correto agora.
- `enumerateOffspring()` (preview de opções antes de sintetizar) **não**
  passa sexo pra `expressPhenotype()` — o preview não resolve sexo antes de
  materializar (só `cross()`/`materializeCross()` o fazem, via
  `combineXGametes`). Uma opção de prole com `Ma` expresso no preview pode,
  portanto, "perder" a juba se a prole nascer fêmea. Aceito como limitação
  conhecida — resolver exigiria decidir uma política de exibição (mostrar
  ambos os desfechos? sortear sexo preview?) fora do escopo desta ADR.
  Nenhum sorteio novo foi introduzido em nenhum caminho (RNG cost inalterado).
- `SPECIES_INFO["panthera-leo"].descriptor` continua, no cadastro, descrevendo
  só o macho — o override fica isolado em `prompt.ts`. Um pack com mais
  espécies dimórficas no futuro provavelmente merece um mecanismo genérico
  (descritor por sexo em `SpeciesInfo`), não mais overrides pontuais — fora
  de escopo aqui.
- Os 4 golden tests (`goldendoodle`, `boerpointer`, `danecollie`,
  `pumajaguar`) permanecem com os valores **inalterados** — nenhum usa `Ma`.

## Alternativas consideradas

- **Campo novo `sexLimitedOffPhenotype` por locus** (string explícita pro
  "estado desligado", em vez de derivar do `dominanceRank`): rejeitada por
  agora — adicionaria um campo a `LocusDef` só usado por 1 locus hoje; a
  convenção "alelo mais recessivo do rank" já é suficiente e correta pra
  `Ma`, e generaliza sem dado extra. Revisitar se um futuro locus
  `SEX_LIMITED_*` precisar de um "estado desligado" que não seja o alelo
  mais recessivo.
- **Mudar `speciesInfo()` pra aceitar sexo e ter descritores por sexo em
  `SPECIES_INFO`**: rejeitada nesta ADR — mudaria a assinatura de uma função
  usada por `apps/web` e por testes que a chamam com 1 argumento
  (`cross.service.spec.ts`); escopo maior que o necessário pra corrigir só a
  leoa hoje. O override pontual em `prompt.ts` resolve o caso real sem essa
  mudança de superfície.
- **Verificar dimorfismo só "o pack tem algum locus SEX_LIMITED"** (sem
  reexpressar o zigoto): rejeitada — daria falso positivo pra qualquer
  indivíduo `ma/ma` (nunca expressa juba em nenhum sexo, ex. onça), forçando
  `cacheKey`s diferentes sem motivo visual real e quebrando o reuso de
  imagem que o Gene-Bank depende.

## Errata (2026-09-16)

- **Escopo da regra "alelo mais recessivo = estado desligado"**: essa
  convenção só é correta para loci cujo alelo recessivo representa a
  **AUSÊNCIA** da característica (ex.: `ma` = sem juba — o recessivo é
  literalmente "não tem"). **Não generalizar** para traits onde o recessivo
  é uma variante presente-mas-diferente (ex.: uma futura "produção de
  leite" sex-limited-female, onde faltar a característica no macho não é o
  mesmo conceito que "alelo recessivo") sem abrir uma nova ADR — nesses
  casos a convenção pode dar um "estado desligado" biologicamente sem
  sentido. `Ma` (juba) se encaixa porque "sem juba" já É o fenótipo do
  alelo `ma`, não uma invenção do mecanismo de sex-limiting.
- **`cacheKey` tem implementação ÚNICA**: `computeCacheKey()`
  (`packages/engine/src/cross.ts`, exportada em `packages/engine/src/index.ts`)
  é a ÚNICA fórmula de `cacheKey` no sistema. A API (`image.service.ts`)
  **não recalcula por fórmula própria** — chama `computeCacheKey()`
  diretamente. Isso corrige o achado desta errata (leão/leoa com a mesma
  chave, ver seção 3 acima) e previne a mesma classe de bug se um novo
  consumidor precisar de cacheKey no futuro (chamar a função, nunca
  reimplementar `sha256(hashGenotype(...) + ...)` de novo em outro arquivo).
- **Migração de dados**: espécimes LEGADOS (persistidos antes desta ADR, ou
  fundadores — cujo `cacheKey` gravado é sempre `null` por design) que
  tenham algum locus limitado ao sexo (`Ma`, hoje) precisam de `cacheKey`
  RECALCULADO depois de receberem sexo (migração de dados do ADR-0015/0016)
  — caso contrário, dois indivíduos que deveriam ter aparência diferente por
  sexo continuam compartilhando a mesma chave/imagem até esse recálculo
  acontecer. Nenhuma migração de dados foi executada por esta ADR (fora de
  escopo — ver `seed.ts`/`reset.ts`, intocados); fundadores usam o fallback
  de `cacheKeyOf()` (calcula on-the-fly a cada leitura, já correto) até lá.
