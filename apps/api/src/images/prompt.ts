/**
 * Construtor de prompt (TDD §5.4 + DS §3.1). Corpo inteiro. Para espécies PURAS
 * usa o descritor anatômico da espécie. Para HÍBRIDOS o FENÓTIPO dirige a pelagem
 * (padrão/melanismo/cor/albino/branco) sobre um corpo felino genérico — assim o
 * retrato reflete a SELEÇÃO do jogador (ex.: rosetas → rosetas), não o parental.
 */
import { expressPhenotype, CANINE_PACK, FELINE_PACK } from "@genbreedai/engine";
import { speciesInfo, SPECIES_INFO, breedInfo, dogBreedInfo, DOG_BREEDS } from "@genbreedai/shared";
import type { StoredSpecimen } from "../specimens/in-memory.repository";

/** Pelagem FELINA a partir do fenótipo. */
function coatFeline(loci: Record<string, string>): string {
  if (loci.Hr === "pelado (sphynx)") return "completely hairless, soft wrinkled bare skin with no fur, coat pattern only faintly visible as skin pigment";
  if (loci.W === "branco") return "a pure solid white coat";
  if (loci.C === "albino") return "a true albino appearance: pure white coat with faint ghost markings and pink-red eyes";
  let base = `a ${baseTone(loci)}`;
  if (loci.B === "chocolate") base = "a chocolate-brown";
  else if (loci.B === "canela") base = "a cinnamon";
  if (loci.D === "diluído") base = base + " diluted blue-grey";
  let coat: string;
  if (loci.A?.startsWith("melan")) coat = "a melanistic solid black coat with faint ghost markings";
  else if (loci.P === "rosetas") coat = `${base} coat covered in bold black rosettes with inner spots`;
  else if (loci.P === "listras") coat = `${base} coat with bold vertical black stripes`;
  else if (loci.P === "pintas") coat = `${base} coat with round solid black spots`;
  else coat = `${base} plain uniform coat`;
  if (loci.C === "pontos") coat += ", with darker pointed extremities (face, ears, paws)";
  if (loci.Ma === "juba completa") coat += ", the male has a full thick lion-like mane around the head and neck";
  else if (loci.Ma === "juba parcial") coat += ", the male has a partial sparse mane (ligre-like), shorter than a lion's";
  if (loci.Fl === "pelo longo") coat += ", long thick fluffy fur";
  else if (loci.Fl === "pelo curto") coat += ", short sleek fur";
  return coat;
}

/** Pelagem CANINA a partir do fenótipo (loci B/K/A/E/S/M/H/F/C/R). */
function coatCanine(loci: Record<string, string>): string {
  // Harlequin (epistasia H sobre M) tem prioridade visual.
  if (loci.M && loci.M.includes("arlequim")) return "a harlequin coat: white base with irregular torn black patches";
  const parts: string[] = [];
  // Base de cor / agouti
  if (loci.E === "creme/vermelho") parts.push("a solid cream-to-red coat");
  else {
    const diluted = loci.D === "diluído (azul)";
    let eumel = loci.B === "liver/chocolate" ? "liver-brown" : "black";
    if (diluted) eumel = loci.B === "liver/chocolate" ? "isabella-fawn (diluted liver)" : "steel blue-grey (diluted black)";
    if (loci.A === "fulvo/sable") parts.push(`a fawn sable coat with ${eumel} shading`);
    else if (loci.A === "tan-points") parts.push(`a ${eumel} coat with tan points (eyebrows, muzzle, legs)`);
    else parts.push(`a solid ${eumel} coat`);
  }
  // Padrões sobrepostos
  if (loci.K === "brindle/tigrado") parts.push("with a PROMINENT ALL-OVER dark brindle tiger-stripe pattern covering the whole body (distinctly brindle, NOT solid)");
  if (loci.M === "merle") parts.push("with a merle dappled pattern");
  if (loci.S === "piebald") parts.push("with irregular white piebald spotting");
  if (loci.R === "roan") parts.push("with dense roan ticking (many small dark flecks) over the white areas, like a pointer");
  if (loci.F === "cacheado") parts.push("dense curly fur");
  else if (loci.F === "ondulado") parts.push("wavy fur");
  if (loci.C === "creme" || loci.C === "creme-parcial") parts.push("diluted/pale tone");
  if (loci.Cl === "pelo longo") parts.push("a long coat");
  if (loci.Ct === "pelo áspero") parts.push("a rough wiry coat");
  else if (loci.Ct === "pelo cacheado") parts.push("a curly coat");
  return parts.join(", ");
}

