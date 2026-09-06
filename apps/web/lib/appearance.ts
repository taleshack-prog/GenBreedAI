/**
 * Genótipo → aparência (renderização procedural instantânea — pilar do TDD/PRD).
 * Traduz loci/fenótipo em traços visuais, SEM inventar padrões fora dos loci
 * documentados no Gene-Bank (Design System §3.2). É a base do retrato procedural
 * (tier grátis / prévia); o retrato IA fotorrealista é o upgrade premium.
 */

import type { Genotype } from "@genbreedai/shared";

export type Family = "feline" | "canine";
export type Pattern = "none" | "brindle" | "merle" | "rosettes" | "harlequin";

export interface Appearance {
  family: Family;
  base: string; // cor de base da pelagem
  shade: string; // sombra/volume
  belly: string; // ventre/peito mais claro
  pattern: Pattern;
  patternColor: string;
  tanPoints: boolean; // a^t — pontos tan (focinho, sobrancelhas, peito)
  piebald: boolean; // s^p/s^p — manchas brancas
  eye: string;
  viable: boolean;
}

const strip = (a: string) => a.replace("⟦mutação⟧", "");
const has = (pair: [string, string] | undefined, allele: string) =>
  !!pair && (strip(pair[0]) === allele || strip(pair[1]) === allele);
const homo = (pair: [string, string] | undefined, allele: string) =>
  !!pair && strip(pair[0]) === allele && strip(pair[1]) === allele;

/** Mistura duas cores hex (t=0 → a, t=1 → b). */
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * t));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}
const darken = (hex: string, t = 0.35) => mix(hex, "#000000", t);
const lighten = (hex: string, t = 0.3) => mix(hex, "#ffffff", t);

export function deriveAppearance(
  family: Family,
  genotype: Genotype,
  viable: boolean,
): Appearance {
  const L = genotype.loci as Record<string, [string, string]>;

  if (family === "feline") {
    const melanistic = has(L.A, "A"); // melanismo dominante
    const base = melanistic ? "#15171d" : "#c8933f"; // preto vs fulvo
    return {
      family,
      base,
      shade: darken(base, 0.4),
      belly: melanistic ? "#22242c" : lighten(base, 0.25),
      pattern: "rosettes",
      // Rosetas "fantasma" no melânico (visíveis sob luz); nítidas no fulvo.
      patternColor: melanistic ? "#262a34" : "#5b3d1c",
      tanPoints: false,
      piebald: false,
      eye: melanistic ? "#F5C542" : "#8fe36b",
      viable,
    };
  }

  // Canino: base eumelanínica, feomelanina, diluição, padrões.
  const liver = homo(L.B, "b");
  let base = liver ? "#6b4a2f" : "#1b1c22"; // liver vs preto
  // Feomelanina (fulvo) domina a cor quando agouti A^y.
  if (has(L.A, "A^y")) base = "#c79a54"; // fawn/dourado
  // e/e → creme/vermelho (só feomelanina).
  if (homo(L.E, "e")) base = "#e3cf9f";
  // Diluição chinchila c^ch → clareia para creme.
  if (has(L.C, "c^ch")) base = lighten(base, homo(L.C, "c^ch") ? 0.35 : 0.18);

  let pattern: Pattern = "none";
  let patternColor = darken(base, 0.45);
  const merle = has(L.M, "M");
  const harlequin = has(L.H, "H") && merle;
  if (harlequin) {
    pattern = "harlequin";
    base = "#eef1f5"; // fundo branco
    patternColor = "#15161b"; // manchas pretas irregulares
  } else if (merle) {
    pattern = "merle";
    patternColor = lighten(base, 0.35); // mesclado azulado/claro
  } else if (has(L.K, "K^br")) {
    pattern = "brindle";
    patternColor = darken(base, 0.5);
  }

  return {
    family,
    base,
    shade: darken(base, 0.4),
    belly: lighten(base, 0.22),
    pattern,
    patternColor,
    tanPoints: has(L.A, "a^t"),
    piebald: homo(L.S, "s^p"),
    eye: "#00F0FF",
    viable,
  };
}
