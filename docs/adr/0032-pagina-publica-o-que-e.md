# ADR-0032 — Página pública `/o-que-e` (SEO e citação por modelos de linguagem)

- **Status:** aceito · **Data:** 2026-09-23
- **Não muda** regra de jogo, motor, planos nem preços; só expõe, em texto, o que já existe no código e nos docs.

## Contexto

Queremos que o GenBreedAI seja encontrado e citado por buscadores e por modelos de linguagem quando alguém pergunta "existe
simulador de genética online?". Hoje só a landing (`/`, que redireciona quem tem sessão para `/app`) descreve o produto, com
texto de marketing e sem dados estruturados. Restrições: nenhum fato inventado (regra 1 do `CLAUDE.md`), sem "em breve", sem
espécie ou recurso não implementado (regra 8), sem login.

## Decisão

1. **Rota pública `/o-que-e`** (`apps/web/app/o-que-e/page.tsx`, server component). Fora do matcher do `middleware.ts` (`/` e
   `/app/:path*`) — nada a mudar lá; um teste garante que continua pública, com ou sem sessão.
2. **Fonte única `apps/web/lib/about.ts`:** o texto visível E o JSON-LD (`FAQPage` + `SoftwareApplication`, num `@graph`) saem
   dos mesmos dados. Preços e limites vêm de `lib/plans.ts` (importados); espécies e raças, do catálogo de `@genbreedai/shared`
   (contagens calculadas, não digitadas). O motor é descrito a partir de `docs/gene-bank/*.md`, `packages/engine` e os ADRs
   0002/0012–0018; cada item tem a fonte em comentário.
3. **Sete blocos** (o que é, para quem serve, espécies, o que calcula, por que não é bichinho virtual, preço, como funciona) +
   **perguntas frequentes** visíveis (as mesmas do JSON-LD). A primeira frase já responde à pergunta.
4. **Metadata:** `title`, `description`, `canonical` (`https://genbreed.com.br/o-que-e`) e Open Graph/Twitter com a imagem que já
   existe (`public/hero-tigre-albino.jpg`, sem declarar dimensões). Link na landing (rodapé) e volta para `/`.
5. **Testes** (`lib/__tests__/about.test.ts`, sem DOM): JSON-LD válido; cada pergunta/resposta, item de `featureList`, preço e
   descrição declarados existem no texto visível; números batem com `plans.ts` (inclusive anual = 11 × mensal); nada de "em
   breve" nem de espécie/recurso não implementado; middleware não a cobre.

### Interpretações registradas (ambiguidade → conservador)

- **Público-alvo:** o pedido listava "curioso, estudante, professor, criador". O PRD (§4) só sustenta Criador Casual e
  Geneticista (quem analisa dominância, endogamia e QTL); "estudante" e "professor" **não estão no código nem nos docs** e sugeririam
  recursos de ensino que não existem. A página usa *curioso*, *criador* e *quem quer ver a herança mendeliana funcionando*.
  Incluir as duas palavras é decisão do dono.
- **"Mesma semente, mesmo resultado":** vale para o motor (`cross()`, TDD §0) e para a API com `seed` explícito. No jogo, cada
  cruzamento normal usa uma semente nova (`randomUUID` em `CrossService.incubate`), senão repetir o par devolveria sempre as
  mesmas descrições. A página diz as duas coisas.
- **"Calculada, não sorteada":** as opções e probabilidades vêm da enumeração mendeliana; o sorteio só escolhe entre resultados
  permitidos, sob semente determinística. A página não afirma ausência total de sorteio.
- **"Plano não muda a probabilidade":** a página diz que o plano define *limites e acesso* (nascimentos por período, espécies),
  nunca o resultado genético — sem "só", porque o plano também define retratos extras e bônus (`CLAUDE.md` §8).
- **Codominância:** o único locus `CODOMINANT` do motor é o laranja ligado ao X do gato (`feline.ts`, mosaico tartaruga); a página
  usa esse exemplo e não promete outros. **Letais:** só o duplo-merle canino existe (`canine.ts`).

