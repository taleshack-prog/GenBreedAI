/**
 * Construtor de prompt (TDD §5.4 + DS §3.1). Corpo inteiro. Para espécies PURAS
 * usa o descritor anatômico da espécie. Para HÍBRIDOS o FENÓTIPO dirige a pelagem
 * (padrão/melanismo/cor/albino/branco) sobre um corpo felino genérico — assim o
 * retrato reflete a SELEÇÃO do jogador (ex.: rosetas → rosetas), não o parental.
 *
 * BUGFIX (achado em produção): híbrido felino chegou a sair como uma espécie
 * pura comum (tigre-branco×leão saiu como tigre listrado comum, sem NENHUM
 * traço de leão) — a versão anterior deliberadamente OMITIA os nomes das
 * espécies-mãe no prompt híbrido felino (pra não enviesar o FLUX pro
 * parental menor, ex. serval), mas isso deixou o prompt vago demais: sem
 * nenhuma âncora textual pro segundo parental, o modelo deriva pro felino
 * mais "óbvio" pelo padrão de pelagem (listras → tigre), ignorando pistas
 * mais sutis (a cláusula de juba). Correção: NOMEAR as duas (ou mais)
 * espécies explicitamente como um cruzamento — nunca o `descriptor` de
 * SPECIES_INFO (que descreve a espécie PURA inteira, ex. "adult Bengal
 * tiger...", e travaria o resultado numa espécie só de novo), só o par
 * nome-comum/científico, igual ao que a rota não-híbrida já usa. O visual
 * em si continua 100% do fenótipo calculado (`coat`/`morphClause`/
 * `physiqueAdj`) — nunca dos descritores fixos de espécie.
 */
import { expressPhenotype, CANINE_PACK, FELINE_PACK } from "@genbreedai/engine";
import { speciesInfo, SPECIES_INFO, breedInfo, dogBreedInfo, dogBreedEnglishName, catBreedEnglishName, baseFounderId, mosaicMaleTwinColourName, DOG_BREEDS } from "@genbreedai/shared";
import type { Sex } from "@genbreedai/shared";
import type { StoredSpecimen } from "../specimens/in-memory.repository";

/**
 * Cor da eumelanina FELINA a partir de B (TYRP1) e D (MLPH) — ADR-0034. `null` = preto denso (B_ D_), o padrão de todos os fundadores:
 * nesse caso o texto continua EXATAMENTE o de antes (tom de fundo `Bd`). Diluição azula o preto; chocolate/canela clareiam com D.
 */
function felineTint(loci: Record<string, string>): string | null {
  const diluted = loci.D === "diluído";
  if (loci.B === "chocolate") return diluted ? "lilac (diluted chocolate)" : "chocolate brown";
  if (loci.B === "canela") return diluted ? "fawn" : "cinnamon";
  return diluted ? "blue-grey (diluted black)" : null;
}

/** Nome da cor dos PONTOS (`c^s/c^s`) pela mesma regra B×D: seal (B_ D_), chocolate, blue, lilac (+ cinnamon/fawn com `b^l`). Só para pontos. */
export function felinePointColour(loci: Record<string, string>): "seal" | "chocolate" | "blue" | "lilac" | "cinnamon" | "fawn" {
  const diluted = loci.D === "diluído";
  if (loci.B === "chocolate") return diluted ? "lilac" : "chocolate";
  if (loci.B === "canela") return diluted ? "fawn" : "cinnamon";
  return diluted ? "blue" : "seal";
}

/** Como o ponto entra no texto. `seal` mantém a frase ANTIGA ("darker"), para os fundadores atuais não mudarem de prompt. */
const POINT_WORDING: Record<ReturnType<typeof felinePointColour>, string> = {
  seal: "darker",
  chocolate: "chocolate-brown",
  blue: "blue-grey",
  lilac: "pale lilac-grey",
  cinnamon: "cinnamon",
  fawn: "fawn",
};

