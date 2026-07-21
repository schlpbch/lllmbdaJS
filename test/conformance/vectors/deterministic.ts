/**
 * Deterministic conformance vectors — programs with no recv, so the
 * probabilistic semantics assigns a single outcome with mass 1 (every
 * pure rule contributes weight 1 and an empty trace; §B.3). Adapted from
 * the Lean development's TestComprehensive phases 1–5, 7, 13, 16–17, 19,
 * restricted to constructs this port's surface actually has (no parser,
 * no string interpolation, no &&/||/not — see ast.ts's Expr/BinOp).
 *
 * Every expected outcome is hand-derived from the cited paper rule.
 * Where this port knowingly diverges (JS float instead of Rat, so no
 * `Rat.num` fractional-index behavior), the vector asserts the
 * *documented* divergent behavior and says so (Article 4).
 */
import {
  app,
  array,
  binop,
  bool,
  endorse,
  field,
  ifThenElse,
  index,
  labelAssert,
  labelDyn,
  labelLit,
  labelTest,
  lam,
  letIn,
  num,
  prim,
  record,
  str,
  v,
} from "../../../src/ast.js";
import { BOTTOM, S, U, US } from "../../../src/lattice.js";
import { tagArray } from "../../../src/prelude.js";
import { det, ev, ok, runtime, security, type Vector } from "../harness.js";

const emptyRec = ev(BOTTOM, { rec: {} });

