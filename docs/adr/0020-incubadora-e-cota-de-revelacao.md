# ADR-0020 — Incubadora: cruzar é livre, revelar consome cota

- **Status:** aceito · **Data:** 2026-09-17

## Contexto

Decisão do dono do produto substitui o modelo de cota da ADR-0019 (cota de
**cruzamento** por tier, cada cruzamento já criando um espécime E incluindo
1 retrato de graça) por um modelo em 3 passos:

1. **CRUZAR** — livre, sem custo, sem cota: enumera N descrições de
   fenótipo (genótipo, fenótipo, probabilidade, aura, sexo), **sem imagem**,
   e grava cada uma na **incubadora**. Nenhum espécime nasce aqui.
2. **REVELAR** uma descrição (gera o retrato de IA) — isso é o que consome
   cota, agora chamada `revealQuota` (mesmos valores/janelas da antiga
   `crossQuota`: FREE 1/7dias, JUNIOR 3/7dias, SENIOR 1/dia civil, PHD
   3/dia civil). Esgotada, usa crédito de imagem (mesma fonte de sempre —
   referral/compra/bônus semanal).
3. **NASCER** a partir de uma descrição já revelada — grátis, sem cota,
   reaproveita a imagem já paga na revelação, **sem recalcular nada**.

Descrições não reveladas ficam de graça, sem prazo, sem limite, na
incubadora. Uma revelada-mas-não-nascida pode ser **congelada** (custa
catalisadores, como o `freezeOption` antigo) pra não ser perdida; se não
nascer nem for congelada, é perdida (o aviso é responsabilidade da web).

Sem custo nenhum em cruzar, cruzar vira gratuitamente repetível — precisa de
um teto TÉCNICO (não de jogo) contra automação/spam: 60 chamadas de
POST /cross por hora por usuário, igual pra todo tier.

## Decisão

### 1. `tiers.ts`

`crossQuota` renomeado pra `revealQuota` (mesmo tipo, mesmos valores).
Novo campo `hourlyCrossLimit: 60`, igual pra todo tier (proteção técnica,
não vantagem de tier).

### 2. Dois contadores de reserva independentes, mesmo mecanismo

`QuotaService` (antes só cota de cruzamento) passou a aceitar um `kind`:

- `"cross_hourly"` — limite técnico horário de POST /cross. Reusa a MESMA
  tabela `cross_reservations` de antes (sem migração — só o SIGNIFICADO
  mudou: antes contava a cota de cruzamento por tier, agora conta só o
  teto técnico de 60/hora). Guard: `QuotaGuard` (`quota.guard.ts`), aplicado
  em `POST /cross` como antes — reserva antes do motor rodar, confirma no
  sucesso, estorna na falha. 429 vira `"Muitos cruzamentos seguidos, tente
  em instantes."` (sem `nextAvailableAt` — é um limite técnico, não algo
  que a UI deva expor como "sua cota").
- `"reveal"` — cota de revelação por tier. Tabela NOVA `reveal_reservations`
  (mesma forma da antiga `cross_reservations`, contador independente — não
  deve ser afetado pelo teto horário de cruzar, nem afetá-lo). Reserva feita
  em `IncubatorService.reveal()`, ANTES de chamar o pipeline de imagem —
  mesmo padrão reserva→confirma/estorna, com fallback pra crédito de imagem
  quando a reserva falha, e 429 com `nextAvailableAt` só nesse caso (é cota
  de jogo, a UI deve mostrar quando volta).

Ambas as janelas suportadas (`ReservationWindow`): `"hour"` (nova, só
`cross_hourly`), `"rolling7d"`, `"day"` (America/Sao_Paulo) — mesma
aritmética de sempre, só generalizada pra aceitar `"hour"`.

### 3. Schema — `incubator_entries`

```
incubator_entries
  id                text PK
  owner_id          text not null
  cross_id          text not null   -- correlação (mesmo POST /cross), NÃO é FK
  sire_id           text not null
  dam_id            text not null
  method            text not null
  pack              text not null
  species           text not null
  genotype          jsonb not null
  phenotype         jsonb not null
  prob              double precision not null
  f_pedigree        double precision not null default 0
  fixation_index    double precision not null default 0
  aura              integer not null
  generation        integer not null default 0
  sex               text not null check in ('M','F')
  fertility         double precision null
  haldane_status    text null check in ('NONE','STERILE','REDUCED')
  image_cache_key   text null
  revealed_at       timestamptz null
  born_specimen_id  text null
  frozen            boolean not null default false
  created_at        timestamptz not null default now()
  índice (owner_id, created_at)
```

