# ADR-0019 — Cotas de cruzamento persistidas, retrato incluído no cruzamento e bônus semanal por tier

- **Status:** aceito · **Data:** 2026-09-17

## Contexto

Decisão do dono do produto substitui as regras de cota vigentes
(`dailyCrosses` fixo por tier, `monthlyPremiumImages` como única cota de
imagem) por três mudanças:

1. **Cota de cruzamentos por janela**, não mais "N por dia" pra todo tier:
   FREE e JUNIOR passam a ser limitados por uma **janela móvel de 7 dias**
   (não reseta à meia-noite — conta os cruzamentos com `created_at` nas
   últimas 168h); SENIOR e PHD continuam num modelo de **dia civil**, mas
   fixo em **America/Sao_Paulo** (não UTC) e com limites recalibrados
   (1/dia e 3/dia, respectivamente — abaixo dos 5/dia e 10/dia anteriores).
2. **Retrato incluído**: todo cruzamento, em qualquer tier, já gera 1
   retrato de IA do filhote sem consumir cota de imagem nem crédito — porque
   o jogo sempre gerou esse retrato de qualquer forma (é o "prêmio" visual
   do cruzamento), só que antes ele saía da mesma cota mensal que prévias de
   fenótipo e regeneração, o que é uma confusão de UX (o jogador achava que
   "cruzar" e "ver o filhote" eram ações independentes de custo).
3. **Bônus semanal (`claimWeekly`) tier-gated**: antes qualquer tier
   (inclusive FREE) podia coletar; passa a exigir JUNIOR+.

Adicionalmente, a cota de cruzamentos vivia **inteiramente em memória**
(`QuotaService` original) — reiniciar o processo (todo deploy) zerava a
cota de todo mundo, permitindo abuso trivial (forçar um redeploy pra
resetar). Precisa ficar persistida.

## Decisão

### 1. Política por tier (`apps/api/src/common/tiers.ts`)

`dailyCrosses` e `monthlyPremiumImages` são removidos; `TierPolicy` ganha:

```ts
crossQuota: { limit: number; window: "rolling7d" | "day" };
monthlyExtraImages: number; // só retratos EXTRAS — o incluído no cruzamento não conta aqui
weeklyBonus: boolean;
```

| Tier | crossQuota | monthlyExtraImages | weeklyBonus |
| --- | --- | --- | --- |
| FREE | 1, rolling7d | 0 | false |
| JUNIOR | 3, rolling7d | 0 | true |
| SENIOR | 1, day (America/Sao_Paulo) | 15 | true |
| PHD | 3, day (America/Sao_Paulo) | 20 | true |

### 2. Cota de cruzamento persistida (`cross_reservations`)

Nova tabela (`apps/api/src/db/schema.ts`):

```
cross_reservations
  id          text PK
  owner_id    text not null
  created_at  timestamptz not null default now()
  status      text not null check (status in ('RESERVED','CONFIRMED'))
  índice (owner_id, created_at)
```

Fluxo (inalterado na forma — reserva no guard, confirma/estorna no
controller — só a persistência muda):

- `QuotaGuard.canActivate` reserva **antes** de `CrossController.create`
  chamar `CrossService.execute`: dentro de uma transação,
  `pg_advisory_xact_lock(hashtext(owner_id))` serializa por dono; conta
  reservas do dono na janela (`now() - 7 dias` pra `rolling7d`; início do
  dia civil em America/Sao_Paulo pra `day`) — contando `CONFIRMED` sempre e
  `RESERVED` só se tiver menos de **10 minutos** (proteção contra processo
  morto que reservou e nunca confirmou nem estornou); se `< limit`, insere
  `RESERVED` e segue; senão, 429.
- Sucesso do cruzamento → `UPDATE ... SET status='CONFIRMED'`. Falha →
  `DELETE` da reserva (estorno), como já era o comportamento em memória.
- **Sem `DATABASE_URL`** (suíte de testes): `QuotaService` mantém um caminho
  em memória com a mesma semântica de janela/staleness — sem `await` entre
  contar e inserir, então atômico por construção (thread única do Node).
- `CROSS_QUOTA_UNLIMITED=true` (flag de teste/seed pré-existente) continua
  ignorando o limite.

### 3. Retrato incluído (`specimens.included_portrait`)

Nova coluna `included_portrait boolean not null default false`. Todo
espécime nascido de cruzamento sai com `true`; fundadores, `false`.

- Depois de `repo.save(...)` em `CrossService.execute`, dispara (fire-and-
  forget, mesmo padrão já usado por `wallet.rewardForCross(...).catch(...)`)
  `ImageService.generateForSpecimen(stored, ownerId, tier, true)` — sem
  cobrar cota nem crédito. Se render com sucesso, `claimIncludedPortrait`
  vira `included_portrait=false` atomicamente
  (`UPDATE ... WHERE included_portrait=true RETURNING`, pra nunca dar 2
  retratos "de graça" por corrida). **Falha na geração não desfaz o
  cruzamento** — só loga.
