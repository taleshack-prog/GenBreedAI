# ADR-0040 — Página pública `/professores` com roteiros de aula

- **Status:** aceito · **Data:** 2026-11-26
- **Não muda** regra de jogo, motor, schema nem preço. Só uma página pública e o texto que a cita.

## Contexto

A genética do motor (dominância, X, Wright) é conteúdo de aula de Biologia, mas nada no site falava com o professor. Antes de escrever,
havia três ambiguidades:

1. **Plano para turma.** Não existe preço nem produto para escola. Criar um exigiria preço, Stripe, contas de alunos e uma regra para
   menores de idade — os Termos de uso hoje não tratam de idade.
2. **Contas de alunos.** Pela mesma razão, pedir que cada aluno crie conta envolve dado de menor (LGPD, art. 14) sem cobertura nos termos.
3. **Exatidão.** Um roteiro de aula ensina a regra como verdade. Um número errado na página vira erro de prova.

## Decisão

- **Página grátis, sem plano turma** (escolha do dono do produto, 26/11/2026). Os roteiros são conduzidos pelo professor na própria conta,
  projetada; os alunos preveem no papel. O uso com conta por aluno é tratado pelo contato do rodapé, sem promessa de preço ou prazo.
- **Só o plano Free.** Os quatro roteiros usam fundadores de *Felis catus* (ADR-0016), para qualquer professor repetir sem pagar:
  1. Gato Preto × Gato Preto (`A/a` × `A/a`): 75% / 25%.
  2. Abissínio Azul × Abissínio Sorrel (B e D em 1:1 cada, Bd em 3:1): 18,8% e 6,3%; as 2 descrições cortadas pelo limite de 6 viram exercício.
  3. Gato Preto (linhagem Tartaruga) `[o]` × Gato Laranja `O/O`: toda fêmea mosaico, todo macho laranja — visível nas descrições
     da incubadora, que já trazem o sexo sorteado (sem nascimento). Termina com a 1ª gestação de 5 min (ADR-0025).
  4. Filhote do roteiro 3 × pai ou mãe: F = 0,25 no laboratório antes de cruzar; limiar 0,15 de `fertility.ts`.
- **Fonte única + motor como juiz.** Todo texto, o JSON-LD (FAQPage) e a linha do `/llms.txt` saem de `apps/web/lib/teachers.ts`.
  `lib/__tests__/teachers.test.ts` recalcula cada número com `enumerateOffspring`/`materializeCross`/`wrightF` sobre os `founderSeeds()`
  da API, e confere nome e sexo de cada fundador. Verificado por sabotagem (trocar 18,75 por 25 derruba o teste).
- **Comprimento do pelo fica fora dos roteiros.** No pack felino `Fl^l` (longo) é **dominante**; no gato real o pelo longo (FGF5) é
  recessivo. A página não o usa e o teste trava isso. A correção do motor é decisão à parte, para a auditoria pendente (CLAUDE.md §6.1).
- Rota em `PUBLIC_ROUTES`/`ROUTE_LASTMOD`/`ROUTE_SOURCES`, no sitemap e no llms; link no rodapé da landing e de `/o-que-e`, e item
  "Professor" em "Para quem serve".

## Consequências

- Mudou genótipo de fundador, o limite de 6 descrições ou a regra de F? O teste da página falha — é o objetivo.
- Uma conta Free tem 1 nascimento a cada 7 dias; o roteiro 4 depende do nascimento do 3. A página diz isso.
- Sem plano turma, não há como medir uso escolar a não ser pelos contatos recebidos.

## Alternativas consideradas

- **Plano turma pago agora:** rejeitado — preço, Stripe e regra de menores não existem; seria promessa sem produto.
- **Roteiros com felinos selvagens ou tigre-branco:** rejeitado — exigem plano Junior. O tigre-branco fica como leitura (artigo do blog).
- **Teste-qui-quadrado com amostras do jogo:** rejeitado — a incubadora mostra a probabilidade exata, não uma amostra; a página não
  sugere uma estatística que o jogo não produz.
