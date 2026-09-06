"use client";

import { createPrng } from "@genbreedai/engine";
import type { Genotype } from "@genbreedai/shared";
import { deriveAppearance, type Family, type Appearance } from "../lib/appearance";

/**
 * Retrato procedural do espécime (cabeça e ombros, estúdio escuro — DS §3.1).
 * A silhueta é felina ou canina; pelagem, padrão e olhos vêm do genótipo.
 * Padrões posicionados por PRNG semeado → estáveis por espécime (determinístico).
 * É a renderização instantânea (tier grátis); o retrato IA fotorrealista é o
 * upgrade premium (pipeline de imagens, fase posterior).
 */
export function Creature({
  genotype,
  family,
  viable = true,
  seed,
  size = 220,
}: {
  genotype: Genotype;
  family: Family;
  viable?: boolean;
  seed: string;
  size?: number;
}) {
  const ap = deriveAppearance(family, genotype, viable);
  const rng = createPrng(seed);
  const id = seed.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "c";

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={`Retrato procedural (${family})`}
      style={{ display: "block" }}
    >
      <defs>
        <radialGradient id={`studio-${id}`} cx="50%" cy="42%" r="70%">
          <stop offset="0%" stopColor="#101722" />
          <stop offset="100%" stopColor="#0A0E14" />
        </radialGradient>
        <linearGradient id={`coat-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ap.base} />
          <stop offset="100%" stopColor={ap.shade} />
        </linearGradient>
        <clipPath id={`body-${id}`}>
          <BodyPath family={ap.family} />
        </clipPath>
      </defs>

      {/* Estúdio */}
      <rect width="200" height="200" fill={`url(#studio-${id})`} />

      <g opacity={ap.viable ? 1 : 0.35}>
        {/* Silhueta preenchida */}
        <g fill={`url(#coat-${id})`}>
          <BodyPath family={ap.family} />
        </g>

        {/* Padrões (recortados na silhueta) */}
        <g clipPath={`url(#body-${id})`}>
          <Patterns ap={ap} rng={rng} />
          {ap.piebald && <Piebald rng={rng} />}
          {ap.tanPoints && <TanPoints family={ap.family} />}
          {/* Ventre/peito mais claro */}
          <ellipse cx="100" cy="168" rx="46" ry="26" fill={ap.belly} opacity="0.35" />
        </g>

        {/* Traços faciais por família */}
        <Face family={ap.family} eye={ap.eye} />
      </g>

      {!ap.viable && (
        <g stroke="#FF3B5C" strokeWidth="4" strokeLinecap="round">
          <line x1="62" y1="62" x2="138" y2="138" />
          <line x1="138" y1="62" x2="62" y2="138" />
        </g>
      )}
    </svg>
  );
}

/** Silhueta de cabeça+ombros: felina (arredondada) ou canina (focinho longo). */
function BodyPath({ family }: { family: Family }) {
  if (family === "feline") {
    return (
      <path
        d="M100 34
           C82 34 74 20 62 22 C64 34 66 40 70 44
           C58 52 50 66 50 84 C50 120 68 150 100 150
           C132 150 150 120 150 84 C150 66 142 52 130 44
           C134 40 136 34 138 22 C126 20 118 34 100 34 Z
           M56 150 C46 168 44 186 44 196 L156 196 C156 186 154 168 144 150 Z"
      />
    );
  }
  // Canino: orelhas maiores caídas, focinho projetado.
  return (
    <path
      d="M100 30
         C80 30 70 24 58 30 C56 44 60 60 70 68
         C56 74 50 92 52 110 C54 128 66 140 82 146
         C86 156 92 162 100 162 C108 162 114 156 118 146
         C134 140 146 128 148 110 C150 92 144 74 130 68
         C140 60 144 44 142 30 C130 24 120 30 100 30 Z
         M60 150 C48 168 46 186 46 196 L154 196 C154 186 152 168 140 150 Z"
    />
  );
}

/** Olhos, nariz e detalhes por família. */
function Face({ family, eye }: { family: Family; eye: string }) {
  const nose = family === "feline" ? "#e07a9b" : "#1b1b1f";
  return (
    <g>
      {/* Olhos com brilho neon */}
      {[80, 120].map((cx) => (
        <g key={cx}>
          <ellipse cx={cx} cy="86" rx="9" ry="7" fill="#0A0E14" />
          <ellipse cx={cx} cy="86" rx="6.5" ry="5" fill={eye} opacity="0.95" />
          <ellipse cx={cx} cy="86" rx="2" ry="4.5" fill="#0A0E14" />
          <circle cx={cx - 2} cy="84" r="1.3" fill="#fff" opacity="0.9" />
        </g>
      ))}
      {/* Focinho */}
      {family === "feline" ? (
        <>
          <path d="M94 104 Q100 110 106 104" fill="none" stroke={nose} strokeWidth="3" strokeLinecap="round" />
          <path d="M100 108 v6" stroke="#000" strokeWidth="1.5" opacity="0.5" />
          {/* bigodes */}
          <g stroke="#dfe6ee" strokeWidth="1" opacity="0.6">
            <line x1="106" y1="106" x2="140" y2="100" />
            <line x1="106" y1="109" x2="140" y2="110" />
            <line x1="94" y1="106" x2="60" y2="100" />
            <line x1="94" y1="109" x2="60" y2="110" />
          </g>
        </>
      ) : (
        <>
          <ellipse cx="100" cy="126" rx="7" ry="5" fill={nose} />
          <path d="M100 131 v8 M92 143 q8 6 16 0" fill="none" stroke="#000" strokeWidth="1.5" opacity="0.4" />
        </>
      )}
    </g>
  );
}

function Patterns({ ap, rng }: { ap: Appearance; rng: ReturnType<typeof createPrng> }) {
  if (ap.pattern === "brindle") {
    return (
      <g fill={ap.patternColor} opacity="0.75">
        {Array.from({ length: 9 }).map((_, i) => {
          const x = 54 + i * 11;
          return <path key={i} d={`M${x} 40 q6 60 -4 150 l-6 0 q10 -90 4 -150 Z`} />;
        })}
      </g>
    );
  }
  if (ap.pattern === "merle") {
    return (
      <g fill={ap.patternColor} opacity="0.7">
        {Array.from({ length: 16 }).map((_, i) => (
          <ellipse
            key={i}
            cx={55 + rng.next() * 90}
            cy={50 + rng.next() * 140}
            rx={5 + rng.next() * 9}
            ry={4 + rng.next() * 7}
          />
        ))}
      </g>
    );
  }
  if (ap.pattern === "rosettes") {
    return (
      <g fill="none" stroke={ap.patternColor} strokeWidth="2.4" opacity="0.75">
        {Array.from({ length: 14 }).map((_, i) => (
          <circle
            key={i}
            cx={58 + rng.next() * 84}
            cy={54 + rng.next() * 130}
            r={4 + rng.next() * 6}
          />
        ))}
      </g>
    );
  }
  if (ap.pattern === "harlequin") {
    return (
      <g fill={ap.patternColor}>
        {Array.from({ length: 10 }).map((_, i) => (
          <ellipse
            key={i}
            cx={55 + rng.next() * 90}
            cy={50 + rng.next() * 140}
            rx={8 + rng.next() * 14}
            ry={7 + rng.next() * 12}
          />
        ))}
      </g>
    );
  }
  return null;
}

function Piebald({ rng }: { rng: ReturnType<typeof createPrng> }) {
  return (
    <g fill="#f2f5f9" opacity="0.9">
      <ellipse cx="100" cy="182" rx="30" ry="20" />
      {Array.from({ length: 4 }).map((_, i) => (
        <ellipse key={i} cx={70 + rng.next() * 60} cy={150 + rng.next() * 40} rx={8 + rng.next() * 10} ry={7 + rng.next() * 8} />
      ))}
    </g>
  );
}

function TanPoints({ family }: { family: Family }) {
  const y = family === "feline" ? 104 : 122;
  return (
    <g fill="#b9803f" opacity="0.85">
      <ellipse cx="100" cy={y} rx="14" ry="10" /> {/* focinho */}
      <ellipse cx="80" cy="74" rx="6" ry="4" /> {/* sobrancelha */}
      <ellipse cx="120" cy="74" rx="6" ry="4" />
      <ellipse cx="100" cy="176" rx="18" ry="12" /> {/* peito */}
    </g>
  );
}
