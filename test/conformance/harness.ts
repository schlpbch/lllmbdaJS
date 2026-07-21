/**
 * Finite-oracle conformance harness — checks this interpreter against the
 * paper's *probabilistic* semantics (§B.3's weighted big-step / denotation;
 * the Lean development's `PBigStep`/`peval`/`denotMass`) on programs whose
 * oracle has finite support.
 *
 * The probabilistic semantics assigns each program a **sub-distribution
 * over outcomes**: `recv` is the sole source of nondeterminism, a run's
 * weight is the product of the per-response weights `M.weight(c, r)` along
 * its trace, and runs ending in the same (conversation, result) aggregate
 * by summing weights. This port deliberately tracks no weights in `src/`
 * (ADR-0003) — but that is a statement about the *interpreter*, not about
 * what is testable. For an oracle whose support at every conversation is
 * finite, the full outcome distribution is computable outside the
 * interpreter: enumerate every response choice, replay the (deterministic
 * given its oracle — see oracle.ts) interpreter along each path, and
 * aggregate. Weights live in the vectors and this harness only.
 *
 * What a passing vector means: the interpreter's outcome distribution on
 * that program equals an expectation hand-derived from the paper's rules
 * (each vector cites which). That is regression evidence of conformance on
 * these programs — not a proof of anything (CONSTITUTION.md, Article 2);
 * the semantics' theorems are machine-checked only in the paper's Lean
 * development.
 *
 * Outcome equality notes (deliberate scope limits):
 * - Error outcomes compare by kind (SecurityError vs RuntimeError), never
 *   by message — messages are implementation detail, and this port throws
 *   host exceptions where the Lean semantics returns `.error msg` with a
 *   final conversation, so error outcomes carry no conversation here.
 * - Closures render as `<closure param>` without their captured
 *   environment — don't write vectors whose outcomes differ only in a
 *   closure's environment.
 */
import type { BareValue, Expr, Labeled } from "../../src/ast.js";
import { emptyConversation, runProgram } from "../../src/evaluator.js";
import { RuntimeError, SecurityError } from "../../src/errors.js";
import { BOTTOM, usFactoredLattice, type UsLabel } from "../../src/lattice.js";
import { defaultParse, defaultPrimEval, defaultSerialise, type Model } from "../../src/model.js";
import type { Oracle } from "../../src/oracle.js";
import { buildPrelude } from "../../src/prelude.js";
import { add, eq, leq, mul, ONE, showRat, ZERO, type Rat } from "./rat.js";

// -------------------- the shared model --------------------
// One fixed Model for the whole suite: the paper's running {U,S,E}-powerset
// example with the standard prelude, and the same array-of-tag-strings
// label encoding the existing examples use (see examples/endorse.ts).

export const conformanceModel: Model<UsLabel> = {
  lattice: usFactoredLattice,
  parse: defaultParse,
  serialise: defaultSerialise,
  primEval: defaultPrimEval,
  toLabel: (v) => {
    if (v.kind === "array" && v.items.every((i) => i.value.kind === "string")) {
      return v.items.map((i) => (i.value as { kind: "string"; value: string }).value) as UsLabel;
    }
    return undefined;
  },
  fromLabel: (l) => ({
    kind: "array",
    items: l.map((tag) => ({ label: BOTTOM, value: { kind: "string", value: tag } as BareValue })),
  }),
  preludeSource: buildPrelude(),
};

// -------------------- vectors --------------------

/**
 * The finite-support analog of `PModel.weight` (Probabilistic/Defs.lean):
 * for a given conversation history (and recv index, so a vector can model
 * call-order-dependent behavior the way scriptedOracle does), the complete
 * list of responses with non-zero mass. Weights at each support must sum
 * to ≤ 1 (`PModel.isSubDist`); a sum < 1 models refusal/divergence mass.
 */
export type FiniteSupport = ReadonlyArray<readonly [response: string, weight: Rat]>;
export type FiniteOracle = (history: ReadonlyArray<string>, callIndex: number) => FiniteSupport;

/** A program under a finite-support oracle — enough to enumerate its distribution. */
export interface ConformanceProgram {
  readonly name: string;
  /** Paper rule(s) the expectation is derived from — shown on failure. */
  readonly rule: string;
  readonly program: Expr;
  readonly oracle: FiniteOracle;
}

/** A program plus its expected outcome distribution. */
export interface Vector extends ConformanceProgram {
  readonly expected: ReadonlyArray<readonly [Rat, ExpectedOutcome]>;
}

export const noResponses: FiniteOracle = () => [];

/** A deterministic (recv-free) vector: one outcome with mass 1. */
export function det(name: string, rule: string, program: Expr, outcome: ExpectedOutcome): Vector {
  return { name, rule, program, oracle: noResponses, expected: [[ONE, outcome]] };
}

// -------------------- expected outcomes --------------------

/** Expected labeled value: a label plus a JS-native shape for the bare value. */
export interface EV {
  readonly label: UsLabel;
  readonly bare: EBare;
}
export type EBare =
  | null
  | boolean
  | number
  | string
  | { readonly rec: Readonly<Record<string, EV>> }
  | { readonly arr: ReadonlyArray<EV> };

