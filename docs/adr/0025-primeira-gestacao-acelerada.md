# ADR-0025 — Primeira gestação da conta dura 5 minutos (cortesia de boas-vindas)

- **Status:** aceito · **Data:** 2026-09-18
- **Complementa** a ADR-0021 (gestação): a tabela por aura continua valendo a partir da 2ª gestação de cada conta.

## Contexto

O jogador novo decide se fica nas primeiras horas, e hoje espera no mínimo 12h
(aura 1★) para ver o primeiro filhote (ADR-0021: 12h a 48h por aura). Produto
decidiu: a **primeira** gestação de cada conta leva 5 minutos, qualquer aura.
É cortesia de boas-vindas, **uma vez por conta**, não por cruzamento.

Restrições:
- Só pacing/monetização — **não toca o motor** (`cross()` segue tier-agnóstico;
  anti-P2W intacto: a regra é a mesma para todo tier e não altera nenhum
  resultado genético). Vive na API, junto de `gestation-time.ts`.
- Tempo de regra vem de `Clock` (regra 3), nunca `new Date()` no serviço.
- A marca "já usou a primeira" tem que ser **confiável**. Deduzi-la das
  entradas da incubadora não serve: a entrada nascida some 7 dias depois
  (ADR-0023) e a descartada é apagada — depois disso a conta pareceria "nunca
  gestou" e ganharia os 5 minutos de novo (farmável: gestar, esperar, repetir).

## Decisão

1. **Marca no usuário:** duas colunas nullable em `users` —
   `first_gestation_at` (`timestamptz`) e `first_gestation_entry_id` (`text`,
   sem FK: a entrada some). `NULL` = a cortesia ainda está disponível.
   Gravadas **uma única vez, juntas**, e nunca mais alteradas.
2. **Claim atômico** (`UserRepository.claimFirstGestation(userId, at, entryId)`):
   `UPDATE users SET first_gestation_at = :agora, first_gestation_entry_id =
   :entrada WHERE id = :id AND first_gestation_at IS NULL RETURNING id`. Só um
   chamador recebe `true` por conta — gestações simultâneas de entradas
   diferentes não ganham as duas os 5 minutos.
3. **Ordem em `IncubatorService.gestate()`:** primeiro a vaga/crédito
   (`birthQuota`/crédito, 429 se faltar — o 429 nunca queima a cortesia), só
   então o claim da marca e o claim da entrada (`claimGestation`). Se a
   gestação falhar antes de acontecer (erro ou corrida na mesma entrada), o
   claim é **desfeito** (`releaseFirstGestation`, só se a marca ainda for a da
   MESMA entrada) junto do estorno de vaga/crédito.
4. **Prazo:** 1ª gestação → `início + 5 min` (`FIRST_GESTATION_MINUTES`,
   `firstGestationEndFor`), qualquer aura. Demais → tabela da ADR-0021,
   inalterada. A cortesia é só de **prazo**: a 1ª gestação consome vaga/crédito
   como qualquer outra (o limite do jogo continua sendo o nascimento).
5. **API → web:** `GET /me/tier` ganha `firstGestationAvailable: boolean`
   (a web usa antes de gestar); a entrada (`GET /incubator`, resposta de
   `POST .../gestate`) ganha `firstGestation: boolean` = o id da entrada é
   igual a `first_gestation_entry_id` do dono — dispensa coluna na entrada.
   `gestationHours` continua sendo o tempo da tabela por aura.
6. **Web:** antes de gestar, com a cortesia disponível: "Primeira gestação
   acelerada: 5 minutos" no lugar de "Gestação: Xh"; no card em gestação da
   1ª: "Primeira gestação acelerada. As próximas levam de 12h a 48h."; da
   segunda em diante o tempo da aura é mostrado como antes. O "12h a 48h" sai
   da tabela (`lib/gestation.ts`), não é digitado à parte.

## Consequências

- **Mudança de schema → migração NECESSÁRIA e ainda NÃO gerada** (nesta rodada
  só `schema.ts` foi editado; `db:generate` fica com o dono, como nas demais
  rodadas). Migração aditiva: `ALTER TABLE users ADD COLUMN first_gestation_at
  timestamptz, ADD COLUMN first_gestation_entry_id text` (as DUAS colunas na
  mesma migração). Contas existentes ficam com `NULL` → **todas** ganham a
  cortesia na próxima gestação (inclusive jogadores antigos). É o efeito
  literal do pedido ("a primeira gestação de cada conta"); se a intenção for
  só contas novas, é preciso um backfill (ex.: preencher com `created_at`
  para quem já gestou) — **decisão do dono, pendente**.
- **Risco de deploy (crítico):** o Drizzle enumera todas as colunas do schema
  em `select()`/`insert` de `users`. Subir o código novo **antes** de aplicar a
  migração quebra **login e cadastro**, não só a gestação. Ordem obrigatória
  (DEPLOY.md §7): backup no Neon → `db:migrate` em produção → conferir o schema
  → merge na `main`. Código antigo com a coluna já criada funciona (aditiva).
- O adapter em memória guarda a marca num mapa próprio (não exige linha em
  `users`) porque usuários de cabeçalho dev e testes e2e não têm linha; o
  adapter Drizzle exige a linha (todo usuário real tem). Em produção não há
  diferença. Se a linha faltasse, o claim devolveria `false` e a conta só
  perderia a cortesia (falha conservadora, nunca gestação mais rápida que a
  tabela por engano).
- Web e API duplicam o valor de 5 minutos (`FIRST_GESTATION_MINUTES`), como já
  duplicam a tabela por aura; a web só mostra, o servidor decide. Web antiga
  falando com API nova continua correta (ignora os campos novos e mostra o
  tempo da aura, sem prometer a cortesia); web nova com API antiga não vê
  `firstGestationAvailable` e também não a promete.
- Sem teste do adapter Drizzle de `users` no PGlite: a suíte aplica as
  migrações de `apps/api/drizzle/`, e a da coluna nova ainda não existe.
  Depois de gerada a migração, vale acrescentar o teste do claim atômico.

## Alternativas consideradas

- **Contar entradas com `gestation_started_at` não nulo** — rejeitada: as
  entradas somem (nascida em 7 dias, descartada é deletada) e a conta
  recuperaria a cortesia; ver Contexto.
- **Deduzir de `birth_reservations` CONFIRMED** — rejeitada: o caminho por
  crédito não cria reserva e reservas são um mecanismo de cota, não histórico.
- **Tabela separada `first_gestations`** — viável e mais segura no deploy
  (migração fora de ordem quebraria só a gestação, não o login), mas o pedido
  preferiu campo no usuário e a coluna nullable é aditiva. Fica como saída se
  o risco de ordem de deploy for considerado alto demais.
- **Cortesia por cruzamento ou por aura** — rejeitada: o pedido é explícito,
  uma vez por conta.
- **Identificar a entrada acelerada por igualdade de instante
  (`gestation_started_at = users.first_gestation_at`)** — adotada na 1ª versão
  e **rejeitada** (bug achado nos testes): duas gestações no mesmo milissegundo
  (relógio fixo em teste; pedidos concorrentes em produção) têm o mesmo
  instante e ficariam ambas marcadas como "primeira". O id da entrada, gravado
  no mesmo claim atômico, é único.
- **Coluna `first_gestation` na entrada da incubadora** — rejeitada: o id
  gravado em `users.first_gestation_entry_id` já identifica a
  entrada sem segundo lugar para manter sincronizado.
