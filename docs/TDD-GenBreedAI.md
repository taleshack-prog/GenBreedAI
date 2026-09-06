> **⚠️ ERRATA DA FASE 0:** alguns valores deste documento foram corrigidos após a
> auditoria científica. Ver `docs/errata/fase0-errata.md` (E1–E5) e os ADRs
> 0001–0004. O motor (`packages/engine`) já implementa o comportamento correto.

Hack Tech Farm

**TDD — GENBREEDAI: SIMULADOR DE GENÉTICA APLICADA**

*Especificação Técnica Executável — Versão 1.0*

05 de setembro de 2026

## SUMÁRIO

- Seção 0 — Regras de Interpretação para o Agente de Código

- Seção 1 — Contexto do Produto

- Seção 2 — Stack e Arquitetura (Decisões Fechadas)

- Seção 3 — Modelo de Dados (Contratos)

- Seção 4 — Motor Genético (packages/engine)

- Seção 5 — Pipeline de IA e Renderização

- Seção 6 — Regras de Negócio e Governança por Tier

- Seção 7 — Sistemas Sociais e Economia

- Seção 8 — Especificação da API REST (/api/v1)

- Seção 9 — Roadmap de Engenharia e Não-Escopo

- Seção 10 — Checklist de Validação (Definition of Done)

### SEÇÃO 0 — REGRAS DE INTERPRETAÇÃO PARA O AGENTE DE CÓDIGO

Esta especificação técnica é a **única fonte de verdade** para a implementação do sistema GenBreedAI pelo agente autônomo de codificação (Claude Code). O descumprimento das diretrizes abaixo invalida os artefatos de código gerados.

- **Fonte Única de Verdade:** É estritamente proibido inventar, inferir ou alucinar espécies, loci, alelos, valores de coeficiente de endogamia ($$F$$), probabilidades biológicas ou regras operacionais fora das tabelas e fórmulas descritas neste documento.

- **Diretriz Anti-P2W (Pay-to-Win):** As probabilidades do motor genético são imutáveis e idênticas em todos os tiers de usuário. A progressão de assinaturas concede acesso a ferramentas analíticas, pools taxonômicos ampliados e maiores cotas diárias de execução, jamais alterando distribuições estocásticas ou taxas de sucesso biológico.

- **Determinismo Estrito:** O motor genético e a geração de mídia devem ser puramente determinísticos sob o mesmo estado: $$\text{Genótipo} + \text{Método} + \text{Seed} \rightarrow \text{Resultado Idêntico}$$. Essa invariância é mandatória para validação de integridade, cache de renderização e auditoria de fairness.

- **Precedência de Testes (Golden Tests):** Nenhum módulo de aplicação, interface ou contrato de API pode ser desenvolvido ou mergeado antes da aprovação total ($$100%$$ de sucesso) da suíte de *Golden Tests* especificada na Seção 4.5.

- **Moderação Obrigatória de Assets:** Nenhuma imagem sintetizada por modelos generativos pode ser exposta ao cliente final sem antes transitar pelo pipeline assíncrono de moderação automatizada e registrar conformidade.

- **Aderência ao Não-Escopo:** Recursos listados expressamente como Não-Escopo (Seção 9) não devem possuir stubs, mocks ou implementações parciais no repositório.

- **Resolução de Ambiguidade:** Diante de qualquer cenário não coberto de forma explícita, o agente deve adotar a conduta computacional mais conservadora, criando formalmente um registro de decisão arquitetural (ADR) no diretório docs/adr/.

### SEÇÃO 1 — CONTEXTO DO PRODUTO

O **GenBreedAI** é uma plataforma de simulação de genética aplicada com mecânicas de jogos interativos, projetada para execução em dispositivos móveis e navegadores desktop. O sistema permite o cruzamento genético de espécimes animais, demandando do usuário o estudo sistemático de segregação mendeliana, interação epistática, depressão endogâmica e seleção quantitativa com o objetivo de fixar características morfológicas e funcionais.

1.1 Personas Alvo

- **Criador Casual:** Focado na experimentação visual, geração de fenótipos raros, engajamento em mecânicas sociais de presentes (*gifts*) e compartilhamento viral.

- **Geneticista / Teórico:** Focado na modelagem probabilística, cálculo de coeficientes de parentesco ($$F_X$$), resposta à seleção artificial e planejamento de linhagens puras.

- **Colecionador / Negociante:** Focado no acúmulo de espécimes de alta aura de fixação, raridade alélica, preservação de proveniência genética e trocas no mercado interno.

1.2 Referências de Design e Benchmarks

- **Pure Felinity:** Mecânica de transmissão mendeliana estrita e fidelidade taxonômica.

