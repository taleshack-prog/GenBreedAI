> **⚠️ ERRATA DA FASE 0:** alguns valores deste documento foram corrigidos após a
> auditoria científica. Ver `docs/errata/fase0-errata.md` (E1–E5) e os ADRs
> 0001–0004. O motor (`packages/engine`) já implementa o comportamento correto.

HACK TECH FARM — PROJETO MOBILE

**GUIA DE CRUZAMENTOS GENÉTICOS — GENE BANK**

*Documento consolidado de assets e genética aplicada*

02 de setembro de 2026

## SUMÁRIO

- **METODOLOGIA E CONCEITOS**

- **CRUZAMENTO 1 — GOLDEN RETRIEVER × POODLE (GOLDENDOODLE)** 2.1 Card dos Progenitores

- 2.2 Variação 1 — F1 (Pelagem Dourada Ondulada)

- 2.3 Variação 2 — F1 (Pelagem Creme Cacheada)

- 2.4 Explicação Genética e Sequência de Estúdio

- **CRUZAMENTO 2 — BOERBOEL × BRA****C****O ALEMÃO (BOERPOINTER)** 3.1 Card dos Progenitores

- 3.2 Variação 1 — F1 (Liver/Roan Atlético)

- 3.3 Variação 2 — F1 (Fulvo/Brindle Mastiff)

- 3.4 Banco Genético — 6 Fenótipos F1

- 3.5 F2 — Alpha × Beta (Segregação 3:1)

- 3.6 Card Individual do Banco Genético

- 3.7 Explicação Genética

- **CRUZAMENTO 3 — DOGUE ALEMÃO ARLEQUIM × COLLIE TRICOLOR (DANECOLLIE)** 4.1 Card dos Progenitores

- 4.2 Banco Genético — 6 Fenótipos F1

- 4.3 F2 — Gamma × Omega

- 4.4 F3 — Omega II × Beta

- 4.5 Explicação Genética

- **CRUZAMENTO 4 — ONÇA PARDA DA AMAZÔNIA × ONÇA NEGRA DO PANTANAL (PUMAJAGUAR)** 5.1 Card dos Progenitores

- 5.2 Banco Genético — 6 Fenótipos F1

- 5.3 BC1 — Delta × Onça Negra (Fixação do Melanismo)

- 5.4 BC1 Invertido — Shadow × Puma (Fixação do Fulvo)

- 5.5 F3 — Amber × Omega (Ressurgimento do Melanismo)

- 5.6 Line-Breeding — Amber II × Amber (Fixação do Creme)

- 5.7 Inbreeding 1 — Ivory × Amber III (Irmãos Completos)

- 5.8 Inbreeding 2 — Alabaster × Ivory (Limiar Crítico)

- 5.9 Outcross de Resgate — Alabaster II × Amber II (Heterose)

- 5.10 Consolidação — Alabaster III × Ivory (Fusão das Linhas Brancas)

- 5.11 Explicação Genética do Arco Completo

- **GLOSSÁRIO E PRÓXIMOS PASSOS**

### 1. METODOLOGIA E CONCEITOS

O sistema de genética aplicada do **Hack Tech Farm** fundamenta-se nos princípios da genética mendeliana e da genética quantitativa de populações. O núcleo matemático do sistema é estruturado em torno do **Índice de Fixação (F)**, que mensura o coeficiente de endogamia e a proporção de homozigose acumulada ao longo das gerações de cruzamentos. Um valor de F reduzido indica alta variabilidade alélica e heterozigose, enquanto valores elevados refletem homogeneidade genética, fixação de caracteres e risco progressivo de depressão endogâmica.

A dinâmica reprodutiva é distribuída em estratégias metodológicas precisas. A **Geração F1** compreende o cruzamento inicial entre linhagens puras distintas, gerando prole 100% heterozigota nos loci segregantes com **F ≈ 0.05**. A **Geração F2 (F1 × F1)** estabelece a segregação mendeliana clássica (3:1 nos loci dominantes), dobrando o coeficiente para **F ≈ 0.10**. A **Geração F3** introduz novos eventos de recombinação meiótica, estabilizando-se em **F ≈ 0.08–0.15** dependendo do parentesco relativo dos genitores.