/** Morfologia canina a partir de Cph/Ec/Tl. */
function dogMorphology(loci: Record<string, string>): string[] {
  const out: string[] = [];
  const skull: Record<string,string> = { "focinho curto (braquicefálico)":"a short brachycephalic muzzle", "focinho médio":"a medium muzzle", "focinho longo (dolicocefálico)":"a long dolichocephalic muzzle", "focinho curto-médio":"a short-to-medium muzzle", "focinho médio-longo":"a medium-to-long muzzle" };
  if (loci.Cph && skull[loci.Cph]) out.push(skull[loci.Cph]!);
  const ears: Record<string,string> = { "orelhas eretas":"erect pointed ears", "orelhas semieretas":"semi-erect ears", "orelhas caídas":"droopy floppy ears", "orelhas semicaídas":"semi-drop ears" };
  if (loci.Ec && ears[loci.Ec]) out.push(ears[loci.Ec]!);
  const tail: Record<string,string> = { "cauda enrolada":"a curled tail over the back", "cauda curta":"a short bobbed tail" };
  if (loci.Tl && tail[loci.Tl]) out.push(tail[loci.Tl]!);
  return out;
}

/** Dispatcher: pelagem ciente da família. */
function coatFromPhenotype(loci: Record<string, string>, pack: "feline" | "canine"): string {
  return pack === "canine" ? coatCanine(loci) : coatFeline(loci);
}


/** Descrição de PORTE a partir do QTL porte (0..1). */
function sizeDesc(porte: number): string {
  if (porte >= 0.85) return "very large and massive";
  if (porte >= 0.65) return "large";
  if (porte >= 0.45) return "medium-sized";
  if (porte >= 0.3) return "small-to-medium";
  return "small";
}
/** Musculatura a partir do QTL vigor. */
function buildDesc(vigor: number): string {
  if (vigor >= 0.8) return "powerfully muscled, athletic";
  if (vigor >= 0.55) return "well-built";
  if (vigor >= 0.35) return "lean";
  return "slender and delicate";
}
/** Cabeça, orelhas e cor de fundo a partir dos loci He/Ec/Bd. */
function morphology(loci: Record<string, string>): string[] {
  const out: string[] = [];
  const head: Record<string, string> = {
    "cabeça larga": "a broad heavy head", "cabeça angular": "an angular head",
    "cabeça arredondada": "a small rounded head", "cabeça média": "a medium head",
    "cabeça larga-angular": "a broad angular head", "cabeça angular-suave": "a softly angular head",
  };
  if (loci.He && head[loci.He]) out.push(head[loci.He]!);
  const ears: Record<string, string> = {
    "orelhas tufadas (lince)": "tufted lynx-like ears", "orelhas grandes (serval)": "very large serval-like ears",
    "orelhas normais": "proportionate ears",
  };
  if (loci.Ec && ears[loci.Ec]) out.push(ears[loci.Ec]!);
  return out;
}
/** Cor de fundo (Bd) → tom base da pelagem. */
function baseTone(loci: Record<string, string>): string {
  const map: Record<string, string> = { "fundo âmbar": "deep amber", "fundo dourado": "golden", "fundo areia": "sandy tan", "fundo cinza": "cool grey" };
  return (loci.Bd && map[loci.Bd]) ? map[loci.Bd]! : "golden-tan";
}

/** Semente numérica determinística a partir da cacheKey. */
export function numericSeed(cacheKey: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < cacheKey.length; i++) { h ^= cacheKey.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h % 2147483647;
}

