/**
 * `/o-que-e` — página PÚBLICA (sem login) que responde, em blocos curtos, o que é o GenBreedAI. Existe para ser recuperada e
 * citada por buscadores e modelos de linguagem ("existe simulador de genética online?"), então a primeira frase já responde.
 *
 * TODO o texto e o JSON-LD (FAQPage + SoftwareApplication) vêm de `lib/about.ts` — fonte única, testada em
 * `lib/__tests__/about.test.ts` (o que o JSON-LD declara existe no texto visível). Não digite fato aqui: edite `lib/about.ts`,
 * com fonte. Preços e limites vêm de `lib/plans.ts`; espécies e raças, do catálogo de `@genbreedai/shared`.
 *
 * Fora do escopo do `middleware.ts` (matcher só cobre `/` e `/app/:path*`) — nenhuma mudança lá foi necessária, e um teste
 * garante que ela continua pública.
 */
import type { Metadata } from "next";
import Link from "next/link";
import {
  ABOUT_BLOG_LABEL, ABOUT_BLOG_LINKS, ABOUT_DESCRIPTION, ABOUT_OG_IMAGE, ABOUT_PUBLISHER, ABOUT_TITLE, ABOUT_URL, aboutFaq, aboutSections, buildAboutJsonLd, serializeJsonLd,
} from "../../lib/about";

export const metadata: Metadata = {
  title: ABOUT_TITLE,
  description: ABOUT_DESCRIPTION,
  alternates: { canonical: ABOUT_URL },
  openGraph: {
    type: "website",
    url: ABOUT_URL,
    siteName: "GenBreedAI",
    locale: "pt_BR",
    title: ABOUT_TITLE,
    description: ABOUT_DESCRIPTION,
    images: [{ url: ABOUT_OG_IMAGE, alt: "Híbrido de Leopardo-das-neves × Tigre-albino gerado no GenBreedAI", type: "image/jpeg" }],
  },
  twitter: { card: "summary_large_image", title: ABOUT_TITLE, description: ABOUT_DESCRIPTION, images: [ABOUT_OG_IMAGE] },
};

export default function AboutPage() {
  const sections = aboutSections();
  const faq = aboutFaq();
  const [lead, ...rest] = sections;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-5 sm:pt-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildAboutJsonLd()) }} />

      <Link href="/" className="mb-6 inline-block font-mono text-[0.7rem] uppercase tracking-wide text-ink-muted transition hover:text-cyan">
        ← GenBreed<span className="text-cyan">AI</span>
      </Link>

      {/* 1. O que é — a primeira frase já responde à pergunta (sem introdução). */}
      <header className="mb-10">
        <h1 className="mb-4 font-display text-2xl font-black uppercase leading-tight tracking-wide text-ink sm:text-3xl"
          style={{ textShadow: "0 0 10px rgba(0,240,255,0.25)" }}>
          {lead!.heading}
        </h1>
        {lead!.paragraphs!.map((p, i) => (
          <p key={i} className={i === 0 ? "mb-3 text-base font-medium leading-relaxed text-ink" : "mb-3 text-sm leading-relaxed text-ink-muted"}>{p}</p>
        ))}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup"
            className="rounded-lg bg-cyan px-6 py-3 text-center font-display text-sm font-bold uppercase tracking-wide text-bg-900 shadow-neon-cyan transition hover:brightness-110">
            Criar conta grátis
          </Link>
          <Link href="/login"
            className="rounded-lg border border-white/15 bg-bg-800/60 px-6 py-3 text-center font-display text-sm font-bold uppercase tracking-wide text-ink transition hover:border-cyan/40 hover:text-cyan">
            Entrar
          </Link>
        </div>
      </header>

      <div className="space-y-9">
        {rest.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
            <h2 id={`${s.id}-h`} className="mb-3 font-display text-xs font-bold uppercase tracking-widest text-cyan">{s.heading}</h2>
            {s.paragraphs?.map((p, i) => (
              <p key={i} className="mb-2.5 text-[0.9rem] leading-relaxed text-ink-muted">{p}</p>
            ))}
            {s.items && (
              <ul className="space-y-2.5">
                {s.items.map((it) => (
                  <li key={it.title ?? it.text} className="rounded-card border border-white/10 bg-bg-800/60 p-4 text-[0.85rem] leading-relaxed text-ink-muted">
                    {it.title && <strong className="mb-0.5 block font-display text-[0.8rem] uppercase tracking-wide text-ink">{it.title}</strong>}
                    {it.text}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {/* Perguntas frequentes — as MESMAS do JSON-LD (FAQPage), com o texto visível. */}
        <section id="perguntas" aria-labelledby="perguntas-h">
          <h2 id="perguntas-h" className="mb-3 font-display text-xs font-bold uppercase tracking-widest text-purple">Perguntas frequentes</h2>
          <div className="space-y-4">
            {faq.map((f) => (
              <div key={f.question}>
                <h3 className="mb-1 font-display text-[0.95rem] font-bold leading-snug text-ink">{f.question}</h3>
                <p className="text-[0.85rem] leading-relaxed text-ink-muted">{f.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {ABOUT_BLOG_LINKS.length > 0 && (
        <section className="mt-10" aria-labelledby="blog-h">
          <h2 id="blog-h" className="mb-2 font-display text-xs font-bold uppercase tracking-widest text-cyan">{ABOUT_BLOG_LABEL}</h2>
          <ul className="space-y-1.5 text-[0.85rem] leading-snug">
            {ABOUT_BLOG_LINKS.map((l) => (
              <li key={l.url}>
                {/* Link externo (outro domínio): nova aba, noopener; SEM nofollow de propósito — passa sinal entre os dois domínios. */}
                <a href={l.url} target="_blank" rel="noopener" className="text-cyan underline-offset-2 hover:underline">{l.title}</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-14 border-t border-white/10 pt-6">
        <p className="mb-4 text-center font-mono text-[0.68rem] text-ink-muted">
          Publicado por <a href={ABOUT_PUBLISHER.url} className="text-cyan hover:underline">{ABOUT_PUBLISHER.name}</a>
        </p>
        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1 font-mono text-[0.7rem] uppercase tracking-wide text-ink-muted">
          <Link href="/" className="hover:text-cyan">Início</Link>
          <Link href="/termos" className="hover:text-cyan">Termos de uso</Link>
          <Link href="/privacidade" className="hover:text-cyan">Privacidade</Link>
          <Link href="/reembolso" className="hover:text-cyan">Reembolso</Link>
        </nav>
      </footer>
    </main>
  );
}
