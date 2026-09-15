# ADR-0015 — Regra de Haldane condicionada ao sexo e classe de hibridação

- **Status:** aceito · **Data:** 2026-09-15

## Contexto

O TDD §4.2 já documentava a Regra de Haldane corretamente:

> "Híbridos F1 Interespecíficos: Fertilidade = 0% **para o sexo
> heterogamético** (Regra de Haldane)."

A implementação original (`fertilityScore()`, antes desta ADR) não recebia o
sexo do zigoto — zerava a fertilidade dos **dois** sexos em qualquer F1
interespecífico, mais restritivo do que o próprio TDD pedia. **Isto é uma
correção do código pra bater com a spec já escrita, não uma mudança de
regra de jogo.** O gap só foi corrigível agora porque o motor passou a
computar sexo cromossômico de verdade (ADR-0013, Etapa 2a) — antes disso não
havia sequer o dado necessário.

O gap foi descoberto e investigado na Etapa 2c ("relatório de Haldane") e a
implementação decidida aqui, na sequência.

## Decisão

### 1. `hybridClass()` — classe de hibridação derivada dos PAIS

`hybridClass(parentA, parentB, pack)` (`packages/engine/src/cross.ts`)
classifica o par de progenitores — **sempre** pela identidade biológica real
dos dois indivíduos (`ParentInput.species`, já normalizado pelo chamador via
`biologicalSpecies()` de `@genbreedai/shared`), **nunca** pelo rótulo
`method` da cruza (uma cruza rotulada "BC1" entre duas espécies diferentes
tem a mesma `hybridClass` que teria rotulada "F1" — quem decide se Haldane
entra em jogo é o `method` E a classe juntos, dentro de `fertilityScore()`).

- `SAME_SPECIES` — mesma `biologicalSpecies`, **ou** `species` ausente de
  QUALQUER lado. Esse segundo caso é o default conservador de verdade:
  `species` é campo novo e opcional; a esmagadora maioria dos chamadores
  hoje (todo cruzamento canino, todo golden felino que não liga essa
  informação) nunca o preenche. Tratar "sem dado" como interespecífico
  inventaria uma restrição que não foi informada — o mesmo princípio da
  regra 1 do CLAUDE.md (não inventar), só que no sentido inverso (assumir
  restrição em vez de assumir alelo). **Bug real pego durante o
  desenvolvimento**: a primeira versão fazia o oposto (`species` ausente →
  `UNDOCUMENTED`) e isso quebrou `golden/goldendoodle.test.ts` assim que
  ligado em `fertilityScore` (nenhum golden canino define `species`) —
  corrigido antes de qualquer commit do item 3 existir (ver histórico do
  commit do item 2, amendado).
- `DOCUMENTED_FERTILE_FEMALE` — espécies diferentes e **conhecidas** dos
  dois lados, em `pack.hybridGenusWhitelist` (qualquer par do mesmo gênero
  listado) ou `pack.hybridSpeciesWhitelist` (par nomeado, fonte citada).
- `UNDOCUMENTED` — espécies diferentes e conhecidas, fora de qualquer
  whitelist.

Whitelist hoje (`packages/engine/src/data/feline.ts`), **dados do pack**,
fonte citada por par:

```ts
hybridGenusWhitelist: ["Panthera"]
hybridSpeciesWhitelist: [
  { speciesA: "felis-catus", speciesB: "leptailurus-serval",
    source: "Gato Savannah — híbrido F1 real e documentado; fêmeas F1 férteis, machos estéreis até ~F4/F5." },
]
```

NÃO adicionar gênero/par sem uma nova ADR.

### 2. Taxonomia explícita (`packages/shared/src/species.ts`)

`SPECIES_INFO` ganhou `biologicalSpecies`/`genus`/`subfamily`
(`"PANTHERINAE" | "FELINAE"`, só felinos). `panthera-tigris`,
`panthera-tigris-branco` e `panthera-tigris-albino` (morfos de cor) mapeiam
todos pra `biologicalSpecies: "panthera-tigris"` — mesma espécie biológica.
`biologicalSpecies()` passou a ler esse campo em vez de usar o slug de
catálogo cru.

**Correção do usuário durante a revisão (importante, registrada aqui):**
*Puma concolor* é da subfamília **FELINAE**, não Pantherinae. Puma × Panthera
(o arco Pumajaguar) é portanto um cruzamento **entre subfamílias**
(divergência ~10 milhões de anos) — mais distante filogeneticamente do que
qualquer par dentro do gênero Panthera. Isso confirma a classificação
`UNDOCUMENTED` do par puma×onça na whitelist (não está nem perto de
qualificar pro tratamento "mesmo gênero").

**Impacto em tier-access (`apps/api`), reportado, código NÃO tocado:**
`assertTierAllows()` já usa `biologicalSpecies` (não slug cru) em todos os 3
call sites de `cross.service.ts`. Efeito automático: tigre-de-bengala ×
tigre-branco deixa de exigir tier JUNIOR (antes tratado como interespecífico
só por ter slugs de catálogo diferentes) — passa a ficar disponível em FREE,
como qualquer cruzamento intraespécie felino. É uma mudança de comportamento
visível ao jogador, não só uma correção interna.

