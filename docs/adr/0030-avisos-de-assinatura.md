# ADR-0030 — Avisos de assinatura: push (no cron existente) e faixa no app

- **Status:** aceito · **Data:** 2026-09-19
- **Depende de** ADR-0028 (Web Push + cron `push:dispatch`), ADR-0029 (regra de vigência da assinatura, `Clock`, dia de
  São Paulo) e ADR-0024 (assinatura/indicação). **Não muda** a regra de quando a assinatura vale.

## Contexto

O jogador perde o plano pago (a assinatura cai para o Free) sem nenhum aviso dentro do jogo. Queremos avisar em três
momentos — **3 dias antes do fim do período pago**, **no vencimento, quando o pagamento falhou** (`PAST_DUE`, o Stripe
está tentando recuperar) e **quando caiu de fato para o Free** — por dois canais, porque nem todo jogador ativou a
notificação: **push** (reaproveitando `PushSender`/`push:dispatch`) e uma **faixa** visível ao abrir qualquer tela do app,
com link para a página de planos.

Restrições: a REGRA de vigência (ADR-0029: `ACTIVE` sempre vale; `PAST_DUE` vale enquanto `currentPeriodEnd > agora`;
`CANCELED`/`INCOMPLETE` nunca) não pode mudar; cada aviso é enviado **uma vez por período**, com marcação atômica; o
Railway cobra por serviço (preferir o cron existente); tempo vem de `Clock`.

## Decisão

### 1. Regras dos três avisos (interpretações registradas)
- **`EXPIRING` — "Sua assinatura vence em N dias"** (N = dias que faltam, arredondado para cima; 3 na hora exata): de
  `fim − 3 dias` (inclusive) até o fim (exclusivo), **só para quem NÃO vai renovar sozinho**: assinatura `ACTIVE` com
  `cancelAtPeriodEnd` (cancelou de propósito) ou `PAST_DUE`. **Interpretação conservadora:** a leitura literal de "qualquer
  status" mandaria "vence em 3 dias" todo mês a todo assinante que renova automaticamente — falso e vira ruído. Se o produto
  quiser o literal, é uma condição em `pushNoticeKinds`/`bannerKind` (`subscription-notices.ts`).
- **`PAST_DUE` — "O pagamento da sua assinatura falhou"**: status `PAST_DUE` com o plano ainda em vigor. É decidido pelo
  **evento** (o status virou `PAST_DUE`), não por comparar datas: o Stripe avança o período na renovação e marca `past_due`
  se a cobrança falha. Se uma linha aparecer `PAST_DUE` com o período JÁ vencido, pela regra do ADR-0029 o jogador já está
  no Free — vale o aviso seguinte.
- **`DROPPED` — "Sua conta voltou para o plano gratuito"**: a assinatura deixou de valer (`CANCELED`, ou `PAST_DUE` com o
  período vencido) **e** o tier efetivo é mesmo `FREE` (uma concessão em vigor, como o mês grátis do prêmio de indicação,
  o mantém acima do Free: o aviso é marcado mas **não enviado** — "pulado" — e a faixa não aparece). Só para quedas
  **recentes**: 2 dias para o push (evita push em massa a ex-assinantes antigos no primeiro rodar do cron) e 7 dias para a
  faixa. `INCOMPLETE` nunca avisa (o jogador nunca teve o plano).
- **Quem cancelou de propósito também é avisado** (3 dias antes e ao cair): é confirmação útil e convite a voltar.
- **Assinatura que renova antes do vencimento não gera aviso**: o fim do período muda (ou o cancelamento é desfeito) e as
  condições deixam de valer; e a marca é por PERÍODO (item 3).
- Textos (push e faixa usam os MESMOS, montados na API): título "Sua assinatura vence em N dias" (corpo com o nome do plano
  e a data), "O pagamento da sua assinatura falhou" (corpo: o plano segue ativo até a data; se não for resolvido a conta volta
  ao plano gratuito) e "Sua conta voltou para o plano gratuito". O clique/link leva a `/app/planos`.

### 2. Nenhuma reimplementação da regra de vigência
`isSubscriptionInForce(row, now)` (em `subscriptions.repository.ts`) é a ÚNICA definição da regra; os dois adapters, os
avisos e a faixa a usam. O refactor manteve o comportamento (o teste do ADR-0029 compara a função com
`findActiveForUser` em todas as combinações status × momento). `subscription-notices.ts` é puro (`now` por parâmetro).

### 3. "Uma vez por período", atômico (padrão do `ready_notified_at`)
Três colunas nullable em `subscriptions` (**migração NÃO gerada**): `expiry_notice_for`, `payment_failed_notice_for`,
`dropped_notice_for`. Cada uma guarda o `current_period_end` **para o qual** o aviso foi reivindicado. O claim é um
`UPDATE ... SET <marca> = current_period_end WHERE id = ? AND current_period_end/status/cancel_at_period_end IGUAIS aos
lidos AND (<marca> IS NULL OR <marca> <> current_period_end) RETURNING` (`claimNotice`): duas execuções simultâneas nunca
reivindicam o mesmo aviso, e uma linha que mudou entre a leitura e o claim (renovou, reativou) é recusada. Uma renovação
muda o fim do período e libera o ciclo seguinte. A reivindicação vem **antes** do envio ("no máximo uma vez") e vale MESMO
sem dispositivo de push (a faixa cobre; assinar o push depois não gera aviso velho).

