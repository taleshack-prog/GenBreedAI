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