- **Flight Rising:** Estrutura econômica resiliente, ciclos reprodutivos baseados em tempo e valorização de linhagens.

- **Khimeros e OviPets:** Profundidade de customização fenotípica e complexidade de padrões epistáticos.

- **Neopets:** Lição histórica sobre a necessidade de governança monetária rígida para prevenir hiperinflação de itens e desvalorização de espécimes.

1.3 Pilares de Navegação da Interface

- **Laboratório:** Espaço de execução de cruzamentos, seleção de matrizes/reprodutores, simulação de Punnett e escolha de métodos de acasalamento.

- **Galeria de Espécies:** Catálogo enciclopédico de espécies desbloqueadas, detalhando loci conhecidos, alelos documentados e árvores taxonômicas.

- **Galeria de Cruzamentos:** Registro visual e histórico de espécimes produzidos pelo jogador, organizados por linhagem e grau de pureza.

- **Genoma:** Visualizador analítico profundo do genótipo, valores de Quantitative Trait Loci (QTL), índice de fixação ($$IF$$) e coeficientes de Wright.

- **Social:** Hub de interações comunitárias, listagem de canais de chat temáticos e envio diário de espécimes como presente (*gift cards*).

- **Mercado:** Ambiente transacional para compra e venda de espécimes via custódia garantida (*escrow*), exclusivo para tiers qualificados.

- **Perfil:** Painel do usuário contendo estatísticas de criação, métricas de rede de indicações (*referral*), inventário e controle de assinatura.

### SEÇÃO 2 — STACK E ARQUITETURA (DECISÕES FECHADAS)

A infraestrutura técnica do GenBreedAI é padronizada sob uma arquitetura de monorepo estruturada para suportar alta densidade computacional e escalabilidade horizontal sem dependência de plataformas BaaS (Backend-as-a-Service) proprietárias.

genbreedai/
├── apps/
│   ├── web/               # Next.js 15 (App Router) + Tailwind CSS + PWA
│   └── api/               # NestJS + Fastify REST API
├── packages/
│   ├── engine/            # TypeScript puro (Motor Genético Determinístico)
│   └── shared/            # Tipos compartilhados, DTOs e constantes

- **Monorepo:** Gerenciado via Turborepo com isolamento de dependências e pipelines de cache de build.

- **Frontend (apps/web):** Next.js 15 com App Router, TypeScript estrito, Tailwind CSS e @ducanh2912/next-pwa. Código unificado fornecendo Progressive Web App instalável e interface web responsiva. Tamanho máximo do bundle inicial: < 35MB.

- **Backend (apps/api):** NestJS estruturado sobre o adapter de alta performance Fastify. Arquitetura em camadas com injeção de dependência e exposição de rotas RESTful.

- **Camada de Persistência:** PostgreSQL 16 gerenciado via Drizzle ORM. Estruturas genômicas e vetores fenotípicos mapeados em colunas nativas JSONB indexadas com GIN.

- **Fila e Cache:** Redis 7 com orquestrador BullMQ para background jobs de geração de imagens, processamento de mutações e reconciliação assíncrona.

- **Armazenamento de Objetos:** Cloudflare R2 ou AWS S3 integrado a CDN Cloudflare com políticas de expiração e assinatura digital de URLs.

- **Autenticação:** Auth.js (NextAuth v5) com tokens JWT assinados via algoritmo EdDSA/RS256, suportando rotação de *Refresh Tokens* e invalidação via Redis.

- **Qualidade e Testes:** Vitest para testes unitários do motor e suites de Golden Tests; Playwright para automação de ponta a ponta (E2E) dos fluxos críticos de cruzamento e transação.

- **Ambiente e Deploy:** Orquestração local via Docker Compose. Deploy de produção: Frontend na Vercel Edge Network, Backend em instâncias Railway/Fly.io, banco de dados hospedado em Neon (MVP) com migração planejada para AWS RDS PostgreSQL Multi-AZ sob alta carga.

### SEÇÃO 3 — MODELO DE DADOS (CONTRATOS)

O esquema de dados relacional foi modelado para suportar relações de parentesco complexas e auditoria criptográfica de proveniência genômica.