- `POST /specimens/:id/image`: se o espécime é do usuário e
  `included_portrait=true` e não é `force`, usa esse claim atômico (grátis);
  senão, cai na regra normal (cota mensal → crédito).
- **Regenerar (`force=true`) nunca consome o retrato incluído** — mesmo que
  ele ainda esteja disponível, `force` sempre paga pela regra normal (ou é
  bloqueado, no caso de fundador).

### 4. `GET /api/v1/me/tier`

Passa a devolver:

```jsonc
{
  "tier": "SENIOR",
  "crossQuota": { "limit": 1, "window": "day", "used": 0, "nextAvailableAt": null },
  "monthlyExtraImages": 15,
  "weeklyBonus": true
}
```

`nextAvailableAt`: `null` se ainda há cota; senão, pra `rolling7d`, o
instante em que a reserva mais antiga contada na janela sai dela
(`createdAt + 7 dias`); pra `day`, o próximo início de dia civil em
America/Sao_Paulo.

### 5. Bônus semanal tier-gated

`GeneBankController.claimWeekly` resolve o tier efetivo
(`TierService.resolve`) e recusa com `403 "Bônus semanal disponível a
partir do plano Junior."` se `!tierPolicy(tier).weeklyBonus`. Web esconde o
botão pra quem não tem `weeklyBonus`.

## Consequências

- Cota de cruzamento sobrevive a deploy/restart (persistida), fecha o vetor
  de abuso "força um redeploy pra resetar a cota".
- Janela móvel (FREE/JUNIOR) é mais restritiva de percepção que "N por dia":
  não há mais um "reset à meia-noite" previsível — o jogador só recupera 1
  slot quando o cruzamento mais antigo contado sai da janela de 7 dias.
  Compensado pela UI expor `nextAvailableAt` explicitamente.
- SENIOR caiu de 5/dia pra 1/dia e PHD de 10/dia pra 3/dia — redução
  deliberada de cota de cruzamento compensada pelo retrato incluído (que
  antes precisava sair da cota mensal de imagem) e pelos 15/20 retratos
  extras/mês inalterados em valor absoluto (só o rótulo mudou, de "imagens
  premium" pra "retratos extras" — o retrato do próprio filhote não conta
  mais nessa cota).
- **Modelo de imagem inalterado**: continua FLUX.2 [pro]
  (`fal-ai/flux-2-pro`) único pra todos os tiers — essa ADR não mexe em
  geração de imagem, só em quem paga o quê. Retrato incluído usa o mesmo
  pipeline/gerador de sempre, só sem descontar cota/crédito.
- **Margem de imagem**: dar 1 retrato de graça por cruzamento aumenta o
  custo de inferência por cruzamento; a meta de produto é manter o custo de
  imagem ≤ 30% da receita líquida por usuário pagante — não modelado nesta
  ADR (é uma restrição de precificação, não de engenharia), mas é a razão
  declarada pela redução de `crossQuota` em SENIOR/PHD (menos cruzamentos ⇒
  menos retratos incluídos gerados ⇒ custo de inferência sob controle sem
  mexer em preço nem em crédito avulso).
- `ImageModule`/`CrossModule`/`TierModule` precisaram de 2 módulos-folha
  novos (`SpecimensModule`, `QuotaModule`) pra evitar dependência circular
  NestJS ao injetar `ImageService` em `CrossService` e `QuotaService` em
  `MeController` — puramente estrutural, sem efeito em regra de negócio.
- Migração de schema (`included_portrait`, `cross_reservations`) gerada via
  `db:generate` pelo dono do produto, não por este agente (regra da sessão:
  nenhum comando executado).

## Alternativas consideradas

- **Resetar cota de cruzamento à meia-noite UTC** (mais simples de
  implementar) — rejeitado: o dono do produto pediu explicitamente janela
  móvel de 7 dias pra FREE/JUNIOR, e dia civil em **America/Sao_Paulo**
  (não UTC) pra SENIOR/PHD, pra bater com o fuso majoritário da base de
  usuários.
  <br>Motivo (ADR original, mantido aqui: FREE/JUNIOR usam janela móvel
  para não criar um "horário de virada" que os jogadores organizem sua vida
  em torno; SENIOR/PHD, tiers pagos com maior intenção de uso diário
  regular, usam dia civil local para dar previsibilidade ("todo dia às
  00h eu ganho minha cota de novo").
- **Cobrar o retrato do cruzamento da cota mensal de imagem** (comportamento
  anterior) — rejeitado: confunde o jogador (cruzar deveria sempre mostrar o
  filhote) e nesta ADR o dono do produto decidiu separar as duas cotas.
- **Deixar a cota de cruzamento em memória e só persistir o retrato
  incluído** — rejeitado: não resolve o vetor de abuso "resetar via
  redeploy", que é justamente o motivo da mudança.