O **Backcross / Retrobreeding (Híbrido × Parental Recorrente)** reconstitui a carga genética parental, reduzindo o índice para **F ≈ 0.03** e acelerando a retenção de fenótipos desejados com segurança biológica. O **Line-breeding** promove fixação moderada mantendo o parentesco concentrado em ancestrais favoráveis. Por outro lado, o **Inbreeding severo (irmãos completos)** atinge **F ≈ 0.15–0.25**, colapsando a variância e demandando o **Outcross de resgate** — introdução de linhagem divergente para deflagrar **vigor híbrido (heterose)**, recompor o sistema imunológico e restaurar a aptidão reprodutiva.

| **Estratégia Reprodutiva** | **Efeito no Índice F** | **Nível de Risco** | **Uso Recomendado no Pipeline** |
| --- | --- | --- | --- |
| Geração F1 (Inter-raças) | F ≈ 0.05 (heterozigose máxima) | Nulo / Base | Abertura de novos ramos taxonômicos |
| Geração F2 (F1 × F1) | F ≈ 0.10 (duplicação de homozigose) | Baixo | Recombinação e mapeamento fenotípico |
| Geração F3 (F2 × F1/F2) | F ≈ 0.08–0.15 (acumulação gradual) | Moderado | Seleção de recombinantes raros |
| Backcross / Retrobreeding | F cai para ≈ 0.03 (homogeneização parental) | Mínimo | Fixação segura de caracteres parentais |
| Line-breeding | F ≈ 0.05–0.08 (estabilização) | Controlado | Consolidação de linhagens purificadas |
| Inbreeding Estrito (Irmãos) | F sobe para 0.15–0.25 (colapso alélico) | Crítico | Fixação ultra-rápida de traços recessivos |
| Outcross de Resgate | F reduz em 40–60% (restauração alélica) | Benéfico | Reversão de depressão endogâmica / Heterose |

### 2. CRUZAMENTO 1 — GOLDEN RETRIEVER × POODLE (GOLDENDOODLE)

2.1 Card dos Progenitores

[Image]

2.2 Variação 1 — F1 (Pelagem Dourada Ondulada)

[Image]

2.3 Variação 2 — F1 (Pelagem Creme Cacheada)

[Image]

2.4 Explicação Genética e Sequência de Estúdio

O cruzamento entre o Golden Retriever (homozigoto para pelagem lisa e cor dourada) e o Poodle Padrão (homozigoto para pelagem cacheada densa e pigmentação creme) exemplifica o comportamento da F1 heterozigota nos loci *Cu* (textura de pelo) e *E/e* (extensão de feomelanina). A textura ondulada da Variação 1 resulta de dominância incompleta no locus da queratina, enquanto a densidade de cachos na Variação 2 expressa a dominância do alelo do Poodle. A variação cromática decorre da modulação de intensidade de feomelanina.

[Image]

[Image]

[Image]

### 3. CRUZAMENTO 2 — BOERBOEL × BRAÇO ALEMÃO (BOERPOINTER)

3.1 Card dos Progenitores

[Image]

3.2 Variação 1 — F1 (Liver/Roan Atlético)

[Image]

3.3 Variação 2 — F1 (Fulvo/Brindle Mastiff)

[Image]

3.4 Banco Genético — 6 Fenótipos F1 (GEN 1, F: 0.05)

[Image]

| **Identificador** | **Nome de Registro** | **Descrição Fenotípica Detalhada** | **Dominância de Loci** |
| --- | --- | --- | --- |
| F1-01 | Boerpointer Alpha | Pelagem liver/roan, porte atlético refinado | Locus B/b (Braço) + Locus R (Roan) |
| F1-02 | Boerpointer Beta | Pelagem fulvo/brindle, estrutura craniofacial mastiff | Locus K^br (Brindle) + Locus A^y (Boerboel) |
| F1-03 | Boerpointer Gamma | Base branca com manchas concentradas liver | Locus S^p (Piebald) + Modificadores |
| F1-04 | Boerpointer Delta | Fulvo sólido, tórax profundo e focinho alongado | Locus E/A (Boerboel) + Morfologia Braço |
| F1-05 | Boerpointer Epsilon | Liver/roan com estrias brindle recombinantes | Recombinação K^br + B/b + R |
| F1-06 | Boerpointer Omega | Fulvo/creme compacto, ossatura pesada | Locus e/e + Conformação Mastiff |

