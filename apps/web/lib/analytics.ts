import type { BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics: limpa a URL antes de enviar a pageview.
 * Mantém só os parâmetros utm_* (origem das visitas) e descarta o resto da
 * query e o hash, onde podem estar tokens de redefinição de senha, códigos
 * de convite ou de indicação. Nada disso deve sair do navegador.
 */
export function limparUrlAnalytics(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  const utm = new URLSearchParams();
  url.searchParams.forEach((valor, chave) => {
    if (chave.startsWith("utm_")) utm.set(chave, valor);
  });
  url.search = utm.toString();
  url.hash = "";
  return { ...event, url: url.toString() };
}
