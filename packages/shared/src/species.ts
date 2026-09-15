import { DOG_BREEDS } from "./breeds";
/**
 * Registro de espécies: nome vulgar (pt), nome científico e descritor de arte
 * (EN, para o prompt de IA). Fonte compartilhada entre API (prompt) e web (labels).
 *
 * Taxonomia explícita (ADR-0015, Etapa 2c): `biologicalSpecies`/`genus`/
 * `subfamily` existem pra que `biologicalSpecies()` e `hybridClass()` (motor)
 * decidam interespecificidade/Haldane a partir de dados taxonômicos de
 * verdade — NUNCA do slug de catálogo cru (que é um id de produto/imagem,
 * não uma unidade biológica: morfos de cor como tigre-branco/tigre-albino
 * têm slug próprio mas são a MESMA espécie que o tigre-de-bengala).
 */
export interface SpeciesInfo {
  common: string;
  scientific: string;
  family: "FELINO" | "CANINO";
  descriptor: string;
  /** Espécie biológica canônica (ADR-0015). Morfos de cor compartilham a
   * MESMA biologicalSpecies do tipo selvagem — nunca o slug do catálogo. */
  biologicalSpecies: string;
  /** Gênero taxonômico (ex. "Panthera", "Puma", "Canis"). */
  genus: string;
  /** Subfamília Felidae (ADR-0015): PANTHERINAE (grandes felinos do gênero
   * Panthera, capazes de rugir) vs. FELINAE (demais gêneros — Puma, Acinonyx,
   * Felis, Lynx, Caracal, Leptailurus, Leopardus...). Ausente em canídeos —
   * não entra no cálculo de hybridClass canino (raças = mesma espécie sempre). */
  subfamily?: "PANTHERINAE" | "FELINAE";
  /** Pool por tier (ADR-0016 — pool de espécies): DOMESTIC_CAT (Felis catus,
   * tier FREE) vs. WILD_FELINE (demais felinos, tier JUNIOR+) vs. DOG
   * (caninos, tier SENIOR+, mesmo mínimo da família canina de sempre).
   * Ausente = sem pool específico cadastrado; `apps/api` cai pro mínimo de
   * família (`FAMILY_MIN_TIER`) nesse caso — nunca inventa restrição extra. */
  poolGroup?: "DOMESTIC_CAT" | "WILD_FELINE" | "DOG";
}

export type PoolGroup = NonNullable<SpeciesInfo["poolGroup"]>;

export const SPECIES_INFO: Record<string, SpeciesInfo> = {
  "panthera-onca": { common: "Onça-pintada", scientific: "Panthera onca", family: "FELINO",
    descriptor: "adult jaguar, large and muscular big cat, broad head, powerful jaws, golden-tan coat covered in black rosettes with inner spots",
    biologicalSpecies: "panthera-onca", genus: "Panthera", subfamily: "PANTHERINAE", poolGroup: "WILD_FELINE" },
  puma: { common: "Puma (Suçuarana)", scientific: "Puma concolor", family: "FELINO",
    descriptor: "adult cougar / mountain lion, sleek athletic big cat, small rounded head, plain uniform tawny-brown coat with no spots or stripes",
    biologicalSpecies: "puma", genus: "Puma", subfamily: "FELINAE", poolGroup: "WILD_FELINE" },
  "panthera-leo": { common: "Leão", scientific: "Panthera leo", family: "FELINO",
    descriptor: "adult male African lion with a full thick brown mane around the head and neck, powerful muscular body, tawny golden fur, unmistakably a lion",
    biologicalSpecies: "panthera-leo", genus: "Panthera", subfamily: "PANTHERINAE", poolGroup: "WILD_FELINE" },
  "panthera-tigris": { common: "Tigre-de-Bengala", scientific: "Panthera tigris tigris", family: "FELINO",
    descriptor: "adult Bengal tiger, massive muscular big cat, deep orange coat with bold vertical black stripes and a white belly and cheeks",
    biologicalSpecies: "panthera-tigris", genus: "Panthera", subfamily: "PANTHERINAE", poolGroup: "WILD_FELINE" },
  "panthera-tigris-branco": { common: "Tigre-branco", scientific: "Panthera tigris (leucístico)", family: "FELINO",
    descriptor: "adult white Bengal tiger, snow-white and cream coat with dark chocolate-brown stripes, striking ice-blue eyes",
    // Morfo leucístico — MESMA espécie que panthera-tigris (item 1, Etapa 2c).
    biologicalSpecies: "panthera-tigris", genus: "Panthera", subfamily: "PANTHERINAE", poolGroup: "WILD_FELINE" },
  "panthera-tigris-albino": { common: "Tigre-albino", scientific: "Panthera tigris (albino)", family: "FELINO",
    descriptor: "true albino tiger, pure white coat with only extremely faint ghost stripes, pale pink nose and pink-red eyes, no orange pigment at all",
    // Morfo albino — MESMA espécie que panthera-tigris (item 1, Etapa 2c).
    biologicalSpecies: "panthera-tigris", genus: "Panthera", subfamily: "PANTHERINAE", poolGroup: "WILD_FELINE" },
  "panthera-pardus": { common: "Leopardo", scientific: "Panthera pardus", family: "FELINO",
    descriptor: "adult leopard, agile spotted big cat, golden-yellow coat densely covered with small dark rosettes, slender build",
    biologicalSpecies: "panthera-pardus", genus: "Panthera", subfamily: "PANTHERINAE", poolGroup: "WILD_FELINE" },
  "acinonyx-jubatus": { common: "Guepardo", scientific: "Acinonyx jubatus", family: "FELINO",
    descriptor: "adult cheetah, slender long-legged cat built for speed, tan coat with solid round black spots, distinctive black tear-mark lines running from the eyes down the muzzle",
    biologicalSpecies: "acinonyx-jubatus", genus: "Acinonyx", subfamily: "FELINAE", poolGroup: "WILD_FELINE" },
  "leptailurus-serval": { common: "Serval", scientific: "Leptailurus serval", family: "FELINO",
    descriptor: "adult serval, tall slender wild cat with very long legs and oversized ears, pale gold coat with bold black spots and bars",
    biologicalSpecies: "leptailurus-serval", genus: "Leptailurus", subfamily: "FELINAE", poolGroup: "WILD_FELINE" },
  "leopardus-pardalis": { common: "Jaguatirica", scientific: "Leopardus pardalis", family: "FELINO",
    descriptor: "adult ocelot, small-to-medium wild cat, golden coat with elongated dark rosettes and chain-like stripes",
    biologicalSpecies: "leopardus-pardalis", genus: "Leopardus", subfamily: "FELINAE", poolGroup: "WILD_FELINE" },
  "panthera-uncia": { common: "Leopardo-das-neves", scientific: "Panthera uncia", family: "FELINO",
    descriptor: "adult snow leopard, thick smoky-grey and cream fur, large dark rosettes, oversized furry paws, very long thick tail, pale green eyes",
    biologicalSpecies: "panthera-uncia", genus: "Panthera", subfamily: "PANTHERINAE", poolGroup: "WILD_FELINE" },
  "lynx-lynx": { common: "Lince", scientific: "Lynx lynx", family: "FELINO",
    descriptor: "adult Eurasian lynx, medium wild cat with long legs, short bobbed tail, prominent black ear tufts, ruff of fur around the face, tan-grey spotted coat",
    biologicalSpecies: "lynx-lynx", genus: "Lynx", subfamily: "FELINAE", poolGroup: "WILD_FELINE" },
  caracal: { common: "Caracal", scientific: "Caracal caracal", family: "FELINO",
    descriptor: "adult caracal, sleek reddish-tan wild cat, plain coat, long dramatic black ear tufts, slender athletic body",
    biologicalSpecies: "caracal", genus: "Caracal", subfamily: "FELINAE", poolGroup: "WILD_FELINE" },
  "felis-catus": { common: "Gato doméstico", scientific: "Felis catus", family: "FELINO",
    descriptor: "domestic house cat",
    biologicalSpecies: "felis-catus", genus: "Felis", subfamily: "FELINAE", poolGroup: "DOMESTIC_CAT" },
  boerboel: { common: "Boerboel", scientific: "Canis lupus familiaris", family: "CANINO",
    descriptor: "adult Boerboel mastiff dog, large muscular guard dog, short fawn coat, broad blocky head with a dark mask",
    biologicalSpecies: "canis-familiaris", genus: "Canis", poolGroup: "DOG" },
  "braco-alemao": { common: "Braço Alemão", scientific: "Canis lupus familiaris", family: "CANINO",
    descriptor: "adult German Shorthaired Pointer dog, athletic hunting dog, short liver-and-white ticked coat",
    biologicalSpecies: "canis-familiaris", genus: "Canis", poolGroup: "DOG" },
};