3.5 F2 — Alpha × Beta (GEN 2, F: 0.10, Segregação 3:1)

[Image]

| **Identificador** | **Nome de Registro** | **Fenótipo Expresso na F2** | **Genótipo Provável** |
| --- | --- | --- | --- |
| F2-01 | Boerpointer Alpha II | Liver/roan atlético homozigoto | B/B, R/r, k^y/k^y |
| F2-02 | Boerpointer Beta II | Fulvo/brindle com crânio mastiff maciço | b/b, K^br/k^y, A^y/a |
| F2-03 | Boerpointer Gamma II | Branco mosqueado com manchas escuras | s^p/s^p, B/b |
| F2-04 | Boerpointer Delta II | Fulvo sólido com musculatura intermediária | A^y/A^y, E/E |
| F2-05 | Boerpointer Epsilon II | Manto duplo: liver/roan com brindle evidente | B/b, K^br/K^br, R/r |
| F2-06 | Boerpointer Omega II | Creme recessivo com conformação ultra-compacta | e/e, a/a |

3.6 Card Individual do Banco Genético

[Image]

3.7 Explicação Genética

A combinação Boerboel × Braço Alemão opera a segregação independente entre os loci **K** (K^br para tigrado e k^y para expressão de agouti), **A** (A^y para fulvo) e **B** (B para preto/roan e b para chocolate/liver). Na geração F1, todos os indivíduos compartilham **F: 0.05**. O cruzamento inter se entre irmãos completos (Alpha × Beta) eleva o índice para **F: 0.10** na F2, revelando homozigotos recessivos e ampliando a variabilidade morfológica entre a conformação molossóide e a agilidade perdigueira.

### 4. CRUZAMENTO 3 — DOGUE ALEMÃO ARLEQUIM × COLLIE TRICOLOR (DANECOLLIE)

4.1 Card dos Progenitores

[Image]

4.2 Banco Genético — 6 Fenótipos F1 (GEN 1, F: 0.05)

[Image]

| **Identificador** | **Nome de Registro** | **Fenótipo Expresso** | **Interação de Loci** |
| --- | --- | --- | --- |
| F1-01 | Danecollie Alpha | Arlequim clássico (fundo branco, manchas pretas) | Modificador Harlequin (H/h) + Merle (M/m) |
| F1-02 | Danecollie Beta | Blue merle mosqueado | Locus Merle (M/m) sem modificador H |
| F1-03 | Danecollie Gamma | Tricolor completo (preto, marcas tan e colar branco) | Locus Agouti tan points (A^t) + Locus S |
| F1-04 | Danecollie Delta | Piebald preto e branco uniforme | Locus White Markings (s^p/s^p) sem tan |
| F1-05 | Danecollie Epsilon | Merle tricolor recombinante | Locus M/m + Tan points (A^t/a) |
| F1-06 | Danecollie Omega | Arlequim com marcas tan distribuídas | Locus H/h + M/m + Locus A^t |

4.3 F2 — Gamma × Omega (GEN 2, F: 0.10)

[Image]

| **Identificador** | **Nome de Registro** | **Fenótipo Expresso na F2** | **Classificação Alélica** |
| --- | --- | --- | --- |
| F2-01 | Gamma II | Tricolor clássico parental | m/m, A^t/A^t, S/s^p |
| F2-02 | Omega II | Arlequim com tan facial | H/h, M/m, A^t/a |
| F2-03 | Sigma | Merle tricolor azul profundo | m/M, A^t/a, S/S |
| F2-04 | Tau | Arlequim puro (sem tan) — INÉDITO | H/h, M/m, a/a (Recombinante puro) |
| F2-05 | Upsilon | Piebald preto com tan estendido | m/m, A^t/A^t, s^p/s^p |
| F2-06 | Phi | Merle piebald (sem tan) — INÉDITO | M/m, a/a, s^p/s^p (Recombinante raro) |

4.4 F3 — Omega II × Beta (GEN 3, F: 0.15)

[Image]