| **Entidade** | **Atributos Principais** | **Chaves Estrangeiras / Relações** |
| --- | --- | --- |
| User | id, email, passwordHash, tier (FREE, JUNIOR, SENIOR, PHD), streak, xp, createdAt | 1:N com Specimen, Cross, ReferralLink, GiftRecord |
| Species | id, slug, name, archetype (FELINO, CANINO, BOVINO, EQUINO, SUINO, OVINO), rarity, tierGate, dataPackId | 1:N com Locus, Trait, Specimen |
| Locus | id, speciesId, name, alleles (Array), dominance (COMPLETE, INCOMPLETE, CODOMINANT), epistasisRule (JSONB), lethalCombos (Array), mutationRate | N:1 com Species |
| Trait | id, speciesId, name, type (DISCRETE, QUANTITATIVE), mean, h2, targetLoci (Array) | N:1 com Species |
| Specimen | id, ownerId, speciesAId, speciesBId, genotype (JSONB), phenotype (JSONB), fPedigree, fertility, fixationIndex, aura (1-5), generation, method, imageUrl, provenanceHash, createdAt | N:1 com User, Species (A e B); 1:N com LineageNode |
| Cross | id, userId, sireId, damId, method (F1, F2, F3, BC1, LINE, INBREED, OUTCROSS), seed, resultSpecimenIds (Array), cost, createdAt | N:1 com User, Specimen (Sire e Dam) |
| LineageNode | id, specimenId, parentId, generation | N:1 com Specimen (Nó e Progenitor) |
| GalleryEntry | id, userId, specimenId, collection (SPECIES, CROSS), isPublic | N:1 com User, Specimen |
| GiftRecord | id, senderId, receiverId, specimenId, referralLinkId, createdAt | N:1 com User (Sender e Receiver), Specimen, ReferralLink |
| ReferralLink | id, userId, code, clicks, installs, d1, d7, conversions, tier | N:1 com User; 1:N com GiftRecord |
| ChatMessage | id, channelId, userId, body, moderatedAt, status | N:1 com User |
| TradeOffer | id, sellerId, specimenId, price, status, escrowId | N:1 com User, Specimen |
| ImageJob | id, specimenId, tier, model, resolution, status, cacheKey, moderationStatus | N:1 com Specimen |
| Provenance | id, specimenId, hash, createdAt | 1:1 com Specimen |

3.1 Estrutura do Payload Genômico (Exemplo JSONB)

{
  "loci": {<br/>
    "B": ["b", "b"],<br/>
    "K": ["k^br", "k^y"],<br/>
    "M": ["M", "m"],<br/>
    "S": ["S", "s"],<br/>
    "A": ["a^y", "a^t"]
  },
  "qtl": {<br/>
    "porte": 0.62,<br/>
    "vigor": 0.71,<br/>
    "beleza": 0.84,<br/>
    "temperamento": 0.55
  }
}

### SEÇÃO 4 — MOTOR GENÉTICO (PACKAGES/ENGINE)

O pacote packages/engine é implementado em TypeScript puro, sem dependências externas de I/O, garantindo portabilidade para execução tanto no backend quanto em workers do frontend para prévias computacionais offline.

4.1 Modelo de Herança

O motor integra herança mendeliana de locos discretos multialélicos com o modelo infinitesimal de genética quantitativa:

- **Dominância Completa:** O alelo dominante mascara a expressão fenotípica do alelo recessivo em heterozigose.

- **Dominância Incompleta e Codominância:** Heterozigotos expressam fenótipos intermediários ou a manifestação simultânea de ambos os alelos parentais.

- **Epistasia:** Modificação da expressão de um locus por alelos presentes em outro locus independente (exemplo: o alelo $$H$$ *Harlequin* atua como modificador epistático sobre o locus $$M$$ *Merle*, convertendo manchas azuladas em áreas brancas puras).

- **Alelos Letais:** Combinações genotípicas específicas (exemplo: $$M/M$$ em homozigose com supressão de viabilidade ou combinações letais de genes dominantes) ativam gatilhos de mortalidade embrionária pré-natal.

- **Genética Quantitativa (QTL):** Características contínuas (porte, vigor híbrido, conformação estética) são computadas através de modelos aditivos gaussianos modulados pela herdabilidade ($$h^2$$), com resposta adaptativa expressa pela Equação do Criador.

4.2 Formulação Matemática

As operações genéticas implementadas obedecem estritamente às formulações matemáticas clássicas:

- **Quadrado de Punnett e Frequências Gaméticas:** A probabilidade do genótipo da prole corresponde ao produto das probabilidades de segregação gamética dos progenitores:
$$\mathbb{P}(G_{\text{filho}}) = \mathbb{P}(g_{\text{pai}}) \times \mathbb{P}(g_{\text{mãe}})$$

- **Coeficiente de Endogamia de Wright ($$F_X$$):** Calculado com base na genealogia estendida do indivíduo através de todos os ancestrais comuns ($$A$$):
$$F_X = \sum \left[ \left(\frac{1}{2}\right)^{n_1 + n_2 + 1} \times (1 + F_A) \right]$$
Onde $$n_1$$ é o número de gerações entre o pai e o ancestral comum $$A$$, e $$n_2$$ é o número de gerações entre a mãe e o mesmo ancestral $$A$$.

