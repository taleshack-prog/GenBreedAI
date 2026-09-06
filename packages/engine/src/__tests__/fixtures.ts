/**
 * Fixtures dos 4 arcos do TDD §4.5 (Gene-Bank). Loci B/K/M/H/S/A + QTL.
 * Decisões de ambiguidade nos ADRs 0001–0004.
 */
import type { Genotype, Pedigree } from "../index";
const QTL = { porte: 0.5, vigor: 0.5, beleza: 0.5, temperamento: 0.5 };

// ── Goldendoodle (Golden × Poodle) — F1 100% ondulado; cor segrega. ADR-0001 ──
export const GOLDEN_RETRIEVER: Genotype = { loci: { F: ["f","f"], C: ["C","c^ch"], E: ["E","E"], K: ["k^y","k^y"], B: ["B","B"] }, qtl: QTL };
export const POODLE: Genotype = { loci: { F: ["F","F"], C: ["c^ch","c^ch"], E: ["e","e"], K: ["k^y","k^y"], B: ["B","b"] }, qtl: QTL };
export const GOLDENDOODLE_PEDIGREE: Pedigree = { golden: { id: "golden", sire: null, dam: null }, poodle: { id: "poodle", sire: null, dam: null } };

// ── Boerpointer F2 (Alpha × Beta, irmãos completos) → F=0.25, 3:1 ──
export const BOERBOEL: Genotype = { loci: { B: ["B","B"], K: ["K^br","K^br"], A: ["A^y","A^y"], E: ["E","E"], R: ["r","r"], S: ["S","S"] }, qtl: QTL };
export const BRACO_ALEMAO: Genotype = { loci: { B: ["b","b"], K: ["k^y","k^y"], A: ["a","a"], E: ["E","e"], R: ["R","R"], S: ["s^p","s^p"] }, qtl: QTL };
export const BOERPOINTER_F1: Genotype = { loci: { B: ["B","b"], K: ["K^br","k^y"], A: ["A^y","a"], E: ["E","e"], R: ["R","r"], S: ["S","s^p"] }, qtl: QTL };
export const BOERPOINTER_PEDIGREE: Pedigree = { boerboel: { id: "boerboel", sire: null, dam: null }, braco: { id: "braco", sire: null, dam: null }, alpha: { id: "alpha", sire: "boerboel", dam: "braco" }, beta: { id: "beta", sire: "boerboel", dam: "braco" } };

// ── Danecollie F3 (Omega II × Beta) → m/m 25%; M/M letal; Harlequin ──
export const OMEGA_II: Genotype = { loci: { H: ["H","h"], M: ["M","m"], A: ["a^t","a"], S: ["S","s^p"] }, qtl: QTL };
export const DANECOLLIE_BETA: Genotype = { loci: { H: ["h","h"], M: ["M","m"], A: ["a","a"], S: ["S","s^p"] }, qtl: QTL };
export const DANECOLLIE_PEDIGREE: Pedigree = { dogue: { id: "dogue", sire: null, dam: null }, collie: { id: "collie", sire: null, dam: null }, gamma: { id: "gamma", sire: "dogue", dam: "collie" }, omega1: { id: "omega1", sire: "dogue", dam: "collie" }, omegaII: { id: "omegaII", sire: "gamma", dam: "omega1" }, beta: { id: "beta", sire: "dogue", dam: "collie" } };

// ── Pumajaguar BC1 (Delta × Onça Negra) → F=0.25; melanismo A dominante ──
export const ONCA_PARDA: Genotype = { loci: { A: ["a","a"] }, qtl: { porte: 0.6, vigor: 0.6, beleza: 0.5, rosetas: 0.3 } };
export const ONCA_NEGRA: Genotype = { loci: { A: ["A","a"] }, qtl: { porte: 0.7, vigor: 0.6, beleza: 0.6, rosetas: 0.7 } };
export const DELTA_F1: Genotype = { loci: { A: ["A","a"] }, qtl: { porte: 0.65, vigor: 0.6, beleza: 0.55, rosetas: 0.5 } };
export const PUMAJAGUAR_PEDIGREE: Pedigree = { puma: { id: "puma", sire: null, dam: null }, negra: { id: "negra", sire: null, dam: null }, delta: { id: "delta", sire: "puma", dam: "negra" } };