| **Identificador** | **Nome de Registro** | **Fenótipo da Geração F3** | **Genótipo Demonstrado** |
| --- | --- | --- | --- |
| F3-01 | Omega III | Arlequim com tan consolidado | H/h, M/m, A^t/a |
| F3-02 | Beta II | Blue merle clássico sem tan | M/m, a/a |
| F3-03 | Kappa | Merle tricolor de alta saturação | M/m, A^t/A^t |
| F3-04 | Lambda | Arlequim puro monocromático | H/h, M/m, a/a |
| F3-05 | Mu | Tricolor não-merle (recessivo reaparece) | m/m, A^t/a (Segregação 3:1 clássica) |
| F3-06 | Nu | Merle piebald com fundo nevado | M/m, s^p/s^p |

4.5 Explicação Genética

O gene **Harlequin (H)** atua como um modificador epistático sobre o alelo **Merle (M)**. Indivíduos sem o alelo Merle expressam pigmentação regular, mesmo portando H. Na F3, o cruzamento entre dois heterozigotos merle (M/m × M/m) resulta na probabilidade estatística exata de 25% para o genótipo **m/m**, comprovado pelo reaparecimento do fenótipo tricolor puro (Mu). O coeficiente cumulativo de **F: 0.15** reflete três ciclos sucessivos de seleção direcionada.

### 5. CRUZAMENTO 4 — ONÇA PARDA DA AMAZÔNIA × ONÇA NEGRA DO PANTANAL (PUMAJAGUAR)

5.1 Card dos Progenitores

[Image]

**Nota Genética:** Em Panthera onca, o melanismo é um traço **autossômico dominante** decorrente de uma mutação com ganho de função no gene receptor de melanocortina-1 (MC1R) e deleção no gene ASIP. A deposição de eumelanina não suprime as rosetas, que permanecem perceptíveis sob incidência de luz como "marcas fantasma".

5.2 Banco Genético — 6 Fenótipos F1 (GEN 1, F: 0.05)

[Image]

| **Identificador** | **Nome de Registro** | **Expressão Fenotípica** | **Herança Alélica** |
| --- | --- | --- | --- |
| F1-01 | Pumajaguar Alpha | Fulvo sólido uniforme, sem rosetas | aa (Recessivo homozigoto Puma) |
| F1-02 | Pumajaguar Beta | Preto melanístico com rosetas fantasma | Aa (Dominante heterozigoto Jaguar) |
| F1-03 | Pumajaguar Gamma | Fulvo acobreado com rosetas residuais | aa + Loci de padrão jaguar incompletos |
| F1-04 | Pumajaguar Delta | Carvão escuro com rosetas de alto relevo | Aa + Modificador de permeabilidade de melanina |
| F1-05 | Pumajaguar Epsilon | Dourado agouti com rosetas clássicas abertas | aa + Expressão plena do padrão de rosetas |
| F1-06 | Pumajaguar Omega | Fulvo escuro com manchas difusas | aa + Recombinação morfológica intermediária |

5.3 BC1 — Delta × Onça Negra (GEN 2, F: 0.03, Fixação do Melanismo)

[Image]

| **Identificador** | **Nome de Registro** | **Fenótipo na Linhagem Escura** | **Configuração de Genótipo** |
| --- | --- | --- | --- |
| BC1-01 | Pumajaguar Delta II | Preto ébano profundo uniforme | AA (Homozigoto dominante fixado) |
| BC1-02 | Pumajaguar Noir | Preto clássico com marcas fantasma | Aa (Heterozigoto estável) |
| BC1-03 | Pumajaguar Obsidian | Carvão grafite com rosetas definidas | Aa (Permeabilidade melânica alta) |
| BC1-04 | Pumajaguar Umbra | Preto com reflexos quentes dourados | AA (Modulador de feomelanina basal) |
| BC1-05 | Pumajaguar Shadow | Carvão com padrão lateral nítido | Aa (Padrão intermediário) |
| BC1-06 | Pumajaguar Panthera | Preto absoluto com rosetas de alto contraste | AA (Grau máximo de fixação melânica) |

5.4 BC1 Invertido — Shadow × Puma (GEN 2, F: 0.03, Fixação do Fulvo)

[Image]

