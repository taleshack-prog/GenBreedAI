/**
 * Construtor de prompt determinístico (TDD §5.4 + Design System §3.1).
 * Genótipo → fenótipo (via motor) → vetor de traços → prompt fotorrealista.
 * Mesmo genótipo ⇒ mesmo prompt ⇒ cache estável (determinismo, TDD §0).
 */
import { expressPhenotype, CANINE_PACK, FELINE_PACK } from "@genbreedai/engine";
import type { StoredSpecimen } from "../specimens/in-memory.repository";

/** Nome popular por slug de espécie (para o prompt). */
const SPECIES_NAME: Record<string, string> = {
  "panthera-onca": "onça-pintada (jaguar)",
  "panthera-onca-negra": "onça-preta melanística (jaguar)",
  puma: "puma (suçuarana)",
  "panthera-tigris": "tigre-de-bengala",
  "panthera-tigris-branco": "tigre-branco",
  "panthera-tigris-albino": "tigre-albino",
  "panthera-pardus": "leopardo",
  "acinonyx-jubatus": "guepardo",
  "panthera-leo": "leão",
  "leptailurus-serval": "serval",
  "leopardus-pardalis": "jaguatirica",
  "felis-catus": "gato doméstico",
  boerboel: "cão Boerboel",
  "braco-alemao": "cão Braço Alemão (Pointer)",
};

const PATTERN_DESC: Record<string, string> = {
  rosetas: "rosettes", listras: "stripes", pintas: "spots", uniforme: "solid uniform coat",
  "merle-duplo": "merle dappled coat", merle: "merle dappled coat", brindle: "brindle striped coat",
};

function speciesName(slug: string): string {
  if (slug.includes("×")) return `hybrid ${slug.split("×").map((s) => SPECIES_NAME[s] ?? s).join(" × ")}`;
  return SPECIES_NAME[slug] ?? slug.replace(/-/g, " ");
}

/** Traços legíveis a partir do fenótipo. */
export function traitVector(s: StoredSpecimen): string[] {
  const pack = s.pack === "canine" ? CANINE_PACK : FELINE_PACK;
  const phen = expressPhenotype({ loci: s.genotype.loci, qtl: {} }, pack);
  const traits: string[] = [];
  for (const [, desc] of Object.entries(phen.loci)) {
    if (desc === "branco") traits.push("pure white coat");
    else if (desc === "melanístico" || desc === "melanístico (preto)") traits.push("melanistic black coat with faint ghost markings");
    else if (desc === "albino") traits.push("albino, pale cream coat, pink eyes");
    else if (desc === "pontos") traits.push("pointed coloration (dark extremities)");
    else if (PATTERN_DESC[desc]) traits.push(PATTERN_DESC[desc]);
    else if (desc === "diluído") traits.push("diluted blue-grey tone");
    else if (desc === "chocolate") traits.push("chocolate brown");
    else if (desc === "fulvo" || desc === "não-melanístico") traits.push("tawny golden coat");
  }
  return [...new Set(traits)];
}

/** Semente numérica determinística a partir da cacheKey (para o modelo). */
export function numericSeed(cacheKey: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < cacheKey.length; i++) { h ^= cacheKey.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h % 2147483647;
}

/** Prompt canônico (TDD §5.4). */
export function buildPrompt(s: StoredSpecimen): string {
  const traits = traitVector(s);
  const traitStr = traits.length ? `, ${traits.join(", ")}` : "";
  return (
    `Photorealistic studio portrait of a ${speciesName(s.species)}${traitStr}. ` +
    `Head and shoulders centered, looking slightly above the camera line, sharp focus, ` +
    `neutral frontal studio lighting, uniform dark background #0A0E14, high detail fur/pelt. ` +
    `No text, no watermark, anatomically correct.`
  );
}
