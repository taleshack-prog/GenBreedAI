/**
 * Página PÚBLICA de compartilhamento (sem login) — `/f/[id]`. Busca
 * `GET /api/v1/public/specimens/:id` (rota pública nova da API, sem
 * genótipo/dono/pedigree) e mostra o retrato + nome + aura + um convite pra
 * criar conta. `generateMetadata` monta Open Graph/Twitter card pra prévia
 * no WhatsApp (a imagem do retrato, não um placeholder genérico, quando ela
 * já existe).
 *
 * Fora do escopo do `middleware.ts` (matcher só cobre `/` e `/app/:path*`,
 * ver `middleware.ts`) — nenhuma mudança precisou ser feita lá pra esta
 * rota ficar pública; ela já nasce fora do que o middleware protege.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublicSpecimen } from "../../../lib/server-api";
import { auraStarsText, buildPublicSpecimenUrl, absoluteImageUrl, pickOgImage, PUBLIC_SHARE_ORIGIN } from "../../../lib/share";

// Prévia genérica quando o espécime ainda não tem retrato gerado — melhor
// que o WhatsApp não mostrar imagem nenhuma. Asset já existente em /public.
const FALLBACK_OG_IMAGE = `${PUBLIC_SHARE_ORIGIN}/hero-tigre-albino.jpg`;

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ ref?: string | string[] }>;

function firstRef(ref: string | string[] | undefined): string | undefined {
  return Array.isArray(ref) ? ref[0] : ref;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const specimen = await getPublicSpecimen(id).catch(() => null);
  if (!specimen) return { title: "GenBreedAI" };

  const title = `${specimen.displayName} — GenBreedAI`;
  const description = `${specimen.displayName} ${auraStarsText(specimen.aura)} — criado no GenBreedAI. Cria o teu criadouro!`;
  const url = buildPublicSpecimenUrl(specimen.id, null);

  // og:image/twitter:image: a MINIATURA 600×600 JPEG (ADR-0027) quando existe — o
  // WhatsApp ignora o retrato original (PNG 1024×1024, >1 MB); sem miniatura
  // (retratos antigos), o original; sem retrato, o fallback. Ver `pickOgImage`.
  // A imagem EXIBIDA na página (mais abaixo) continua sendo a original, com `?v=`.
  const ogImage = pickOgImage(specimen, FALLBACK_OG_IMAGE);

  return {
    title,
    description,
    openGraph: { title, description, images: [ogImage], url, type: "website", siteName: "GenBreedAI" },
    twitter: { card: "summary_large_image", title, description, images: [{ url: ogImage.url, alt: specimen.displayName }] },
  };
}

export default async function PublicSpecimenPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  const ref = firstRef((await searchParams).ref);
  const specimen = await getPublicSpecimen(id);
  if (!specimen) notFound();

  const image = absoluteImageUrl(specimen.imageUrl);
  // Preserva o `ref` da URL de chegada nos DOIS botões (item 2 do pedido).
  const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const landingHref = `/${refQuery}`;
  const signupHref = `/signup${refQuery}`;

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-10 text-center">
      <div className="mx-auto mb-5 aspect-square w-full max-w-sm overflow-hidden rounded-card border border-cyan/20 bg-bg-800">
        {image ? (
          <img src={image} alt={specimen.displayName} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center px-6 font-mono text-xs uppercase text-ink-muted">Retrato ainda não gerado</div>
        )}
      </div>
      <h1 className="mb-2 font-display text-2xl font-black uppercase text-ink">{specimen.displayName}</h1>
      <p className="mb-6 font-mono text-lg text-purple">{auraStarsText(specimen.aura)}</p>

      {/* O que é o GenBreedAI (item 1) — quem cai aqui vindo do WhatsApp, sem
          contexto nenhum, precisa entender que é um jogo antes de qualquer
          botão. Texto sóbrio de propósito: sem promessa de ganho, sem
          jargão de marketing — só o que o jogo de fato é. */}
      <div className="mb-6 space-y-2.5 rounded-card border border-white/10 bg-bg-800/60 p-4 text-left text-sm leading-snug text-ink-muted">
        <p>Genética real: dominância, recessividade, epistasia e herança ligada ao sexo — como na biologia.</p>
        <p>Cruze espécies, acompanhe a gestação e veja o filhote nascer com retrato gerado por IA.</p>
        <p>Monte linhagens, fixe características e construa seu criadouro.</p>
      </div>

      <div className="space-y-3">
        <Link
          href={landingHref}
          className="block w-full rounded-xl bg-ok px-6 py-3.5 font-display font-black uppercase tracking-wide text-bg-900 shadow-neon-green transition hover:brightness-110"
        >
          Conhecer o GenBreedAI
        </Link>
        <Link
          href={signupHref}
          className="block w-full rounded-xl border border-cyan/40 px-6 py-3 font-display text-sm uppercase tracking-wide text-cyan transition hover:bg-cyan/10"
        >
          Criar meu criadouro
        </Link>
      </div>

      <p className="mt-8 text-[0.7rem] text-ink-muted">Você chegou aqui pelo convite de um criador.</p>
    </main>
  );
}