**Achado correlato, fora de escopo:** `combineSpecies()` em
`cross.service.ts` ainda compara slugs crus — um cruzamento tigre×tigre-branco
continua produzindo um `species` resultante tipo
`"panthera-tigris×panthera-tigris-branco"` (nome de híbrido), mesmo o motor e
o gate de tier já tratando a cruza corretamente como intraespecífica.
Registrado pra decisão futura, não corrigido aqui (Etapa 5-API).

### 3. Haldane por sexo (`fertility.ts`)

`FertilityOptions` recebe `sex` (do ZIGOTO) e `hybridClass` (dos PAIS);
`interspecific: boolean` removido da interface. Ramo `F1`:

```
hybridClass === SAME_SPECIES                              → 100, NONE   (igual intraespécie)
sexo macho (heterogamético), qualquer hybridClass          → 0,   STERILE
fêmea, DOCUMENTED_FERTILE_FEMALE                           → 50–80 (rng), REDUCED
fêmea, UNDOCUMENTED                                        → 5–15  (rng), REDUCED
```

`BC1`/`F2`/`OUTCROSS`/`LINE`/`INBREED`/`F3` inalterados — não consultam
`hybridClass`/`sex`.

`haldaneSterile: boolean` (campo antigo) **mantido**, agora derivado de
`haldaneStatus === "STERILE"` — há consumidores reais que ainda o leem
(`apps/web/lib/api.ts`, tipo da resposta da API; `apps/api/test/
cross.service.spec.ts`, asserção direta). Marcado `@deprecated` com nota
explícita: `false` não significa mais "fértil plena" — uma fêmea `REDUCED`
também retorna `haldaneSterile: false`, mesmo com fertilidade bem abaixo de
100. Decisão de remover o campo antigo fica pra Etapa 5-API.

### 4. Gate de fertilidade do parental