/** Resultado do motor para o loco O (ligado ao X, ADR-0013) — vem de `Phenotype`; ausente em genótipo sem `xLoci`. */
interface PigmentInfo { coatPigment?: "EUMELANIN" | "PHEOMELANIN" | "MOSAIC"; pigmentDiluted?: boolean }

/** Nome curto da cor de eumelanina (parte escura da tartaruga): "black" no preto denso; senão a cor de B×D. */
function eumelaninName(loci: Record<string, string>): string {
  const tint = felineTint(loci);
  if (!tint) return "black";
  return tint === "blue-grey (diluted black)" ? "blue-grey" : tint === "lilac (diluted chocolate)" ? "lilac" : tint;
}

/**
 * Pelagem da FAMÍLIA LARANJA (ADR-0035): `PHEOMELANIN` (O/O, macho O) e `MOSAIC` (fêmea O/o). O laranja MASCARA a via da eumelanina —
 * A (preto/melanismo) e B (chocolate/canela) não aparecem; D dilui o laranja em creme; P continua definindo o padrão ("O não mascara P").
 * O S (manchas brancas) entra AQUI e só aqui (calico / laranja e branco): renderizá-lo para todo gato mudaria o prompt do Birmanês/Ragdoll.
 */
function coatOrange(loci: Record<string, string>, kind: "PHEOMELANIN" | "MOSAIC", diluted: boolean): string {
  const white = loci.S === "bicolor";
  if (kind === "MOSAIC") {
    const eu = eumelaninName(loci);
    const pheo = diluted ? "soft cream" : "ginger";
    const patches = white ? " with large white patches" : "";
    if (white) return `a ${diluted ? "dilute " : ""}calico coat, irregular patches of ${eu} and ${pheo}${patches}`;
    if (!diluted) return `a tortoiseshell coat, irregular patches of ${eu} and ${pheo}`;
    return eu === "blue-grey"
      ? `a blue-cream coat, irregular patches of ${eu} and ${pheo}`
      : `a dilute tortoiseshell coat, irregular patches of ${eu} and ${pheo}`;
  }
  const shade = diluted ? "cream" : "ginger";
  let coat = diluted ? "a soft cream coat" : "a rich ginger-orange coat";
  if (loci.P === "listras") coat += `, with bold vertical darker ${shade} stripes`;
  else if (loci.P === "pintas") coat += `, with round solid darker ${shade} spots`;
  else if (loci.P === "rosetas") coat += `, with darker ${shade} rosettes`;
  else coat += ", with faint ghost tabby markings"; // uniforme: o laranja sempre deixa o tabby "fantasma" (ghostPattern)
  if (white) coat += ", with white patches on the chest, belly and paws";
  return coat;
}

/** Como o ponto entra no texto para gato de pontos + laranja (red/cream point, tortie point). */
function orangePointWording(kind: "PHEOMELANIN" | "MOSAIC", diluted: boolean): string {
  if (kind === "MOSAIC") return "tortoiseshell";
  return diluted ? "cream" : "ginger-orange";
}

