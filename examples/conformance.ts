/**
 * Conformance suite entry point — runs every vector in
 * test/conformance/vectors/ against the finite-oracle enumeration
 * harness (test/conformance/harness.ts) and reports pass/fail per
 * vector, so `pnpm test` picks the whole suite up as one example script.
 *
 * What "PASS" means here: on this program, the interpreter's exact
 * outcome distribution under the vector's finite-support oracle equals
 * the distribution hand-derived from the paper's probabilistic semantics
 * (§B.3; the Lean development's PBigStep/peval). Evidence, not proof —
 * see the harness header and CONSTITUTION.md Article 2.
 *
 * The self-tests at the end exercise the harness's own failure paths
 * (Article 3 in spirit: a checker that cannot fail proves nothing) —
 * wrong mass, wrong deeply-nested label, an over-unit support, and a
 * non-finite response tree must each be *detected*.
 */
import { app, fix, lam, letIn, num, prim, prompt, record, str, v } from "../src/ast.js";
import { BOTTOM, U } from "../src/lattice.js";
import {
  checkPair,
  checkVector,
  det,
  ev,
  ok,
  type Vector,
} from "../test/conformance/harness.js";
import { ONE, rat } from "../test/conformance/rat.js";
import { conversationVectors } from "../test/conformance/vectors/conversation.js";
import { deterministicVectors } from "../test/conformance/vectors/deterministic.js";
import { pairChecks } from "../test/conformance/vectors/pairs.js";
import { probabilisticVectors } from "../test/conformance/vectors/probabilistic.js";

let passed = 0;
let failed = 0;

function report(name: string, err?: unknown): void {
  if (err === undefined) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    console.log("FAIL", name);
    console.log(err instanceof Error ? err.message : String(err));
  }
}

const allVectors = [...deterministicVectors, ...conversationVectors, ...probabilisticVectors];
for (const vec of allVectors) {
  try {
    await checkVector(vec);
    report(vec.name);
  } catch (e) {
    report(vec.name, e);
  }
}

for (const pair of pairChecks) {
  try {
    await checkPair(pair);
    report(pair.name);
  } catch (e) {
    report(pair.name, e);
  }
}

// -------------------- harness self-tests --------------------

async function mustFail(name: string, needle: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes(needle)) {
      report(name);
    } else {
      report(name, new Error(`failed for the wrong reason (no "${needle}" in message):\n${msg}`));
    }
    return;
  }
  report(name, new Error("expected the harness to detect a mismatch, but it passed"));
}

await mustFail("self-test: wrong mass is detected", "mass mismatch", () =>
  checkVector({
    ...det("wrong-mass", "harness self-test", num(1), ok(ev(BOTTOM, 1))),
    expected: [[rat(1, 2), ok(ev(BOTTOM, 1))]],
  }),
);

await mustFail("self-test: wrong deeply-nested label is detected", "missing outcome", () =>
  // shape's fields really come back ⊥-stamped (wrapValues); expecting ["U"]
  // on a nested field must fail — proving the comparator sees deep labels.
  checkVector(
    det(
      "wrong-deep-label",
      "harness self-test",
      prim("shape", num(42)),
      ok(ev(BOTTOM, { rec: { type: ev(U, "number"), sign: ev(BOTTOM, "positive") } })),
    ),
  ),
);

await mustFail("self-test: over-unit support is rejected", "sub-distribution", () =>
  checkVector({
    name: "over-unit",
    rule: "harness self-test",
    program: prompt(str("q")),
    oracle: () => [
      ["a", rat(2, 3)],
      ["b", rat(2, 3)],
    ],
    expected: [],
  } satisfies Vector),
);

await mustFail("self-test: a non-finite response tree is caught, not looped", "recv depth", () =>
  checkVector(
    {
      name: "infinite-retry",
      rule: "harness self-test",
      // fix(λself. λu. let a = @"q" in self u) {} — every path recurses
      // through another recv, so the response tree is infinite.
      program: app(
        fix(lam("self", lam("u", letIn("a", prompt(str("q")), app(v("self"), v("u")))))),
        record([]),
      ),
      oracle: () => [["x", ONE]],
      expected: [],
    } satisfies Vector,
    4, // small maxDepth: fail fast
  ),
);

console.log(`\n${passed}/${passed + failed} conformance checks passed.`);
if (failed > 0) process.exit(1);
