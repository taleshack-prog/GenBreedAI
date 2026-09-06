# ADR-0010 — Extensão da genética felina (completa o TDD)

- **Status:** aceito · **Data:** 2026-09-06

## Contexto
O TDD/Gene-Bank só documentava o loco A (melanismo) para felinos (arco
Pumajaguar). Tales pediu um catálogo felino completo (onças, puma, tigres,
leopardo, guepardo, leão, serval, jaguatirica, gato doméstico + raças) e
autorizou completar o TDD onde ele estava incompleto.

## Decisão
Autorar `docs/gene-bank/felinos-genetica.md` como fonte de verdade, com loci
REAIS de felídeos (não inventados): A (melanismo), P (padrão/Taqpep:
rosetas/listras/pintas/uniforme), B (TYRP1), C (série albino/TYR, inclui pontos
e albino), D (diluição/MLPH), W (branco dominante/KIT), S (manchas/KIT).
Implementado em FELINE_PACK. O loco A mantém o significado do arco Pumajaguar →
os 4 golden tests do TDD §4.5 continuam válidos (33 testes verdes).

## Consequências
- Free intraespécie fica rico: cada espécie felina cruza dentro de si; onça-negra
  é Panthera onca melanística (mesma espécie da pintada) → Free segrega melanismo.
- Gato doméstico (felis-catus) é a espécie com variedade em todos os loci.
- Anti-P2W, determinismo e Haldane inalterados.