**Campos além da lista literal pedida** (`sireId`, `damId`, `method`,
`pack`, `species`, `fPedigree`, `fixationIndex`, `generation`, `fertility`,
`haldaneStatus`): necessários porque "nascer" (item 5) tem que criar um
`StoredSpecimen` válido **sem recalcular nada** — sem esses campos não dá
pra montar um espécime só com genótipo/fenótipo/prob/aura/sexo. `cross_id`
**não é FK** pra `crosses` (tabela legada, nunca chegou a ser escrita —
`result_specimen_id` é `NOT NULL`, incompatível com "cruzar não cria
espécime"); é só um id de correlação, igual em toda linha do mesmo
POST /cross, pra a UI conseguir agrupar "essas N descrições vieram do mesmo
cruzamento".

**Sexo sorteado na INCUBAÇÃO, não mais só na síntese**: diferença
deliberada da ADR-0017 — antes, o sexo só era decidido (RNG) no momento de
materializar UM espécime escolhido; agora, como cada descrição vira uma
linha independente que pode nascer sozinha sem recálculo, o sexo (e
fenótipo já resolvido PRA esse sexo, fertilidade, F, IF, aura, cacheKey)
são decididos no momento de CRUZAR, uma vez por descrição, via
`materializeCross()` — mesma função/mecânica de sempre, só chamada N vezes
(uma por opção) em vez de 1.

### 4. `POST /api/v1/cross`

Guard muda de "cota de cruzamento por tier" pra "limite técnico horário"
(`QuotaGuard`, kind `cross_hourly`). Handler: `CrossController.create()`
chama `CrossService.incubate()` (novo método — enumera as opções, roda
`materializeCross()` pra CADA uma com seed derivada `${seed}|${chave da
opção}`) e grava cada resultado via `IncubatorRepository.create()`. Resposta
`{ crossId, entries: StoredIncubatorEntry[] }` — **não** mais
`{ specimen, cacheKey, engine }`.

`CrossService.execute()` (cria espécime direto, ADR-0019) foi **mantido**,
não removido — ainda usado internamente por `GeneBankService.
synthesizeAndFreeze` (ver "Órfãos" abaixo). A rota HTTP `POST /cross` é que
passou a chamar `incubate()` em vez de `execute()`.

**Determinismo do seed por padrão MUDOU deliberadamente**: `computeResult()`
(usado por `execute()`) default do seed é ESTÁVEL
(`${method}:${sireId}x${damId}`, sem aleatoriedade) — repetir a MESMA
chamada sem seed sempre dava o MESMO espécime. `incubate()` (novo) usa
`crossId = randomUUID()` como base do seed quando `dto.seed` não é passado
— cruzar sendo livre/ilimitado, repetir o MESMO par sem seed deveria dar
descrições DIFERENTES a cada vez (esse é o mecanismo: cruze de novo pra ver
mais opções). Com `dto.seed` explícito (testes), o resultado continua
100% determinístico.

### 5. `POST /api/v1/incubator/:id/reveal`

Reivindicação ATÔMICA (`IncubatorRepository.claimReveal`, mesmo padrão de
`claimIncludedPortrait` da ADR-0019 — `UPDATE ... WHERE revealed_at IS
NULL ... RETURNING`) ANTES de cobrar: calcula a cacheKey (pura, sem I/O),
tenta a reserva de `revealQuota` (ou crédito de imagem no fallback), gera o
retrato via `ImageService.generateForSpecimen(..., skipQuota=true)`
(a cota MENSAL de retratos extras da ADR-0019 não se aplica aqui — é uma
cota diferente, pra regenerar), e só então reivindica. Corrida (2 pedidos
simultâneos na mesma descrição nunca revelada): quem perde estorna o que
cobrou e devolve a imagem que o vencedor já gerou — nunca cobra 2×. Já
revelada → devolve a imagem existente sem cobrar nada (nem tenta reservar).

### 6. `POST /api/v1/incubator/:id/born`

Só se `revealed_at` não for nulo (senão 400 "Revele antes de fazer
nascer."); já nascida → 400. Cria o espécime **copiando** genótipo,
fenótipo, sexo, F, IF, aura, fertilidade, Haldane e a `image_cache_key` já
revelada — nenhuma chamada ao motor. `includedPortrait` (ADR-0019) sai
`false`: o retrato já foi pago na revelação, não há "vale" de novo. Mantém
a recompensa por fixação (`WalletService.rewardForCross`, aura alta rende
catalisadores/biomassa) — antes disparada em `execute()`, agora em
`born()`, já que é o nascimento que faz o espécime passar a existir.

### 7. `POST /api/v1/incubator/:id/freeze`

Só revelada e não nascida (senão 400); cobra `FREEZE_COST` (20
catalisadores, mesmo valor do `freezeOption` antigo); idempotente (chamar
2× não cobra 2×). Congelada continua podendo nascer, de graça.

### 8. `DELETE /api/v1/incubator/:id`

Descarta sem checar estado — a API só executa; o aviso "vai perder" é
responsabilidade da web (fora do escopo desta ADR).

### 9. `GET /api/v1/incubator`

Lista as entradas do dono com descrição completa (genótipo, fenótipo,
probabilidade, aura, sexo, fertilidade) + estado (`revealed`, `frozen`,
`born`, `imageUrl` quando revelada). Forma exata (`IncubatorEntryView`)
pode precisar de ajuste quando a web for implementada (prompt seguinte).

### 10. `GET /api/v1/me/tier`

`crossQuota` → `revealQuota` no corpo da resposta (mesmo formato: `limit`,
`window`, `used`, `nextAvailableAt`).

## Órfãos (ADR-0020, item 9)

- **`freezeOption`** (congelar uma opção NÃO sintetizada, pagando
  catalisadores só pra "reservar" o genótipo) foi **removido** (método e
  rota `POST gene-bank/freeze-option`) — toda descrição de um cruzamento já
  fica de graça, sem prazo, na incubadora; não há mais nada pra "reservar".
- **`GeneBankService.synthesizeAndFreeze`** (usado por
  `POST gene-bank/synthesize`, botão "Sintetizar" + congelar o resto da
  web) dependia de `freezeOption` pra congelar as opções não escolhidas.
  Essa sub-funcionalidade foi **removida** (o método continua existindo,
  ainda sintetiza o escolhido via `cross.execute()` — inalterado — mas
  `frozen`/`frozenCount` sempre saem vazios/zero agora, com um comentário
  explicando). Todo o fluxo `gene-bank/synthesize` tende a ser substituído
  pelo par incubadora "revelar"+"nascer" quando a web for atualizada
  (prompt seguinte) — mantido de pé aqui só pra não quebrar o build.

## Consequências

- **Custo de imagem melhor alinhado ao consumo real**: antes, um PhD abrindo
  as 12 opções do seletor pra "ver o retrato antes de escolher" (ADR-0019,
  adendo) esgotava a cota de imagem sem nunca sintetizar nada — a prévia já
  tinha sido removida por isso; agora, cruzar nem gera imagem nenhuma, então
  esse vetor de custo desaparece estruturalmente (não só por remover um
  botão) — só REVELAR (ação explícita, 1 por descrição) gasta.
- Duas tabelas de reserva (`cross_reservations`, `reveal_reservations`) em
  vez de uma — mais uma migração, mas contadores logicamente independentes
  evitam que abuso técnico (spam de cruzamento) drene a cota de jogo
  (revelação) do usuário, e vice-versa.
- `CrossModule`/`IncubatorModule` ficaram desacoplados por design
  (`IncubatorStoreModule`, módulo-folha só com `IncubatorRepository`) —
  `CrossController` grava direto na incubadora sem o resto da feature
  (revelar/nascer/congelar) precisar saber de `CrossService`, evitando um
  ciclo `CrossModule` ⇄ `IncubatorModule`.
- **Genética/modelo de imagem inalterados**: nenhuma probabilidade, alelo,
  regra de dominância ou provider de imagem mudou — só QUEM paga o quê e
  QUANDO o retrato é gerado.
- Migração de schema (`incubator_entries`, `reveal_reservations`) gerada via
  `db:generate` pelo dono do produto, não por este agente (regra da sessão:
  nenhum comando executado).

## Alternativas consideradas

- **Reusar `crosses` (tabela legada) como o "cross_id" de
  `incubator_entries`** — rejeitado: `result_specimen_id` é `NOT NULL`,
  exige um espécime já existente no momento do INSERT, incompatível com
  "cruzar não cria espécime nenhum". Reaproveitar exigiria relaxar essa
  constraint (mudança de schema numa tabela com semântica antiga e nunca
  escrita) — mais arriscado que só usar `cross_id` como correlação solta.
- **Um único contador de reserva pros dois limites** (horário de cruzar +
  cota de revelação) — rejeitado: são limites de NATUREZA diferente (um é
  proteção técnica igual pra todos, o outro é cota de jogo por tier);
  misturar faria um usuário que cruza muito (livre, sem custo) ficar sem
  cota de revelar por acidente, ou vice-versa.
- **Recalcular o espécime no "nascer" a partir de sire/dam/method/seed**
  (em vez de copiar os campos gravados na incubadora) — rejeitado
  explicitamente pelo pedido ("sem recalcular nada") e por segurança: uma
  mudança futura no motor entre "cruzar" e "nascer" (dias/semanas depois,
  descrição não revelada não tem prazo) poderia fazer o espécime nascido
  divergir do que foi mostrado na incubadora.
