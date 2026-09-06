/**
 * Genótipo → aparência (render procedural v1, loci do TDD B/K/M/A). A FAMÍLIA
 * (feline/canine) define a silhueta; os loci definem cor/padrão. Determinístico.
 * Regra 1: nada fora dos loci do Gene-Bank. O animal fotorrealista é PNG (§3.1).
 */
import type { Genotype } from "@genbreedai/shared";

export type Family = "feline" | "canine";
export type Pattern = "none" | "brindle" | "merle" | "rosettes" | "harlequin" | "stripes" | "spots";

export interface Appearance {
  family: Family; base: string; shade: string; belly: string;
  pattern: Pattern; patternColor: string; tanPoints: boolean; piebald: boolean; eye: string; viable: boolean;
}

const strip = (a: string) => a.replace("⟦mutação⟧", "");
const has = (p: [string, string] | undefined, al: string) => !!p && (strip(p[0]) === al || strip(p[1]) === al);
const homo = (p: [string, string] | undefined, al: string) => !!p && strip(p[0]) === al && strip(p[1]) === al;
function mix(a: string, b: string, t: number) { const pa=[1,3,5].map(i=>parseInt(a.slice(i,i+2),16)); const pb=[1,3,5].map(i=>parseInt(b.slice(i,i+2),16)); return "#"+pa.map((v,i)=>Math.round(v+(pb[i]!-v)*t).toString(16).padStart(2,"0")).join(""); }
const dark=(h:string,t=.35)=>mix(h,"#000000",t), light=(h:string,t=.3)=>mix(h,"#ffffff",t);

/** family: "FELINO"/"CANINO" (do pack). Aceita também "feline"/"canine". */
export function deriveAppearance(family: string, genotype: Genotype, viable: boolean): Appearance {
  const fam: Family = family === "canine" || family === "CANINO" ? "canine" : "feline";
  const L = genotype.loci as Record<string, [string, string]>;

  if (fam === "feline") {
    // W branco dominante mascara tudo.
    if (has(L.W, "W")) return { family: "feline", base: "#eef1f5", shade: "#cfd6df", belly: "#ffffff",
      pattern: "none", patternColor: "#dfe6ee", tanPoints: false, piebald: homo(L.S, "S"), eye: "#8fb6d8", viable };
    // Albino (cc / c^a) → branco/creme, olhos claros.
    const cc = homo(L.C, "c") || homo(L.C, "c^a");
    const pointed = has(L.C, "c^s") && !cc;
    const mel = has(L.A, "A");
    // cor de base por B/D + melanismo
    let base = "#c8933f"; // fulvo padrão
    if (mel) base = "#15171d";
    if (homo(L.B, "b")) base = mel ? "#2a2018" : "#7a5a3a"; // chocolate
    if (has(L.D, "d")) base = light(base, .2); // diluído
    if (cc) base = "#f0e9da"; // albino
    else if (pointed) base = "#e8ddc8"; // corpo claro (pontos)
    // tipo de padrão (P)
    let pattern: Pattern = "rosettes";
    if (has(L.P, "P^m")) pattern = "stripes";
    else if (has(L.P, "P^s")) pattern = "spots";
    else if (has(L.P, "P^t")) pattern = "none";
    else pattern = "rosettes";
    const patternColor = mel ? dark(base, .25) : cc ? "#d8cbb0" : dark(base, .5);
    return { family: "feline", base, shade: dark(base, .4), belly: light(base, .25),
      pattern, patternColor, tanPoints: pointed, piebald: has(L.S, "S"),
      eye: cc ? "#f2b3b3" : mel ? "#F5C542" : "#8fe36b", viable };
  }
  const liver = homo(L.B, "b");
  let base = liver ? "#6b4a2f" : "#1b1c22";
  if (has(L.A, "A^y")) base = "#c79a54";
  if (homo(L.E, "e")) base = "#e3cf9f";
  if (has(L.C, "c^ch")) base = light(base, homo(L.C, "c^ch") ? .35 : .18);
  let pattern: Pattern = "none"; let patternColor = dark(base, .45);
  const merle = has(L.M, "M"); const harlequin = has(L.H, "H") && merle;
  if (harlequin) { pattern = "harlequin"; base = "#eef1f5"; patternColor = "#15161b"; }
  else if (merle) { pattern = "merle"; patternColor = light(base, .35); }
  else if (has(L.K, "K^br")) { pattern = "brindle"; patternColor = dark(base, .5); }
  return { family: "canine", base, shade: dark(base, .4), belly: light(base, .22),
    pattern, patternColor, tanPoints: has(L.A, "a^t"), piebald: homo(L.S, "s^p"), eye: "#00F0FF", viable };
}