- **Estatística $$F$$ de Wright (Déficit de Heterozigose Local):**
$$F = 1 - \frac{H_{\text{obs}}}{H_{\text{exp}}}$$

- **Equação do Criador (Resposta à Seleção Quantitativa):**
$$R = h^2 \times S$$
Onde $$R$$ representa a resposta fenotípica média da próxima geração, $$h^2$$ é a herdabilidade no sentido restrito e $$S$$ é o diferencial de seleção aplicado aos parentais.

- **Dinâmica de Fertilidade e Viabilidade:**

Cruzamentos intraespécie basais: $$\text{Fertilidade} = 100%$$.

- Híbridos F1 Interespecíficos: $$\text{Fertilidade} = 0%$$ para o sexo heterogamético (Regra de Haldane).

- Retrocruzamento (BC1): $$\text{Fertilidade} = 60% - 80%$$.

- Intercruzamento F2: $$\text{Fertilidade} = 30% - 50%$$.

- Penalidade por Depressão Endogâmica: Quando $$F_{\text{pedigree}} > 0.15$$, aplica-se uma redução de $$10%$$ na fertilidade basal para cada acréscimo de $$0.05$$ em $$F_{\text{pedigree}}$$.

- Inviabilidade Embrionária: Quando $$F_{\text{pedigree}} > 0.25$$, introduz-se uma probabilidade mínima de $$5%$$ de óbito embrionário não-reversível.

- *Outcross* de Resgate: Cruzamento exogâmico aplicado a linhagens com alta endogamia confere bonificação imediata de $$+40%$$ a $$+60%$$ nos índices de fertilidade e vigor da prole.

- **Taxa de Mutação Espontânea:**
$$\mu = 1 \times 10^{-4} \text{ por locus por gameta}$$
Em caso de mutação positiva, o alelo mutante é rotulado com a tag indelével "mutação" nos metadados do espécime.

4.3 Índice de Fixação (Métrica de Jogo)

O Índice de Fixação (

$$IF$$

) representa a métrica de gamificação que quantifica a estabilidade de transmissão dos traços desejados da linhagem. Diferencia-se matematicamente do coeficiente 

$$F_{\text{pedigree}}$$

, sendo computado pela média ponderada:

$$IF = 0.5 \times H_{\text{alvo}} + 0.3 \times G_{\text{pedigree}} + 0.2 \times S_{\text{gerações}}$$

Onde:

- $$H_{\text{alvo}} = \frac{\text{Loci Alvo Homozigotos}}{\text{Total de Loci Alvo Selecionados}}$$

- $$G_{\text{pedigree}} = \min\left(1.0, \frac{F_{\text{pedigree}}}{0.25}\right)$$

- $$S_{\text{gerações}} = \min\left(1.0, \frac{\text{Gerações sob Seleção Direcionada}}{7}\right)$$

**Atenção:** O $IF$ é a métrica apresentada na interface visual para progressão de rank e classificação de Auras. Alertas biológicos de depressão por endogamia e esterilidade calculam exclusivamente o $F_{\text{pedigree}}$ real.

- **Aura ★ (1 estrela):** $$IF < 0.25$$ (Linhagem Instável / Híbrido Primário)

- **Aura ★★ (2 estrelas):** $$0.25 \leq IF < 0.50$$ (Início de Segregação)

- **Aura ★★★ (3 estrelas):** $$0.50 \leq IF < 0.75$$ (Linhagem em Consolidação)

- **Aura ★★★★ (4 estrelas):** $$0.75 \leq IF < 0.90$$ (Quase-Pura com Alta Previsibilidade)

- **Aura ★★★★★ (5 estrelas):** $$IF \geq 0.90$$ (Linhagem Pura Fixada / True-Breeder)

4.4 Pseudocódigo do Algoritmo de Cruzamento

