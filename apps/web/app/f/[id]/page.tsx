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
import { auraStarsText, buildPublicSpecimenUrl, absoluteImageUrl, PUBLIC_SHARE_ORIGIN } from "../../../lib/share";

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
  const image = absoluteImageUrl(specimen.imageUrl) ?? FALLBACK_OG_IMAGE;
  const url = buildPublicSpecimenUrl(specimen.id, null);

  return {
    title,
    description,
    openGraph: { title, description, images: [image], url, type: "website", siteName: "GenBreedAI" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function PublicSpecimenPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  const ref = firstRef((await searchParams).ref);
  const specimen = await getPublicSpecimen(id);
  if (!specimen) notFound();

  const image = absoluteImageUrl(specimen.imageUrl);
  // Preserva o `ref` da URL de chegada até o signup — item 1 do pedido.
  const signupHref = ref ? `/signup?ref=${encodeURIComponent(ref)}` : "/signup";

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
      <Link
        href={signupHref}
        className="inline-block rounded-xl bg-ok px-6 py-3.5 font-display font-black uppercase tracking-wide text-bg-900 shadow-neon-green transition hover:brightness-110"
      >
        Criar meu criadouro
      </Link>
    </main>
  );
}
