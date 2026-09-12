import { DOG_BREEDS } from "./breeds";
/**
 * Registro de espécies: nome vulgar (pt), nome científico e descritor de arte
 * (EN, para o prompt de IA). Fonte compartilhada entre API (prompt) e web (labels).
 */
export interface SpeciesInfo { common: string; scientific: string; family: "FELINO" | "CANINO"; descriptor: string; }

export const SPECIES_INFO: Record<string, SpeciesInfo> = {
  "panthera-onca": { common: "Onça-pintada", scientific: "Panthera onca", family: "FELINO",
    descriptor: "adult jaguar, large and muscular big cat, broad head, powerful jaws, golden-tan coat covered in black rosettes with inner spots" },
  puma: { common: "Puma (Suçuarana)", scientific: "Puma concolor", family: "FELINO",
    descriptor: "adult cougar / mountain lion, sleek athletic big cat, small rounded head, plain uniform tawny-brown coat with no spots or stripes" },
  "panthera-leo": { common: "Leão", scientific: "Panthera leo", family: "FELINO",
    descriptor: "adult male African lion with a full thick brown mane around the head and neck, powerful muscular body, tawny golden fur, unmistakably a lion" },
  "panthera-tigris": { common: "Tigre-de-Bengala", scientific: "Panthera tigris tigris", family: "FELINO",
    descriptor: "adult Bengal tiger, massive muscular big cat, deep orange coat with bold vertical black stripes and a white belly and cheeks" },
  "panthera-tigris-branco": { common: "Tigre-branco", scientific: "Panthera tigris (leucístico)", family: "FELINO",
    descriptor: "adult white Bengal tiger, snow-white and cream coat with dark chocolate-brown stripes, striking ice-blue eyes" },
  "panthera-tigris-albino": { common: "Tigre-albino", scientific: "Panthera tigris (albino)", family: "FELINO",
    descriptor: "true albino tiger, pure white coat with only extremely faint ghost stripes, pale pink nose and pink-red eyes, no orange pigment at all" },
  "panthera-pardus": { common: "Leopardo", scientific: "Panthera pardus", family: "FELINO",
    descriptor: "adult leopard, agile spotted big cat, golden-yellow coat densely covered with small dark rosettes, slender build" },
  "acinonyx-jubatus": { common: "Guepardo", scientific: "Acinonyx jubatus", family: "FELINO",
    descriptor: "adult cheetah, slender long-legged cat built for speed, tan coat with solid round black spots, distinctive black tear-mark lines running from the eyes down the muzzle" },
  "leptailurus-serval": { common: "Serval", scientific: "Leptailurus serval", family: "FELINO",
    descriptor: "adult serval, tall slender wild cat with very long legs and oversized ears, pale gold coat with bold black spots and bars" },
  "leopardus-pardalis": { common: "Jaguatirica", scientific: "Leopardus pardalis", family: "FELINO",
    descriptor: "adult ocelot, small-to-medium wild cat, golden coat with elongated dark rosettes and chain-like stripes" },
  "panthera-uncia": { common: "Leopardo-das-neves", scientific: "Panthera uncia", family: "FELINO",
    descriptor: "adult snow leopard, thick smoky-grey and cream fur, large dark rosettes, oversized furry paws, very long thick tail, pale green eyes" },
  "lynx-lynx": { common: "Lince", scientific: "Lynx lynx", family: "FELINO",
    descriptor: "adult Eurasian lynx, medium wild cat with long legs, short bobbed tail, prominent black ear tufts, ruff of fur around the face, tan-grey spotted coat" },
  caracal: { common: "Caracal", scientific: "Caracal caracal", family: "FELINO",
    descriptor: "adult caracal, sleek reddish-tan wild cat, plain coat, long dramatic black ear tufts, slender athletic body" },
  "felis-catus": { common: "Gato doméstico", scientific: "Felis catus", family: "FELINO",
    descriptor: "domestic house cat" },
  boerboel: { common: "Boerboel", scientific: "Canis lupus familiaris", family: "CANINO",
    descriptor: "adult Boerboel mastiff dog, large muscular guard dog, short fawn coat, broad blocky head with a dark mask" },
  "braco-alemao": { common: "Braço Alemão", scientific: "Canis lupus familiaris", family: "CANINO",
    descriptor: "adult German Shorthaired Pointer dog, athletic hunting dog, short liver-and-white ticked coat" },
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
    };
  }
  return SPECIES_INFO[slug] ?? { common: slug.replace(/-/g, " "), scientific: slug, family: "FELINO", descriptor: slug.replace(/-/g, " ") };
}

/**
 * Espécie BIOLÓGICA (para fertilidade/Haldane): raças caninas são a MESMA
 * espécie (Canis familiaris). Felinos: cada slug é sua espécie (onça, tigre…),
 * exceto raças de gato doméstico que já compartilham `felis-catus`.
 */
export function biologicalSpecies(pack: "feline" | "canine" | string, slug: string): string {
  return pack === "canine" ? "canis-familiaris" : slug;
}