function cross(
  parentA: Specimen, <br/>
  parentB: Specimen, <br/>
  method: BreedingMethod, <br/>
  seed: string<br/>
): CrossResult {
  // 1. Validação de regras e integridade
  validateBreedingConstraints(parentA, parentB, method);
  
  const rng = createPrng(seed);

  // 2. Formação gamética independente com taxa de mutação
  const gameteA = generateGamete(parentA.genotype, rng, 1e-4);
  const gameteB = generateGamete(parentB.genotype, rng, 1e-4);

  // 3. Fusão dos gametas no novo zigoto
  const zygoteGenotype = combineGametes(gameteA, gameteB);

  // 4. Resolução fenotípica (dominância, epistasia e modelo aditivo)
  const phenotype = expressPhenotype(zygoteGenotype, parentA.speciesAId);

  // 5. Cálculos de pedigree, fertilidade e fixação
  const fPedigree = calculateWrightF(parentA.lineage, parentB.lineage);
  const fertility = calculateFertility(phenotype, method, fPedigree);
  const fixation = calculateFixationIndex(phenotype, fPedigree, parentA.generation + 1);
  const aura = mapFixationToAura(fixation);

  // 6. Geração de chave de cache para renderização
  const cacheKey = generateSha256(
    hashGenotype(zygoteGenotype) + 
    parentA.speciesAId + 
    CURRENT_ART_VERSION
  );

  return {
    specimen: {<br/>
      genotype: zygoteGenotype,
      phenotype,
      fPedigree,
      fertility,
      fixationIndex: fixation,
      aura,
      generation: Math.max(parentA.generation, parentB.generation) + 1,
      method
    },
    cacheKey
  };
}

4.5 Casos de Teste Ouro (Golden Tests)

O pacote de testes do motor deve conter a implementação dos 4 arcos de validação do Gene-Bank, executados via vitest com tolerância estocástica zero sob seeds pré-definidas:

| **Caso de Teste** | **Cruzamento / Parentais** | **Genótipos Alvo** | **Valores Esperados** |
| --- | --- | --- | --- |
| Goldendoodle F1 | Golden Retriever (liso, dourado) × Poodle (cacheado, creme) | $$K/k^{\text{y}}, F/f, E/e, c^{\text{ch}}/c^{\text{ch}}$$ | $$F_{\text{pedigree}} = 0.00$$; $$IF \approx 0.05$$; 2 fenótipos possíveis: ondulado ($$F/f$$) e cacheado ($$F/F$$). |
| Boerpointer F2 | Alpha (F1) × Beta (F1) [Irmãos Completos] | Segregação nos loci $$B, K, S$$ | $$F_{\text{pedigree}} = 0.25$$; proporção clássica de segregação $$3:1$$ em dominantes; 6 classes fenotípicas. |
| Danecollie F3 | Omega II × Beta (F2) | Segregação do locus $$M$$ (Merle) e $$H$$ | Reaparecimento de homozigoto recessivo não-merle ($$m/m$$) em exatos $$25\%$$; identificação dos recombinantes Tau e Phi. |
| Pumajaguar BC1 | Delta (F1 Híbrida) × Onça Negra (Pai) | Locus Melanístico $$a/a$$ e Porte | Fixação de pelagem melânica; $$F_{\text{pedigree}} = 0.25$$; $$IF \approx 0.03$$; validação da curva $$0.05 \rightarrow 0.25 \rightarrow 0.12 \rightarrow 0.13$$. |

### SEÇÃO 5 — PIPELINE DE IA E RENDERIZAÇÃO

O pipeline de geração visual converte vetores genotípicos discretos em descritores visuais normalizados, garantindo consistência documental científica e controle de custos de inferência.

[Genótipo + QTL] ──► [Vetor de Traços] ──► [Template de Prompt] ──► [Seed Fixa]
 │
[Imagem Card] ◄── [CDN / S3] ◄── [Moderação] ◄── [Fila BullMQ / Modelo] ◄─┴──► [Cache Hit?]

5.1 Especificação de Cache e Deduplicação

- **Chave de Cache:**
$$\text{cacheKey} = \text{SHA-256}(\text{genotypeHash} + \text{speciesPackId} + \text{artPipelineVersion})$$

- **Política de Cache:** Redis com persistência key-value e TTL de 90 dias com refresh no acesso (*LRU*).

- **Meta de Eficiência:** Hit rate global da camada de renderização $$\geq 50%$$ da volumetria de cruzamentos após a primeira semana de ciclo de vida de cada data pack.

5.2 Alocação de Modelos Generativos por Tier

| **Tier** | **Motor de Renderização** | **Resolução** | **Custo Médio / Imagem** | **Políticas de Execução** |
| --- | --- | --- | --- | --- |
| Freebreeder | Procedural SVG/Canvas 2D + 1 Retrato IA/mês | 512x512 | `$0.00` (Procedural) | Geração procedural local no cliente; 1 job de IA via fila de baixa prioridade. |
| Junior Breeder | FLUX.2 Pro via API | 1024x1024 | `~$0.03` | Fila BullMQ padrão; pipeline com upscaler de textura. |
| Senior Breeder | GPT Image 2 / Nano Banana Pro | 1536x1536 | `~$0.05` | Fila prioritária com refinamento de iluminação de estúdio e máscara de pelagem. |
| PhD Breeder | Generative Engine Ultra Premium | 3840x2160 (4K) | `~$0.10` | Renderização em altíssima definição, multi-pass com preservação de detalhes taxonômicos. |

