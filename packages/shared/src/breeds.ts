/**
 * Raças de gato doméstico (Felis catus). Compartilham a espécie biológica, mas
 * têm NOME e DESCRITOR próprios (essencial p/ o retrato ficar fiel). Chave = id
 * do fundador. Usado no prompt (API) e no display (web).
 */
export interface BreedInfo { name: string; descriptor: string; }

export const BREEDS: Record<string, BreedInfo> = {
  "gato-tabby": { name: "Gato Rajado", descriptor: "a classic brown mackerel tabby domestic shorthair cat, short coat with dark tabby stripes and an 'M' on the forehead" },
  "gato-siames": { name: "Siamês", descriptor: "a Siamese cat: sleek slender oriental body, a wedge-shaped head, short coat, pale cream body with dark seal-point coloration on the face mask, ears, paws and tail, vivid blue almond eyes" },
  "gato-preto": { name: "Gato Preto", descriptor: "a solid jet-black domestic shorthair cat, short glossy coat, luminous yellow-green eyes" },
  "gato-branco": { name: "Gato Branco", descriptor: "a pure white domestic shorthair cat, short clean coat" },
  "gato-maine-coon": { name: "Maine Coon", descriptor: "a Maine Coon cat: very large and long-bodied, a long shaggy water-resistant coat, prominent lynx-tipped tufted ears, a thick ruff around the neck, a very long bushy tail, brown classic tabby markings" },
  "gato-persa": { name: "Persa", descriptor: "a Persian cat: cobby stocky body, extremely long dense flowing fur, a flat brachycephalic round face with a snub nose, tiny ears set low, large round expressive eyes" },
  "gato-bengala": { name: "Bengala", descriptor: "a Bengal cat: muscular athletic wild-looking body, short dense coat with bold leopard-like black spots and rosettes on a golden background" },
  // ── novas ──
  "gato-birmania": { name: "Sagrado da Birmânia", descriptor: "a Birman cat: medium semi-long silky coat, a pale golden body with dark point coloration on face/ears/tail and characteristic pure white 'gloves' on all four paws, deep sapphire-blue eyes" },
  "gato-sphynx": { name: "Sphynx", descriptor: "a Sphynx cat: hairless with soft wrinkled bare skin, very large bat-like ears, prominent cheekbones, a lean muscular body and a round pot belly" },
  "gato-mau-egipcio": { name: "Mau Egípcio", descriptor: "an Egyptian Mau cat: an elegant spotted shorthair, silver coat scattered with random natural black spots, gooseberry-green eyes and a slightly worried expression" },
  "gato-abissinio": { name: "Abissínio", descriptor: "an Abyssinian cat: a slender athletic ticked-agouti cat with a warm ruddy-brown coat, large alert ears, lithe body" },
  "gato-ragdoll": { name: "Ragdoll", descriptor: "a Ragdoll cat: large and heavy, a plush semi-long silky coat, pointed coloration with a lighter body, big oval blue eyes, a relaxed floppy posture" },
  // ── fundadores de COR (ADR-0036) — descritores SEM cor: a cor vem do fenótipo calculado, nunca do descritor ──
  "gato-laranja": { name: "Gato Laranja", descriptor: "a domestic shorthair cat with a short smooth coat" },
  "gato-tartaruga": { name: "Gato Tartaruga", descriptor: "a domestic shorthair cat with a short smooth coat" },
  "gato-calico": { name: "Gato Calico", descriptor: "a domestic shorthair cat with a short smooth coat" },
  "gato-persa-branco": { name: "Persa Branco", descriptor: "a Persian cat: cobby stocky body, extremely long dense flowing fur, a flat brachycephalic round face with a snub nose, tiny ears set low, large round expressive eyes" },
  "gato-persa-colorpoint": { name: "Persa Colorpoint (Himalaio)", descriptor: "a Persian cat: cobby stocky body, extremely long dense flowing fur, a flat brachycephalic round face with a snub nose, tiny ears set low, large round expressive eyes" },
  "gato-persa-chocolate": { name: "Persa Chocolate", descriptor: "a Persian cat: cobby stocky body, extremely long dense flowing fur, a flat brachycephalic round face with a snub nose, tiny ears set low, large round expressive eyes" },
  "gato-persa-laranja": { name: "Persa Laranja", descriptor: "a Persian cat: cobby stocky body, extremely long dense flowing fur, a flat brachycephalic round face with a snub nose, tiny ears set low, large round expressive eyes" },
  "gato-persa-tartaruga": { name: "Persa Tartaruga", descriptor: "a Persian cat: cobby stocky body, extremely long dense flowing fur, a flat brachycephalic round face with a snub nose, tiny ears set low, large round expressive eyes" },
  "gato-maine-coon-preto": { name: "Maine Coon Preto", descriptor: "a Maine Coon cat: very large and long-bodied, a long shaggy water-resistant coat, prominent lynx-tipped tufted ears, a thick ruff around the neck, a very long bushy tail" },
  "gato-maine-coon-branco": { name: "Maine Coon Branco", descriptor: "a Maine Coon cat: very large and long-bodied, a long shaggy water-resistant coat, prominent lynx-tipped tufted ears, a thick ruff around the neck, a very long bushy tail" },
  "gato-maine-coon-laranja": { name: "Maine Coon Laranja", descriptor: "a Maine Coon cat: very large and long-bodied, a long shaggy water-resistant coat, prominent lynx-tipped tufted ears, a thick ruff around the neck, a very long bushy tail" },
  "gato-maine-coon-tartaruga": { name: "Maine Coon Tartaruga", descriptor: "a Maine Coon cat: very large and long-bodied, a long shaggy water-resistant coat, prominent lynx-tipped tufted ears, a thick ruff around the neck, a very long bushy tail" },
  "gato-abissinio-sorrel": { name: "Abissínio Sorrel", descriptor: "an Abyssinian cat: a slender athletic ticked-coat cat, large alert ears, lithe body" },
  "gato-abissinio-azul": { name: "Abissínio Azul", descriptor: "an Abyssinian cat: a slender athletic ticked-coat cat, large alert ears, lithe body" },
  "gato-ragdoll-blue": { name: "Ragdoll Blue Point", descriptor: "a Ragdoll cat: large and heavy, a plush semi-long silky coat, pointed coloration with a lighter body, big oval blue eyes, a relaxed floppy posture" },
  "gato-bengala-snow": { name: "Bengala Snow (Lynx Point)", descriptor: "a Bengal cat: muscular athletic wild-looking body, short dense coat with bold leopard-like spots and rosettes" },
};

