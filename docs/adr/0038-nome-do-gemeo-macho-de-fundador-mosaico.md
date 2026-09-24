# ADR-0038 — Nome do gêmeo macho de fundador tartaruga/calico

- **Status:** aceito · **Data:** 2026-09-24
- **Complementa** ADR-0035 (regra do X do gêmeo) e ADR-0036 (fundadores de cor). Só nome de exibição e nome no prompt de imagem; genótipo, `cacheKey` e sexo não mudam.

## Contexto

O gêmeo macho de um fundador tartaruga ou calico herda o X não-laranja (`[o]`, ADR-0035) e sai **preto**. O nome de exibição vinha de `resolveDisplayName(id, species)`, que
remove o sufixo de gêmeo (`baseFounderId`) e devolve o nome do base — então o gato preto aparecia como "Persa Tartaruga ♂". Macho tartaruga praticamente não existe na natureza:
o nome confunde e ensina errado. O prompt de imagem tinha o mesmo defeito (`a purebred Persa Tartaruga cat … Coat: a melanistic solid black coat`), com o risco de o gerador
desenhar um gato tartaruga. `resolveDisplayName` só conhece `id` e `species` (sem genótipo), e é usada em ~15 lugares da web e na rota pública `/f/[id]`.

## Decisão

Regra GERAL, sem lista à mão (`packages/shared/src/display.ts`):
1. `mosaicMaleTwinColourName(id)`: se `id` é um gêmeo **macho** (`-macho`) cujo fundador base tem "Tartaruga" ou "Calico" no nome, devolve o nome com a palavra trocada por
   **"Preto"** ("Persa Tartaruga" → "Persa Preto"). Qualquer fundador mosaico futuro herda o tratamento.
2. `resolveDisplayName` usa esse nome; **se ele já é de outro fundador** (raça de gato, de cão ou felino selvagem), acrescenta a linhagem: `"<nome> (linhagem Tartaruga|Calico)"`.
   A checagem é dinâmica contra `BREEDS`/`DOG_BREEDS`/`WILD_FELINE_FOUNDER_NAMES`.
3. O prompt de imagem do gêmeo usa o nome da cor **sem** a linhagem (`a purebred Persa Preto cat`), para o gerador nunca ler "Tartaruga" num gato preto.

| Fundador | Nome hoje → novo | Colisão |
|---|---|---|
| `gato-tartaruga-macho` | Gato Tartaruga → **Gato Preto (linhagem Tartaruga)** | "Gato Preto" já é o `gato-preto` |
| `gato-calico-macho` | Gato Calico → **Gato Preto (linhagem Calico)** | idem; distinto do anterior |
| `gato-persa-tartaruga-macho` | Persa Tartaruga → **Persa Preto** | nenhuma (o `gato-persa-preto` não existe, ADR-0036) |
| `gato-maine-coon-tartaruga-macho` | Maine Coon Tartaruga → **Maine Coon Preto (linhagem Tartaruga)** | "Maine Coon Preto" já é o `gato-maine-coon-preto` |

Base (fêmea) e todos os outros gêmeos mantêm o nome.

## Consequências

- **Por que regra e não lista:** a cor do gêmeo depende do genótipo, que `resolveDisplayName` não tem. A regra se apoia numa convenção verificável — todo fundador mosaico tem melanismo
  (`A/a`), então o gêmeo macho é preto. O teste `founder-names.spec.ts` confere, para cada gêmeo macho mosaico, que a pelagem calculada é `a melanistic solid black coat`; se alguém criar um
  tartaruga sem melanismo, o teste falha e a regra precisa mudar.
- Nenhum nome de exibição se repete entre fundadores diferentes (teste sobre os 180 espécimes de `founderSeeds()`); base e gêmeo da mesma linha compartilham o nome, como sempre.
- Se um dia existir `gato-persa-preto`, o gêmeo da Persa Tartaruga passa sozinho a "Persa Preto (linhagem Tartaruga)".
- Espécimes nascidos (id gerado) não são afetados: o nome deles vem da espécie, como antes.
- O nome com "(linhagem …)" é longo para cartões estreitos; a web já trunca nomes (`truncate`).

## Alternativas consideradas

- *Lista de quatro exceções:* rejeitada — a regra é geral e a colisão é resolvida sozinha.
- *Nome pelo fenótipo real (genótipo + sexo):* rejeitada por ora — exigiria mudar a assinatura de `resolveDisplayName` e ~15 chamadores que só têm `id`/`species`.
- *Manter "Gato Preto" para o gêmeo:* rejeitada — dois fundadores diferentes com o mesmo nome.