5.3 Moderação e Auditoria de Proveniência

- **Moderação em Duas Camadas:**
Filtro neural automático no retorno do buffer da imagem (detecção de anomalias anatômicas extremas, conteúdo explícito ou quebra de estética).

- Encaminhamento assíncrono para fila de inspeção humana para scores de incerteza entre $$0.65$$ e $$0.85$$.

- Rejeição imediata aciona renderizador vetorial procedural de contingência (*fallback*).

- **Proveniência Criptográfica:** Todo espécime gerado recebe uma assinatura indelével no banco de dados calculada por:
$$\text{provenanceHash} = \text{SHA-256}(\text{genotypeJSON} + \text{pedigreeTreeHash} + \text{ownerId} + \text{timestamp})$$

5.4 Template Canônico de Engenharia de Prompt

"Retrato de estúdio fotorrealista de um espécime híbrido [NOME_POPULAR], resultante do cruzamento de [ESPECIE_A] x [ESPECIE_B]. Fenótipo expresso: [DESCRITORES_ANATOMICOS]. Pelagem: [COR_PRIMARIA], [COR_SECUNDARIA], textura [TEXTURA_PELAGEM]. Marcações e padrões: [PADRAO_EPISTATICO]. Conformação física: porte [PORTE_RELATIVO], vigor muscular aparente. Iluminação de estúdio cinemática, fundo escuro neutro com gradiente sutil, estilo documental biológico profissional, fotografia macro 8k, alta fidelidade anatômica. Sem artefatos, sem deformações, sem texto, sem bordas, sem marcas d'água."

### SEÇÃO 6 — REGRAS DE NEGÓCIO E GOVERNANÇA POR TIER

A matriz de monetização é estruturada para monetizar capacidade de processamento, amplitude de conteúdo taxonômico e ferramentas de visualização analítica, blindando o ecossistema contra dinâmicas de Pay-to-Win.

| **Tier de Acesso** | **Pool Taxonômico Disponível** | **Cota de Cruzamentos** | **Imagens IA / Mês** | **Ferramentas Analíticas e Recursos** | **Preço Mensal** |
| --- | --- | --- | --- | --- | --- |
| Freebreeder | Felinos Base (Apenas Intraespécie) | 1 cruzamento / dia (+1 evento semanal de hibridação) | 1 imagem premium / mês | Visualizador de genoma básico, streak diário, renderização procedural ilimitada. | `R$ 0,00` |
| Junior Breeder | + Híbridos Interespecíficos de Felinos | 3 cruzamentos / dia | 6 imagens premium / mês | Bio-filtros de alelos, árvore genealógica de 3 gerações, remoção de anúncios. | `R$ 19,90` |
| Senior Breeder | + Caninos e Raças Selecionadas | 5 cruzamentos / dia | 10 imagens premium / mês | Mapeamento cromossômico completo, árvore genealógica de 7 gerações, simulador preditivo de Punnett avançado. | `R$ 39,90` |
| PhD Breeder | + Grandes Animais (Bovinos, Equinos, Suínos, Ovinos) | 10 cruzamentos / dia | 20 imagens premium / mês | Acesso ao Mercado (compra/venda), exportação 4K, ferramentas de seleção por QTL, auditoria de linhagem completa. | `R$ 89,90` |

### SEÇÃO 7 — SISTEMAS SOCIAIS E ECONOMIA

O ecossistema social conecta os jogadores por meio de mecânicas de compartilhamento viral e canais seguros de transação e comunicação.

7.1 Arquitetura de Chat Comunitário