`SterileParentError` (erro tipado, mensagem "Espécime estéril não pode
reproduzir") — `validateBreedingConstraints()` rejeita parental com
`fertility === 0` **explícito**. Só gate: `fertility` ausente nunca bloqueia
(fertilidade desconhecida ≠ estéril), e nenhum valor `>0` bloqueia — não
modela probabilidade de concepção (isso mudaria consumo de rng dos
goldens, fora de escopo).

**Investigação "rejeição antes de consumir cota" (`apps/api`, não tocado):**
hoje **não é assim**. `QuotaGuard` (guard do NestJS) roda antes do
controller/service e já incrementa o contador diário de cota
imediatamente, se houver — **antes** de `CrossService.execute()` sequer
rodar, ou seja, antes de qualquer validação do motor (isto vale também pro
`SexMismatchError` pré-existente, não é regressão desta etapa). Um
cruzamento que falha na validação já consumiu 1 unidade de cota do usuário.
Gap pré-existente, mesma categoria dos gaps de persistência já registrados
nas ADR-0013/0014. Corrigir é mudança de `apps/api`, fora de escopo
(engine-only, `feat/sex-linked-engine`).

### 5. Golden Pumajaguar — orientação corrigida

Delta (F1 Puma×Onça) era macho E sire num BC1 — biologicamente impossível
pela Regra de Haldane corretamente aplicada (macho = sexo heterogamético em
felinos, XY — deveria ser estéril, nunca sirar um retrocruzamento). Corrigido:
Delta vira fêmea/dam (`fertility: 10`, fixo, dentro da faixa 5–15 de fêmea
F1 UNDOCUMENTED); Onça Negra vira macho/sire (`species: "panthera-onca"`).
Método continua BC1. `species` deliberadamente **não** setado em Delta — ela
é híbrida, não tem uma `biologicalSpecies` única no catálogo; inventar uma
violaria a regra 1 do CLAUDE.md.

Nenhum valor golden mudou (F_pedigree=0.25, Punnett do locus A, IF≥0.30,
`haldaneStatus`/`haldaneSterile`/`inviabilityRisk`, determinismo — todos
idênticos). Análise **prévia** ao código: `DELTA_F1` e `ONCA_NEGRA` têm o
mesmo shape (mesmo loco, mesmas 4 chaves de QTL na mesma ordem, nenhum
`xLoci` definido em nenhum dos dois) — trocar quem ocupa o slot sire/dam
preserva byte-a-byte a sequência de consumo de rng (o padrão sire=M/dam=F
por slot não muda, só qual fixture ocupa cada slot) e a fórmula de
ponto-médio do QTL é simétrica. Confirmado empiricamente rodando os 4
goldens + `parity.test.ts` depois da mudança.

## Faixas 50–80 e 5–15 — parâmetros de jogo (Tales Hack)

Ambas são **parâmetros de design**, não constantes biológicas medidas —
mesma categoria/mesmo aviso da ADR-0014 pro efeito materno.

- **50–80 (DOCUMENTED_FERTILE_FEMALE):** evidência de fêmeas F1 realmente
  férteis em híbridos documentados — ligre/tigão (*Panthera leo* ×
  *P. tigris*, fêmeas F1 férteis, cruzadas de volta com leão ou tigre
  produzindo prole viável) e gato Savannah F1 (*Felis catus* ×
  *Leptailurus serval*, fêmeas F1 férteis desde a primeira geração).
- **5–15 (UNDOCUMENTED):** sem documentação de hibridação real — faixa
  conservadora, **GRADE muito baixo**. Não é "quase impossível" nem "quase
  normal": é uma extrapolação de jogo pra permitir a mecânica sem alegar
  qualquer embasamento biológico específico.

### Pumajaguar — Puma × Panthera, entre subfamílias

Confirmado pela correção do usuário: Puma (Felinae) × Onça (Pantherinae) é
mais distante filogeneticamente que qualquer par Panthera×Panthera. O único
análogo histórico é o "pumapard" (puma × leopardo) — registros do início do
século XX, não confirmados cientificamente, associados a nanismo nos
poucos espécimes relatados. Não há qualquer evidência de fêmea F1 fértil
nesse par. A fertilidade de 5–15 usada pra Delta é **extrapolação de jogo,
GRADE muito baixo** — não uma inferência do caso pumapard (que nem sequer
documenta fertilidade, só a existência dos híbridos).

## Pendências (registradas, NÃO implementadas nesta etapa)

1. **Esterilidade do macho persistindo em retrocruzamento.** Em híbridos
   reais (Savannah), a esterilidade do macho NÃO desaparece no F1 — persiste
   por várias gerações de retrocruzamento (machos ainda estéreis até
   ~F4/F5). O `BC1` atual do motor (`60–80` pra qualquer sexo) não reflete
   isso — é incorreto especificamente pro macho de uma linhagem híbrida em
   retrocruzamento precoce. Corrigir exigiria: (a) rastrear "geração de
   separação da hibridação" por linhagem, não só `generation`/`F_pedigree`;
   (b) revisar o golden Pumajaguar (que já é um BC1 envolvendo um F1) —
   decisão de design futura do Tales, não decidida aqui.
2. **Whitelist só com pares verificados.** Nenhum par Felinae×Felinae (fora
   do par Savannah nomeado) foi assumido viável — mesmo pares
   filogeneticamente próximos dentro de Felinae (ex.: lince × caracal) NÃO
   entram na whitelist sem uma ADR própria citando evidência de hibridação
   real. `hybridGenusWhitelist`/`hybridSpeciesWhitelist` existem como
   mecanismo genérico justamente pra permitir isso no futuro, mas vazios
   até serem preenchidos com fonte.

## Vieses e limitações (GRADE)

- Faixas 50–80/5–15 são design, não medição — ver seção acima.
- `hybridGenusWhitelist: ["Panthera"]` assume TODOS os pares dentro do
  gênero igualmente documentados — na prática a evidência é mais forte pra
  alguns pares (leão×tigre, leão×leopardo) que pra outros (ex.: onça×leopardo
  -das-neves, sem híbridos documentados conhecidos). Simplificação
  deliberada nesta versão — granularidade por par específico (em vez de por
  gênero inteiro) fica pra uma ADR futura se necessário.
- O sexo do zigoto que aciona Haldane é sorteado 50/50 (`generateXGamete`),
  igual qualquer felino — não há nenhum viés reprodutivo adicional
  modelado (ex.: proporção de sexo alterada em híbridos, fenômeno real mas
  fora de escopo).

## Consequências

- TDD §4.2 agora implementado fielmente (fertilidade condicionada ao sexo
  heterogamético, não aos dois sexos).
- Determinismo preservado: toda faixa nova é resolvida pelo mesmo `rng`
  seedado já em uso; `hybridClass()` é pura (sem rng).
- Anti-P2W preservado: `cross()`/`fertilityScore()` continuam sem parâmetro
  de tier.
- Golden tests (4 arcos) inalterados — verificado, não assumido.
- Gap de produto real e visível: tigre×tigre-branco passa a ficar disponível
  em FREE (ver seção 2).

## Alternativas consideradas

- **Granularidade por par específico em vez de gênero inteiro** (Panthera):
  mais preciso, mas exigiria uma linha de dados por par (10 pares só dentro
  de Panthera) com fonte individual — decidido adiar até haver motivo
  concreto pra diferenciar um par do outro dentro do gênero.
- **`species` ausente → UNDOCUMENTED** (primeira tentativa, revertida):
  quebrou golden tests reais ao ser integrada — ver seção 1. Rejeitada.
- **Modelar probabilidade de concepção no gate de fertilidade** (item 4):
  rejeitada explicitamente pelo Tales nesta etapa — mudaria o consumo de
  rng de todos os goldens; só gate binário (`fertility===0` bloqueia) por
  enquanto.
