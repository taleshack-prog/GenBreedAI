# ADR-0033 — O prompt de imagem nomeia a raça canina pura

- **Status:** aceito · **Data:** 2026-09-23
- **Não muda** genótipo, fenótipo, `cacheKey` nem `CURRENT_ART_VERSION`; só o TEXTO enviado ao gerador para espécimes caninos de raça pura.

## Contexto

Dois filhotes de `dogue-alemao × dogue-alemao` saíram com cara de presa/mastim. O QTL `porte` estava certo (0,93–1,0) e virava
"very large and massive", mas nenhuma informação de RAÇA/proporção chegava ao gerador. Causa: `buildPrompt` só nomeava a raça pelo
**id do espécime** (`dogBreedInfo(s.id)`), que só casa com ids de FUNDADOR (`"boerboel"`, `"dogue-azul"`…). Um espécime NASCIDO tem id
gerado, então caía em `a <porte> mixed-breed dog with <cor>` — "cão misto grande e maciço", o oposto do Dogue Alemão (alto e esguio).

## Decisão

1. **Raça pura** = `species` sem `"×"` num espécime do pack canino que não é fundador de raça (id não casa). O prompt passa a dizer
   `a purebred <Nome inglês> dog (Canis familiaris), <porte, vigor> with <morfologia>. Its coat and features (these take priority
   over the <Nome> breed's typical colour and markings): <cor calculada>` — a MESMA ideia de prioridade que os híbridos já tinham.
2. **Só o NOME entra** — nunca o `descriptor` da raça (ele traz cor/pelagem típicas e travaria a cor). Cor, padrão e morfologia
   continuam 100% do fenótipo calculado: Dogue Alemão merle azul sai merle azul.
3. **Nome em inglês por slug de ESPÉCIE:** `DOG_BREED_ENGLISH_NAMES` / `dogBreedEnglishName()` em `packages/shared/src/breeds.ts`
   (o `SPECIES_INFO` só tem dois cães e `DOG_BREEDS` guarda só o nome em português e um descritor). Cada nome foi **transcrito
   literalmente do descritor** da própria raça — nada foi inventado — e o teste confere que aparece lá. Os seis Dogues (`dogue-*`)
   compartilham a espécie `dogue-alemao` → "Great Dane". **`terrier-anao-branco` fica de fora** (o descritor é "a small white toy
   terrier", sem nome de raça): continua no texto genérico até o dono fornecer o nome.
4. **Híbridos** e o caminho de **fundador** (id de raça) ficam exatamente como estavam.

## Consequências

- Só gerações NOVAS mudam de prompt. Retratos já gravados não mudam (a `cacheKey` não inclui o prompt): quem quiser refazer os dois
  filhotes precisa regenerar o retrato.
- O texto de porte continua "very large and massive" para `porte ≥ 0,85` — para o Dogue Alemão isso ainda empurra para "maciço";
  a proporção alta/esguia NÃO é dita. Correção possível numa 2ª rodada (não feita aqui).
- Lista de nomes é conferível e substituível pelo dono; entrada nova exige que o nome apareça no descritor ou que o teste seja atualizado
  com a fonte.

## Achados relacionados (não corrigidos aqui)

- `prompt.ts` chama `expressPhenotype` com `qtl: {}` (linhas 182/188): `expressPhenotype` só COPIA `zygote.qtl` para a saída (`phenotype.ts`,
  retorno) e não o usa para nenhum loco/traço; o prompt lê o QTL real de `s.genotype.qtl`. **Nenhum traço visível é afetado.**
- Gêmeos de fundador (`boerboel-femea`, `gato-persa-macho`…) não casam em `dogBreedInfo(s.id)`/`breedInfo(s.id)` (falta `baseFounderId`):
  os cães agora são cobertos pela nova regra por espécie; os **gatos** de raça (todos `felis-catus`) e os gêmeos/nascidos perdem a raça e
  saem como "domestic house cat". A raça de gato não é recuperável só pela espécie.
- Híbrido canino com `dogue-alemao` mostra o slug cru no texto ("a cross between dogue-alemao and …"): `DOG_BREEDS`/`SPECIES_INFO` não
  têm a chave `dogue-alemao`.

## Adendo (2026-09-23) — gêmeos, híbridos de cão e o limite dos gatos

- **Gêmeos de fundador corrigidos:** `buildPrompt` passa o id por `baseFounderId` antes de `breedInfo`/`dogBreedInfo`; `boerboel-femea` e
  `gato-persa-macho` saem com o mesmo prompt do fundador base (teste compara os dois textos).
- **Híbridos caninos:** os parentais usam o nome INGLÊS da tabela ("a cross between Great Dane and Boerboel"), depois o nome em português
  de `DOG_BREEDS`, depois o nome comum; o slug cru só aparece se nada existir. Como agora há nome de raça, o texto ganhou a cláusula de
  prioridade que só os híbridos felinos tinham ("Its coat and features (these take priority over either parent breed's typical look)"),
  no lugar do antigo "wearing <cor>". O teste de `image.spec.ts` passou a esperar "German Shorthaired Pointer" em vez de "Braço Alemão".
- **Gatos nascidos — NÃO corrigível sem novo dado.** Toda raça de gato tem `species = "felis-catus"` (a raça é só o id do fundador) e o
  espécime não guarda a raça em nenhum campo: `StoredSpecimen`/`specimens` têm `species`, `sireId`, `damId`, genótipo, mas nada como `breed`.
  Diferente do cão (a espécie carrega a raça: `boerboel`, `dogue-alemao`…), o gato nascido de dois Persas é indistinguível, pela linha,
  de um nascido de dois gatos sem raça. Deduzir pelos pais exigiria consultar o pedigree dentro de `buildPrompt` (puro, sem repositório)
  e não define o caso "Persa × Siamês". **O que falta:** um campo `breed` no espécime, preenchido no cruzamento (raça dos dois pais se
  igual; nulo se mistura) — mudança de schema + migração + preenchimento em `CrossService`/`IncubatorService`; decisão do dono.
- **Nomes em inglês dos gatos (para quando houver o campo), existentes nos descritores:** Siamese, Maine Coon, Persian, Bengal, Birman,
  Sphynx, Egyptian Mau, Abyssinian, Ragdoll ("a <Nome> cat"). **Sem nome de raça no descritor:** `gato-tabby` ("classic brown mackerel tabby
  domestic shorthair"), `gato-preto` ("solid jet-black domestic shorthair") e `gato-branco` ("pure white domestic shorthair") — são
  variedades de cor de gato sem raça, não raças; nada inventado. A tabela inglesa dos gatos NÃO foi criada (ficaria sem uso).

## Alternativas consideradas

- *Usar o `descriptor` da raça:* rejeitada — fixa a cor típica e briga com o fenótipo calculado.
- *Casar o nome pelo id do espécime:* rejeitada — nascidos têm id gerado; a espécie é o que permanece.
- *Mudar `CURRENT_ART_VERSION`:* rejeitada nesta rodada (invalida os retratos de fundador; decisão do dono).
