# ADR-0014 — Efeito materno no QTL porte (Etapa 2b)

- **Status:** aceito · **Data:** 2026-09-15

## Contexto

A versão anterior deste parâmetro usava `m = 0` (efeito materno desligado,
placeholder). Esta ADR define o mecanismo de verdade: o porte da PROLE não
depende só do seu próprio valor genético (breeding value) — depende também
do ambiente uterino/de amamentação da MÃE, um efeito bem documentado em
zootecnia e completamente separado de herança mendeliana.

**Fonte:** Walton, A. & Hammond, J. (1938), *"The maternal effects on growth
and conformation in Shire horse-Shetland pony crosses"*, Proc. R. Soc. Lond.
B 125:311–335. Cruzamentos RECÍPROCOS Shire×Shetland (Shire garanhão ×
Shetland égua, e o inverso) produzem F1 GENETICAMENTE idênticas (mesma
combinação de alelos possível dos dois lados) — mas os potros nascidos de
mãe Shetland ficam PERMANENTEMENTE menores que os nascidos de mãe Shire,
mesmo depois de adultos. Como a genética é a mesma dos dois lados, a
diferença observada só pode ser efeito MATERNO (ambiente pré/pós-natal), não
genético.

**Derivação:** diferença recíproca = m × (Shire − Shetland), onde "Shire" e
"Shetland" são os valores médios de porte adulto de cada raça parental nas
tabelas de Walton & Hammond.

**Δ declarado explicitamente (correção Etapa 2b, item 1):** generalizando pro
jogo — dois indivíduos GENETICAMENTE equivalentes (mesmo BV, mesma seed),
trocando de orientação recíproca (quem é o pai e quem é a mãe), têm

```
Δ = porteMãe₁ − porteMãe₂
diferença entre recíprocos (porteAdulto₁ − porteAdulto₂) = mAdult × Δ
diferença entre recíprocos (porteNascimento₁ − porteNascimento₂) = mBirth × Δ
```

onde `porteMãe₁`/`porteMãe₂` são o `adultPorte` de quem ocupa o papel de mãe
em cada orientação (a MESMA fêmea física, papéis trocados) — não uma "mãe"
nova por orientação. Essa é a MESMA fórmula da implementação
(`applyMaternalEffect`, `packages/engine/src/cross.ts`): lá o desvio é
`damAdultPorte − médiaParentalBV`; como `médiaParentalBV` é idêntica nas duas
orientações (mesmo par de BVs, só trocando quem é pai/mãe), a diferença entre
orientações colapsa exatamente nesse Δ — ver
`packages/engine/src/__tests__/maternal-effect.test.ts` (teste "recíproco",
que verifica isso EXATO por indivíduo, com `|Δporte − m×Δ| < 1e-9`, excluindo
só os pares em que `clamp01()` atuou — contados e reportados no teste).

### Coeficientes derivados (W&H 1938) — efeito materno no porte

**Origem:** derivados por Tales Hack (geneticista responsável) a partir de
Walton & Hammond (1938), Proc R Soc B 125:311–335, cruzamentos recíprocos
Shire × Shetland.

**Método de derivação:** os F1 recíprocos são geneticamente idênticos
(mesmo genoma nuclear médio). Portanto:
  diferença recíproca = m × (Shire − Shetland)
Um cruzado de mãe Shetland com porte igual ao Shetland puro implica m = 1.

**Valores adotados:**
| Fase | m | Faixa |
|---|---|---|
| Nascimento | 0,75 | 0,67 – 1,0 |
| Maturidade | ~0,25 | — |

**Dinâmica:** o efeito materno decai do nascimento à maturidade, mas persiste
(não zera). Corroborado qualitativamente por fontes secundárias: cruzados de
mãe Shetland, aos 3 anos, eram maiores que Shetland puro e menores que os
cruzados de mãe Shire.

**Definição formal vs. jogo:** o m de Falconer é uma regressão parcial, não
limitada a 0–1, e é usado aqui só como definição. O parâmetro do jogo é
limitado a [0, 1].

**Pendências de auditoria (GRADE baixo):**
1. Medidas brutas dos quatro grupos (Shire puro, Shetland puro e os dois
   recíprocos, ao nascer e na maturidade) não transcritas. O recálculo
   independente dos coeficientes está pendente até a transcrição.
2. Hipótese em aberto: efeito assimétrico (restrição por mãe pequena ≈ 1;
   aumento por mãe grande < 1). A faixa 0,67–1,0 pode refletir essa
   assimetria. Fontes secundárias divergem; resolver com a tabela original.
3. Extrapolação de equino (um filhote por gestação) para cães e gatos
   (ninhada).
4. Imprinting genômico (Panthera) é mecanismo distinto, fora deste parâmetro.

Os valores `mBirth = 0.75` / `mAdult = 0.25` usados no pack **não vêm
diretamente dessa derivação** — são parâmetros de jogo escolhidos a partir da
faixa qualitativa relatada (efeito forte ao nascer, atenua mas não zera na
maturidade). Ver seção "Parâmetro do jogo" abaixo.

## Decisão

### 1. Separação obrigatória: BV vs fenótipo

- `genotype.qtl.porte` = **valor genético (breeding value)** — o único
  insumo de `segregateQtl` (ADR-0012). PROIBIDO gravar efeito materno aqui:
  se o efeito materno entrasse no BV, ele se propagaria geneticamente pra
  gerações seguintes (deriva artificial) — ver teste de anti-herança.
