# ADR-0028 — Web Push: aviso "Gestação concluída" por cron externo do Railway

- **Status:** aceito · **Data:** 2026-09-19
- **Depende de** ADR-0026 (PWA instalável, service worker sem cache) e ADR-0021/0025 (gestação). **Excepciona** a
  linha do CLAUDE.md "nenhum processo agendado" (ver Decisão 1).

## Contexto

Queremos avisar o jogador, por notificação do navegador, quando o filhote "nascer". Mas o nascimento
NÃO é automático: `POST /incubator/:id/born` é sempre disparado pelo jogador (ele já está com o app
aberto), então avisar "nasceu" não faz sentido. O evento que acontece com o jogador **longe** do app é
outro: o **fim da gestação** (`gestation_ends_at`, de 5 minutos na primeira gestação, ADR-0025, até 48 h),
quando a entrada passa a "pronto para nascer". É esse o aviso — **"Gestação concluída"**.

Esse evento tem hora marcada e a API não tem nenhum agendador (tudo roda por requisição, CLAUDE.md §5). O
Web Push não agenda envio, e a API do navegador que agendava notificações foi abandonada: alguém precisa
acordar, achar as gestações vencidas e enviar.

Restrições: sem cota, sem custo (é só um push), idempotente, seguro para rodar a cada 5 minutos para
sempre; falha de envio nunca pode quebrar o fluxo que a disparou; sem chaves VAPID o recurso fica
desligado sem quebrar nada.

## Decisão

1. **Gatilho: cron externo do Railway** rodando o script `push:dispatch` a cada 5 minutos (mesmo padrão
   dos `images:*`: script na API, dry-run/guardas, sempre imprime resultado). A API em si continua sem
   agendador — o processo agendado é externo e é só o Railway chamando um comando. Alternativa descartada:
   `setInterval` dentro da API (Alternativas).
2. **Modelo de dados** (migração **não gerada** nesta rodada — `db:generate` fica com o dono):
   - `push_subscriptions` (`id`, `user_id` → `users` com `ON DELETE CASCADE`, `endpoint` **único**, `p256dh`,
     `auth`, `user_agent`, `created_at`, `last_used_at`, `failed_at`). Uma linha por dispositivo; uma pessoa
     tem vários. Assinar de novo o mesmo endpoint **atualiza** a linha (chaves novas, `failed_at` zerado,
     `created_at` preservado) em vez de duplicar. **Só `endpoint` é único** (`user_id` não é: vários
     dispositivos por usuário). `listByUser` ordena por `(created_at, id)` nos dois adapters — ordem total
     e estável, mas o `id` é uuid aleatório, então dispositivos criados no mesmo instante saem numa ordem
     arbitrária (a ordem de envio entre dispositivos não tem significado de negócio). Se outra conta assina
     no mesmo navegador a linha passa a ser
     dela.
   - `incubator_entries.ready_notified_at` (timestamp, nullable) e índice em `gestation_ends_at`.
3. **Claim atômico, "no máximo uma vez":** `UPDATE incubator_entries SET ready_notified_at = :agora WHERE id
   IN (candidatas) AND ready_notified_at IS NULL AND born_specimen_id IS NULL RETURNING *`. A condição é
   repetida no UPDATE externo: uma segunda execução simultânea espera o lock da linha, reavalia, vê a marca e
   pula — cada entrada é avisada por UMA execução só. A marca é gravada **antes** do envio: se o envio falhar
   o aviso daquela entrada se perde (conta em FALHAS), preferível a reenviar a cada 5 minutos.
4. **Candidata** = gestação iniciada e vencida, **não nascida** (se o jogador já fez nascer antes do aviso, não
   é mais candidata) e ainda não avisada. A marca é gravada **mesmo que o dono não tenha assinatura**: se não
   fosse, ao assinar depois ele receberia um aviso velho de uma gestação que terminou há tempos.
5. **Envio:** `PushService.sendToUser` manda a **todos** os dispositivos do usuário; assinatura que o serviço
   de push devolve **404 ou 410** é **apagada** (app desinstalado/permissão revogada); outro erro mantém a
   assinatura com `failed_at`. **Nunca lança** para quem chamou. Várias gestações vencidas do mesmo dono na
   mesma rodada viram **um** push ("<fenótipo> e mais N prontos para nascer").
6. **Texto:** título **"Gestação concluída"**; corpo = nome do fenótipo (o mesmo `phenoSummary` que a
   Incubadora mostra — movido para `packages/shared` para a API e a web falarem o mesmo texto); ícone
   `icon-192.png`; o clique abre a **Incubadora** (`/app/incubadora`, só na mesma origem).
7. **Recurso opcional e desligado por padrão:** exige `VAPID_PUBLIC_KEY` **e** `VAPID_PRIVATE_KEY`
   (`VAPID_SUBJECT` opcional) na API e `NEXT_PUBLIC_VAPID_PUBLIC_KEY` na web. Sem elas: `GET /push/config` →
   `enabled:false`, `POST /push/subscribe` → 503, `sendToUser` é no-op, a web não renderiza o botão e
   `push:dispatch` imprime "DESLIGADO" e sai com 0 **sem marcar nenhuma entrada** (elas continuam candidatas
   quando ligarem). Só uma das duas chaves = configuração incompleta: desliga e o script aborta com erro.
