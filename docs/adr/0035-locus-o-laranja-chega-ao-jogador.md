# ADR-0035 — O locus O (laranja) chega ao jogador: cacheKey com X, prompt lê o pigmento, gêmeo trata o X

- **Status:** aceito · **Data:** 2026-09-24
- **Complementa** a ADR-0013 (sexo cromossômico e locus O). **Não cria fundador laranja** — só destrava; quais gatos laranja entram é decisão à parte.

## Contexto

O locus O (laranja, ligado ao X) existe no motor, com golden test (`tortoiseshell`), mas o jogador nunca via um gato laranja, creme, tartaruga
ou calico. Quatro lacunas:
1. nenhum fundador tem `xLoci` — todos assumem `o` (`gamete.ts`, `defaultXAllele`);
2. o prompt não lia o pigmento: `coatFeline` só olhava `loci`, e ainda chamava `expressPhenotype` **sem** `xLoci` (então `coatPigment` nem era calculado);
3. `hashGenotype` ignorava `xLoci` — e o motor calculava a `cacheKey` do nascido sobre o `zygote` (sem X), então dois gatos iguais exceto no O
   dividiriam o MESMO retrato;
4. o gêmeo de fundador é cópia profunda do base: uma fêmea tartaruga (`O/o`) copiada para macho geraria um X inválido (macho é hemizigoto).

## Decisão

### 1. `hashGenotype` inclui `xLoci` (packages/engine/src/cross.ts)
- Anexa `|x{O:…}` **só quando há `xLoci` não vazio**; por locus, alelos distintos e ordenados (`[o]` e `[o,o]` → `o`; `[O,o]` e `[o,O]` → `O/o`), para macho e
  fêmea sem diferença visual não gerarem chaves diferentes.
- Genótipo sem `xLoci` gera EXATAMENTE a string de antes ⇒ **nenhuma `cacheKey` de fundador muda**. Nascidos já têm `cache_key` gravada (prioridade em
  `cacheKeyOf`), então o retrato existente não é invalidado. Risco residual, não verificável pelo repo: linha com `cache_key` NULA e `xLoci` no genótipo —
  `SELECT count(*) FROM specimens WHERE method <> 'FOUNDER' AND cache_key IS NULL AND genotype ? 'xLoci';`
- `finalizeSpecimen` passa a calcular a chave sobre `zygoteWithX` (antes: `zygote`), para a chave do nascido enxergar o X. Efeito: um nascido novo
  não reaproveita retrato de chave antiga por coincidência de genótipo (na prática nunca ocorria: o QTL entra no hash com 6 casas).

### 2. Prompt felino lê o pigmento (`apps/api/src/images/prompt.ts`)
`expressPhenotype` recebe `xLoci`; `coatFeline` recebe `coatPigment`/`pigmentDiluted`. Ordem de precedência: **pelado > branco dominante > albino > LARANJA >
melanismo/cor B×D > tom de fundo**. O laranja mascara `A` (preto) e `B` (chocolate/canela); `D` dilui o laranja em creme; `P` continua o padrão.

| Pigmento | Texto |
|---|---|
| `PHEOMELANIN` (macho `O`, fêmea `O/O`) | `a rich ginger-orange coat` (+ padrão em "darker ginger" ou `faint ghost tabby markings` no liso) |
| `PHEOMELANIN` + `d/d` | `a soft cream coat` (+ padrão) |
| `MOSAIC` (fêmea `O/o`) | `a tortoiseshell coat, irregular patches of black and ginger` (a parte escura é a cor de B×D: chocolate, azul-cinza…) |
| `MOSAIC` + `d/d` | `a blue-cream coat, irregular patches of blue-grey and soft cream` (`a dilute tortoiseshell coat…` com chocolate/lilás) |
| `MOSAIC` + `S` | `a calico coat, irregular patches of black and ginger with large white patches` (`a dilute calico…`) |
| `PHEOMELANIN` + `S` | acrescenta `, with white patches on the chest, belly and paws` |
| gato de pontos + laranja | corpo no tom de fundo; pontos `ginger-orange` / `cream` / `tortoiseshell` |

`EUMELANIN` (macho `o`, fêmea `o/o`, sem X) → texto **idêntico** ao de antes. Macho nunca é `MOSAIC` (o motor o impede; teste com 300 filhotes).

**O S (bicolor) entra só na família laranja** (calico, laranja e branco). Renderizá-lo em todo gato mudaria o prompt do Birmanês e do Ragdoll
(`S/s`), contra "fundadores inalterados". O bicolor de gato preto/tabby continua fora do prompt — decisão do dono.

### 3. Gêmeo de fundador trata o X (`twinGenotype`, `in-memory.repository.ts`)
Cópia profunda dos autossomos; X assim: fêmea `O/O` → macho `[O]`; `o/o` → `[o]`; **`O/o` (tartaruga) → macho `[o]`**; macho `[O]` → fêmea `[O,O]`; `[o]` →
`[o,o]`. O gêmeo mantém o fenótipo sempre que biologicamente possível; para a tartaruga (macho não pode ser mosaico) o alelo mais recessivo do ranking
(`o`, o mesmo default de `gamete.ts`) dá ao gêmeo a cor de base da linhagem, e o casal tartaruga × gêmeo segrega laranja, preto e tartaruga. Sem `xLoci`
(todo fundador atual) o gêmeo é a cópia idêntica de sempre.

### 4. `fel()` aceita `xLoci` (último parâmetro, opcional)
A chave `xLoci` só existe no genótipo quando informada — nenhum fundador atual muda. **Nenhum fundador novo foi criado.**

## Consequências

- Fundadores: mesmo genótipo, fenótipo, prompt e `cacheKey` (testes: `feline-orange-prompt.spec.ts`, `feline-colour-prompt.spec.ts`, `hash-xloci.test.ts`).
- Quando entrarem fundadores laranja, o Sphynx continua ignorando cor (pelado retorna cedo) e o sépia/silver/mink seguem fora do pack.
- Gatos nascidos passam a ter chave de retrato que depende do X; irmãos idênticos exceto no O geram retratos diferentes (o objetivo).

## Alternativas consideradas

- *Só mudar `hashGenotype`:* rejeitada — a chave do nascido era calculada sobre `zygote` (sem X).
- *Renderizar S para todos:* rejeitada — mudaria o prompt do Birmanês/Ragdoll.
- *Gêmeo da tartaruga com `[O]`:* válida, mas o `[o]` mantém a cor de base da linhagem; troca é uma linha em `twinGenotype`.
