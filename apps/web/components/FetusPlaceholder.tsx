/**
 * Retrato provisório de uma entrada GESTANDO (ADR-0021, item 2) — mesma
 * imagem pra QUALQUER espécie (não dá pra saber a aparência final antes de
 * nascer). SVG inline neutro, sem chamar a API de imagem — evita precisar
 * de um arquivo binário nesta rodada (só edição de arquivo de texto).
 *
 * PARA TROCAR POR ARTE DEFINITIVA: salve o arquivo em
 * `apps/web/public/feto.png` (ou `.svg`, `.webp`) e troque o `<svg>...</svg>`
 * abaixo por `<img src="/feto.png" alt="Gestando" className={className} />`
 * — quem usa este componente (`app/app/incubadora/page.tsx`) já espera um
 * elemento do tamanho do contêiner (`h-full w-full object-cover`), então a
 * troca fica só neste arquivo, sem mexer na tela.
 */
export function FetusPlaceholder({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Gestando">
      <defs>
        <radialGradient id="fetus-glow" cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor="#BF00FF" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#0A0E14" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="#0A0E14" />
      <circle cx="50" cy="52" r="42" fill="url(#fetus-glow)" />
      <ellipse cx="50" cy="55" rx="27" ry="33" fill="none" stroke="#BF00FF" strokeWidth="2" opacity="0.75" />
      <path
        d="M38 50c2-8 8-13 12-13s10 5 12 13c1 6-2 13-8 17-2 1.5-6 1.5-8 0-6-4-9-11-8-17Z"
        fill="#BF00FF"
        opacity="0.55"
      />
      <circle cx="50" cy="50" r="3.2" fill="#00F0FF" />
    </svg>
  );
}