/** Traços legíveis (usado no card/roundtrip). */
export function traitVector(s: StoredSpecimen): string[] {
  const pack = s.pack === "canine" ? CANINE_PACK : FELINE_PACK;
  const phen = expressPhenotype({ loci: s.genotype.loci, qtl: {} }, pack);
  return [coatFromPhenotype(phen.loci, s.pack)];
}

export function buildPrompt(s: StoredSpecimen): string {
  const pack = s.pack === "canine" ? CANINE_PACK : FELINE_PACK;
  const phen = expressPhenotype({ loci: s.genotype.loci, qtl: {} }, pack);
  const coat = coatFromPhenotype(phen.loci, s.pack);
  const isHybrid = s.species.includes("×");
  const q = s.genotype.qtl ?? {};
  const physiqueAdj = `${sizeDesc(q.porte ?? 0.5)}, ${buildDesc(q.vigor ?? 0.5)}`;
  const morph = s.pack === "feline" ? morphology(phen.loci) : dogMorphology(phen.loci);
  const morphClause = morph.length ? ` with ${morph.join(" and ")}` : "";

  let subject: string;
  if (isHybrid) {
    const parents = s.species.split("×").map((slug) => SPECIES_INFO[slug]?.common ?? slug).filter(Boolean);
    if (s.pack === "canine") {
      const dogParents = s.species.split("×").map((slug) => DOG_BREEDS[slug]?.name ?? SPECIES_INFO[slug]?.common ?? slug).filter(Boolean);
      subject =
        `a photorealistic ${physiqueAdj} mixed-breed domestic dog (a cross between ${dogParents.join(" and ")})${morphClause}, ` +
        `four-legged canine body, dog anatomy, wearing ${coat}`;
    } else {
      // Híbrido felino → GRANDE FELINO dirigido pelo FENÓTIPO. Não citamos os pais
      // no visual (enviesava o FLUX para o parental menor, ex.: serval). A pelagem
      // (padrão) é a característica definidora.
      const kind = (q.porte ?? 0.5) >= 0.6 ? "wild big cat" : "cat";
      subject =
        `a fictional but photorealistic ${physiqueAdj} ${kind}, a novel hybrid feline${morphClause}, ` +
        `proportionate feline body, four legs and a long tail, standing tall. ` +
        `Its coat: ${coat}`;
    }
  } else {
    const info = speciesInfo(s.species);
    const breed = s.species === "felis-catus" ? breedInfo(s.id) : undefined;
    const dogBreed = s.pack === "canine" ? dogBreedInfo(s.id) : undefined;
    if (breed) {
      subject = `a purebred ${breed.name} cat (Felis catus): ${breed.descriptor}. Body build: ${physiqueAdj}. Coat: ${coat}`;
    } else if (dogBreed) {
      subject = `a purebred ${dogBreed.name} dog (Canis familiaris): ${dogBreed.descriptor}. Body build: ${physiqueAdj}. Coat: ${coat}`;
    } else if (s.pack === "canine") {
      subject = `a ${physiqueAdj} mixed-breed dog${morphClause}, with ${coat}`;
    } else {
      subject = `a ${physiqueAdj} ${info.common} (${info.scientific})${morphClause}: ${info.descriptor}, with ${coat}`;
    }
  }

  const furEmphasis = s.pack === "feline" && phen.loci.Fl === "pelo longo"
    ? " This cat is distinctly LONG-HAIRED: a very long, thick, fluffy, flowing semi-longhair coat (like a Persian or Maine Coon), NOT short-haired." : "";
  return (
    `Full-body professional studio wildlife photograph of ${subject}.${furEmphasis} ` +
    `The entire animal is visible head to paws in a natural standing pose, centered, sharp focus, ` +
    `neutral studio lighting, seamless dark background #0A0E14, ultra photorealistic, high detail fur. ` +
    `Anatomically correct, no text, no watermark, no humans.`
  );
}