export function speciesInfo(slug: string): SpeciesInfo {
  if (slug.includes("×")) {
    // Dedupe as espécies componentes (uma linhagem pode acumular ancestrais).
    const uniq = [...new Set(slug.split("×"))];
    const infos = uniq.map((c) => SPECIES_INFO[c]).filter(Boolean) as SpeciesInfo[];
    const allCanine = infos.every((x) => x.family === "CANINO");
    const prefix = allCanine ? "Cruza" : "Híbrido";
    const commons = uniq.map((c) => SPECIES_INFO[c]?.common ?? DOG_BREEDS[c]?.name ?? c.replace(/-/g, " "));
    const sciences = uniq.map((c) => SPECIES_INFO[c]?.scientific ?? (DOG_BREEDS[c] ? "Canis familiaris" : c));
    return {
      common: `${prefix} ${commons.join(" × ")}`,
      scientific: sciences.join(" × "),
      family: infos[0]?.family ?? "FELINO",
      descriptor: `a fictional but photorealistic hybrid animal blending ${commons.join(", ")}`,
      biologicalSpecies: uniq.join("×"),
      genus: infos[0]?.genus ?? "",
    };
  }
  return SPECIES_INFO[slug] ?? {
    common: slug.replace(/-/g, " "), scientific: slug, family: "FELINO", descriptor: slug.replace(/-/g, " "),
    biologicalSpecies: slug, genus: "",
  };
}

/**
 * Espécie BIOLÓGICA (para fertilidade/Haldane, ADR-0015) — lê o campo
 * `biologicalSpecies` de `SPECIES_INFO`, nunca o slug cru:
 *   - Caninos: SEMPRE "canis-familiaris" — toda raça é a mesma espécie
 *     biológica (Canis lupus familiaris); não depende de cadastro por raça
 *     (nem toda raça de `DOG_BREEDS` está em `SPECIES_INFO`).
 *   - Felinos: lê `SPECIES_INFO[slug].biologicalSpecies` (morfos de cor
 *     colapsam na espécie selvagem — ex. tigre-branco/albino → "panthera-tigris").
 *     Fallback pro slug SÓ pra espécie felina ainda não cadastrada em
 *     `SPECIES_INFO` (rede de segurança defensiva — não deveria acontecer
 *     com o catálogo atual; registrado aqui em vez de lançar erro, pra não
 *     travar cruzamentos de espécie nova antes do cadastro taxonômico).
 */
export function biologicalSpecies(pack: "feline" | "canine" | string, slug: string): string {
  if (pack === "canine") return "canis-familiaris";
  return SPECIES_INFO[slug]?.biologicalSpecies ?? slug;
}