### 4. Push: segundo passo do MESMO cron
`push:dispatch` (`dispatch-ready-cli.ts`) passou a executar, no mesmo processo, pool e `PushService`, primeiro a gestação
(ADR-0028) e depois `dispatchSubscriptionNotices` (`push/dispatch-subscriptions.ts`) — **sem serviço novo no Railway**.
`listNoticeCandidates` só devolve as linhas que podem ter aviso (`PAST_DUE`; `ACTIVE` com cancelamento agendado no fim da
janela de 3 dias; `CANCELED` recente) — nunca varre o histórico inteiro. Resumo sempre impresso (candidatas / avisos por
tipo / avisados / sem push / pulados / falhas); saída 1 com falhas. Sem VAPID: desligado, nada é marcado (a faixa segue
funcionando); `web-push` ausente: aborta antes de reivindicar.

### 5. Faixa no app
`GET /api/v1/me/subscription-notice` → `{ notice: null | { kind, subscriptionId, tier, periodEnd, title, body, dismissKey,
url } }`. Rota própria (leve, sem as consultas de cota de `/me/tier`, que já não devolvia os dados da assinatura). O
**servidor** decide (usa a regra do ADR-0029; a web não a duplica). **Some quando a assinatura volta a ficar ativa**: se
existe qualquer assinatura em vigor, `ACTIVE` e sem cancelamento agendado, não há faixa; entre as demais vence a mais
urgente (falhou > vence > voltou ao gratuito). A web (`SubscriptionBanner` no layout de `/app/*`) busca ao abrir, ao voltar
para a aba e ao navegar (no máximo 1x/minuto), é **dispensável** (lembrado em `localStorage` por aviso e por período: um
aviso novo reaparece) e nunca quebra a tela se a busca falhar.

## Consequências

- **Migração necessária e ainda NÃO gerada** (aditiva: 3 colunas nullable em `subscriptions`). **Aplicar ANTES do
  merge** (DEPLOY.md §7): o Drizzle enumera todas as colunas, então código novo sem elas quebra o `SELECT` de
  `subscriptions` — e com ele a resolução de tier de TODOS os pedidos. Depois da migração as marcas ficam `NULL`: no primeiro
  rodar do cron, assinaturas HOJE em `PAST_DUE`, com cancelamento agendado a ≤ 3 dias do fim, ou canceladas há ≤ 2 dias
  recebem o aviso (é justamente o público-alvo); nada mais antigo.
- Sem migração, a faixa e o push ficam fora do ar (não dá para subir só metade); a ordem migrar → merge é obrigatória.
- O `SubscriptionRow` ganhou `noticeFor` (opcional) e a porta ganhou `listForUser`, `listNoticeCandidates` e `claimNotice`
  nos DOIS adapters (in-memory e Drizzle). O adapter Drizzle não tem teste em PGlite (a migração ainda não existe); a
  exclusividade do claim é coberta no adapter em memória (mesmo contrato).
- Aviso "no máximo uma vez": falha transitória de envio perde o push daquele aviso (aparece em FALHAS); a faixa continua.
- A faixa "voltou para o gratuito" fica 7 dias após o fim do período (ou até dispensar/reassinar): para um cancelamento
  imediato com fim do período no futuro, a contagem começa no fim do período (mostra até lá + 7 dias).
- Não foi tratado: reembolso/disputa; assinatura do Stripe em `trialing` (mapeada para `ACTIVE`, sem aviso de vencimento);
  vários planos simultâneos do mesmo jogador (a faixa escolhe o aviso mais urgente).

## Alternativas consideradas

- **Script/serviço de cron próprio** — rejeitado: o Railway cobra por serviço; o passo extra no cron existente reaproveita
  pool, `PushService` e guardas sem complicar.
- **Avisar todo ACTIVE 3 dias antes do fim (leitura literal)** — rejeitada: mente ("vence") para quem renova sozinho.
- **Web calculando a faixa a partir de `GET /billing/subscription`** — rejeitada: duplicaria a regra de vigência no cliente
  (o "caiu" ainda exigiria o tier efetivo, recência e várias linhas) e os textos divergiriam do push.
- **Estender `GET /me/tier`** — rejeitada: é chamada com consultas de cota e a faixa é buscada em toda tela.
- **Marca booleana por tipo** — rejeitada: não distingue períodos (uma renovação com novo cancelamento nunca mais avisaria).
- **Comparar datas para "vencimento com falha"** — rejeitada: o Stripe avança o período na renovação; o evento (`PAST_DUE`) é o
  sinal confiável.
- **Marcar só quando o push chega** — rejeitada: sem dispositivo ninguém seria marcado e, ao assinar o push depois, receberia
  aviso velho; a faixa cobre quem não tem push.