8. **Segurança do `endpoint`:** é uma URL enviada pelo cliente e o servidor faz POST nela ao enviar — sem
   validação seria SSRF. Só é aceito HTTPS, sem credencial/porta estranha, nos hosts dos serviços de push
   reais (FCM, Mozilla, Apple, WNS). As chaves da assinatura nunca são devolvidas por rota nem logadas.
9. **Rotas:** `GET /api/v1/push/config` (pública), `POST /api/v1/push/subscribe` (autenticada; grava/atualiza),
   `DELETE /api/v1/push/subscribe` (autenticada; só remove o endpoint do próprio usuário; funciona mesmo sem VAPID).
10. **Service worker** (`public/sw.js`): trata `push` (SEMPRE mostra uma notificação — o Safari/iOS revoga a
    assinatura de quem recebe push sem exibir nada) e `notificationclick` (abre/foca o app na URL da
    mesma origem). Continua **sem cache offline** (ADR-0026).
11. **Web:** botão "Avisar quando nascer" no Perfil e na Incubadora: pede a permissão num clique, registra o
    SW se preciso, assina (`userVisibleOnly`) e envia à API. Permissão **negada** → explica como reverter por
    sistema. iPhone sem o app instalado → mostra primeiro a instrução de instalar; iPhone fora do Safari →
    abrir no Safari; iOS < 16.4 → atualizar. Sem suporte → aviso. Decisão de qual estado mostrar em função
    pura (`lib/push.ts`).

## Limitação do iPhone

No iOS o Web Push só existe para **apps instalados na tela inicial** (Safari → Compartilhar → "Adicionar à
Tela de Início") e a partir do **iOS 16.4**. Numa aba comum do Safari — e em qualquer outro navegador no
iOS — o navegador nem expõe `PushManager`, e não há como contornar. Por isso a web trata o iPhone à parte e
manda instalar primeiro (o PWA já é instalável, ADR-0026). No Android e no desktop funciona no próprio
navegador, sem instalar. Mesmo instalado, o usuário pode revogar em Ajustes → Notificações.

## Consequências

- **Migração NECESSÁRIA e ainda NÃO gerada**: `push_subscriptions`, `incubator_entries.ready_notified_at` e
  os índices `incubator_entries_gestation_ends_idx` e `push_subscriptions_user_idx`. **Risco de deploy:** o
  Drizzle enumera todas as colunas — código novo sem a coluna quebra `GET /incubator`, gestar e nascer (não
  só o push). Ordem: backup → `db:migrate` → conferir → merge (DEPLOY.md §7). Na 1ª execução do cron,
  todas as entradas hoje vencidas e não nascidas ficam marcadas sem envio (ninguém tem assinatura ainda).
- **Dependência `web-push` ainda NÃO instalada** (`pnpm --filter @genbreedai/api add web-push`, `package.json`
  e lockfile juntos — o Dockerfile usa `--frozen-lockfile`). Carregada por `import()` dinâmico com o nome em
  variável (o `typecheck` passa antes e depois). Sem ela, `push:dispatch` aborta **antes** de marcar qualquer
  entrada.
- **Precisão do aviso:** o cron do Railway roda no mínimo a cada 5 minutos, então o aviso chega até ~5 min
  depois do fim da gestação (a gestação de 5 minutos da 1ª vez pode avisar em até 10).
- **"No máximo uma vez":** falha transitória de envio perde o aviso daquela entrada (aparece em FALHAS; o
  estado real continua visível na Incubadora, "Pronto para nascer!").
- O serviço de cron do Railway é peça de infraestrutura a criar e monitorar (o log de cada execução sempre traz
  a contagem; saída 1 em erro/falhas). Sem ele nada é avisado.
- O adapter Drizzle do claim e do upsert não tem teste em PGlite: a suíte aplica as migrações de
  `apps/api/drizzle/` e a das novas colunas/tabela ainda não existe. A exclusividade do claim é coberta no
  adapter in-memory (mesmo contrato da porta). Vale acrescentar os testes Drizzle depois da migração.
- Não verificado em aparelho real (Android, desktop, iPhone instalado).

## Alternativas consideradas

- **`setInterval` dentro da API** (sem serviço novo) — rejeitada pelo dono: contraria a convenção "sem
  processo agendado" da API e mistura trabalho periódico com o servidor de requisições.
- **Notification Triggers / agendar no cliente** — abandonada nos navegadores; não funciona com o app fechado.
- **Notificar "nasceu"** — sem sentido: o jogador dispara o nascimento com o app aberto.
- **Endpoint HTTP interno acionado por um cron** — exigiria segredo e rota nova; o script direto no banco não
  expõe superfície.
- **Marcar como avisada só quando o envio der certo** — reenviaria notificação repetida a cada 5 minutos em
  falha persistente; preferido "no máximo uma vez".
- **Não marcar entradas de donos sem assinatura** — quem assinasse depois receberia avisos velhos.
- **Tabela de eventos/outbox de notificações** — mais peças; a coluna `ready_notified_at` resolve o único evento existente.
- **Aceitar qualquer `endpoint` https** — abre SSRF (o servidor posta na URL do cliente).
