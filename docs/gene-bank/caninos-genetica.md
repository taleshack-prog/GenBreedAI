# Gene-Bank Canino — Extensão de Genética (loci morfológicos)

**Status:** fonte de verdade · **Data:** 2026-09-07 · **ADR-0011**
**Motivo:** o pack canino original (B/K/A/E/S/R/F/C/M/H) cobre cor e padrão, mas
não o que diferencia as raças (porte, cabeça, orelhas, pelo, cauda). Esta
extensão adiciona loci morfológicos REAIS (base poligênica simplificada em loci
mendelianos, como no felino) para que as raças fiquem distintas e HERDÁVEIS.

## Loco de cor adicionado
| Loco | Traço | Alelos (dominância) | Efeito |
|---|---|---|---|
| **D** | Diluição (MLPH) | `D`(denso) > `d`(diluído) | `dd` = azul/isabela (preto→azul, liver→isabela) |

## Loci morfológicos novos (todos os caninos compartilham)

| Loco | Traço | Alelos (dominância) | Efeito |
|---|---|---|---|
| **Cph** | Formato do crânio | `Cph^b`(braquicefálico) > `Cph^m`(mesocefálico) > `Cph^d`(dolicocefálico) (dom. INCOMPLETA → intermediários) | Focinho curto/médio/longo |
| **Ec** | Orelhas | `Ec^e`(eretas) > `Ec^s`(semieretas) > `Ec^d`(caídas) (dom. INCOMPLETA) | Porte das orelhas |
| **Cl** | Comprimento do pelo | `Cl^l`(longo) > `Cl^s`(curto) (dom. completa) | Pelo longo vs curto |
| **Ct** | Tipo do pelo | `Ct^w`(áspero/wire) > `Ct^c`(cacheado/curly) > `Ct^n`(liso/normal) (dom. completa) | Textura |
| **Tl** | Cauda | `Tl^l`(longa) > `Tl^c`(enrolada) > `Tl^b`(curta/bob) (dom. completa) | Formato da cauda |

## QTL caninos (contínuos, herdáveis — média parental)
`porte` (0 = toy … 1 = gigante), `vigor` (musculatura), `beleza`, `temperamento`.
`porte` dirige o TAMANHO no retrato; `vigor` a robustez.

## Ordem de expressão
Cor/padrão (loci originais) definem a pelagem; os loci morfológicos definem
estrutura (crânio, orelhas, cauda, pelo). O QTL `porte` define a escala.

## Loco S (malhado branco) — dominância INCOMPLETA (ADR-0022)

**Atualizado:** 2026-09-18 · **ADR-0022**
**Motivo:** em cães reais, o heterozigoto do loco S costuma mostrar branco
residual (peito, patas, ponta da cauda) — sinal visual de que o animal
carrega piebald. A dominância completa anterior escondia essa pista: `S/s^p`
saía idêntico a `S/S`.

| Genótipo | Alelos (dominância) | Fenótipo |
|---|---|---|
| `S/S` | `S`(sólido) > `s^p`(piebald) — dom. INCOMPLETA | sólido |
| `S/s^p` | heterozigoto | **branco residual** (peito, patas, ponta da cauda) |
| `s^p/s^p` | homozigoto recessivo | piebald |

Nenhum dos 47 fundadores caninos (94 espécimes com os gêmeos) era `S/s^p` antes desta mudança (todos
`S/S` ou `s^p/s^p`) — nenhum fundador muda de aparência. Afeta apenas
filhotes `S/s^p` gerados por cruzamento (ex.: `dogue-manto` `s^p/s^p` ×
`dogue-tigrado` `S/S` → 100% da prole `S/s^p`, branco residual).

## Onda 1 — 12 raças icônicas (presets)

| Raça (slug) | porte | Cph | Ec | Cl | Tl | Cor/padrão |
|---|---|---|---|---|---|---|
| `dobermann` | 0.7 | Cph^d | Ec^e | Cl^s | Tl^l | preto+tan (a^t), sólido |
| `dogue-alemao` | 0.95 | Cph^m | Ec^s | Cl^s | Tl^l | fulvo ou arlequim |
| `pastor-alemao` | 0.7 | Cph^m | Ec^e | Cl^s | Tl^l | preto+tan (a^t) |
| `rottweiler` | 0.75 | Cph^b | Ec^d | Cl^s | Tl^l | preto+tan, robusto |
| `sao-bernardo` | 0.95 | Cph^b | Ec^d | Cl^l | Tl^l | branco+liver piebald, pelo longo |
| `dogo-argentino` | 0.75 | Cph^b | Ec^d | Cl^s | Tl^l | branco puro (ee) |
| `mastim-ingles` | 0.98 | Cph^b | Ec^d | Cl^s | Tl^l | fulvo com máscara |
| `collie` | 0.6 | Cph^d | Ec^s | Cl^l | Tl^l | sable+branco, pelo longo |
| `border-collie` | 0.5 | Cph^m | Ec^s | Cl^l | Tl^l | preto+branco piebald |
| `bull-terrier` | 0.5 | Cph^d | Ec^e | Cl^s | Tl^l | branco, cabeça ovoide |
| `bulldog-frances` | 0.3 | Cph^b | Ec^e | Cl^s | Tl^b | brindle, orelhas de morcego |
| `greyhound` | 0.6 | Cph^d | Ec^s | Cl^s | Tl^l | esguio, qualquer cor |