| **Identificador** | **Nome de Registro** | **Fenótipo na Linhagem Clara** | **Configuração Alélica** |
| --- | --- | --- | --- |
| BC1-INV-01 | Pumajaguar Shadow II | Carvão com marcas escuras (melanístico) | Aa (50% da prole retém melanismo) |
| BC1-INV-02 | Pumajaguar Puma | Fulvo sólido puro, anatomia puma | aa (50% expressa não-melanismo homozigoto) |
| BC1-INV-03 | Pumajaguar Tawny | Fulvo com vestígios tênues de padrão | aa (Herança aditiva) |
| BC1-INV-04 | Pumajaguar Solaris | Dourado vibrante com rosetas completas | aa (Fenótipo de alto valor comercial) |
| BC1-INV-05 | Pumajaguar Amber | Creme claro uniforme | aa (Diluição de tom primária) |
| BC1-INV-06 | Pumajaguar Terra | Fulvo terroso com sombreamento dorsal | aa (Intermediário estrutural) |

5.5 F3 — Amber × Omega (GEN 3, F: 0.08, Ressurgimento do Melanismo)

[Image]

| **Identificador** | **Nome de Registro** | **Fenótipo Expresso** | **Mecânica Genética Subjacente** |
| --- | --- | --- | --- |
| F3-01 | Amber II | Creme claro sólido | aa (Retenção da linha parental clara) |
| F3-02 | Omega II | Fulvo escuro com manchas fracas | aa (Manutenção do fenótipo F1 parental) |
| F3-03 | Iota | Preto melanístico com rosetas fantasma | Aa (Ressurgimento mendeliano do alelo A) |
| F3-04 | Kappa | Dourado brilhante com rosetas clássicas | aa (Padrão jaguar de alta definição) |
| F3-05 | Lambda | Carvão com rosetas aparentes | Aa (Expressão melânica parcial) |
| F3-06 | Mu | Fulvo com rosetas difusas | aa (Recombinante intermediário) |

5.6 Line-Breeding — Amber II × Amber (GEN 3, F: 0.05, Fixação do Creme)

[Image]

| **Identificador** | **Nome de Registro** | **Graduação do Creme e Padrão** | **Classificação de Pureza** |
| --- | --- | --- | --- |
| LB-01 | Amber III | Creme claro uniforme estabilizado | Parental purificado (aa) |
| LB-02 | Cream | Creme com rosetas quase imperceptíveis | Padrão residual atenuado |
| LB-03 | Gold | Dourado quente com rosetas fechadas | Seleção para textura dérmica |
| LB-04 | Dune | Fulvo areia com sombreamento ventral | Gradiente feomelânico |
| LB-05 | Ivory | Marfim pálido sólido (tom ultraclaro) | Diluição recessiva homozigota |
| LB-06 | Sand | Areia dourada com rosetas finas | Padrão semi-expresso |

5.7 Inbreeding 1 — Ivory × Amber III (GEN 4, F: 0.15, Irmãos Completos)

[Image]

**Atenção — Alerta de Depressão Endogâmica:** O coeficiente F atinge 0.15. A variabilidade fenotípica foi extinta para padrões de rosetas, restringindo a prole a variações de feomelanina diluída. Há risco moderado de penalidade em fertilidade e vigor biológico.

| **Identificador** | **Nome de Registro** | **Micro-variação de Tonalidade** | **Impacto no Pool Genético** |
| --- | --- | --- | --- |
| INB1-01 | Ivory II | Marfim pálido absoluto | Fixação estrita de diluição |
| INB1-02 | Amber IV | Creme suave homogêneo | Supressão de rosetas |
| INB1-03 | Pearl | Creme perolado acinzentado | Modificador térmico recessivo |
| INB1-04 | Alabaster | Branco-creme quase translúcido | Ponto de seleção para linha branca |
| INB1-05 | Champagne | Champanhe acetinado morno | Saturação mínima |
| INB1-06 | Vanilla | Baunilha claro sem marcações | Homozigose total em padrão |

5.8 Inbreeding 2 — Alabaster × Ivory (GEN 5, F: 0.25, Limiar Crítico)

[Image]

| **Identificador** | **Nome de Registro** | **Fenótipo de Homozigose Extrema** | **Estado de Aptidão Biológica** |
| --- | --- | --- | --- |
| INB2-01 | Alabaster II | Branco alabastro sólido | Exaustão alélica severa |
| INB2-02 | Ivory III | Marfim vítreo monocromático | Imunidade comprometida |
| INB2-03 | Snow | Branco puro níveo (raridade máxima) | Taxa de fertilidade reduzida (-40%) |
| INB2-04 | Porcelain | Branco porcelana com subtom frio | Homozigose em alelos deletérios |
| INB2-05 | Milk | Branco leitoso denso | Vigor vital em nível crítico |
| INB2-06 | Opal | Branco com iridescência perolada | Bloqueio de novas recombinações |