/**
 * Fundadores de gato que são VARIEDADE DE COR (ADR-0036), não raça nova: id → id da raça a que pertencem, ou `null` para variedade de cor do
 * gato doméstico sem raça (laranja, tartaruga, calico — como tabby/preto/branco). Alimenta `founderBreed` (campo `specimens.breed`, ADR-0033
 * adendo 2): um Persa Branco × Persa Laranja nasce "Persian". `gato-tabby`, `gato-preto` e `gato-branco` (anteriores) não constam aqui:
 * seguem contando como "raças" em `catBreedIds()` como sempre contaram.
 */
export const CAT_FOUNDER_COLOUR_VARIANTS: Readonly<Record<string, string | null>> = {
  "gato-laranja": null, "gato-tartaruga": null, "gato-calico": null,
  "gato-persa-branco": "gato-persa", "gato-persa-colorpoint": "gato-persa", "gato-persa-chocolate": "gato-persa",
  "gato-persa-laranja": "gato-persa", "gato-persa-tartaruga": "gato-persa",
  "gato-maine-coon-preto": "gato-maine-coon", "gato-maine-coon-branco": "gato-maine-coon",
  "gato-maine-coon-laranja": "gato-maine-coon", "gato-maine-coon-tartaruga": "gato-maine-coon",
  "gato-abissinio-sorrel": "gato-abissinio", "gato-abissinio-azul": "gato-abissinio",
  "gato-ragdoll-blue": "gato-ragdoll", "gato-bengala-snow": "gato-bengala",
};

/** Ids de `BREEDS` que são fundadores "de raça" (12 — sem as variedades de cor de `CAT_FOUNDER_COLOUR_VARIANTS`). */
export function catBreedIds(): string[] {
  return Object.keys(BREEDS).filter((id) => !(id in CAT_FOUNDER_COLOUR_VARIANTS));
}

export function breedInfo(id: string): BreedInfo | undefined { return BREEDS[id]; }

