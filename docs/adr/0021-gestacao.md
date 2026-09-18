# ADR-0021 — Gestação: o limite fica onde está o custo (a imagem)

- **Status:** aceito · **Data:** 2026-09-17

## Contexto

Decisão do dono do produto substitui o modelo de "revelação" da ADR-0020
(publicada mais cedo no mesmo dia) por um modelo de 3 passos onde o único
custo real do sistema — a imagem gerada pela fal.ai — só é comprometido
quando o espécime de fato vai nascer, não antes:

1. **CRUZAR**, ver descrições, guardar na incubadora, ver genoma/árvore —
   tudo **livre, sem cota** (inalterado da ADR-0020).
2. **GESTAR** — o jogador escolhe uma entrada da incubadora e inicia a
   gestação. É AQUI, e só aqui, que a vaga (`birthQuota`) é consumida — não
   em "revelar" como na ADR-0020, porque revelar nunca comprometia a imagem
   de verdade (a entrada podia ser descartada depois de revelada sem nunca
   nascer). O tempo de gestação é determinado pela **aura** da entrada:

   | Aura | Tempo de gestação |
   |---|---|
   | 1★ | 12h |
   | 2★ | 18h |
   | 3★ | 24h |
   | 4★ | 36h |
   | 5★ | 48h |

   Vagas por tier (mesmos valores/janelas da `revealQuota` da ADR-0020, só o
   alvo mudou): FREE 1/7 dias corridos · JUNIOR 3/7 dias corridos · SENIOR
   1/dia civil (America/Sao_Paulo) · PHD 3/dia civil. Sem vaga, usa 1
   crédito de imagem; sem nenhum dos dois, 429 com `nextAvailableAt`.
   **Gestações simultâneas não têm teto** — só o RITMO de iniciar novas é
   limitado pela vaga; quantas já estão em andamento ao mesmo tempo, não.
   **Não existe acelerar gestação.**
3. **NASCER** — só depois que o prazo termina (`gestationEndsAt` já
   passado). É aqui que a imagem é de fato gerada — sem cobrar nada de
   novo, a vaga já foi paga em GESTAR — e o espécime é criado com os campos
   já gravados na entrada, **sem recalcular nada**.

A revelação avulsa e o congelamento de descrição (ADR-0020) **somem**: não
fazem mais sentido quando o custo real só existe no nascimento — não há
mais "imagem já paga, mas ainda não decidiu nascer" pra proteger congelando.

O bônus de crédito de imagem (referral/engajamento) passa de **semanal**
para **quinzenal** (15 dias corridos), do Junior pra cima — a recompensa
diária de catalisadores/biomassa continua diária e inalterada.

## Decisão

### 1. `tiers.ts`

`revealQuota` → `birthQuota` (mesmo tipo/valores/janelas — só o nome muda,
porque o gate agora é "iniciar gestação", não "revelar"). `weeklyBonus` →
`biweeklyBonus`.

### 2. Schema

- `incubator_entries` ganha `gestation_started_at timestamptz null` e
  `gestation_ends_at timestamptz null` — ambas `null` = "na incubadora,
  livre, sem prazo" (estado inicial, igual à ADR-0020).
- `image_cache_key` e `revealed_at` **saem** de `incubator_entries` — seu
  único escritor (`reveal()`) foi removido; não existe mais imagem antes do
  nascimento neste modelo. `imageUrl` na listagem passa a ser derivado do
  espécime já nascido (via `bornSpecimenId` → `SpecimenRepository.get()` →
  `cacheKeyOf()`), nunca de uma coluna própria da entrada.
- `reveal_reservations` renomeada para `birth_reservations` (mesma forma,
  só o nome — reflete que a reserva agora é da vaga de gestação).
- **Adição além da lista literal do pedido** (reportada aqui, não só no
  código): `wallets.last_weekly` → `wallets.last_biweekly`. Decisão: manter
  o nome antigo sob a semântica nova (15 dias) pareceria enganoso (mesmo
  problema de nome que motivou o rename `CROSS_QUOTA_UNLIMITED` →
  `QUOTA_UNLIMITED_DEV`, sessão anterior); como `db:generate` já precisa
  rodar nesta rodada por causa dos itens acima, o custo marginal de incluir
  este rename é baixo.
