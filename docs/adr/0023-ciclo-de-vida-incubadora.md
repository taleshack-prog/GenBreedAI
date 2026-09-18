# ADR-0023 — Ciclo de vida das entradas da incubadora: retenção de 7 dias após nascer + teto de 200 não-gestadas

- **Status:** aceito · **Data:** 2026-09-18

## Contexto

Cruzar é livre e sem custo (ADR-0020/0021) — cada cruzamento grava até 6
entradas (`optionCount`, `cross.service.ts`) em `incubator_entries`. Nenhuma
entrada era apagada automaticamente: uma entrada NASCIDA (já virou espécime,
com link no Gene Bank) continuava ocupando linha pra sempre, e uma entrada
NÃO GESTADA (livre, sem prazo — ADR-0020/0021) também. A tabela cresce sem
limite e ocupa espaço no banco, sem nenhum benefício pro jogador (a entrada
NASCIDA é só um link redundante pro espécime, que já vive no Gene Bank; a
entrada não gestada acumulada além de qualquer uso razoável é só ruído).

### (a) Processo agendado hoje

**Nenhum.** Busca por cron/job/fila (`@nestjs/schedule`, BullMQ, `node-cron`,
`setInterval`) em todo `apps/api/src` não achou nada — nem no
`package.json`. Tudo roda por requisição HTTP. Por isso a limpeza desta ADR é
**preguiçosa** (lazy): dispara dentro de `GET /api/v1/incubator`
(`IncubatorService.list`) e ao gravar um cruzamento novo (`POST /api/v1/cross`,
`CrossController.create`), nunca por timer.

### (b) Entradas por cruzamento e índice

`optionCount()` (`cross.service.ts`) é **sempre 6** (tier não muda o motor,
anti-P2W) — até 6 entradas por `POST /cross` (pode ser menos se
`enumerateOffspring` não tiver 6 fenótipos distintos pra enumerar, ex. pais
muito homozigotos).

Índice existente: `incubator_entries_owner_created_idx` em `(owner_id,
created_at)`. Cobre bem "achar as mais antigas de um dono" (`ORDER BY
created_at DESC`/`ASC` filtrado por `owner_id`) — usado tanto pela paginação
(ADR-0021 item 2) quanto pelo teto desta ADR (`listOldestNonGestatedBeyondCap`,
`OFFSET cap` sobre a lista já ordenada). Não é um índice PARCIAL pro filtro
exato de "não gestada" (`gestation_started_at IS NULL AND born_specimen_id IS
NULL`) — o filtro roda sobre o resultado já reduzido pelo índice de
`(owner_id, created_at)`, adequado pro volume por dono que esta própria ADR
passa a limitar (200). Um índice parcial dedicado exigiria migração — **não
criado aqui** (item 5 do pedido: nenhuma mudança de schema), fica registrado
como otimização futura se o volume por dono algum dia justificar.

### (c) O que a web mostrava no estado NASCIDO (antes desta ADR)

Card com a imagem (ou "modo procedural" se ainda sem retrato) + um link "✓
Ver espécime" pro Gene Bank. Nenhum aviso de que a entrada tem prazo — porque
não tinha.

## Decisão

### 1. Retenção de 7 dias após nascer

Entrada NASCIDA (`bornSpecimenId != null`) é apagada **7 dias corridos**
depois do nascimento — o ESPÉCIME nunca é afetado, continua no Gene Bank pra
sempre (só a ENTRADA, que é só a descrição/link, some).

**Sem coluna nova** (item 5 do pedido): "instante do nascimento" usa
`specimens.createdAt` do espécime já vinculado (`bornSpecimenId`) — a coluna
já existia em `specimens` (só não estava exposta na porta `StoredSpecimen`,
que ganhou o campo `createdAt?: Date`, OPCIONAL pelo mesmo motivo de
`includedPortrait?` — não obrigar todo literal existente, ex. os 74
fundadores, a declarar um valor). `IncubatorService.born()` agora passa
`createdAt: this.clock.now()` explicitamente ao criar o espécime (nunca
`new Date()` direto — precisa ser controlável por `Clock` pros testes
simularem o prazo sem esperar de verdade). O adapter Drizzle ignora esse
campo na escrita (usa `defaultNow()` do Postgres, o instante real do INSERT,
que é equivalente em produção) mas passa a devolvê-lo em leitura
(`getCreatedAtBatch`, novo método em lote na porta `SpecimenRepository`).

Limpeza preguiçosa (`pruneExpiredBorn`, `incubator-lifecycle.ts`): busca as
entradas NASCIDAS do dono (`IncubatorRepository.listBornSpecimenIds`), busca
o `createdAt` dos espécimes em lote (`SpecimenRepository.getCreatedAtBatch`),
apaga (`IncubatorRepository.deleteMany`) as que passaram de 7 dias. Roda no
INÍCIO de `IncubatorService.list()` (antes de listar/contar — senão a MESMA
resposta ainda mostraria uma entrada vencida) e no INÍCIO de
`CrossController.create()` (antes de gravar as entradas novas do
cruzamento).