export const deterministicVectors: ReadonlyArray<Vector> = [
  // ---- scalars and binops (§B.1 scalar rule + prim "binop_⊕" encoding) ----
  det("scalar literal", "§B.1 ⇓-Scalar", num(42), ok(ev(BOTTOM, 42))),
  det("arithmetic precedence", "§B.1 binop encoding", binop("+", num(2), binop("*", num(3), num(4))), ok(ev(BOTTOM, 14))),
  det("negative result", "§B.1 binop_sub", binop("-", num(5), num(10)), ok(ev(BOTTOM, -5))),
  det("division", "§B.1 binop_div", binop("/", num(15), num(5)), ok(ev(BOTTOM, 3))),
  det("modulo", "§B.1 binop_mod", binop("%", num(15), num(4)), ok(ev(BOTTOM, 3))),
  det("string concatenation", "§B.1 binop_add on strings", binop("+", str("foo"), str("bar")), ok(ev(BOTTOM, "foobar"))),
  det("comparison", "§B.1 binop_lt", binop("<", num(3), num(5)), ok(ev(BOTTOM, true))),
  det("cross-type equality is false", "§B.1 binop_eq", binop("==", num(1), str("1")), ok(ev(BOTTOM, false))),
  det("neq derived form", "§B.1 e1≠e2 ≜ if(e1=e2)…", binop("!=", num(3), num(3)), ok(ev(BOTTOM, false))),
  det("binop type fault", "§B.1 primEval fault ⇒ RuntimeError", binop("+", num(1), record([])), runtime),

  // ---- records and arrays (§B.1) ----
  det(
    "record duplicate field: first wins",
    "§B.1 lookup(f, f⃗) — first occurrence shadows",
    field(record([["x", num(1)], ["x", num(2)]]), "x"),
    ok(ev(BOTTOM, 1)),
  ),
  det("field access on non-record", "§B.1 ⇓-FieldAccess fault", field(num(1), "x"), runtime),
  det("missing field", "§B.1 lookup fault", field(record([["x", num(1)]]), "y"), runtime),
  det("array index", "§B.1 ⇓-ArrayIndex", index(array([num(10), num(20)]), num(1)), ok(ev(BOTTOM, 20))),
  det("array index out of bounds", "§B.1 ⇓-ArrayIndex fault", index(array([num(1)]), num(3)), runtime),
  det(
    "non-integer index rejected",
    "documented divergence from §B.1 Rat.num (ADR: JS float, no rational type)",
    index(array([num(1)]), num(0.5)),
    runtime,
  ),
  det(
    "index joins array, index, and element labels",
    "§B.1 ⇓-ArrayIndex; §3.2 ⇓-Labelled",
    index(labelLit(U, array([labelLit(S, num(7))])), num(0)),
    ok(ev(US, 7)),
  ),

  // ---- closures, let, if (§3.1; §B.1 derived forms) ----
  det("identity application", "§3.1 ⇓-App", app(lam("x", v("x")), num(42)), ok(ev(BOTTOM, 42))),
  det(
    "closure captures its definition scope",
    "§3.1 ⇓-Lam/⇓-App (environment port of substitution, ADR-0001)",
    letIn(
      "x",
      num(10),
      letIn("f", lam("y", binop("+", v("x"), v("y"))), letIn("x", num(99), app(v("f"), num(5)))),
    ),
    ok(ev(BOTTOM, 15)),
  ),
  det("application of non-function", "§3.1 ⇓-App fault", app(num(1), num(2)), runtime),
  det("if on non-boolean", "§B.1 ite encoding fault", ifThenElse(num(1), num(2), num(3)), runtime),
  det(
    "tainted closure runs its body at the closure's label",
    "§3.1 ⇓-App — body evaluates at the closure's label, not the caller's pc",
    app(labelLit(U, lam("x", v("x"))), num(1)),
    ok(ev(U, 1)),
  ),
  det(
    "condition label taints the taken branch",
    "§B.1 ite — branch runs at pc ⊔ ℓ(cond)",
    ifThenElse(labelLit(U, bool(true)), num(1), num(2)),
    ok(ev(U, 1)),
  ),

  // ---- label propagation (§3.2, §3.3; TestComprehensive Phase 16 analogs) ----
  det("nested labels join", "§3.2 ⇓-Labelled", labelLit(U, labelLit(S, num(3))), ok(ev(US, 3))),
  det(
    "binop joins operand labels",
    "§B.1 binop — result at pc ⊔ ℓ(e1) ⊔ ℓ(e2)",
    binop("+", labelLit(U, num(1)), labelLit(S, num(2))),
    ok(ev(US, 3)),
  ),
  det("dynamic label raises pc for the body", "§3.2 ⇓-LabelFlow", labelDyn(tagArray(["U"]), num(5)), ok(ev(U, 5))),
  det("dynamic label with non-label value", "§3.2 ⇓-LabelFlow fault", labelDyn(num(3), num(5)), runtime),
  det(
    "labelTest true, stamped with the threshold",
    "§3.4 ⇓-LabelTest — result label is pc ⊔ n ⊔ l (the policy), not the data's label",
    labelTest(tagArray(["U", "S"]), labelLit(U, num(1))),
    ok(ev(US, true)),
  ),
  det(
    "labelTest false stays public for a ⊥ threshold",
    "§3.4 ⇓-LabelTest",
    labelTest(tagArray([]), labelLit(U, num(1))),
    ok(ev(BOTTOM, false)),
  ),
  det(
    "assert success returns pc-labeled {}",
    "§3.2 ⇓-LabelAssert",
    labelAssert(tagArray(["U"]), labelLit(U, num(1))),
    ok(emptyRec),
  ),
  det(
    "assert failure is a security refusal",
    "§3.2 ⇓-LabelAssert — ℓ(V) ⋢ l",
    labelAssert(tagArray([]), labelLit(U, num(1))),
    security,
  ),
  det(
    "assert with policy tainted above pc",
    "§3.2 ⇓-LabelAssert — n ⊑ pc side condition",
    labelAssert(labelLit(S, tagArray(["U"])), num(1)),
    security,
  ),

  // ---- endorse (§5.2; the paper's §6.3/Lean Phase 19 probes T1–T6) ----
  det("T1: endorse washes {U} to {}", "§5.2 ⇓-Endorse", endorse(tagArray([]), labelLit(U, str("untrusted"))), ok(ev(BOTTOM, "untrusted"))),
  det(
    "T2: endorse cannot declassify {S}",
    "§5.2 ⇓-Endorse — confidentiality comes from the value's own label (Insulated TIPNI is about this)",
    endorse(tagArray([]), labelLit(S, str("password"))),
    ok(ev(S, "password")),
  ),
  det(
    "T3: pc-taint propagates through endorse",
    "§5.2 ⇓-Endorse — result joins pc",
    ifThenElse(labelLit(U, bool(true)), endorse(tagArray([]), str("x")), str("skip")),
    ok(ev(U, "x")),
  ),
  det(
    "T4: endorse changes labels, not content",
    "§5.2 ⇓-Endorse",
    binop("*", endorse(tagArray([]), labelLit(U, num(42))), num(2)),
    ok(ev(BOTTOM, 84)),
  ),
  det("T5: invalid endorse target", "§5.2 ⇓-Endorse — M.toLabel = none", endorse(str("not a label"), labelLit(U, str("d"))), runtime),
  det(
    "T6: endorse unblocks a subsequent flow test",
    "§5.2 ⇓-Endorse + §3.4 ⇓-LabelTest",
    letIn(
      "vv",
      labelLit(U, str("x")),
      letIn(
        "w",
        endorse(tagArray([]), v("vv")),
        ifThenElse(labelTest(tagArray(["S"]), v("w")), str("accepted"), str("rejected")),
      ),
    ),
    ok(ev(S, "accepted")),
  ),

  // ---- primitives (§3.3/§B.1 ⇓-Prim: strip, primEval, wrapValues, pc ⊔ deepLabel) ----
  det(
    "shape of a tainted number",
    "§B.1 ⇓-Prim — result at pc ⊔ deepLabel(arg); wrapValues stamps ⊥ on nested fields",
    prim("shape", labelLit(U, num(42))),
    ok(ev(U, { rec: { type: ev(BOTTOM, "number"), sign: ev(BOTTOM, "positive") } })),
  ),
  det("toStr", "§B.1 ⇓-Prim", prim("toStr", num(3)), ok(ev(BOTTOM, "3"))),
  det(
    "recordUpdate flattens labels into the result's top label",
    "§B.1 ⇓-Prim — primEval sees stripped input, result rejoins deepLabel(arg) at the top; " +
      "nested fields come back ⊥ via wrapValues (coarser than the Lean interpreter's native " +
      "per-field recordUpdate rule — this port follows §B.1's prim encoding)",
    prim("recordUpdate", array([record([["x", labelLit(U, num(1))]]), str("y"), num(2)])),
    ok(ev(U, { rec: { x: ev(BOTTOM, 1), y: ev(BOTTOM, 2) } })),
  ),
  det("unknown primitive", "§B.1 ⇓-Prim fault", prim("no_such_prim", num(1)), runtime),
];