5.9 Outcross de Resgate — Alabaster II × Amber II (GEN 6, F: 0.12, Heterose)

[Image]

| **Identificador** | **Nome de Registro** | **Fenótipo Restaurado** | **Efeito da Heterose** |
| --- | --- | --- | --- |
| OUT-01 | Alabaster III | Branco alabastro sólido com vigor renovado | Retenção da cor branca com vitalidade |
| OUT-02 | Amber III | Creme estruturado sem depressão endogâmica | Recuperação de imunocompetência |
| OUT-03 | Rosetta | Creme marfim com rosetas restauradas | Reexpressão de loci estruturais de padrão |
| OUT-04 | Sol | Dourado radiante com rosetas clássicas abertas | Expressão máxima de vigor híbrido |
| OUT-05 | Nimbus | Marfim suave com sombreamento difuso | Recombinação alélica funcional |
| OUT-06 | Aurora | Champanhe quente com rosetas parciais nítidas | Equilíbrio perfeito entre tom e padrão |

5.10 Consolidação — Alabaster III × Ivory (GEN 7, F: 0.13, Fusão das Linhas Brancas)

[Image]

| **Identificador** | **Nome de Registro** | **Fenótipo Consolidado** | **Potencial de Rota Reprodutiva** |
| --- | --- | --- | --- |
| CON-01 | Alabaster IV | Branco alabastro puro estável | Rota A: Fixação definitiva da linha branca pura |
| CON-02 | Ivory IV | Marfim clássico de alta densidade | Rota A: Manutenção de base sólida clara |
| CON-03 | Lumen | Branco níveo com rosetas pálidas tênues | Rota B: Desenvolvimento de jaguar branco com padrão |
| CON-04 | Cloud | Creme nebuloso com reflexos quentes | Rota B: Recombinação cromática intermediária |
| CON-05 | Snow II | Branco porcelana sem imperfeições | Rota A: Espécime de exibição/competência máxima |
| CON-06 | Pearl II | Marfim perolado com manchas residuais | Rota B: Linhagem de padrão estruturado |

5.11 Explicação Genética do Arco Completo

O arco reprodutivo do **Pumajaguar** demonstra o ciclo integral de manipulação genética no *Hack Tech Farm*. A trajetória evolutiva percorreu as fases de **Exploração (F1)** com segregação de alelos dominantes de melanismo (ASIP/MC1R); **Bifurcação Estratégica (BC1 Preto vs. BC1 Fulvo)** onde o retrobreeding derrubou o coeficiente para F: 0.03; **Ressurgimento (F3)** demonstrando portadores heterozigotos de caracteres ocultos; **Purificação (Line-Breeding)** com exclusão total do alelo melânico; **Exaustão Genética (Inbreeding sucessivo)** onde o coeficiente F atingiu o pico crítico de 0.25; **Resgate Alélico (Outcross)** via indução de heterose, reduzindo o índice para F: 0.12 e recuperando as rosetas; e finalmente a **Consolidação Estabilizada (F: 0.13)** com separação clara entre a linhagem branca pura e a linhagem branca padronizada.

| **Fase do Arco Genético** | **Cruzamento Realizado** | **Geração** | **Índice F** | **Status do Pool Genético** |
| --- | --- | --- | --- | --- |
| 1. Exploração Inicial | Onça Parda × Onça Negra | GEN 1 | 0.05 | Heterozigose ampla; dominância melânica |
| 2. Recombinação F2 | Alpha × Beta (estimado) | GEN 2 | 0.10 | Segregação mendeliana de caracteres |
| 3. Fixação Melânica | Delta × Onça Negra (BC1) | GEN 2 | 0.03 | Homogeneização em direção ao preto (AA/Aa) |
| 4. Fixação Clara | Shadow × Puma (BC1 Invertido) | GEN 2 | 0.03 | Diluição melânica 1:1; fixação do fulvo (aa) |
| 5. Ressurgimento | Amber × Omega (F3) | GEN 3 | 0.08 | Expressão de alelos recessivos residuais |
| 6. Line-Breeding | Amber II × Amber | GEN 3 | 0.05 | Eliminação de alelos escuros (100% aa) |
| 7. Inbreeding 1 | Ivory × Amber III | GEN 4 | 0.15 | Colapso de padrão; início de risco biológico |
| 8. Inbreeding 2 | Alabaster × Ivory | GEN 5 | 0.25 | Exaustão genética; depressão endogâmica |
| 9. Outcross Resgate | Alabaster II × Amber II | GEN 6 | 0.12 | Heterose ativa; restauração de rosetas |
| 10. Consolidação | Alabaster III × Ivory | GEN 7 | 0.13 | Linhagem estabilizada; bisseção de rotas |