export const ev = (label: UsLabel, bare: EBare): EV => ({ label, bare });

export type ExpectedOutcome =
  | {
      readonly kind: "ok";
      readonly value: EV;
      readonly convLabel: UsLabel;
      readonly history: ReadonlyArray<string>;
    }
  | { readonly kind: "security" }
  | { readonly kind: "runtime" };

/** Successful outcome; conversation defaults to unchanged-empty (⊥ label, no history). */
export function ok(value: EV, conv?: { label?: UsLabel; history?: ReadonlyArray<string> }): ExpectedOutcome {
  return { kind: "ok", value, convLabel: conv?.label ?? BOTTOM, history: conv?.history ?? [] };
}
export const security: ExpectedOutcome = { kind: "security" };
export const runtime: ExpectedOutcome = { kind: "runtime" };

// -------------------- canonical outcome rendering --------------------
// Actual and expected outcomes both render to one canonical string; the
// distribution is a Map from that string to a mass. The rendering includes
// every label, however deeply nested, plus the final conversation label and
// history — anything the semantics distinguishes, the key must distinguish.

function evToLabeled(e: EV): Labeled<UsLabel> {
  return { label: e.label, value: evToBare(e.bare) };
}
function evToBare(b: EBare): BareValue {
  if (b === null) return { kind: "null" };
  if (typeof b === "boolean") return { kind: "bool", value: b };
  if (typeof b === "number") return { kind: "number", value: b };
  if (typeof b === "string") return { kind: "string", value: b };
  if ("rec" in b) {
    return {
      kind: "record",
      fields: new Map(Object.entries(b.rec).map(([k, f]) => [k, evToLabeled(f)])),
    };
  }
  return { kind: "array", items: b.arr.map(evToLabeled) };
}

/**
 * Labels equal under the lattice must render identically: the UsLabel
 * representation is a tag *array* whose order is not canonical (e.g. the
 * exported `US` constant is ["U","S"] while `join` normalizes to sorted
 * ["S","U"]) — joining with ⊥ routes every label through `norm` first.
 */
function showLabel(l: UsLabel): string {
  return usFactoredLattice.show(usFactoredLattice.join(l, BOTTOM));
}

function renderValue(v: Labeled<unknown>): string {
  const lv = v as Labeled<UsLabel>;
  return `${showLabel(lv.label)}:${renderBare(lv.value)}`;
}
function renderBare(b: BareValue): string {
  switch (b.kind) {
    case "null":
      return "null";
    case "bool":
    case "number":
      return String(b.value);
    case "string":
      return JSON.stringify(b.value);
    case "closure":
      return `<closure ${b.param}>`;
    case "record": {
      const parts = [...b.fields.entries()]
        .sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0))
        .map(([k, f]) => `${JSON.stringify(k)}: ${renderValue(f)}`);
      return `{${parts.join(", ")}}`;
    }
    case "array":
      return `[${b.items.map(renderValue).join(", ")}]`;
  }
}

function okKey(value: Labeled<unknown>, convLabel: UsLabel, history: ReadonlyArray<string>): string {
  return `ok ${renderValue(value)} | conv ${showLabel(convLabel)} ${JSON.stringify(history)}`;
}

function expectedKey(o: ExpectedOutcome): string {
  if (o.kind === "security") return "SecurityError";
  if (o.kind === "runtime") return "RuntimeError";
  return okKey(evToLabeled(o.value), o.convLabel, o.history);
}

// -------------------- enumeration --------------------

/**
 * Control-flow signal, not an error: the probe oracle throws this when the
 * run reaches a recv beyond the scripted prefix, so the enumerator learns
 * which (history, callIndex) to branch on. evaluate() catches nothing, so
 * this propagates cleanly out of runProgram.
 */
class NeedChoice extends Error {
  constructor(
    readonly history: ReadonlyArray<string>,
    readonly callIndex: number,
  ) {
    super("conformance probe: unscripted recv reached");
  }
}

function validateSupport(name: string, support: FiniteSupport): void {
  const seen = new Set<string>();
  let total = ZERO;
  for (const [r, w] of support) {
    if (seen.has(r)) throw new Error(`${name}: duplicate response in support: ${JSON.stringify(r)}`);
    seen.add(r);
    if (w.num === 0n) throw new Error(`${name}: zero-weight response in support: ${JSON.stringify(r)}`);
    total = add(total, w);
  }
  if (!leq(total, ONE)) {
    throw new Error(
      `${name}: support weights sum to ${showRat(total)} > 1 — not a sub-distribution (PModel.isSubDist)`,
    );
  }
}

/**
 * Compute the program's full outcome distribution by exhaustive
 * enumeration: depth-first over response choices, replaying the run from
 * scratch with each extended prefix (the interpreter is deterministic
 * given its oracle, so replays are exact). Verifies the sub-distribution
 * invariant on every support and on the total outcome mass (§B.3:
 * denotation mass ≤ 1). `maxDepth` bounds the number of recvs per path —
 * exceeding it means the vector's response tree isn't finite, which is a
 * vector bug, not a semantics result.
 */