/** Raças caninas (Canis familiaris). Onda 1 — 12 raças icônicas. */
export const DOG_BREEDS: Record<string, BreedInfo> = {
  "boerboel": { name: "Boerboel", descriptor: "an adult Boerboel mastiff, large muscular guard dog, short fawn coat, broad blocky head with a dark mask, droopy ears" },
  "braco-alemao": { name: "Braço Alemão", descriptor: "an adult German Shorthaired Pointer, athletic hunting dog, short liver-and-white ticked/roan coat, droopy ears, long muzzle" },
  "dobermann": { name: "Dobermann", descriptor: "an adult Dobermann Pinscher, large sleek athletic dog, short glossy black coat with rich tan markings on face, chest and legs, a long elegant dolichocephalic muzzle, pointed erect ears, lean muscular build" },
  "dogue-dourado": { name: "Dogue Alemão Dourado", descriptor: "a giant Great Dane, extremely tall and elegant, short coat, a long rectangular head, semi-erect (or naturally folded) ears, very long legs, deep chest, a fawn golden coat with a black mask" },
  "dogue-tigrado": { name: "Dogue Alemão Tigrado", descriptor: "a giant Great Dane, tall and elegant, a long rectangular head, deep chest; its coat is DISTINCTLY BRINDLE: a golden-fawn base completely covered with bold vertical dark tiger-stripes over the entire body and legs (a tiger-striped brindle Great Dane, definitely NOT a solid fawn dog)" },
  "dogue-preto": { name: "Dogue Alemão Preto", descriptor: "a giant Great Dane, tall and elegant, a long rectangular head, deep chest, a solid glossy jet-black coat" },
  "dogue-azul": { name: "Dogue Alemão Azul", descriptor: "a giant Great Dane, tall and elegant, a long rectangular head, deep chest, a solid steel blue-grey (dilute) coat" },
  "dogue-arlequim": { name: "Dogue Alemão Arlequim", descriptor: "a giant Great Dane, tall and elegant, a long rectangular head, deep chest, a harlequin coat: a pure white base with irregular torn jet-black patches scattered over the body" },
  "dogue-manto": { name: "Dogue Alemão Manto (Boston)", descriptor: "a giant Great Dane, tall and elegant, a long rectangular head, deep chest, a mantle/boston pattern: a solid black 'blanket' over the back with a white chest, muzzle, collar, legs and tail tip" },
  "pastor-alemao": { name: "Pastor Alemão", descriptor: "an adult German Shepherd Dog, large athletic dog, medium double coat, black-and-tan saddle markings, large erect pointed ears, a sloping back, a long muzzle, a bushy tail" },
  "rottweiler": { name: "Rottweiler", descriptor: "an adult Rottweiler, large powerfully muscled robust dog, short black coat with defined mahogany-tan markings, a broad heavy head, droopy triangular ears, blocky muzzle" },
  "sao-bernardo": { name: "São Bernardo", descriptor: "a giant Saint Bernard, massive heavy dog, long thick white coat with large liver/red patches, a huge broad head with jowls, droopy ears, a bushy tail" },
  "dogo-argentino": { name: "Dogo Argentino", descriptor: "an adult Dogo Argentino, large athletic muscular dog, short pure white coat, a broad powerful head, a strong muzzle, often cropped or half-pricked ears" },
  "mastim-ingles": { name: "Mastiff Inglês", descriptor: "a giant English Mastiff, enormous heavy-boned dog, short fawn/apricot coat with a dark black mask on the face, a massive broad head with heavy jowls, small droopy ears" },
  "collie": { name: "Collie", descriptor: "an adult Rough Collie, elegant medium dog, a very long luxurious sable-and-white coat, a long narrow refined muzzle, semi-erect tipped ears, a mane-like ruff, a plumed tail" },
  "border-collie": { name: "Border Collie", descriptor: "an adult Border Collie, medium athletic herding dog, a medium-long black-and-white coat, an intense focused expression, semi-erect ears, a bushy tail" },
  "bulldog-frances": { name: "Bulldog Francês", descriptor: "a small French Bulldog, compact muscular dog, short brindle coat, a flat brachycephalic wrinkled face with a short muzzle, large rounded bat ears standing erect, a short stub tail" },
  "greyhound": { name: "Greyhound", descriptor: "an adult Greyhound, tall extremely slender sighthound, a deep narrow chest and tucked-up waist, very long thin legs, a long narrow head, small rose ears folded back, short smooth coat, a long thin tail" },
  // ── ONDA 2 ──
  // Molossos / guardiões
  "presa-canaria": { name: "Presa Canário", descriptor: "an adult Presa Canario (Dogo Canario), a large powerful molosser guard dog, short brindle or fawn coat, a broad massive head with a black mask, thick neck, droopy ears, muscular build" },
  "cane-corso": { name: "Cane Corso", descriptor: "an adult Cane Corso, a large athletic Italian molosser, short black or grey coat, a broad rectangular head with loose jowls and a black mask, muscular powerful body, droopy or cropped ears" },
  "mastim-napolitano": { name: "Mastim Napolitano", descriptor: "an adult Neapolitan Mastiff, a giant heavy molosser with abundant loose wrinkled skin and pendulous dewlaps and jowls, short grey/blue or black coat, a massive head, droopy ears" },
  "bull-mastiff": { name: "Bullmastiff", descriptor: "an adult Bullmastiff, a large powerful dog, short fawn or red coat with a dark black mask on the muzzle, a broad wrinkled head, droopy V-shaped ears, muscular square body" },
  "kangal": { name: "Kangal", descriptor: "an adult Kangal, a large Anatolian livestock guardian dog, short pale fawn/sable coat with a distinctive black mask and black ears, powerful build, curled tail, thick neck" },
  "alabai": { name: "Alabai (Pastor do Cáucaso Central)", descriptor: "an adult Central Asian Shepherd (Alabai), a giant powerful livestock guardian resembling a Kangal: a BROAD heavy bear-like head with a WIDE muzzle and a dark BLACK MASK, a solid fawn/sable SHORT-to-medium coat (NOT very fluffy or long), small drop ears, massive bone and a thick neck" },
  "pastor-caucaso": { name: "Pastor do Cáucaso", descriptor: "an adult Caucasian Shepherd Dog, a giant bear-like livestock guardian with a very thick long coat and a huge mane-like ruff, a massive broad head, small drop ears, grey/fawn/brindle" },
  "mastim-tibetano": { name: "Mastim Tibetano", descriptor: "an adult Tibetan Mastiff, a large guardian with an extremely thick long double coat and a prominent lion-like mane around the neck and shoulders, a broad head, droopy ears, a bushy curled tail, often black-and-tan or red" },
  "cimarron": { name: "Cimarrón Uruguaio", descriptor: "an adult Cimarron Uruguayo, a medium-large molosser, short brindle or fawn coat with a black mask, a broad head, drop ears, athletic muscular body" },
  "terra-nova": { name: "Terra Nova (Newfoundland)", descriptor: "an adult Newfoundland dog, a giant water dog with a thick heavy black (or brown/landseer black-and-white) double coat, a massive broad head, droopy ears, webbed feet, a bushy tail" },
  // Pastores
  "pastor-belga-malinois": { name: "Pastor Belga Malinois", descriptor: "an adult Belgian Malinois: an athletic lean medium shepherd with a VERY SHORT close-lying fawn/mahogany coat (short-haired, NOT long or fluffy), a long chiseled NARROW tapered muzzle, and a large solid BLACK MASK that covers the muzzle and face and extends UP TO THE EARS; the ears themselves are black; the body is a SOLID fawn colour with only black-tipped guard hairs — it has NO black saddle, NO black blanket and NO dark cape over the back (do not draw a German-Shepherd saddle); large erect pointed ears, alert intense expression" },
  "pastor-belga-groenendael": { name: "Pastor Belga Groenendael", descriptor: "an adult Belgian Groenendael, an elegant shepherd with a long solid jet-black coat, a thick mane-like ruff, large erect pointed ears, a plumed tail" },
  "pastor-serra-estrela": { name: "Pastor da Serra da Estrela", descriptor: "an adult Estrela Mountain Dog, a large Portuguese livestock guardian, a thick fawn/wolf-grey coat, a broad bear-like head, small folded ears, a hooked bushy tail" },
  "pastor-pampeano": { name: "Pastor Pampeano (Ovelheiro Gaúcho)", descriptor: "an adult Pampas/Gaucho sheepdog, a rustic medium-large herding dog with a shaggy medium coat, hair often covering the eyes, drop ears, varied colours" },
  "old-english-sheepdog": { name: "Old English Sheepdog", descriptor: "an adult Old English Sheepdog, a large shaggy herding dog with a profuse long grey-and-white coat covering the whole body and eyes, a bear-like gait, a bobbed or absent tail" },
  "australian-shepherd": { name: "Pastor Australiano", descriptor: "an adult Australian Shepherd, a medium herding dog with a medium-length merle (blue or red merle) or black/red coat with tan and white markings, semi-erect ears, often striking blue eyes" },
  "blue-heeler": { name: "Blue Heeler (Boiadeiro Australiano)", descriptor: "an adult Australian Cattle Dog (Blue Heeler): a MEDIUM-SIZED, compact, hard-muscled and STURDY working herding dog — clearly larger, heavier and more substantial than any small terrier (this is NOT a terrier); a well-balanced athletic body of moderate height, a broad slightly-rounded skull with a moderate strong muzzle, a thick powerful neck, erect pointed ears; the coat is the classic BLUE colour: a dense short blue-grey speckled and mottled coat (black hairs evenly flecked through white giving a blue appearance) with tan points on the legs, chest and face and often a black or blue patch on the head" },
  // Collies extras
  "pastor-shetland": { name: "Pastor de Shetland (Sheltie)", descriptor: "an adult Shetland Sheepdog, a small elegant herding dog resembling a miniature Rough Collie, a long sable/tricolour/blue-merle-and-white coat, a refined wedge head, semi-erect tipped ears, a mane and plumed tail" },
  // Terriers / bulldogs / brasileiros
  "pit-bull": { name: "Pit Bull (APBT)", descriptor: "an adult American Pit Bull Terrier, a muscular medium athletic dog with a short coat in many colours, a broad wedge-shaped head with strong cheek muscles, a medium muzzle, rose or half-pricked ears" },
  "terrier-brasileiro": { name: "Terrier Brasileiro (Fox Paulistinha)", descriptor: "an adult Brazilian Terrier, a small agile tricolour (white with black/tan) short-coated terrier, a triangular head, semi-erect folded ears, a lively expression" },
  "terrier-anao-branco": { name: "Terrier Anão Branco", descriptor: "a small white toy terrier, a compact short-coated little dog with a mostly white coat, a small refined head, erect or semi-erect ears, an alert lively expression" },
  "bulldog-ingles": { name: "Bulldog Inglês", descriptor: "an adult English Bulldog, a medium stocky heavy dog, a very broad massive brachycephalic head with a short upturned muzzle, heavy facial wrinkles and undershot jaw, small rose ears, a wide low muscular body, a short tail" },
  "bulldog-americano": { name: "Bulldog Americano", descriptor: "an adult American Bulldog, a large athletic muscular dog, short white coat often with brindle or fawn patches, a broad powerful head with a moderate muzzle, drop ears, strong build" },
  "buldogue-campeiro": { name: "Buldogue Campeiro", descriptor: "an adult Buldogue Campeiro, a rustic Brazilian bulldog, medium-large muscular, short coat (often white/brindle/fawn), a broad head with a moderate muzzle (less extreme than the English), drop ears, athletic" },
  "spitz-alemao": { name: "Spitz Alemão (Lulu da Pomerânia)", descriptor: "a small Pomeranian / German Spitz, a tiny fluffy dog with a very thick stand-off double coat forming a ruff, a fox-like face, small erect triangular ears, a plumed tail curled over the back" },
  // Sighthounds
  "irish-wolfhound": { name: "Wolfhound Irlandês", descriptor: "an adult Irish Wolfhound, a giant rough-coated sighthound, very tall, with a harsh HARD WIRY solid grey (or fawn/wheaten) coat with NO stripes and NO brindle, a long narrow head with a wiry beard and eyebrows, small rose ears, a deep narrow chest, long legs, a long tail" },
  "whippet": { name: "Whippet", descriptor: "an adult Whippet, a small-medium sighthound, extremely slender with a deep chest and tucked waist, a short smooth coat, a long narrow head, small rose ears folded back, a long thin tail" },
  "saluki": { name: "Saluki", descriptor: "an adult Saluki, an elegant slender sighthound, a smooth short coat with long silky feathering on the ears, tail and legs, a long narrow refined head, long drop ears with silky hair, a deep chest" },
  "afghan-hound": { name: "Afghan Hound", descriptor: "an adult Afghan Hound, an elegant sighthound with a very long flowing silky coat, a long refined head with a topknot, long drop ears covered in silky hair, a ring-curled tail tip, aristocratic bearing" },
};

