# Errata da Fase 0 — Correções nos documentos-fonte

**Projeto:** GenBreedAI · Hack Tech Farm
**Base:** parecer `docs/audit/fase0-audit.md` e ADRs 0001–0004
**Data:** 2026-09-05 · **Aplica-se a:** `docs/TDD-GenBreedAI.md`, `docs/Gene-Bank.md`

Este documento registra formalmente as correções textuais que os documentos-fonte
devem receber. O **motor já implementa o comportamento correto**; a errata fecha
o débito editorial para que os textos parem de contradizer o código e a ciência.

Convenção: ~~texto atual (incorreto)~~ → **texto corrigido** · *(justificativa)*.

---

## E1 — TDD §4.5, arco Pumajaguar BC1: coluna "IF ≈ 0.03" (severidade CRÍTICA)

- ~~`IF ≈ 0.03`~~ → **`IF ≥ 0.30` (≈ 0.36 para prole heterozigota Aa)**
- *Justificativa (ADR-0004):* pela fórmula do próprio TDD §4.3,
  `G_pedigree = min(1, F_pedigree/0.25) = 1.0` quando `F_pedigree = 0.25`; o peso
  `0.3·G_pedigree = 0.30` já garante `IF ≥ 0.30`. O valor `0.03` é o `F` narrativo
  do Gene-Bank §5.3 vazado para a coluna do IF. Manter `F_pedigree = 0.25`.
- *Observação de aura:* com `IF ≈ 0.36` a BC1 fica em **Aura ★★** ("início de
  segregação"), não em ★. Ajustar qualquer material de marketing/onboarding que
  cite ★ para a BC1.

---

## E2 — Gene-Bank §3.7 e §5.11: coeficientes `F` narrativos (severidade MAIOR)

| Cruzamento | ~~F narrativo (atual)~~ | **F de Wright real (corrigido)** |
|---|---|---|
| F2 (irmãos completos) — Boerpointer/Pumajaguar | ~~0.10~~ | **0.25** |
| BC1 (retrocruzamento ao progenitor) — Pumajaguar | ~~0.03~~ | **0.25** |

- *Justificativa (ADR-0002):* prole de irmãos completos e prole de
  retrocruzamento pai×filho(a) têm `F = 0.25` (Wright 1922; Falconer & Mackay
  1996). Os valores 0.10/0.03 não correspondem ao coeficiente de endogamia de
  Wright.
- *Ação editorial:* onde o Gene-Bank exibir esses `F`, adicionar nota:
  "Valor ilustrativo de acúmulo de homozigose percebida; o coeficiente de
  endogamia de Wright real é 0.25 (ver motor)." As demais etapas do arco
  (line-breeding, inbreeding, outcross, consolidação) devem ter seus `F`
  recalculados pelo pedigree real na Fase 1 (visualizador de linhagem).

---

## E3 — Gene-Bank §2.2/§2.3 e §2.4: "Creme Cacheada (F/F)" na F1 (severidade MAIOR)

- ~~Variação 2 F1 = "Creme **Cacheada**" (textura `F/F`)~~ →
  **Variação 2 F1 = "Creme **Ondulada**" (textura `F/f`)**
- *Justificativa (ADR-0001):* de `Golden f/f × Poodle F/F`, **toda** a F1 é `F/f`
  (ondulado). O genótipo `F/F` (cacheado) só reaparece na **F2**. A diferença
  documentada entre as duas variações F1 é **cromática** (Dourada × Creme), não de
  textura.
- *Ação editorial:* renomear a Variação 2 e mover a demonstração do fenótipo
  "cacheado `F/F`" para uma seção **F2** do Goldendoodle (a criar), preservando o
  valor pedagógico ("o cacheado ressurge na F2").

---

## E4 — TDD §4.5, arco Danecollie: "recombinantes Tau e Phi" (severidade MENOR)

- ~~Tau e Phi apresentados como recombinantes **do arco F3**~~ →
  **Tau e Phi são indivíduos **F2** (Gamma × Omega); na F3 eles reaparecem como
  *classes* recombinantes com probabilidade conjunta `Tau = 0.125`, `Phi = 0.0625`.**
- *Justificativa (ADR-0003):* no Gene-Bank §4.3, Tau e Phi são registros da F2. O
  requisito real do arco F3 é o reaparecimento de `m/m` em 25%. O motor calcula as
  probabilidades das classes recombinantes exatamente.

---

## E5 — Gene-Bank §4 e TDD §4.1: letalidade de `M/M` (severidade MENOR — reforço)

- **Adicionar nota explícita:** "O genótipo `M/M` (duplo-merle) é **letal**
  (mortalidade embrionária); nunca aparece como espécime viável. Em `M/m × M/m`, a
  razão de nascidos vivos é `2 M/m : 1 m/m` (o quarto `M/M` é perdido)."
- *Justificativa:* o motor já marca `M/M` como `viable = false` (`expressPhenotype`);
  o texto deve deixar claro o efeito na proporção de nascidos vivos.

---

## Rastreabilidade

| Errata | Achado (auditoria) | ADR | Trava no motor/teste |
|---|---|---|---|
| E1 | A2 (crítica) | 0004 | `pumajaguar.test.ts` → `IF ≥ 0.30` |
| E2 | A1 (maior) | 0002 | `wright.ts` + golden `F_ped = 0.25` |
| E3 | A3 (maior) | 0001 | `goldendoodle.test.ts` → 100% ondulado |
| E4 | A5 (menor) | 0003 | `danecollie.test.ts` → Tau/Phi exatos |
| E5 | A6 (menor) | — | `danecollie.test.ts` → `M/M` inviável |

> Estas correções são **textuais** e não alteram o código: o motor da Fase 0 já
> reflete o comportamento correto. Aplicá-las aos `.docx/.odt` originais é tarefa
> editorial do time de conteúdo; os arquivos em `docs/` desta base seguem como
> cópia de trabalho anotada.