- `frozen`/`markFrozen()` (repositório) ficam **órfãos, mas NÃO removidos**
  — o pedido (item 5) só lista `image_cache_key`/`revealed_at` como
  candidatos a sair "se não tiverem outro uso"; `frozen` não estava nessa
  lista, então foi mantido por interpretação conservadora, com o órfão
  sinalizado em comentário no código e neste ADR para decisão explícita
  numa próxima rodada.
- **Migração**: nenhuma migração foi gerada nem `db:generate` executado
  nesta rodada (regra da sessão: só edição de arquivo, nenhum comando) — o
  dono do produto roda `db:generate` a partir do `schema.ts` já editado.

### 3. `POST /api/v1/incubator/:id/gestate`

Substitui `POST /:id/reveal`. Reserva atômica de `birthQuota` (mesmo padrão
reserva→confirma/estorna da ADR-0020, com fallback de crédito de imagem no
`null`), depois reivindicação atômica da gestação em si
(`IncubatorRepository.claimGestation`, `UPDATE ... WHERE
gestation_started_at IS NULL AND born_specimen_id IS NULL ... RETURNING` no
Postgres) — grava `gestation_started_at = agora` e `gestation_ends_at =
agora + horas da aura` (`gestation-time.ts`). Corrida (2 chamadas na MESMA
entrada) faz a perdedora estornar a vaga que acabou de cobrar e responder
400. Entrada já em gestação ou já nascida → 400 (checado antes de cobrar
E de novo atomicamente, mesmo padrão da revelação da ADR-0020). Nenhuma
imagem é gerada aqui.

### 4. `POST /api/v1/incubator/:id/born`

