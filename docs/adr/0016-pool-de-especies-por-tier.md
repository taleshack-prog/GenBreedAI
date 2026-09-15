# ADR-0016 — Pool de espécies por tier

- **Status:** aceito · **Data:** 2026-09-15

## Contexto

Anteriormente, o gate de acesso por tier (`apps/api/src/common/tier-access.ts`)
só conhecia **família** (felino/canino/grande) e **interespecificidade**
(booleano). Isso deixava todo o catálogo felino — de gato doméstico a
onça-pintada, leão, tigre — igualmente acessível no tier FREE, desde que a
cruza fosse intraespécie. Não havia como restringir especificamente os
**felinos selvagens** ao tier FREE sem também bloquear o gato doméstico
(mesma família).

Esta etapa foi investigada primeiro (sem código) — ver relatório anterior
desta sessão — e confirmada como **nunca implementada** em nenhuma branch
antes deste commit.

## Decisão

### 1. `poolGroup` em `SPECIES_INFO` (`packages/shared/src/species.ts`)

```ts
poolGroup?: "DOMESTIC_CAT" | "WILD_FELINE" | "DOG"
```

- `DOMESTIC_CAT` — só `felis-catus`.
- `WILD_FELINE` — todo o resto do catálogo felino (onça, puma, leão, tigre
  + morfos, leopardo, guepardo, serval, jaguatirica, leopardo-das-neves,
  lince, caracal).
- `DOG` — `boerboel`/`braco-alemao` (as 2 entradas caninas de
  `SPECIES_INFO`; a maioria das raças, que só existe em `DOG_BREEDS`, fica
  sem `poolGroup` — ver "sem inventar restrição" abaixo).

Ausente = sem pool específico cadastrado.

### 2. Tier mínimo por pool + família

```ts
POOL_GROUP_MIN_TIER = { DOMESTIC_CAT: FREE, WILD_FELINE: JUNIOR, DOG: SENIOR }
```

`speciesMinRank(family, species)` = **máximo** entre o mínimo de família
(`FAMILY_MIN_TIER`, inalterado) e o mínimo do `poolGroup` da espécie, se
cadastrado. Sem `poolGroup` cadastrado → cai pro mínimo de família, **nunca
mais restritivo** que o comportamento de sempre — não inventa restrição sem
dado (mesmo princípio já aplicado em `hybridClass()`/`biologicalSpecies()`
nas ADRs 0013/0015).

Isso significa: `DOG` tem o MESMO mínimo (SENIOR) que a família canina já
tinha — não é uma restrição nova pra caninos, só uma re-expressão do mesmo
limite via o mecanismo novo, pra manter os 3 pools consistentes.

### 3. `specimenVisibleAtTier(tier, pack, species): boolean` — o gate único

Substitui `familyVisibleAtTier` (mantida, `@deprecated`, só família) como o
mecanismo PRIMÁRIO de visibilidade. Aplicado:

- **`GET /specimens`** (`specimens.controller.ts`) — filtra a listagem:
  espécimes fora do pool simplesmente NÃO aparecem. "Não vê."
- **`CrossService.resolve()`** (`cross.service.ts`) — logo após buscar
  sire/dam por id, ANTES de qualquer outra validação: se qualquer um dos
  dois estiver fora do pool do tier atual, lança `NotFoundException` com a
  MESMA mensagem/formato de "não encontrado" (nunca revela que o espécime
  existe). "Não cruza" — e sem cadeado: do ponto de vista do cliente, um
  espécime fora do pool é indistinguível de um id inexistente.
- **`GeneBankService.freezeSpecimen`/`thaw`** — mesma checagem, mesmo
  motivo (congelar/descongelar um espécime que o tier não deveria nem ver).

**Efeito colateral notado e aceito:** como o gate de pool roda ANTES do
gate de família antigo (`assertTierAllows`) dentro de `resolve()`, uma
violação de FAMÍLIA (ex.: canino no tier FREE) agora também vira 404 "não
encontrado" — não mais 403 com a mensagem antiga "exige o tier SENIOR ou
superior". `assertTierAllows` continua existindo e correndo depois (defesa
em profundidade — nunca mais restritivo, só redundante nesse caminho), mas
na prática o pool sempre intercepta primeiro pros casos que ele cobre.
Testes atualizados de acordo (`cross.service.spec.ts`).

### 4. `assertTierAllows` simplificado

Perdeu o parâmetro `interspecific: boolean` — a regra antiga
"interespecífico exige JUNIOR" foi **substituída**, não complementada, pelo
pool de espécie (que cobre o mesmo caso E MAIS: intraespécie de espécie
fora do pool grátis, como tigre×tigre-branco). Assinatura antiga preservada
pro resto (família).

## Teste obrigatório (item 2)

