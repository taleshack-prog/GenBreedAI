/**
 * Chave de "mesma caixa de e-mail" pra barrar auto-indicação por alias
 * (ADR-0024): minúsculas, sem `+tag` no local-part e, pra gmail/googlemail,
 * sem pontos (`a.lice+x@gmail.com` e `alice@gmail.com` são a MESMA caixa).
 * Não é validação de e-mail — só normalização pra comparar dois endereços.
 */
export function mailboxKey(email: string): string {
  const [rawLocal = "", rawDomain = ""] = email.trim().toLowerCase().split("@");
  let local = rawLocal.split("+")[0] ?? "";
  let domain = rawDomain;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}
