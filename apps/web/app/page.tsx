"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eyebrow } from "../components/Eyebrow";
import { PlanPicker } from "../components/PlanPicker";
import { InstallApp } from "../components/InstallApp";

const IMG_BASE = "https://img.genbreed.com.br/generated";

/** Retratos reais do catálogo — hashes conferidos no bucket, nenhum inventado. */
const GALLERY = [
  { hash: "b79e8a4f4b555931e295c8a7d5f5aa908fabf03f7760e7565edc054e33faba1e", name: "Leopardo-das-neves × Tigre-albino", sub: "Híbrido sintetizado no jogo" },
  { hash: "37a4c1244d0c2f2692275e9cbb70425f559c65757eadadedefbd5f15bdbd40ec", name: "Onça-pintada", sub: "Panthera onca" },
  { hash: "1cc64c98b21550023f7aa5a9dfef7843f439416c3ed369a67686d249d96cf58b", name: "Tigre-branco", sub: "Panthera tigris (leucístico)" },
  { hash: "cb64cf67b2fdb4fcf6808e5b218e44dda8bc80a973950e29bb0492ef9e2f88aa", name: "Leopardo-das-neves", sub: "Panthera uncia" },
  { hash: "3ee2a48a81b748e0be38953260a50537a55fafbbfb1365863c1a0fc03b7c14cc", name: "Pastor Alemão", sub: "Canis familiaris" },
  { hash: "46cf3178f6668e91e9459690d25e02855d1a3329b8bcdbe08fc9eba0a2ff0eb3", name: "Rottweiler", sub: "Canis familiaris" },
];

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="mx-auto max-w-5xl">
      {/* 1. HERO */}
      <section className="relative flex min-h-[86vh] flex-col justify-end overflow-hidden px-5 pb-10 pt-24 sm:min-h-[80vh]">
        <img
          src="/hero-tigre-albino.jpg"
          alt="Híbrido de Leopardo-das-neves × Tigre-albino gerado no GenBreedAI"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg-900 via-bg-900/70 to-bg-900/20" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-bg-900/90 to-transparent" />

        <div className="relative z-10 mx-auto w-full max-w-2xl">
          <div className="mb-4 flex items-center gap-2">
            <span className="font-display text-lg font-black uppercase tracking-wide text-ink">GenBreed<span className="text-cyan">AI</span></span>
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-muted">// console de laboratório</span>
          </div>
          <h1
            className="font-display text-4xl font-black uppercase leading-[1.05] tracking-wide text-ink sm:text-5xl"
            style={{ textShadow: "0 0 18px rgba(0,240,255,0.35)" }}
          >
            Genética aplicada,<br /><span className="text-cyan">de verdade</span>.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-muted sm:text-base">
            Cruze espécies reais, aplique herança mendeliana e quantitativa de verdade, e tente fixar fenótipos ao longo de gerações — ou falhe tentando.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup"
              className="rounded-lg bg-cyan px-6 py-3.5 text-center font-display text-sm font-bold uppercase tracking-wide text-bg-900 shadow-neon-cyan transition hover:brightness-110">
              Criar conta
            </Link>
            <Link href="/login"
              className="rounded-lg border border-white/15 bg-bg-800/60 px-6 py-3.5 text-center font-display text-sm font-bold uppercase tracking-wide text-ink transition hover:border-cyan/40 hover:text-cyan">
              Entrar
            </Link>
          </div>
        </div>
      </section>

      {/* 2. O QUE É */}
      <section className="px-5 py-14 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <Eyebrow color="#00F0FF">O que é</Eyebrow>
          <p className="mb-10 text-center font-display text-2xl font-bold text-ink sm:text-3xl">Um laboratório de genética, não um bicho-de-estimação virtual.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { t: "Cruze espécies reais", d: "Felinos e caninos com loci genéticos de verdade — cor, padrão, diluição, albinismo — não paletas aleatórias." },
              { t: "Herança mendeliana e quantitativa", d: "O motor calcula Punnett, dominância/codominância e traços quantitativos (QTL, herdabilidade) igual a um livro-texto de genética." },
              { t: "F de Wright, sem enrolação", d: "Endogamia é calculada de verdade a partir do pedigree — cruzar parentes tem consequência genética real, visível no jogo." },
              { t: "Fixe fenótipos ao longo de gerações — ou falhe", d: "Selecionar, cruzar e tentar estabilizar uma linhagem pura (aura) é um jogo de longo prazo. Nem toda tentativa dá certo." },
            ].map((b) => (
              <div key={b.t} className="rounded-card border border-white/10 bg-bg-800/60 p-5">
                <h3 className="mb-1.5 font-display text-sm font-bold uppercase tracking-wide text-ink">{b.t}</h3>
                <p className="text-[0.8rem] leading-relaxed text-ink-muted">{b.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. GALERIA */}
      <section className="px-5 py-14 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <Eyebrow color="#BF00FF">Catálogo</Eyebrow>
          <p className="mb-10 text-center font-display text-2xl font-bold text-ink sm:text-3xl">Retratos reais, sintetizados no motor do jogo</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {GALLERY.map((g) => (
              <figure key={g.hash} className="overflow-hidden rounded-card border border-white/10 bg-bg-800">
                <div className="aspect-square w-full bg-bg-studio">
                  <img src={`${IMG_BASE}/${g.hash}.png`} alt={g.name} className="h-full w-full object-cover" loading="lazy" />
                </div>
                <figcaption className="p-2.5">
                  <div className="font-display text-[0.72rem] font-semibold uppercase tracking-wide text-ink">{g.name}</div>
                  <div className="font-mono text-[0.62rem] text-ink-muted">{g.sub}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* 4. PLANOS */}
      <section className="px-5 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <Eyebrow color="#00F0FF">Tiers</Eyebrow>
          <p className="mb-6 text-center font-display text-2xl font-bold text-ink sm:text-3xl">Um plano para cada profundidade de estudo</p>

          <PlanPicker onSelect={(plan, interval) => router.push(`/signup?plan=${plan}&interval=${interval}`)} />
        </div>
      </section>

      {/* 5. INSTALE O APP (PWA — no iPhone o aviso de gestação concluída só funciona com o app instalado) */}
      <InstallApp />

      {/* 6. RODAPÉ */}
      <footer className="border-t border-white/10 px-5 py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 text-center">
          <div className="font-display text-sm font-bold uppercase tracking-wide text-ink">GenBreed<span className="text-cyan">AI</span></div>
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1 font-mono text-[0.7rem] uppercase tracking-wide text-ink-muted">
            <Link href="/o-que-e" className="hover:text-cyan">O que é o GenBreedAI</Link>
            <Link href="/termos" className="hover:text-cyan">Termos de uso</Link>
            <Link href="/privacidade" className="hover:text-cyan">Privacidade</Link>
            <Link href="/reembolso" className="hover:text-cyan">Reembolso</Link>
          </nav>
          <p className="font-mono text-[0.62rem] text-ink-muted">© {new Date().getFullYear()} GenBreedAI. Todos os direitos reservados.</p>
        </div>
      </footer>
    </main>
  );
}