### Deixado de fora por não haver fonte (ou por incerteza)

Pacotes avulsos de crédito (não estão em `plans.ts`); nome do modelo de IA (a página diz só "retrato gerado por IA").

## Adendo (2026-09-23) — gestação, sitemap e robots

- **Primeira gestação incluída:** o dono informou que a ADR-0025 está em produção desde 18/09 (migração 0011 aplicada — informado,
  não verificável pelo repo). O passo "Gestar" diz que a primeira gestação da conta leva 5 minutos e as seguintes de 12h a 48h,
  conforme a raridade. Os valores vêm de `lib/gestation.ts` (`FIRST_GESTATION_MINUTES`, mínimo e máximo da tabela), que espelha
  `apps/api/src/incubator/gestation-time.ts`; `lib/__tests__/sitemap.test.ts` falha se os dois divergirem.
- **`app/sitemap.ts` e `app/robots.ts`** (recursos nativos do Next 15; fonte das rotas: `lib/public-routes.ts`). Sitemap: `/`,
  `/o-que-e`, `/termos`, `/privacidade`, `/reembolso`. **Fora de propósito:** `/app/*` (logado), `/f/[id]` (um espécime por página — não
  se indexa em massa), `/login` e `/signup` (formulários sem conteúdo). Não existe `/planos` público (só `/app/planos`, logado).
  Robots: libera `/`, bloqueia `/app/`, aponta para `https://genbreed.com.br/sitemap.xml`. `/f/` **não** é bloqueado no robots
  (só fica fora do sitemap) para não quebrar prévias de compartilhamento; se quiserem tirá-lo dos buscadores, o caminho é
  `noindex` na própria página, decisão à parte.

## Adendo 2 (2026-09-23) — links de entrada, blog e publisher

- **Links para a página:** a home (`app/page.tsx`) não tem menu — só os botões do hero (Criar conta / Entrar) e o rodapé. Não se
  inventou menu: entrou um link "O que é" fixo no topo do hero, "Ver a explicação completa →" ao fim da seção "O que é" e o
  link do rodapé (3 no total; o teste conta).
- **Blog da Hack Tech Farm:** bloco no fim de `/o-que-e` ("Para entender a genética por trás do jogo"), dirigido por
  `ABOUT_BLOG_LINKS` em `lib/about.ts`. As 3 URLs foram fornecidas pelo dono (não constam no repositório); os títulos descrevem o
  conteúdo e foram derivados dos slugs — **os artigos não foram lidos**. Links externos: `target="_blank"` e `rel="noopener"`, **sem
  `nofollow`** de propósito (passar sinal entre os domínios). Lista vazia = bloco oculto; o teste valida URL, título e o `rel`.
- **JSON-LD:** `SoftwareApplication` ganhou `publisher` (Organization "Hack Tech Farm", `https://hacktechfarm.com.br/`), com a
  linha visível "Publicado por Hack Tech Farm" (link) no rodapé da página. `inLanguage: "pt-BR"` já existia (no
  `SoftwareApplication` e no `FAQPage`). A URL do publisher vem do pedido do dono (não consta no repositório).

## Consequências

- Manutenção: fato novo entra **só** em `lib/about.ts`, com fonte, e o teste falha se JSON-LD e texto divergirem. Mudar preço
  em `plans.ts` atualiza a página e o JSON-LD sozinho.
- Não há `sitemap.xml` nem `robots.txt` no app hoje; a página é descoberta por link (landing) — adicionar os dois é o próximo
  passo natural para indexação (fora deste ADR).
- O JSON-LD segue o schema.org, mas não há garantia de rich result; o objetivo é texto estruturado para recuperação.

## Alternativas consideradas

- *Texto digitado na página:* rejeitada — preço/contagem dessincronizariam do código, e o JSON-LD do texto.
- *Só a landing com JSON-LD:* rejeitada — a landing é marketing, redireciona logados e mistura promessas.
- *`<details>` no FAQ:* rejeitada — conteúdo recolhido pode ser tratado como não visível; o FAQ fica aberto.