### 2. Teto de 200 não-gestadas

Só roda ao GRAVAR um cruzamento novo (nunca no `GET`). Depois de gravar as
entradas do cruzamento, se o dono passar de 200 entradas NÃO GESTADAS
(`gestationStartedAt === null` — por construção nunca nascida também, ver
`incubatorStateOf`), apaga as mais ANTIGAS (`createdAt` desc, `OFFSET 200`
sobre a lista já ordenada — `IncubatorRepository.
listOldestNonGestatedBeyondCap`) até caber. Nunca apaga entrada em gestação
nem nascida — o filtro "não gestada" já as exclui por definição, sem precisar
de exceção explícita. As entradas RECÉM-criadas no mesmo cruzamento nunca são
as descartadas (são sempre as mais NOVAS do lote). `POST /cross` devolve
`discardedForCap: number` — quantas foram apagadas por causa do teto (0 na
maioria das vezes).

### 3. Web

Card NASCIDO ganha um texto discreto: "Sai da incubadora em N dias — o
espécime fica no Gene Bank" (`incubatorExitLabel`, `lib/gestation.ts`, usa o
novo campo `expiresAt` da entrada — calculado pela API a partir do
`createdAt` do espécime, `IncubatorService.toView`). Quando `POST /cross`
descarta por teto (`discardedForCap > 0`), o Laboratório mostra "N
descrições antigas foram liberadas para abrir espaço." (tom neutro, não é
erro).

### 4. Testes

`incubator.e2e.spec.ts` ganhou: (a) entrada nascida há 6 dias permanece, há 8
dias some do `GET /incubator`/`list()`, contagem por estado correta, e o
ESPÉCIME (genótipo/fenótipo/sexo) segue intacto depois da entrada sumir; (b)
teto descarta as mais antigas não-gestadas, nunca uma em gestação nem uma
nascida (mesmo sendo as entradas mais antigas de todas no cenário do teste);
(c) teste HTTP completo do teto de 200 de verdade via `POST /cross`,
confirmando `discardedForCap` na resposta. Todos usam `SystemClock.
setForTesting()` — nenhuma espera real.

## Consequências

- **Tabela para de crescer sem limite**: toda entrada eventualmente sai —
  NASCIDA em até 7 dias, não-gestada quando o dono passa de 200 (e cruzar de
  novo é o único jeito de disparar a limpeza — um dono que nunca mais
  cruzasse manteria as não-gestadas indefinidamente, mas sem crescer, porque
  ninguém mais grava linha nova pra ele).
- **Backlog pré-existente**: contas antigas (antes desta ADR) podem ter
  milhares de entradas NASCIDAS/não-gestadas acumuladas — a primeira
  chamada de `GET /incubator`/`POST /cross` depois do deploy paga esse custo
  de limpeza de uma vez (podendo ser mais lenta que o normal nessa
  primeira chamada); depois disso, o volume por dono fica sempre pequeno.
- **`StoredSpecimen.createdAt` exposto**: mudança de porta, não de schema —
  qualquer código que construía um `StoredSpecimen` sem esse campo continua
  válido (campo opcional); `gene-bank.service.ts` (freeze/unfreeze) preserva
  o valor existente porque faz `{ ...s, status: ... }` (spread do que já veio
  de `get()`).
- **`CrossController` ganhou 2 dependências** (`SpecimenRepository`, `Clock`)
  — ambas já disponíveis no grafo de DI de `CrossModule` (`SpecimensModule`
  já importado por causa de `CrossService`; `ClockModule` é módulo-folha,
  adicionado agora) — nenhum ciclo novo.
- **Nenhuma migração de schema** (item 5 do pedido) — confirmado antes de
  editar (seção (b) acima) que `specimens.createdAt` já existente resolve o
  "instante do nascimento" sem coluna nova em `incubator_entries`.

## Alternativas consideradas

- **Coluna `born_at` dedicada em `incubator_entries`** — rejeitada: exigiria
  migração (`db:generate`), proibido nesta rodada sem reportar antes; e seria
  redundante com `specimens.createdAt`, que já é exatamente o mesmo instante
  (gravado pela mesma chamada, `IncubatorService.born()`).
- **Cron/job dedicado (BullMQ, já citado no stack do CLAUDE.md)** —
  rejeitada pro escopo desta ADR: não existe NENHUM processo agendado hoje
  (achado do item (a)); introduzir o primeiro exigiria infraestrutura nova
  (worker, conexão Redis dedicada) fora do pedido, que foi explícito sobre
  preferir a limpeza preguiçosa quando não há processo agendado.
- **Índice parcial dedicado pro filtro "não gestada"** — considerado,
  não criado: exigiria migração; o índice `(owner_id, created_at)` já
  existente é adequado pro volume que o próprio teto de 200 garante daqui
  pra frente.
