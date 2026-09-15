import type { ReactNode } from "react";
import Link from "next/link";

/** Moldura comum das páginas legais (/termos, /privacidade, /reembolso). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
      <Link href="/" className="mb-6 inline-block font-mono text-[0.7rem] uppercase tracking-wide text-ink-muted transition hover:text-cyan">← GenBreedAI</Link>
      <h1 className="mb-2 font-display text-2xl font-black uppercase tracking-wide text-ink sm:text-3xl"
        style={{ textShadow: "0 0 10px rgba(0,240,255,0.25)" }}>{title}</h1>
      <p className="mb-8 rounded-lg border border-white/10 bg-bg-800/60 px-3 py-2 font-mono text-[0.68rem] leading-relaxed text-ink-muted">
        Última atualização: {updated}. Este texto pode ser revisado a qualquer momento — a versão vigente é sempre a publicada nesta página.
      </p>
      <div className="space-y-7">{children}</div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-cyan">{title}</h2>
      <div className="space-y-2 text-[0.82rem] leading-relaxed text-ink-muted [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_b]:text-ink [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}