- **Segmentação de Canais:** Salas organizadas por arquétipos taxonômicos (#felinos, #caninos, #hibridacao-avancada, #linhagens-puras).

- **Moderação em Três Camadas:***Filtro Léxico e Semântico em Tempo Real:* Bloqueio preventivo de termos abusivos, dados sensíveis (PII) e links externos não autorizados.

- *Rate Limiting Estrito:* Máximo de 5 mensagens a cada 30 segundos por usuário via Redis Token Bucket.

- *Mecanismo de Denúncia e Flagging:* Suspensão automática de exibição após 3 denúncias de usuários distintos até revisão pelo time de moderação.

- **Privacidade e Proteção de Menores:** Estrita conformidade com as diretrizes da LGPD (Lei Geral de Proteção de Dados) e COPPA, sem armazenamento de geolocalização precisa e com opções ativas de bloqueio de mensagens diretas.

7.2 Sistema de Presentes (Gifts) e Mecânica Viral

- **Cota de Envio:** Todo usuário tem direito ao envio de 1 *Gift Card* digital a cada 24 horas.

- **Integridade Genômica:** O envio de um gift gera um novo espécime único baseado nos parâmetros parentais do emissor, contendo registro de proveniência rastreável. É estritamente proibida a duplicação direta de espécimes existentes no inventário.

- **Link de Atribuição Embutido:** O card recebido por canais externos (WhatsApp, redes sociais, email) contém um link dinâmico de referral associado à conta do emissor.

7.3 Programa de Indicação e Níveis de Divulgador (Referral Engine)

- **Rastreamento de Funil:** Monitoramento individualizado de métricas:
$$\text{Cliques} \longrightarrow \text{Instalações (PWA/App)} \longrightarrow \text{Retenção D1/D7} \longrightarrow \text{Conversão a Tiers Pagos}$$

- **Níveis de Ranqueamento de Divulgadores:****Bronze:** 1 a 4 instalações ativas convertidas.

- **Prata:** 5 a 19 instalações ativas com retenção D7.

- **Ouro:** 20 a 49 conversões com ao menos 3 upgrades de tier.

- **Diamante:** $$\geq 50$$ conversões qualificadas.

- **Matriz de Recompensas:** Créditos para processamento de imagens adicionais, desbloqueio temporário de data packs de espécies raras e cupons de desconto recursivos em assinaturas.

7.4 Mercado Interno com Custódia (Escrow)

- **Restrição de Acesso:** Exclusivo para usuários autenticados no tier **PhD Breeder**.

- **Mecanismo de Escrow:** Na criação de uma oferta, o espécime é transferido imediatamente para a conta do sistema (escrow_wallet). O comprador transfere os fundos e o sistema executa a liberação simultânea do espécime e dos créditos após validação criptográfica.

- **Taxa de Governança Econômica:** Retenção automática de $$5%$$ a $$10%$$ sobre o volume de cada transação como mecanismo de sumidouro de moeda (*money sink*), contendo surtos inflacionários.

- **Confirmação em Duas Etapas:** Transações de espécimes de Aura 4 e 5 exigem reautenticação de credencial ou confirmação via 2FA.

### SEÇÃO 8 — ESPECIFICAÇÃO DA API REST (/API/V1)

A comunicação entre clientes e o backend é realizada através de endpoints RESTful sob transporte seguro HTTPS/TLS 1.3 com payloads formatados em JSON.

| **Método / Endpoint** | **Descrição da Operação** | **Autenticação / Gate** | **Status de Resposta** |
| --- | --- | --- | --- |
| POST /api/v1/cross | Executa o cruzamento genético entre dois espécimes informados. | JWT (Validação de Cota por Tier) | 201 Created, 400 Bad Request, 429 Too Many Requests |
| GET /api/v1/specimens | Lista espécimes pertencentes ao usuário autenticado com paginação. | JWT (Todos os Tiers) | 200 OK, 401 Unauthorized |
| GET /api/v1/specimens/:id | Retorna detalhes profundos, genótipo, QTLs e fenótipo do espécime. | JWT (Todos os Tiers) | 200 OK, 404 Not Found |
| GET /api/v1/specimens/:id/lineage | Retorna a árvore genealógica estruturada até o limite do tier do usuário. | JWT (Profundidade: Junior 3, Senior 7, PhD Total) | 200 OK, 403 Forbidden |
| POST /api/v1/gifts | Gera e envia um card de presente vinculado ao link de referral. | JWT (Limite: 1 operação / 24h) | 201 Created, 429 Too Many Requests |
| GET /api/v1/referral | Recupera o código de indicação, link dinâmico e métricas do funil. | JWT (Todos os Tiers) | 200 OK |
| GET /api/v1/referral/leaderboard | Retorna o ranking global dos maiores divulgadores. | JWT (Todos os Tiers) | 200 OK |
| POST /api/v1/chat/channels/:id/messages | Envia uma nova mensagem de texto para o canal especificado. | JWT (Filtro Léxico + Rate Limit) | 201 Created, 422 Unprocessable Entity |
| GET /api/v1/market/offers | Lista ofertas ativas no mercado com filtros por IF e raridade. | JWT (Exclusivo Tier PhD) | 200 OK, 403 Forbidden |
| POST /api/v1/market/offers | Publica espécime para venda, transferindo-o para custódia (escrow). | JWT (Exclusivo Tier PhD) | 201 Created, 400 Bad Request |
| POST /api/v1/market/offers/:id/buy | Executa a compra em duas etapas e transfere a titularidade do espécime. | JWT (Exclusivo Tier PhD + 2FA) | 200 OK, 409 Conflict |
| GET /api/v1/species | Catálogo enciclopédico de espécies base e regras taxonômicas. | Público (Sem Autenticação) | 200 OK |
| GET /api/v1/loci | Tabelas de loci, alelos conhecidos e relações de dominância. | Público (Sem Autenticação) | 200 OK |

### SEÇÃO 9 — ROADMAP DE ENGENHARIA E NÃO-ESCOPO

O cronograma de implementação é dividido em marcos sequenciais orientados por critérios técnicos e métricas de aceitação objetivas.

9.1 Fases de Desenvolvimento

- **Fase 0 — Motor Genético Headless (Semanas 1 a 4):***Entregáveis:* Pacote packages/engine implementado em TypeScript puro com cobertura de testes unitários e aprovação integral dos 4 arcos do Gene-Bank via Golden Tests.

- *Critério de Aceitação:* Reprodução exata dos fenótipos, valores de $$F_{\text{pedigree}}$$ e proporções de segregação sem interface gráfica.

- **Fase 1 — MVP Operacional (Semanas 5 a 12):***Entregáveis:* Frontend Next.js PWA, Backend NestJS, Banco PostgreSQL/Drizzle, Módulos de Laboratório, Galeria e visualização de Genoma básico, pipeline de geração de imagem com cache Redis, catálogo de 6 espécies iniciais, suporte a Freebreeders com 1 cruzamento/dia.

- *Critérios de Aceitação:* Retenção D1 $$> 40%$$, D7 $$> 18%$$ e latência de resposta de API $$< 200\text{ms}$$ (p95).

- **Fase 2 — Módulos Sociais e Crescimento (Semanas 13 a 18):***Entregáveis:* Canais de chat moderados, envio de Gift Cards diários, sistema de rastreamento de referral e quadro de líderes.

- *Critério de Aceitação:* No mínimo $$5%$$ dos usuários ativos realizando envio diário de gifts.

- **Fase 3 — Infraestrutura de Monetização (Semanas 19 a 24):***Entregáveis:* Gateway de pagamento integrado a assinaturas de Tiers (Junior, Senior, PhD), mercado com custódia (*escrow*), torneios de fixação fenotípica (*contests*).

- *Critério de Aceitação:* Taxa de conversão de usuários ativos para tiers pagos $$\geq 2.8%$$.

- **Fase 4 — Expansão Contínua de Conteúdo (Pós-lançamento):***Entregáveis:* Ingestão mensal de novos data packs de espécies mediante alcance de metas comunitárias de engajamento (Retenção D30 $$> 6.5%$$), introdução de grandes animais e eventos sazonais.

9.2 Definição Explícita de Não-Escopo (MVP)

Os itens a seguir não devem ser implementados durante as fases 0, 1 e 2 do projeto:

- Integração com Web3, tokens on-chain, NFTs ou contratos inteligentes.

- Mercado aberto para tiers inferiores ao PhD Breeder.

- Modelagem de espécies de pecuária pesada e equinos fora do tier PhD Breeder.

- Protocolos WebSockets bidirecionais complexos para chat (o MVP operará via polling inteligente / SSE).

- Empacotamento nativo compilado em Swift/Kotlin (o suporte móvel é atendido via PWA instalável).

- Processamento de checkout multi-moeda com conversão cambial dinâmica internacional no lançamento inicial.

### SEÇÃO 10 — CHECKLIST DE VALIDAÇÃO (DEFINITION OF DONE)

O agente de código deve verificar a conformidade de cada item da lista abaixo antes de submeter pull requests ou considerar qualquer módulo finalizado.

| **Critério de Validação** | **Métrica / Teste de Aceitação** | **Status Requerido** |
| --- | --- | --- |
| Suíte de Golden Tests | $100\%$ de aprovação nos 4 arcos de teste (Goldendoodle, Boerpointer, Danecollie, Pumajaguar). | Obrigatório |
| Paridade Anti-P2W | Teste de asserção: mesma semente ($seed$) e progenitores geram genótipo idêntico independente do tier do usuário. | Obrigatório |
| Integridade da IA | $100\%$ das imagens exibidas possuem registro na tabela ImageJob com status de moderação APPROVED. | Obrigatório |
| Conformidade LGPD/COPPA | Termos de consentimento ativos, política de exclusão de dados funcional e ausência de coleta de PII no chat. | Obrigatório |
| Desempenho Frontend | Bundle estático total $< 35\text{MB}$; Time-to-Interactive (TTI) $< 3.0\text{s}$ em conexões 4G móveis médias. | Obrigatório |
| Segurança e Escrow | Validação de integridade transacional de compra/venda com testes de concorrência e auditoria de saldos em banco. | Obrigatório |

*Documento elaborado em 05 de setembro de 2026. As informações contidas são de responsabilidade do solicitante.*