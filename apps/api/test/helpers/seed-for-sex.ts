/**
 * Helper de TESTE (nunca golden): acha a primeira seed determinística que
 * produz um filho do sexo pedido, tentando `${base}-0`, `${base}-1`, ...
 * `${base}-(max-1)` em ordem — pra testes de 2ª geração que precisam de um
 * sexo específico no filho (ex.: F1 fêmea pra servir de dam num BC1, ou F1
 * macho pra servir de sire) sem fixar manualmente "na mão" qual seed acerta.
 *
 * NUNCA usar em `packages/engine/src/__tests__/golden/` — lá a seed é parte
 * do contrato documentado (ADR), nunca escolhida por tentativa e erro.
 */
export async function firstSeedWithSex(
  run: (seed: string) => Promise<{ specimen: { sex: "M" | "F" } }>,
  sex: "M" | "F",
  base: string,
  max = 50,
): Promise<string> {
  for (let i = 0; i < max; i++) {
    const seed = `${base}-${i}`;
    const result = await run(seed);
    if (result.specimen.sex === sex) return seed;
  }
  throw new Error(`firstSeedWithSex: nenhuma seed "${base}-0".."${base}-${max - 1}" produziu filho ${sex}.`);
}