**Ondas seguintes:** Presa Canaria, Kangal, Alabai, Mastim Tibetano/Napolitano,
Cane Corso, Cimarron, Beauceron, Terra Nova, Bearded/Border/Shetland, Bull Mastiff,
Dogue de Bordeaux, Pit Bull, Belga (Malinois/Tervuren/Groenendael), Caucaso,
Serra da Estrela, Pampeiro, Campeiro, Terrier brasileiro/anão, Bulldog Inglês/
Americano, Spitz (todos), Blue Heeler, Aussie, Old English, Irish Wolfhound,
Whippet, Saluki, Afghan Hound, etc.

## Portadores ocultos por fundador

**Atualizado:** 2026-09-18 · mesmo raciocínio dos felinos (`felinos-genetica.md`).
**Motivo:** dos 47 fundadores-base caninos, 37 eram 100% homozigotos — cruzar
dois deles dava SEMPRE 1 única combinação (nada segregava). Nada de alelo
novo: só combinações que já existem no pack.

**Regras (todas verificadas por `apps/api/test/founder-carriers-canine.spec.ts`):**

1. Só loci de dominância **COMPLETA** (`B`, `K`, `A`, `E`, `R`, `D`, `Cl`, `Ct`,
   `Tl`) podem esconder um portador. `Cph`, `Ec`, `C`, `F`, `M` e `S` (desde a
   ADR-0022) têm dominância INCOMPLETA — o heterozigoto MUDA a aparência, então
   nunca viram portador.
2. O fundador precisa estar homozigoto no alelo do **topo do ranking** daquele
   locus; o portador é o recessivo abaixo dele. Quem já está no fundo do
   ranking (ex.: `a/a`, `d/d`, `e/e`, `b/b`, `Cl^s/Cl^s`) não tem o que esconder ali.
3. **Nenhum fenótipo visível muda** — `expressPhenotype()` dos 47, antes e
   depois, idêntico. Máximo de **2 loci** heterozigotos por fundador.
4. `D/d` (azul) só onde a cor diluída é notória na raça (8 fundadores: cane-corso,
   bulldog-frances, dogue-dourado, dogue-preto, whippet, greyhound, kangal,
   alabai) — nos demais, outro locus entrou no lugar.