### 6. GLOSSÁRIO E PRÓXIMOS PASSOS

6.1 Glossário Técnico de Termos

- **Geração F1 (Filial 1):** Primeira geração de descendentes resultante do cruzamento de progenitores geneticamente divergentes e homozigotos para linhagens puras.

- **Geração F2 (Filial 2):** Descendência obtida pela autofecundação ou cruzamento entre irmãos da geração F1, onde ocorrem recombinações e segregação mendeliana 3:1.

- **Geração F3 (Filial 3):** Terceira geração filial decorrente de cruzamentos direcionados na F2, revelando homozigotos recessivos raros e novas recombinações.

- **Backcross / Retrobreeding (BC1):** Cruzamento de um indivíduo híbrido com um de seus genitores puros ou linhagem parental recorrente, visando fixar caracteres específicos sem aumentar a endogamia deletéria.

- **Line-Breeding:** Método de acasalamento direcionado focado em manter o relacionamento genético restrito a determinado ancestral superior de alta performance.

- **Inbreeding (Endocruzamento Estrito):** Cruzamento entre indivíduos de parentesco imediato (como irmãos completos), acelerando a homozigose mas gerando risco de depressão biológica.

- **Outcross de Resgate:** Introdução deliberada de material genético de uma linhagem divergente em um pool endogâmico com o propósito de restaurar o vigor vital.

- **Heterose (Vigor Híbrido):** Fenômeno biológico no qual a progênie de linhagens endocruzadas divergentes exibe superioridade funcional, reprodutiva e imunológica em relação aos pais.

- **Índice de Fixação (F):** Métrica matemática de genética populacional que quantifica a redução esperada de heterozigose em relação ao equilíbrio de Hardy-Weinberg.

- **Melanismo:** Hiperpigmentação fenotípica decorrente de produção excessiva de eumelanina via mutações nos genes MC1R ou ASIP.

- **Harlequin (H):** Gene modificador epistático que converte áreas mosqueadas merle em fundo branco sólido com manchas pigmentadas irregulares.

- **Merle (M):** Padrão de diluição irregular da eumelanina na pelagem, associado a inserções de retrotransposons no gene SILV/PMEL17.

- **Tan Points ($$A^t$$):** Padrão do locus Agouti caracterizado por manchas castanhas/douradas localizadas sobre olhos, focinho, peito e extremidades dos membros.

- **Piebald ($$s^p$$):** Padrão de manchas brancas assimétricas decorrente de alelos recessivos no locus de pigmentação epidérmica *S*.

6.2 Próximos Passos de Desenvolvimento (Pipeline Hack Tech Farm)

- **Desenvolvimento da UI de Fixação de Linhagem:** Implementação das telas de interface do usuário dedicadas aos alertas dinâmicos de índice F, gráficos de pedigree e sinalização visual de depressão endogâmica.

- **Integração Algorítmica no Gene Bank:** Parametrização da matriz matemática no backend para cálculo automático instantâneo de F, coeficientes de Wright e probabilidades fenotípicas em cada ninhada.

- **Sessões de Playtest e Calibração de Game Design:** Ajuste de curvas de probabilidade para obtenção de mutações raras (ex.: fenótipos Snow, Solaris e Tau) assegurando o equilíbrio econômico do jogo.

- **Pipeline Audiovisual no Kling:** Renderização e interpolação sequencial dos morphings entre os cards de progenitores e fenótipos F1/F2 utilizando os assets visuais gerados.

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;

LEAD GAME DESIGNER                                                DIRETOR DE ARTE & GENÉTICA

Local e data: Studio Hack Tech Farm, 02 de setembro de 2026