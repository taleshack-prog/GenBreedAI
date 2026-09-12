/**
 * Coeficiente de endogamia de Wright F_X (TDD §4.2).
 *
 *   F_X = Σ_A (1/2)^(n1+n2+1) × (1 + F_A)
 *
 * Implementado pelo método recursivo de coancestria (equivalente ao método dos
 * caminhos, porém numericamente estável e memoizado). Para uma prole de pai
 * `sire` e mãe `dam`:  F_prole = f(sire, dam)  (coeficiente de parentesco entre
 * os pais). Fundadores são não-endogâmicos e não-aparentados entre si.
 *
 * Referência: Wright (1922); Falconer & Mackay (1996).
 */

import type { Pedigree } from "./types";

/**
 * Coeficiente de parentesco (kinship / coancestria) f(a,b) sob um pedigree.
 * f(a,a) = ½(1 + F_a). Fundadores distintos: f = 0.
 */
export function kinship(ped: Pedigree, a: string | null, b: string | null): number {
  const depthMemo = new Map<string, number>();
  const kinMemo = new Map<string, number>();

  function depth(x: string | null): number {
    if (x === null) return -1;
    if (depthMemo.has(x)) return depthMemo.get(x)!;
    const n = ped[x];
    const d = n && (n.sire || n.dam) ? 1 + Math.max(depth(n?.sire ?? null), depth(n?.dam ?? null)) : 0;
    depthMemo.set(x, d);
    return d;
  }

  function inbreeding(x: string): number {
    const n = ped[x];
    if (n && n.sire && n.dam) return f(n.sire, n.dam);
    return 0;
  }

  function f(x: string | null, y: string | null): number {
    if (x === null || y === null) return 0;
    if (x === y) return 0.5 * (1 + inbreeding(x));

    const key = x < y ? `${x}::${y}` : `${y}::${x}`;
    const cached = kinMemo.get(key);
    if (cached !== undefined) return cached;

    // Expande o indivíduo mais recente (maior profundidade) que tenha pais.
    let hi: string, lo: string;
    if (depth(x) >= depth(y)) {
      hi = x;
      lo = y;
    } else {
      hi = y;
      lo = x;
    }
    const hn = ped[hi];
    let result: number;
    if (!hn || (!hn.sire && !hn.dam)) {
      // `hi` é fundador; tenta expandir `lo`.
      const ln = ped[lo];
      if (!ln || (!ln.sire && !ln.dam)) {
        result = 0; // dois fundadores distintos
      } else {
        result = 0.5 * (f(ln.sire, hi) + f(ln.dam, hi));
      }
    } else {
      result = 0.5 * (f(hn.sire, lo) + f(hn.dam, lo));
    }
    kinMemo.set(key, result);
    return result;
  }

  return f(a, b);
}

/**
 * F de Wright de uma prole cujos pais são `sireId` e `damId` no pedigree.
 * Equivale ao parentesco entre os pais.
 */
export function wrightF(ped: Pedigree, sireId: string, damId: string): number {
  return kinship(ped, sireId, damId);
}

/**
 * Estatística F de déficit de heterozigose local (TDD §4.2): F = 1 − H_obs/H_exp.
 * @param hObs heterozigose observada [0,1]
 * @param hExp heterozigose esperada sob Hardy-Weinberg [0,1]
 */
export function fStatistic(hObs: number, hExp: number): number {
  if (hExp === 0) return 0;
  return 1 - hObs / hExp;
}

/** Contribuição de um caminho de endogamia por ancestral comum. */
export interface WrightPath {
  ancestor: string; n1: number; n2: number; fAncestor: number; contribution: number;
}
export interface WrightExplanation {
  total: number;
  paths: WrightPath[];
  note: string;
}

/** Todos os caminhos simples de `start` até cada ancestral (sequências de ids). */
function ancestorPaths(ped: Pedigree, start: string | null): Map<string, string[][]> {
  const out = new Map<string, string[][]>();
  function walk(node: string | null, path: string[]) {
    if (!node) return;
    const acc = [...path, node];
    if (!out.has(node)) out.set(node, []);
    out.get(node)!.push(acc);
    const n = ped[node];
    if (n?.sire) walk(n.sire, acc);
    if (n?.dam) walk(n.dam, acc);
  }
  walk(start, []);
  return out;
}

/**
 * Decompõe F_X = Σ_A (1/2)^(n1+n2+1) × (1+F_A) pelo MÉTODO DOS CAMINHOS (TDD §4.2),
 * listando cada ancestral comum e sua contribuição. Só conta pares de caminhos
 * (pai→A, mãe→A) que não compartilham indivíduos além de A (caminhos válidos).
 */
export function explainWrightF(ped: Pedigree, sireId: string, damId: string): WrightExplanation {
  const fromSire = ancestorPaths(ped, sireId);
  const fromDam = ancestorPaths(ped, damId);
  const paths: WrightPath[] = [];
  let total = 0;

  const common = [...fromSire.keys()].filter((a) => fromDam.has(a));
  for (const A of common) {
    const fA = (() => { const n = ped[A]; return n?.sire && n?.dam ? kinship(ped, n.sire, n.dam) : 0; })();
    for (const ps of fromSire.get(A)!) {
      for (const pd of fromDam.get(A)!) {
        // caminhos válidos: só compartilham o ancestral A (nenhum outro indivíduo).
        const setS = new Set(ps.slice(0, -1));
        if (pd.slice(0, -1).some((x) => setS.has(x))) continue;
        const n1 = ps.length - 1, n2 = pd.length - 1;
        const contribution = Math.pow(0.5, n1 + n2 + 1) * (1 + fA);
        total += contribution;
        paths.push({ ancestor: A, n1, n2, fAncestor: fA, contribution });
      }
    }
  }
  paths.sort((a, b) => b.contribution - a.contribution);
  return {
    total: Number(total.toFixed(6)),
    paths,
    note: common.length === 0
      ? "Sem ancestral comum entre os pais → F = 0 (não endogâmico)."
      : `F = Σ (½)^(n1+n2+1)·(1+F_ancestral) sobre ${paths.length} caminho(s) por ${new Set(paths.map((p) => p.ancestor)).size} ancestral(is) comum(ns).`,
  };
}