- `phenotype` ganha dois campos novos:
  ```
  porteAdulto     = clamp01(BV + mAdult  × (porteAdultoMãe − médiaParentalBV))
  porteNascimento = clamp01(BV + mBirth × (porteAdultoMãe − médiaParentalBV))
  ```
  onde `BV` já inclui o ruído de segregação da ADR-0012 (não se sorteia um
  ruído novo — mesmo rng/seed pros dois valores, por construção: os dois
  somam o MESMO `BV`, só o coeficiente `m` muda).
- `porteAdulto` é o valor "de verdade" do espécime: alimenta prompt de
  imagem, IF, classificador e — quando ELE for usado como mãe numa próxima
  geração — o `porteAdultoMãe` daquela cruza. `porteNascimento` é só
  exibição (não alimenta nada).
- **Nota de implementação (packages/engine, Etapa 2b):** hoje nem IF
  (`fixationIndex`) nem o classificador (`classifyCross`) de fato consultam
  `porte`/`qtl` — só `prompt.ts` (apps/api) e a UI (apps/web) o fazem. Essa
  frase da decisão descreve o CONTRATO pretendido (qual valor usar, se/quando
  cada consumidor passar a ler porte), não uma integração já feita nesses
  dois — ver "Fora de escopo" abaixo.

### 2. Parâmetro do jogo, não constante biológica

```ts
maternalEffect: { porte: { mBirth: 0.75, mBirthRange: [0.67, 1.0], mAdult: 0.25 } }
```
Mesmo valor em FELINE e CANINE nesta versão. `mBirthRange` é documental (a
faixa que W&H relatou ao nascimento), não entra no cálculo.

**Distinção terminológica importante:** o "m" de Falconer & Mackay
(*Introduction to Quantitative Genetics*) é um **coeficiente de regressão
parcial** — estimado por regressão, pode assumir qualquer valor real
(inclusive negativo ou >1), e mede quanto da variância fenotípica é
explicada pelo ambiente materno. O `mBirth`/`mAdult` do jogo é outra coisa:
um parâmetro de DESIGN, deliberadamente restrito a **[0, 1]**, interpretado
como "fração do desvio materno que se expressa". Os dois compartilham nome e
espírito, mas não são o mesmo objeto estatístico — não usar um artigo sobre
"m de Falconer" pra justificar um valor de `mAdult`/`mBirth` sem converter.

### 3. Efeito decai, não zera

W&H documentaram que a diferença de porte PERSISTE na vida adulta (potros
Shetland-mãe continuam menores mesmo crescidos), só ATENUADA. Por isso
`mAdult > 0` (nunca 0) e `mAdult < mBirth` — nunca o inverso.

## Vieses e limitações (GRADE)

- **Viés do clamp:** `clamp01()` nas bordas introduz viés sistemático — se o
  valor não-truncado excederia 1 (ou ficaria abaixo de 0), o clamp acha a
  MÉDIA esperada do valor truncado sempre menor que 1 (ou maior que 0), nunca
  simétrico. Em BVs centrais (~0.5) com desvio materno moderado isso raramente
  importa; em fundadores já perto das bordas (porte muito alto/baixo), o
  efeito materno pode ficar sistematicamente amortecido pelo clamp sem que
  isso reflita biologia nenhuma — é um artefato do [0,1] do jogo.
- **Extrapolação de espécie (GRADE baixo):** W&H mediram equinos — cada
  égua pare UM potro por vez. Aplicar o mesmo `m` a cães e gatos (que parem
  ninhadas de vários filhotes, competindo pelos mesmos recursos maternos)
  é uma extrapolação não validada; a dinâmica de efeito materno em ninhada
  múltipla (competição intra-ninhada) pode ser bem diferente. Usamos o
  mesmo `m` em FELINE/CANINE nesta versão por simplicidade, sabendo disso.
- **Imprinting genômico ≠ efeito materno:** o efeito W&H é AMBIENTAL
  (útero/lactação); imprinting genômico (ex.: ligre vs. tigreão em
  *Panthera*, onde o tamanho depende de QUAL progenitor contribuiu o alelo,
  não do ambiente materno) é um mecanismo MOLECULAR inteiramente diferente.
  Continua fora do escopo deste parâmetro — registrado também na ADR-0013,
  planejado junto do catálogo do tier Junior.

## Fora de escopo desta etapa (packages/engine apenas)

- `apps/api` não foi tocado. `phenotype` nunca é persistido hoje
  (`cross.service.ts#execute()` não inclui `phenotype` no `save()`) — então
  não há hoje de onde ler "o `porteAdulto` que a mãe teve" pra repassar como
  `adultPorte` na próxima cruza. O motor aceita esse valor como
  `ParentInput.adultPorte?` opcional; sem ele, o desvio materno é 0 (nunca
  inventado). Ligar isso de ponta a ponta (persistir `phenotype`, repassar
  `porteAdulto` da mãe geração a geração) é trabalho de dados/API, mesmo
  padrão do gap de sexo/xLoci já registrado na ADR-0013.
- `enumerateOffspring()` (opções de fenótipo pro Senior/PhD escolher) não
  aplica efeito materno — só `cross()`/`materializeCross()` (via
  `finalizeSpecimen`). As opções mostradas na seleção de fenótipo seguem
  usando o BV puro.

## Consequências

- Determinismo preservado: `applyMaternalEffect()` é uma função pura dos
  valores já computados — nenhum sorteio novo, nenhum stream de RNG tocado.
- Anti-P2W preservado: `cross()` continua sem receber tier; o cálculo não
  distingue tier em nenhum ponto.
- Golden tests (4 arcos) inalterados — nenhum usa `adultPorte`, então o
  desvio materno é sempre 0 pra eles; `genotype.qtl.porte` nunca muda.