```ts
// FREE não vê nem cruza tigre-de-bengala × tigre-branco — intraespécie
// (mesma biologicalSpecies, ADR-0015), mas WILD_FELINE.
specimenVisibleAtTier("FREE", "feline", "panthera-tigris") === false
specimenVisibleAtTier("FREE", "feline", "panthera-tigris-branco") === false
svc.execute("demo", "FREE", { sireId: "tigre-bengala", damId: "tigre-branco", method: "F1" })
  // → rejects com NotFoundException ("não encontrado")
```

Ambas as formas (unidade em `apps/api/test/visibility.spec.ts`, integração
em `apps/api/test/cross.service.spec.ts`) passam.

## Consequências

- **Mudança de comportamento real, visível ao jogador:** onça-pintada,
  puma, leão, tigre etc. deixam de ser acessíveis no FREE — precisam de
  JUNIOR. Gato doméstico (qualquer raça de `felis-catus`) continua FREE.
- `cross.service.spec.ts` teve várias asserções atualizadas — os cenários
  que usavam onça/puma no tier FREE pra testar "intraespécie funciona"
  foram trocados por fixtures de gato doméstico; um teste que verificava a
  mensagem antiga "403 exige SENIOR" pra caninos agora verifica "404 não
  encontrado" (efeito colateral da seção 3, aceito).
- **Testes que dependem do motor (sex/species não repassados —
  `cross.service.ts` ainda tem os 5 erros de typecheck conhecidos)
  continuam falhando pela MESMA razão pré-existente**, não relacionada a
  esta ADR — ver Etapa 5-API. Confirmado explicitamente: os testes que
  dependem SÓ do gate de pool (bloqueio) já passam agora; os que dependem
  do motor terminar a cruza com sucesso só passarão depois da correção do
  item 3.
- Anti-P2W preservado: pool não depende de tier real recebido pelo motor —
  é um gate de ACESSO fora do motor, exatamente como família já era.

## Alternativas consideradas

- **Deixar violação de família como 403, só pool novo como 404**: rejeitada
  por inconsistência — duas semânticas HTTP diferentes pro mesmo conceito
  ("você não pode usar este espécime agora"). Unificado em 404 pool-first.
- **`poolGroup` obrigatório em toda entrada de `SPECIES_INFO`/`DOG_BREEDS`**:
  rejeitada — a maioria das raças caninas só existe em `DOG_BREEDS` (sem
  conceito de família/pool ali); exigir cadastro completo antes de liberar
  o pool atrasaria a entrega sem necessidade, já que o fallback pro mínimo
  de família é seguro e correto pra esses casos.

## Híbridos e fail-closed

Correção pós-commit `7c89ca0` (achado crítico, verificado em produção):

- **Espécime híbrido** (`species` composto por "×", via `combineSpecies` em
  `cross.service.ts` — ex.: `"panthera-uncia×panthera-tigris-albino"`): o
  tier exigido é o **máximo** entre os mínimos de cada componente separado
  por "×", nunca o mínimo de um lookup do slug composto inteiro (que nunca
  bate com nenhuma chave de `SPECIES_INFO`).
- **Componente desconhecido** (não cadastrado em `SPECIES_INFO`) **nunca**
  resolve para FREE — fail-closed: resolve para `max(mínimo de família,
  JUNIOR)`. Inverte o comportamento anterior ("sem inventar restrição extra"
  citado na seção 2 acima), que era fail-*open* pra esse caso específico e
  se mostrou inseguro.
- **Defesa em profundidade mantida**: o gate interespecífico em
  `assertTierAllows` (parâmetro `interspecific: boolean`) não foi removido
  — continua como barreira independente do pool de espécie, pro caso de
  algum caminho de código futuro chamar o gate sem passar pelo pool.
- `isInterspecific` (`cross.service.ts`) compara **espécie biológica por
  componente** (`biologicalSpecies()` aplicada a cada pedaço de um slug
  eventualmente composto por "×"), nunca o slug cru. Bug corrigido: raças
  caninas entre si (ex.: `"boerboel"` × `"braco-alemao"`, ambas
  `canis-familiaris`) eram incorretamente marcadas como interespecíficas
  por comparação direta de string.
- `species` da prole é sempre o **nome da linhagem** (slugs crus,
  concatenados por `combineSpecies` — ex.: `"collie×dogo-argentino"`), não
  gated por `interspecific`. Biologia (gate de tier, Haldane, fertilidade)
  nunca é derivada desse valor — só de `isInterspecific`/`biologicalSpecies`.
- **Achado registrado**: a versão original do commit `7c89ca0` (a de
  `speciesMinRank` fazendo lookup direto do slug composto) deixaria
  visíveis e cruzáveis ao tier FREE os 8 espécimes
  `"panthera-uncia×panthera-tigris-albino"` existentes em produção (pool
  não reconhecido → caía no mínimo de família felina, FREE). Essa versão
  nunca chegou a `main`.