export function dogBreedInfo(id: string): BreedInfo | undefined { return DOG_BREEDS[id]; }

/**
 * Nome da raça em INGLÊS para o prompt de imagem, por SLUG DE ESPÉCIE (`specimen.species`) — não por id de fundador: um espécime
 * NASCIDO tem id gerado, então `dogBreedInfo(id)` não o acha, mas a espécie permanece (raça pura = species sem "×"). Os seis
 * Dogues Alemães (dogue-dourado/tigrado/preto/azul/arlequim/manto) compartilham a espécie "dogue-alemao".
 * Cada nome foi TRANSCRITO literalmente do `descriptor` da raça em `DOG_BREEDS` (acima) — nada foi inventado; o teste
 * `prompt-canine-breed.spec.ts` confere que o nome aparece no descritor. Só o NOME: cor, padrão e morfologia vêm do fenótipo
 * calculado. Ausente de propósito: `terrier-anao-branco` (o descritor não traz nome de raça em inglês — "a small white toy terrier").
 */
export const DOG_BREED_ENGLISH_NAMES: Readonly<Record<string, string>> = {
  boerboel: "Boerboel",
  "braco-alemao": "German Shorthaired Pointer",
  dobermann: "Dobermann Pinscher",
  "dogue-alemao": "Great Dane",
  "pastor-alemao": "German Shepherd Dog",
  rottweiler: "Rottweiler",
  "sao-bernardo": "Saint Bernard",
  "dogo-argentino": "Dogo Argentino",
  "mastim-ingles": "English Mastiff",
  collie: "Rough Collie",
  "border-collie": "Border Collie",
  "bulldog-frances": "French Bulldog",
  greyhound: "Greyhound",
  "presa-canaria": "Presa Canario",
  "cane-corso": "Cane Corso",
  "mastim-napolitano": "Neapolitan Mastiff",
  "bull-mastiff": "Bullmastiff",
  kangal: "Kangal",
  alabai: "Central Asian Shepherd (Alabai)",
  "pastor-caucaso": "Caucasian Shepherd Dog",
  "mastim-tibetano": "Tibetan Mastiff",
  cimarron: "Cimarron Uruguayo",
  "terra-nova": "Newfoundland",
  "pastor-belga-malinois": "Belgian Malinois",
  "pastor-belga-groenendael": "Belgian Groenendael",
  "pastor-serra-estrela": "Estrela Mountain Dog",
  "pastor-pampeano": "Pampas/Gaucho sheepdog",
  "old-english-sheepdog": "Old English Sheepdog",
  "australian-shepherd": "Australian Shepherd",
  "blue-heeler": "Australian Cattle Dog (Blue Heeler)",
  "pastor-shetland": "Shetland Sheepdog",
  "pit-bull": "American Pit Bull Terrier",
  "terrier-brasileiro": "Brazilian Terrier",
  "bulldog-ingles": "English Bulldog",
  "bulldog-americano": "American Bulldog",
  "buldogue-campeiro": "Buldogue Campeiro",
  "spitz-alemao": "Pomeranian / German Spitz",
  "irish-wolfhound": "Irish Wolfhound",
  whippet: "Whippet",
  saluki: "Saluki",
  "afghan-hound": "Afghan Hound",
};

