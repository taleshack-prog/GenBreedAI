/*
 * Service worker do GenBreedAI — instalação (PWA, ADR-0026) + Web Push (ADR-0028).
 * NÃO faz cache offline, de propósito: cache mal feito serve conteúdo velho (telas do jogo,
 * respostas da API) e é pior que nada. Qualquer cache futuro exige decisão própria.
 *
 * O `fetch` abaixo NÃO chama `respondWith`: o navegador segue com o pedido de rede normal,
 * como se não houvesse service worker.
 *
 * Push: a API (`push:dispatch`) manda `{ title, body, icon, url, tag }` em JSON. O `push`
 * SEMPRE mostra uma notificação (o Safari/iOS revoga a assinatura de quem recebe push sem
 * exibir nada). O clique abre (ou foca) o app na `url` — só na MESMA origem.
 */
const DEFAULT_URL = "/app/incubadora";
const DEFAULT_ICON = "/icon-192.png";

self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", () => { /* passthrough: sem cache, sem interceptar */ });

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "GenBreedAI";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: typeof data.icon === "string" && data.icon ? data.icon : DEFAULT_ICON,
    data: { url: typeof data.url === "string" && data.url ? data.url : DEFAULT_URL },
  };
  if (typeof data.tag === "string" && data.tag) options.tag = data.tag;
  event.waitUntil(self.registration.showNotification(title, options));
});

/** Só URLs da mesma origem do app; qualquer outra coisa cai na Incubadora. */
function sameOriginUrl(raw) {
  try {
    const url = new URL(raw, self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL(DEFAULT_URL, self.location.origin).href;
  } catch (_e) {
    return new URL(DEFAULT_URL, self.location.origin).href;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = sameOriginUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && "focus" in client) {
        // App já aberto: leva pra tela certa e traz pra frente.
        if ("navigate" in client) { try { await client.navigate(target); } catch (_e) { /* segue: ainda foca */ } }
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
