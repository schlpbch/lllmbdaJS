/**
 * Exact non-negative rational arithmetic for probability masses.
 *
 * The Lean development's weights are NNReal (Probabilistic/Defs.lean);
 * every weight a *finite-support* conformance vector can express is a
 * non-negative rational, and finite products/sums of rationals stay
 * rational — so distribution comparison can be literal equality on
 * canonical forms, never a floating-point tolerance. (This is a harness
 * type only; per ADR-0003 no weight of any kind enters src/.)
 */

export interface Rat {
  /** Numerator, ≥ 0. */
  readonly num: bigint;
  /** Denominator, > 0; gcd(num, den) = 1, so equality is structural. */
  readonly den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

export function rat(num: bigint | number, den: bigint | number = 1n): Rat {
  let n = BigInt(num);
  let d = BigInt(den);
  if (d === 0n) throw new Error("rat: zero denominator");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  if (n < 0n) throw new Error("rat: probability masses cannot be negative");
  const g = n === 0n ? d : gcd(n, d);
  return { num: n / g, den: d / g };
}

export const ZERO: Rat = rat(0);
export const ONE: Rat = rat(1);

export const mul = (a: Rat, b: Rat): Rat => rat(a.num * b.num, a.den * b.den);
export const add = (a: Rat, b: Rat): Rat => rat(a.num * b.den + b.num * a.den, a.den * b.den);
/** Structural equality — exact, because construction always reduces to canonical form. */
export const eq = (a: Rat, b: Rat): boolean => a.num === b.num && a.den === b.den;
export const leq = (a: Rat, b: Rat): boolean => a.num * b.den <= b.num * a.den;
export const showRat = (a: Rat): string => (a.den === 1n ? `${a.num}` : `${a.num}/${a.den}`);