/** Pelagem FELINA a partir do fenótipo. `pigment` = `coatPigment`/`pigmentDiluted` do motor (ADR-0035). */
function coatFeline(loci: Record<string, string>, pigment: PigmentInfo = {}): string {
  if (loci.Hr === "pelado (sphynx)") return "completely hairless, soft wrinkled bare skin with no fur, coat pattern only faintly visible as skin pigment";
  if (loci.W === "branco") return "a pure solid white coat";
  if (loci.C === "albino") return "a true albino appearance: pure white coat with faint ghost markings and pink-red eyes";
  const pointed = loci.C === "pontos";
  const orange = pigment.coatPigment === "PHEOMELANIN" || pigment.coatPigment === "MOSAIC" ? pigment.coatPigment : null;
  const diluted = pigment.pigmentDiluted ?? loci.D === "diluído";
  // Corpo de gato de PONTOS não recebe a cor de B/D (ela vai nos pontos, abaixo): o corpo segue o tom de fundo, como sempre.
  const tint = pointed ? null : felineTint(loci);
  const base = `a ${baseTone(loci)}`;
  let coat: string;
  if (orange && !pointed) {
    coat = coatOrange(loci, orange, diluted);
  } else if (loci.A?.startsWith("melan")) {
    coat = tint ? `a melanistic solid ${tint} coat with faint ghost markings` : "a melanistic solid black coat with faint ghost markings";
  } else if (tint) {
    // Cor de eumelanina diferente do preto denso (ADR-0034): "a solid <cor> coat" no liso; nos padrões, marcas "darker" (não "black").
    if (loci.P === "rosetas") coat = `a ${tint} coat covered in bold darker rosettes with inner spots`;
    else if (loci.P === "listras") coat = `a ${tint} coat with bold vertical darker stripes`;
    else if (loci.P === "pintas") coat = `a ${tint} coat with round solid darker spots`;
    else coat = `a solid ${tint} coat`;
  } else if (loci.P === "rosetas") coat = `${base} coat covered in bold black rosettes with inner spots`;
  else if (loci.P === "listras") coat = `${base} coat with bold vertical black stripes`;
  else if (loci.P === "pintas") coat = `${base} coat with round solid black spots`;
  else coat = `${base} plain uniform coat`;
  if (pointed) {
    const word = orange ? orangePointWording(orange, diluted) : POINT_WORDING[felinePointColour(loci)];
    coat += `, with ${word} pointed extremities (face, ears, paws)`;
  }
  // Descritor de juba SÓ quando o fenótipo diz juba (ADR-0017) — Ma agora é
  // sex-limited no motor (fêmea nunca expressa, mesmo Ma/Ma), então "sem
  // juba" já cobre o caso feminino sem precisar de um branch "the male";
  // nada é dito quando ausente (silêncio, não "no mane" — ver buildPrompt
  // pra correção específica da leoa, que precisa negar a juba explicitamente
  // por causa do descritor estático de SPECIES_INFO).
  if (loci.Ma === "juba completa") coat += ", a full thick lion-like mane around the head and neck";
  else if (loci.Ma === "juba parcial") coat += ", a partial sparse mane (ligre-like), shorter than a lion's";
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
  else if (loci.S === "branco residual") parts.push("with small white markings on chest, paws and tail tip");
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
function coatFromPhenotype(phen: { loci: Record<string, string> } & PigmentInfo, pack: "feline" | "canine"): string {
  return pack === "canine" ? coatCanine(phen.loci) : coatFeline(phen.loci, phen);
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

/** "A" / "A and B" / "A, B and C" — nomeia TODOS os componentes de um híbrido, na ordem em que aparecem em `species` (item 4 do pedido). */
function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Semente numérica determinística a partir da cacheKey. */
export function numericSeed(cacheKey: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < cacheKey.length; i++) { h ^= cacheKey.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h % 2147483647;
}

/**
 * Correção pontual (ADR-0017) do cadastro ESTÁTICO de leão em SPECIES_INFO
 * (packages/shared/src/species.ts) — `common`/`descriptor` são fixos pro
 * macho ("Leão"/"adult male African lion ... full thick brown mane"), sem
 * variante por sexo (nenhuma espécie tem). Corrigido AQUI, local ao prompt,
 * sem mudar `speciesInfo()`/SPECIES_INFO (mudaria a assinatura pra todo
 * chamador do pacote, fora de escopo). Só se aplica a panthera-leo fêmea;
 * qualquer outra espécie/sexo usa o cadastro sem alteração.
 *
 * IMPORTANTE: o descritor abaixo é só de termos POSITIVOS — nunca usa
 * "mane"/"no mane"/"male" em nenhuma forma. Negar a juba ("no mane") ainda
 * arrisca o gerador de imagem "ler" a palavra-chave "mane" e desenhá-la
 * mesmo negada; descrever positivamente a cabeça/pescoço sem juba evita
 * essa palavra por completo.
 */
function lionessOverride(species: string, sex: Sex | null | undefined): { name: string; descriptor: string; physiqueAdj: string } | null {
  if (species !== "panthera-leo" || sex !== "F") return null;
  return {
    name: "Leoa",
    descriptor: "adult female African lioness, sleek smooth rounded head, short tawny fur on head and neck, lean muscular body",
    physiqueAdj: "large, athletic",
  };
}

/** Traços legíveis (usado no card/roundtrip). */
export function traitVector(s: StoredSpecimen): string[] {
  const pack = s.pack === "canine" ? CANINE_PACK : FELINE_PACK;
  // `xLoci` entra (ADR-0035): sem ele o motor não calcula `coatPigment` e o laranja nunca apareceria. `qtl: {}` continua — o
  // fenótipo só COPIA o QTL para a saída, nenhum traço visível depende dele (ADR-0033).
  const phen = expressPhenotype({ loci: s.genotype.loci, qtl: {}, xLoci: s.genotype.xLoci }, pack, s.sex ?? undefined);
  return [coatFromPhenotype(phen, s.pack)];
}

export function buildPrompt(s: StoredSpecimen): string {
  const pack = s.pack === "canine" ? CANINE_PACK : FELINE_PACK;
  const phen = expressPhenotype({ loci: s.genotype.loci, qtl: {}, xLoci: s.genotype.xLoci }, pack, s.sex ?? undefined);
  const coat = coatFromPhenotype(phen, s.pack);
  const isHybrid = s.species.includes("×");
  const q = s.genotype.qtl ?? {};
  const physiqueAdj = `${sizeDesc(q.porte ?? 0.5)}, ${buildDesc(q.vigor ?? 0.5)}`;
  const morph = s.pack === "feline" ? morphology(phen.loci) : dogMorphology(phen.loci);
  const morphClause = morph.length ? ` with ${morph.join(" and ")}` : "";

  let subject: string;
  if (isHybrid) {
    // NUNCA `SPECIES_INFO[slug].descriptor` aqui — descreve a espécie PURA
    // inteira (item 3 do pedido: nada de "adult Bengal tiger" pra um
    // híbrido). Só o par nome-comum/científico identifica cada parental;
    // quem desenha o visual é sempre `coat`/`morphClause`/`physiqueAdj`
    // (fenótipo calculado), nunca o descritor fixo — item 2.
    const speciesLabels = s.species.split("×").map((slug) => {
      const info = SPECIES_INFO[slug];
      return info ? `${info.common} (${info.scientific})` : slug;
    });
    if (s.pack === "canine") {
      // Parentais pelo nome INGLÊS da tabela (ADR-0033: "Great Dane", nunca o slug cru "dogue-alemao"); raça sem nome inglês cai no
      // nome em português de DOG_BREEDS e, por último, no nome comum da espécie — o slug cru só se nada existir.
      const dogParents = s.species.split("×")
        .map((slug) => dogBreedEnglishName(slug) ?? DOG_BREEDS[slug]?.name ?? SPECIES_INFO[slug]?.common ?? slug)
        .filter(Boolean);
      subject =
        `a photorealistic ${physiqueAdj} mixed-breed domestic dog (a cross between ${joinWithAnd(dogParents)})${morphClause}, ` +
        `four-legged canine body, dog anatomy. ` +
        `Its coat and features (these take priority over either parent breed's typical look): ${coat}`;
    } else {
      // Híbrido felino: NOMEIA as espécies-mãe (item 1 — sem isso o modelo
      // não tem âncora textual pro parental "menos óbvio" e deriva pra uma
      // espécie pura, ver bugfix no comentário do topo do arquivo) e deixa
      // claro que o fenótipo calculado (`coat`) tem prioridade sobre a
      // aparência típica de qualquer uma delas.
      const kind = (q.porte ?? 0.5) >= 0.6 ? "big cat" : "cat";
      subject =
        `a fictional but photorealistic ${physiqueAdj} hybrid ${kind}, a crossbreed between ${joinWithAnd(speciesLabels)}, ` +
        `blending visual traits of both parent species${morphClause}, proportionate feline body, four legs and a long tail, standing tall. ` +
        `Its coat and features (these take priority over either parent species' typical look): ${coat}`;
    }
  } else {
    const info = speciesInfo(s.species);
    // Gêmeo de fundador ("boerboel-femea", "gato-persa-macho") é tratado como o fundador BASE: sem `baseFounderId` o id não casava
    // em nenhuma tabela e a raça se perdia. Espécime nascido (id gerado) não casa pelo id: a raça de GATO vem de `s.breed`
    // (ADR-0033 adendo 2 — a espécie "felis-catus" não a carrega) e a de CÃO, da espécie (`dogBreedEnglishName` abaixo).
    const baseId = baseFounderId(s.id);
    const breed = s.species === "felis-catus" ? breedInfo(baseId) : undefined;
    const dogBreed = s.pack === "canine" ? dogBreedInfo(baseId) : undefined;
    if (breed) {
      // Gêmeo macho de fundador tartaruga/calico (preto): o nome do prompt é a cor que ele TEM ("Persa Preto"), nunca "Persa Tartaruga" (ADR-0038).
      const founderName = mosaicMaleTwinColourName(s.id) ?? breed.name;
      subject = `a purebred ${founderName} cat (Felis catus): ${breed.descriptor}. Body build: ${physiqueAdj}. Coat: ${coat}`;
    } else if (dogBreed) {
      subject = `a purebred ${dogBreed.name} dog (Canis familiaris): ${dogBreed.descriptor}. Body build: ${physiqueAdj}. Coat: ${coat}`;
    } else if (s.pack === "canine") {
      // RAÇA PURA nascida (species sem "×"; o id é gerado, então `dogBreedInfo(id)` acima não acha): NOMEIA a raça em inglês —
      // antes saía "mixed-breed dog" e o gerador desenhava um cão grande e maciço (dogue-alemao × dogue-alemao saiu com cara de
      // mastim). Só o NOME entra (nunca o descriptor da raça, que traz cor/pelagem típicas): cor, padrão e morfologia continuam
      // 100% do fenótipo calculado e PREVALECEM sobre o padrão da raça (mesma cláusula de prioridade dos híbridos).
      const breedName = dogBreedEnglishName(s.species);
      subject = breedName
        ? `a purebred ${breedName} dog (Canis familiaris), ${physiqueAdj}${morphClause}. ` +
          `Its coat and features (these take priority over the ${breedName} breed's typical colour and markings): ${coat}`
        : `a ${physiqueAdj} mixed-breed dog${morphClause}, with ${coat}`;
    } else if (catBreedEnglishName(s.breed) && s.species === "felis-catus") {
      // GATO DE RAÇA nascido (`breed` = mesma raça dos dois pais, ADR-0033 adendo 2): nomeia a raça em inglês, sem o descriptor
      // (que traz cor típica — Siamese "pointed", etc.); cor, padrão e morfologia continuam do fenótipo calculado e PREVALECEM.
      // Mestiço (`breed` nulo), variedade de cor (tabby/preto/branco) e espécime antigo seguem no ramo genérico abaixo.
      const catName = catBreedEnglishName(s.breed)!;
      subject = `a purebred ${catName} cat (Felis catus), ${physiqueAdj}${morphClause}. ` +
        `Its coat and features (these take priority over the ${catName} breed's typical colour and markings): ${coat}`;
    } else {
      const override = lionessOverride(s.species, s.sex);
      const commonName = override ? override.name : info.common;
      const sciLabel = override ? `${info.scientific}, female` : info.scientific;
      const descriptor = override ? override.descriptor : info.descriptor;
      const adj = override ? override.physiqueAdj : physiqueAdj;
      subject = `a ${adj} ${commonName} (${sciLabel})${morphClause}: ${descriptor}, with ${coat}`;
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
