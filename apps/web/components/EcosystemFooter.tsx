"use client";
import { useEffect, useState } from "react";

/**
 * Contato, redes e os outros sites da Hack Tech Farm, no rodapé das páginas públicas. A mesma lista aparece nos rodapés de
 * todos os apps da HTF: mudou um perfil ou um domínio, mude em todos.
 *
 * O e-mail vai em duas partes e só é montado no navegador, depois da hidratação: o HTML do servidor sai sem o endereço, o que
 * tira o grosso dos robôs que colhem e-mail para spam.
 *
 * Os links do ecossistema não levam UTM de propósito: o analytics já mostra o site de origem pelo referrer, e UTM em link entre
 * os nossos sites apagaria a origem real da visita (padrão de UTMs da HTF, regra 3).
 */
const EMAIL_PARTS = ["hacktechfarm", "proton.me"] as const;

const SOCIAL = [
  { href: "https://www.instagram.com/hackfinance67/", label: "Instagram" },
  { href: "https://www.linkedin.com/in/taleshack/", label: "LinkedIn" },
] as const;

const ECOSYSTEM = [
  { href: "https://hacktechfarm.com.br/", label: "Hack Tech Farm" },
  { href: "https://posthink.com.br/", label: "Posthink" },
  { href: "https://neuroartdapp.com.br/", label: "NeuroArt DApp" },
  { href: "https://www.asphalthoops.com.br/", label: "Asphalt Hoops" },
  { href: "https://www.taleshack.com.br/", label: "ArtHack" },
] as const;

const LINK = "hover:text-cyan";

export function EcosystemFooter() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => setEmail(EMAIL_PARTS.join("@")), []);

  return (
    <div className="flex flex-col items-center gap-2 font-mono text-[0.68rem] text-ink-muted">
      <nav aria-label="Contato e redes" className="flex flex-wrap justify-center gap-x-5 gap-y-1">
        {email ? <a href={`mailto:${email}`} className={LINK}>{email}</a> : <span>E-mail</span>}
        {SOCIAL.map((s) => (
          <a key={s.href} href={s.href} target="_blank" rel="noopener me" className={LINK}>{s.label}</a>
        ))}
      </nav>
      <nav aria-label="Ecossistema Hack Tech Farm" className="flex flex-wrap justify-center gap-x-5 gap-y-1">
        <span className="uppercase tracking-wide">Ecossistema</span>
        {ECOSYSTEM.map((s) => (
          <a key={s.href} href={s.href} target="_blank" rel="noopener" className={LINK}>{s.label}</a>
        ))}
      </nav>
    </div>
  );
}
