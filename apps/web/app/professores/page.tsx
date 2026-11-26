/**
 * `/professores` — página PÚBLICA (sem login) com roteiros de aula de genética (ADR-0040). Fora do matcher do `middleware.ts`.
 *
 * TODO o texto e o JSON-LD (FAQPage) vêm de `lib/teachers.ts`, cujos números são recalculados no motor pelo teste
 * `lib/__tests__/teachers.test.ts`. Não digite fato aqui: edite `lib/teachers.ts`.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { EcosystemFooter } from "../../components/EcosystemFooter";
import { ABOUT_BLOG_LABEL, ABOUT_BLOG_LINKS, ABOUT_OG_IMAGE, ABOUT_PUBLISHER, serializeJsonLd } from "../../lib/about";
import {
  LESSONS, TEACHERS_CONTACT, TEACHERS_DESCRIPTION, TEACHERS_LEAD, TEACHERS_TITLE, TEACHERS_URL,
  buildTeachersJsonLd, coupleText, outcomeText, teachersFaq, teachersIntro,
} from "../../lib/teachers";

export const metadata: Metadata = {
  title: TEACHERS_TITLE,
  description: TEACHERS_DESCRIPTION,
  alternates: { canonical: TEACHERS_URL },
  openGraph: {
    type: "website",
    url: TEACHERS_URL,
    siteName: "GenBreedAI",
    locale: "pt_BR",
    title: TEACHERS_TITLE,
    description: TEACHERS_DESCRIPTION,
    images: [{ url: ABOUT_OG_IMAGE, alt: "Híbrido de Leopardo-das-neves × Tigre-albino gerado no GenBreedAI", type: "image/jpeg" }],
  },
  twitter: { card: "summary_large_image", title: TEACHERS_TITLE, description: TEACHERS_DESCRIPTION, images: [ABOUT_OG_IMAGE] },
};

const H2 = "mb-3 font-display text-xs font-bold uppercase tracking-widest text-cyan";
const P = "mb-2.5 text-[0.9rem] leading-relaxed text-ink-muted";

export default function TeachersPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-5 sm:pt-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildTeachersJsonLd()) }} />

      <Link href="/" className="mb-6 inline-block font-mono text-[0.7rem] uppercase tracking-wide text-ink-muted transition hover:text-cyan">
        ← GenBreed<span className="text-cyan">AI</span>
      </Link>

      <header className="mb-10">
        <h1 className="mb-4 font-display text-2xl font-black uppercase leading-tight tracking-wide text-ink sm:text-3xl"
          style={{ textShadow: "0 0 10px rgba(0,240,255,0.25)" }}>
          {TEACHERS_TITLE}
        </h1>
        <p className="mb-3 text-base font-medium leading-relaxed text-ink">{TEACHERS_LEAD}</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup"
            className="rounded-lg bg-cyan px-6 py-3 text-center font-display text-sm font-bold uppercase tracking-wide text-bg-900 shadow-neon-cyan transition hover:brightness-110">
            Criar conta grátis
          </Link>
          <a href="#roteiros"
            className="rounded-lg border border-white/15 bg-bg-800/60 px-6 py-3 text-center font-display text-sm font-bold uppercase tracking-wide text-ink transition hover:border-cyan/40 hover:text-cyan">
            Ver os roteiros
          </a>
        </div>
      </header>

      <div className="space-y-9">
        {teachersIntro().slice(0, 1).map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
            <h2 id={`${s.id}-h`} className={H2}>{s.heading}</h2>
            {s.paragraphs.map((p, i) => <p key={i} className={P}>{p}</p>)}
          </section>
        ))}

        <section id="roteiros" aria-label="Roteiros de aula" className="space-y-6">
          {LESSONS.map((l) => (
            <article key={l.id} id={l.id} aria-labelledby={`${l.id}-h`} className="rounded-card border border-white/10 bg-bg-800/60 p-4 sm:p-5">
              <p className="mb-1 font-mono text-[0.65rem] uppercase tracking-wide text-purple">Roteiro {l.number}</p>
              <h2 id={`${l.id}-h`} className="mb-1 font-display text-[1.05rem] font-bold leading-snug text-ink">{l.title}</h2>
              <p className="mb-3 text-[0.8rem] italic leading-snug text-ink-muted">{l.concept}</p>
              <p className="mb-3 rounded border border-cyan/20 bg-bg-900/50 px-3 py-2 font-mono text-[0.75rem] text-cyan">{coupleText(l)}</p>
              <dl className="space-y-2.5 text-[0.85rem] leading-relaxed text-ink-muted">
                <div><dt className="font-display text-[0.72rem] uppercase tracking-wide text-ink">Antes de cruzar</dt><dd>{l.setup}</dd></div>
                <div><dt className="font-display text-[0.72rem] uppercase tracking-wide text-ink">Previsão no papel</dt><dd>{l.prediction}</dd></div>
                <div>
                  <dt className="font-display text-[0.72rem] uppercase tracking-wide text-ink">No jogo</dt>
                  <dd>
                    {l.inGame}
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                      {l.outcomes.map((o) => <li key={o.label} className="text-ink">{outcomeText(l, o)}</li>)}
                    </ul>
                  </dd>
                </div>
                <div><dt className="font-display text-[0.72rem] uppercase tracking-wide text-ink">Para discutir</dt><dd>{l.discussion}</dd></div>
              </dl>
            </article>
          ))}
        </section>

        {teachersIntro().slice(1).map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
            <h2 id={`${s.id}-h`} className={H2}>{s.heading}</h2>
            {s.paragraphs.map((p, i) => <p key={i} className={P}>{p}</p>)}
          </section>
        ))}

        <section id="perguntas" aria-labelledby="perguntas-h">
          <h2 id="perguntas-h" className="mb-3 font-display text-xs font-bold uppercase tracking-widest text-purple">Perguntas frequentes</h2>
          <div className="space-y-4">
            {teachersFaq().map((f) => (
              <div key={f.question}>
                <h3 className="mb-1 font-display text-[0.95rem] font-bold leading-snug text-ink">{f.question}</h3>
                <p className="text-[0.85rem] leading-relaxed text-ink-muted">{f.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="rounded-card border border-cyan/30 bg-bg-800/60 p-4 text-[0.9rem] leading-relaxed text-ink">{TEACHERS_CONTACT}</p>
      </div>

      {ABOUT_BLOG_LINKS.length > 0 && (
        <section className="mt-10" aria-labelledby="blog-h">
          <h2 id="blog-h" className="mb-2 font-display text-xs font-bold uppercase tracking-widest text-cyan">{ABOUT_BLOG_LABEL}</h2>
          <ul className="space-y-1.5 text-[0.85rem] leading-snug">
            {ABOUT_BLOG_LINKS.map((l) => (
              <li key={l.url}>
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
          <Link href="/o-que-e" className="hover:text-cyan">O que é o GenBreedAI</Link>
          <Link href="/termos" className="hover:text-cyan">Termos de uso</Link>
          <Link href="/privacidade" className="hover:text-cyan">Privacidade</Link>
        </nav>
        <div className="mt-4"><EcosystemFooter /></div>
      </footer>
    </main>
  );
}