/**
 * Nome INGLÊS das raças de GATO para o prompt, por id de raça (o mesmo id do fundador e de `specimens.breed`, ADR-0033 adendo 2).
 * Transcrito literalmente do `descriptor` em `BREEDS` ("a Persian cat: …"); o teste confere que "<Nome> cat" aparece lá.
 * `gato-tabby`, `gato-preto` e `gato-branco` NÃO estão aqui de propósito: são variedades de cor de "domestic shorthair", não raças —
 * não têm `breed` e seguem saindo como gato doméstico.
 */
export const CAT_BREED_ENGLISH_NAMES: Readonly<Record<string, string>> = {
  "gato-siames": "Siamese",
  "gato-maine-coon": "Maine Coon",
  "gato-persa": "Persian",
  "gato-bengala": "Bengal",
  "gato-birmania": "Birman",
  "gato-sphynx": "Sphynx",
  "gato-mau-egipcio": "Egyptian Mau",
  "gato-abissinio": "Abyssinian",
  "gato-ragdoll": "Ragdoll",
};

/** Nome inglês da raça de gato pelo id de raça (`specimens.breed`), ou `undefined` (nulo, variedade de cor ou desconhecida). */
export function catBreedEnglishName(breed: string | null | undefined): string | undefined {
  return breed ? CAT_BREED_ENGLISH_NAMES[breed] : undefined;
}

/** Nome inglês da raça pura pelo slug de espécie, ou `undefined` (espécie desconhecida, híbrido com "×" ou sem nome no descritor). */
export function dogBreedEnglishName(species: string): string | undefined {
  return species.includes("×") ? undefined : DOG_BREED_ENGLISH_NAMES[species];
}
