/*
 * Service worker MÍNIMO do GenBreedAI — existe só para o app poder ser instalado
 * (PWA) e, depois, receber push. NÃO faz cache offline, de propósito: cache mal
 * feito serve conteúdo velho (telas do jogo, respostas da API) e é pior que nada.
 * Qualquer cache futuro exige decisão própria (ver ADR-0026).
 *
 * O `fetch` abaixo NÃO chama `respondWith`: o navegador segue com o pedido de
 * rede normal, como se não houvesse service worker.
 */
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", () => { /* passthrough: sem cache, sem interceptar */ });