5. Gêmeos (sexo oposto) continuam CÓPIA do genótipo do fundador-base.
6. Justificativas abaixo são de plausibilidade biológica ("recessivo raro/fora
   do padrão, mas descrito na raça real"), não de frequência alélica medida.

### 37 fundadores que ganharam portador (eram 100% homozigotos)

| Fundador | Portador(es) | Justificativa (raça real) |
|---|---|---|
| `boerboel` | K `K^br/k^y` · A `A^y/a` | Ninhadas de Boerboel misturam brindle e não-brindle (portador de k^y); linhas fulvas/brindle produzem, raramente, pretos sólidos (fora do padrão) |
| `dogue-dourado` | D `D/d` · B `B/b` | Dane azul e chocolate são cores reais, fora de alguns padrões mas documentadas; o Dane fulvo pode carregá-las |
| `dogue-tigrado` | K `K^br/k^y` · B `B/b` | Ninhadas brindle produzem fulvos (k^y); chocolate documentado — mesmo pool gênico do dourado (mesma raça), o que faz o par dourado × tigrado segregar |
| `dogue-preto` | D `D/d` · B `B/b` | Dane preto carregando azul é genética clássica (preto × azul dá azul); chocolate documentado |
| `dogue-azul` | B `B/b` | Já é `d/d` e `a/a` (fundo do ranking, nada a esconder); azul + chocolate oculto = isabela |
| `dogue-manto` | B `B/b` · E `E/e` | `a/a` e `s^p/s^p` definem a variante (intocados); cores de base raras ocultas sob o manto |
| `rottweiler` | B `B/b` · E `E/e` | Fígado/marrom e vermelho/amarelo são variantes raras e desclassificantes, mas segregam. **Não** usa `a` sob `a^t` (preto sólido desqualifica a raça — ajuste 2) |
| `sao-bernardo` | Cl `Cl^l/Cl^s` · A `A^y/a^t` | A raça tem duas variedades oficiais, pelo longo (rough) e curto (smooth); herança de cães de montanha suíços (tan-points) |
| `dogo-argentino` | B `B/b` · A `A^y/a` | `e/e` (branco) é epistático no fenótipo e mascara qualquer cor de base; ancestrais (Dogue, Boxer, Bull Terrier, Pointer) trazem pigmentos variados |
| `mastim-ingles` | B `B/b` · A `A^y/a` | Apricot/chocolate e máscara escura/preto sólido raros na raça |
| `collie` | Cl `Cl^l/Cl^s` · A `A^y/a^t` | Collie tem variedades rough e smooth; sable × tricolor (a^t) é o cruzamento clássico da raça |
| `border-collie` | Cl `Cl^l/Cl^s` · B `B/b` | Pelagem rough e smooth reais; red/chocolate é cor reconhecida (portadores comuns) |
| `bulldog-frances` | K `K^br/k^y` · D `D/d` | Brindle, fulvo e pied na mesma linhagem (k^y); azul é uma das cores mais documentadas da raça |
| `greyhound` | D `D/d` · B `B/b` | Azul e fígado são cores reconhecidas |
| `cane-corso` | D `D/d` · B `B/b` | Azul/formentino é uma das cores mais famosas da raça; chocolate documentado |
| `mastim-napolitano` | B `B/b` · E `E/e` | `a/a` e `d/d` já no fundo; chocolate raro documentado; creme/vermelho raro |
| `bull-mastiff` | B `B/b` · A `A^y/a` | Fulvo/vermelho carregando fígado/chocolate e preto sólido (raros, fora do padrão) |
| `kangal` | D `D/d` · B `B/b` | Diluição (cinza) é comum em cães de guarda de gado da Ásia Central |
| `alabai` | D `D/d` · B `B/b` | Idem — diluição bem documentada em Alabai/Ovtcharka |
| `pastor-caucaso` | Cl `Cl^l/Cl^s` · A `A^y/a^t` | Variedades de pelo longo e curto reconhecidas; preto-e-fogo ocorre na raça |
| `mastim-tibetano` | A `a^t/a` · B `B/b` | Linhas sólidas pretas sem tan existem (o `a` fica sob `a^t`, sem mudar o tan-point); marrom é cor reconhecida |
| `terra-nova` | B `B/b` · E `E/e` | Marrom é cor reconhecida (portador em linha preta é genética básica); amarelo raro, ancestral compartilhado com retrievers |
| `pastor-belga-malinois` | B `B/b` · A `A^y/a` | As variedades belgas (Groenendael preto) já se cruzaram historicamente — o Malinois fulvo pode carregar preto |
| `pastor-belga-groenendael` | B `B/b` · Cl `Cl^l/Cl^s` | Pelo curto (Malinois) circula entre as variedades da mesma raça |
| `pastor-serra-estrela` | Cl `Cl^l/Cl^s` · A `A^y/a` | Variedades de pelo curto e longo oficiais; carvão/preto sólido raro, fora do padrão |
| `old-english-sheepdog` | B `B/b` · E `E/e` | `a/a`, `d/d`, `Tl^b` já no fundo; marrom/creme como variantes conhecidas |
| `blue-heeler` | R `R/r` · B `B/b` | Roan/não-roan segrega de verdade na raça; cor de base oculta. **Não** usa `a` sob `a^t` (ajuste 2) |
| `pastor-shetland` | B `B/b` · A `A^y/a^t` | Marrom/chocolate raro; sable × tricolor (a^t) é o cruzamento clássico |
| `terrier-brasileiro` | A `a^t/a` · B `B/b` | Variação de cor plausível em linhas de terrier (o `a` fica sob `a^t`) |
| `terrier-anao-branco` | B `B/b` · A `A^y/a^t` | O manchado extenso (s^p) já cobre boa parte do corpo — cor de base oculta é plausível |
| `bulldog-americano` | B `B/b` · A `A^y/a` | Preto-e-branco e fígado existem na raça |
| `buldogue-campeiro` | B `B/b` · A `A^y/a` | Mesma lógica dos demais bulldogs |
| `spitz-alemao` | B `B/b` · A `A^y/a` | Marrom e preto são cores reconhecidas do Spitz Alemão |
| `irish-wolfhound` | Ct `Ct^w/Ct^n` · B `B/b` | Exemplares de pelo liso ("throwback") são descritos na raça; fígado raro |
| `whippet` | D `D/d` · B `B/b` | Azul e fígado são cores populares e documentadas |
| `saluki` | B `B/b` · A `A^y/a^t` | Fígado, preto-e-fogo e tricolor são cores reconhecidas |
| `afghan-hound` | B `B/b` · A `A^y/a` | Chocolate raro; preto é comum |

### 10 fundadores que JÁ eram heterozigotos (nunca documentados; NÃO mudaram)

| Fundador | Heterozigose | Observação |
|---|---|---|
| `braco-alemao` | E `E/e` | Portador do recessivo (creme/vermelho) escondido sob `E`; a base fígado (`b/b`) e o `s^p/s^p` definem a raça |
| `dobermann` | B `B/b` · D `D/d` | Vermelho (fígado) e azul são variantes reais do Dobermann; portadores comuns |
| `dogue-arlequim` | M `M/m` · H `H/h` | **Visível, define a variante:** M é incompleta (merle) e H, com epistasia sobre M, produz o arlequim |
| `pastor-alemao` | Cl `Cl^l/Cl^s` | `Cl^l` domina neste pack: o fundador expressa pelo longo e carrega o curto (NÃO é portador oculto — a variedade de pelo longo existe na raça) |
| `pastor-pampeano` | Cl `Cl^l/Cl^s` | Idem |
| `australian-shepherd` | M `M/m` · Cl `Cl^l/Cl^s` | M/m (merle) visível, define a raça; Cl como acima. **Achado desta rodada** — não estava na lista inicial |
| `presa-canaria` | K `K^br/k^y` | Brindle visível; carrega o não-brindle (ninhadas brindle × fulvo) |
| `cimarron` | K `K^br/k^y` | Idem |
| `pit-bull` | K `K^br/k^y` | Idem |
| `bulldog-ingles` | K `K^br/k^y` | Idem |

### Loci que NÃO podem virar portador (definem a raça)

- **S, Cph, Ec, C, F, M**: dominância incompleta em todo o pack.
- **E** em `dogo-argentino` (`e/e`, branco puro) — já é o fundo do ranking.
- **A** `a/a` (não-agouti sólido) em `dogue-preto`, `dogue-azul`, `dogue-manto`,
  `cane-corso`, `mastim-napolitano`, `terra-nova`, `pastor-belga-groenendael`,
  `old-english-sheepdog`, `border-collie` — fundo do ranking.
- **A** mínimo `a^t` (tan-point) em `pastor-alemao`, `rottweiler`,
  `mastim-tibetano`, `blue-heeler`, `terrier-brasileiro` — não pode subir pra `A^y`
  (viraria fulvo); o `a` sob `a^t` é permitido, exceto em `rottweiler` e
  `blue-heeler` (preto sólido desqualifica — ajuste 2).
- **D** `d/d` em `dogue-azul`, `mastim-napolitano`, `old-english-sheepdog`,
  `irish-wolfhound`; **K** `K^br` em `boerboel`, `dogue-tigrado`, `bulldog-frances`
  (só esconde `k^y` embaixo); **B** `b/b` em `sao-bernardo`; **Tl** `Tl^b` em
  `bulldog-frances`, `old-english-sheepdog`.
- **Tl** não foi usado como portador nesta rodada (rabo enrolado/curto oculto é
  pouco plausível para várias raças e o pedido restringiu os substitutos).

### Segregação (exemplos verificados por teste)

Antes, todo par entre fundadores 100% homozigotos dava 1 combinação. Agora:

| Par | Conta locus a locus | Combinações |
|---|---|---|
| `dogue-dourado` × `dogue-tigrado` | B `B/b`×`B/b` (2) · K `k^y/k^y`×`K^br/k^y` (2) · D `D/d`×`D/D` (1, mascarado) | 4 |
| `collie` × `border-collie` | A `A^y/a^t`×`a/a` (2) · Cl `Cl^l/Cl^s`×`Cl^l/Cl^s` (2) · B `B/B`×`B/b` (1, mascarado) | 4 |
| `cane-corso` × `boerboel` | K `k^y/k^y`×`K^br/k^y` (2) · A `a/a`×`A^y/a` (2) · B, D (1, mascarados) | 4 |

Portador só aparece no fenótipo quando os DOIS pais carregam o mesmo recessivo
ou o outro pai é homozigoto recessivo — por isso pares como `dogue-dourado` ×
`dogue-preto` dão só 1 combinação (nenhum recessivo é revelado).

### Retratos

O `cacheKey` do retrato depende do genótipo: os 37 fundadores alterados têm
`cacheKey` novo (o de canino não depende do sexo, então base e gêmeo dividem a
mesma imagem — 37 retratos, 74 espécimes). Os 10 pré-existentes não mudam.