export async function enumerate(p: ConformanceProgram, maxDepth = 12): Promise<Map<string, Rat>> {
  const dist = new Map<string, Rat>();
  const addMass = (key: string, mass: Rat): void => {
    dist.set(key, add(dist.get(key) ?? ZERO, mass));
  };

  const explore = async (prefix: ReadonlyArray<readonly [string, Rat]>): Promise<void> => {
    const probe: Oracle = {
      async respond(history, callIndex) {
        if (callIndex < prefix.length) return prefix[callIndex]![0];
        throw new NeedChoice(history, callIndex);
      },
    };
    const pathMass = prefix.reduce((acc, [, w]) => mul(acc, w), ONE);
    try {
      const result = await runProgram(
        conformanceModel,
        probe,
        usFactoredLattice.bottom,
        emptyConversation(usFactoredLattice.bottom),
        p.program,
      );
      addMass(okKey(result.value, result.conv.label, result.conv.history), pathMass);
    } catch (e) {
      if (e instanceof NeedChoice) {
        if (prefix.length >= maxDepth) {
          throw new Error(
            `${p.name}: recv depth exceeded ${maxDepth} — the vector's response tree must be finite`,
          );
        }
        const support = p.oracle(e.history, e.callIndex);
        validateSupport(p.name, support);
        for (const branch of support) await explore([...prefix, branch]);
      } else if (e instanceof SecurityError) {
        addMass("SecurityError", pathMass);
      } else if (e instanceof RuntimeError) {
        addMass("RuntimeError", pathMass);
      } else {
        throw e;
      }
    }
  };

  await explore([]);
  const total = [...dist.values()].reduce(add, ZERO);
  if (!leq(total, ONE)) {
    throw new Error(`${p.name}: total outcome mass ${showRat(total)} > 1 — harness or support bug`);
  }
  return dist;
}

// -------------------- checks --------------------

function renderDist(d: ReadonlyMap<string, Rat>): string {
  const lines = [...d.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, m]) => `    ${showRat(m)}  ${k}`);
  return lines.length > 0 ? lines.join("\n") : "    (no outcomes — all mass refused)";
}

/** Enumerate the vector and require its distribution to equal `expected` exactly. */
export async function checkVector(vec: Vector, maxDepth?: number): Promise<void> {
  const actual = await enumerate(vec, maxDepth);
  const expected = new Map<string, Rat>();
  for (const [mass, o] of vec.expected) {
    const key = expectedKey(o);
    if (expected.has(key)) throw new Error(`${vec.name}: duplicate expected outcome: ${key}`);
    expected.set(key, mass);
  }
  const problems: string[] = [];
  for (const [key, mass] of expected) {
    const a = actual.get(key);
    if (a === undefined) problems.push(`missing outcome (expected mass ${showRat(mass)}): ${key}`);
    else if (!eq(a, mass)) problems.push(`mass mismatch (expected ${showRat(mass)}, got ${showRat(a)}): ${key}`);
  }
  for (const [key, mass] of actual) {
    if (!expected.has(key)) problems.push(`unexpected outcome (mass ${showRat(mass)}): ${key}`);
  }
  if (problems.length > 0) {
    throw new Error(
      `${vec.name} [${vec.rule}]\n  ${problems.join("\n  ")}\n  actual distribution:\n${renderDist(actual)}`,
    );
  }
}

/** A pair of programs whose outcome distributions must (or must not) coincide. */
export interface PairCheck {
  readonly name: string;
  readonly rule: string;
  readonly a: ConformanceProgram;
  readonly b: ConformanceProgram;
  readonly expectEqual: boolean;
}

/**
 * Enumerate both programs and compare their full distributions. With
 * `expectEqual: true` this is a finite, TIPNI-flavored regression: two
 * runs differing only in a high-labeled input must induce identical
 * outcome distributions. Evidence on these programs — the theorem itself
 * is established only in the paper's Lean development. `expectEqual:
 * false` cases exist to demonstrate the comparator detects distributional
 * differences (so the equal cases mean something).
 */
export async function checkPair(pair: PairCheck): Promise<void> {
  const da = await enumerate(pair.a);
  const db = await enumerate(pair.b);
  const keys = new Set([...da.keys(), ...db.keys()]);
  let equal = da.size === db.size;
  for (const k of keys) {
    const ma = da.get(k);
    const mb = db.get(k);
    if (ma === undefined || mb === undefined || !eq(ma, mb)) equal = false;
  }
  if (equal !== pair.expectEqual) {
    throw new Error(
      `${pair.name} [${pair.rule}]: distributions ${equal ? "coincide" : "differ"}, expected them ${
        pair.expectEqual ? "to coincide" : "to differ"
      }\n  ${pair.a.name}:\n${renderDist(da)}\n  ${pair.b.name}:\n${renderDist(db)}`,
    );
  }
}