Substitui a versão da ADR-0020: agora exige `gestation_ends_at` já
passado — antes disso, 400 com o tempo restante em minutos. Depois do
prazo, gera a imagem (`ImageService.generateForSpecimen(...,
skipQuota=true)` — a vaga já foi paga em GESTAR, nunca cobra de novo),
cria o espécime com genótipo/fenótipo/sexo/F/IF/aura/fertilidade/Haldane
copiados da entrada **sem recalcular nada**, e marca `born_specimen_id`.
Já nascida → 400; nunca gestada → 400 ("Inicie a gestação antes de fazer
nascer.").

**Limitação conhecida, não resolvida nesta rodada**: duas chamadas a
`born()` na mesma entrada, exatamente após o prazo, podem ambas passar do
check inicial antes de qualquer uma marcar `bornSpecimenId` — o cache de
imagem por `cacheKey` evita duplicar o CUSTO, mas `specimens.save()` pode
criar 2 espécimes. Não há proteção atômica dedicada (tipo `claimGestation`)
porque (a) não é o tipo de concorrência pedido no item 9 ("gestações
simultâneas: sem teto" é sobre entradas DIFERENTES, não uma corrida na
MESMA entrada) e (b) o `born()` da ADR-0020 nunca teve essa proteção
também. Comentário deixado no código apontando o mesmo.

### 5. Rotas removidas

`POST /:id/reveal` e `POST /:id/freeze` saem inteiramente — não existe mais
revelação avulsa nem congelamento.

### 6. `GET /api/v1/incubator`

Cada entrada devolve `state: "NA_INCUBADORA" | "GESTANDO" | "NASCIDO"`
(derivado de `gestationStartedAt`/`bornSpecimenId`, nunca uma coluna própria
de estado), `gestationEndsAt` (ISO, `null` fora de gestação) e
`gestationHours` (tempo previsto pela aura — sempre presente, útil pra UI
mostrar "vai levar Xh" mesmo antes de gestar).

### 7. `GET /api/v1/me/tier`

`revealQuota` → `birthQuota` no corpo da resposta (mesmo formato: `limit`,
`window`, `used`, `nextAvailableAt`); `weeklyBonus` → `biweeklyBonus`.

### 8. `claimWeekly` → `claimBiweekly`

Janela de 15 dias — **móvel** (compara `now` contra o timestamp do último
resgate, `wallets.last_biweekly`), não bucket de calendário: a implementação
anterior (`weekKey()`) usava igualdade de string contra um bucket ISO-week,
o que funciona pra semana (52-53 buckets cobrindo o ano sem sobra) mas não
pra 15 dias (não divide um calendário em buckets limpos). Mesmo modelo
mental da janela `rolling7d` já usada em `QuotaService`. Continua exigindo
`biweeklyBonus` (FREE → 403 "Bônus quinzenal disponível a partir do plano
Junior."). Rota HTTP renomeada de `POST wallet/weekly` para
`POST wallet/biweekly` — a web ainda chama a rota antiga até o próximo
turno (fora de escopo aqui: "a web vem depois").

## Consequências

- **Custo alinhado ao consumo real, de vez**: a ADR-0020 já tinha alinhado
  bem (revelar era a única ação que gerava imagem), mas ainda permitia
  "revelar e nunca decidir" consumir a cota sem o espécime chegar a
  existir. Agora a vaga só é gasta quando o jogador já decidiu que quer
  aquele espécime — a imagem só é gerada quando ele de fato nasce.
- **Sem "congelar"**: como não existe mais revelação solta pra proteger, o
  conceito de congelamento de descrição desaparece — uma entrada em
  gestação já está "protegida" (ninguém mais compete pela vaga dela; a
  vaga já foi gasta), e uma entrada ainda na incubadora não tem nada a
  perder (sem prazo, sem custo).
- **Espera de produto, não de engine**: o tempo de gestação é uma decisão
  de pacing/monetização (recompensa aura alta com nascimento mais rápido
  seria o oposto do incentivo certo — aqui é o CONTRÁRIO: aura alta =
  espera MAIOR, o prêmio já está na probabilidade/fixação em si, não em
  velocidade), por isso vive em `apps/api/src/incubator/gestation-time.ts`,
  nunca em `packages/engine` (motor é puro/determinístico sobre genótipo).
- Duas tabelas de reserva permanecem (`cross_reservations`,
  `birth_reservations`) — mesma justificativa da ADR-0020 (contadores
  logicamente independentes).
- Migração de schema (rename de 2 tabelas, 2 colunas novas, remoção de 2
  colunas, rename de 1 coluna de `wallets`) gerada via `db:generate` pelo
  dono do produto, não por este agente (regra da sessão).

## Alternativas consideradas

- **Manter o gate em "revelar" e só adicionar gestação depois** — rejeitado
  pelo próprio pedido: cobrar a vaga duas vezes ao longo do fluxo (revelar
  E gestar) não faz sentido quando só existe UM custo real (a imagem, paga
  uma vez, no nascimento).
- **Cobrar a vaga em NASCER, não em GESTAR** — rejeitado: o pedido é
  explícito ("É AQUI que a vaga é consumida" sobre GESTAR) e faz mais
  sentido de produto — cobrar no início da espera (compromisso) em vez do
  fim (resultado) evita que o jogador inicie N gestações "de graça" e só
  descubra o limite quando tentar colher todas.
- **Proteger `born()` com reivindicação atômica dedicada (tipo
  `claimGestation`)** — considerado, não implementado: fora do escopo do
  item 9 (que pede proteção pra gestações simultâneas em entradas
  DIFERENTES, não corrida na mesma entrada) e o comportamento anterior
  (ADR-0020) também não tinha essa proteção; documentado como limitação
  conhecida em vez de resolvido silenciosamente ou ignorado sem registro.
- **Bucket de calendário pra `claimBiweekly` (ex.: 1º e 16º dia do mês)** —
  rejeitado: meses têm 28-31 dias, um bucket fixo faria a janela real
  variar entre ~13 e ~16 dias dependendo de quando o jogador resgata
  primeiro — a janela MÓVEL de 15 dias corridos é a única forma de garantir
  exatamente 15 dias sempre, igual ao que `rolling7d` já garante pra 7.
