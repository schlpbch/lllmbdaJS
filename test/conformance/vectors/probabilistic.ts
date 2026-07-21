/**
 * Genuinely probabilistic conformance vectors — multi-response supports,
 * so the program denotes a non-trivial distribution. These check the
 * distribution-level content of §B.3 / the Lean `PBigStep`:
 *
 * - a path's mass is the *product* of its responses' weights,
 * - paths ending in the same (conversation, result) *aggregate* by
 *   summing (the denotation is a pushforward measure, not a trace list),
 * - supports may sum to < 1 (sub-distributions: missing mass is
 *   refusal/divergence, denotMass ≤ 1),
 * - security refusals are outcomes with mass like any other.
 */
import { binop, bool, fork, ifThenElse, index, labelLit, letIn, num, prompt, str, send, v } from "../../../src/ast.js";
import { BOTTOM, S } from "../../../src/lattice.js";
import { ev, ok, security, type Vector } from "../harness.js";
import { ONE, rat } from "../rat.js";

const half = rat(1, 2);
const third = rat(1, 3);

/** `(@"q").[1]` — ask once, take the parsed value. */
const askOnce = index(prompt(str("q")), num(1));

export const probabilisticVectors: ReadonlyArray<Vector> = [
  {
    name: "two-point response distribution",
    rule: "§B.3 — recv branches with weight M.weight(c, r); distinct histories stay distinct outcomes",
    program: askOnce,
    oracle: () => [
      ["1", half],
      ["2", half],
    ],
    expected: [
      [half, ok(ev(BOTTOM, 1), { history: ['"q"', "1"] })],
      [half, ok(ev(BOTTOM, 2), { history: ['"q"', "2"] })],
    ],
  },
  {
    name: "pushforward aggregation: different traces, same outcome",
    rule: "§B.3 — the denotation sums the weights of all traces with the same (C′, V); fork (§3.1) erases the history difference",
    program: binop(">", index(fork(prompt(str("q"))), num(1)), num(0)),
    oracle: () => [
      ["1", half],
      ["2", half],
    ],
    expected: [[ONE, ok(ev(BOTTOM, true))]],
  },
  {
    name: "path mass is the product of response weights",
    rule: "§B.3 — sequential composition multiplies weights; the support may depend on the history",
    program: letIn(
      "a",
      index(prompt(str("q1")), num(1)),
      letIn(
        "b",
        index(prompt(str("q2")), num(1)),
        binop("+", binop("*", v("a"), num(10)), v("b")),
      ),
    ),
    oracle: (history, callIndex) => {
      if (callIndex === 0) {
        return [
          ["1", half],
          ["2", half],
        ];
      }
      // Second ask: the support genuinely depends on what was answered first.
      return history.includes("1")
        ? [
            ["3", third],
            ["4", rat(2, 3)],
          ]
        : [["5", ONE]];
    },
    expected: [
      [rat(1, 6), ok(ev(BOTTOM, 13), { history: ['"q1"', "1", '"q2"', "3"] })],
      [third, ok(ev(BOTTOM, 14), { history: ['"q1"', "1", '"q2"', "4"] })],
      [half, ok(ev(BOTTOM, 25), { history: ['"q1"', "2", '"q2"', "5"] })],
    ],
  },
  {
    name: "sub-distribution: missing mass is refusal, not an outcome",
    rule: "§B.3 / PModel.isSubDist — per-conversation weights sum ≤ 1; denotation mass ≤ 1",
    program: askOnce,
    oracle: () => [
      ["1", third],
      ["2", third],
    ],
    expected: [
      [third, ok(ev(BOTTOM, 1), { history: ['"q"', "1"] })],
      [third, ok(ev(BOTTOM, 2), { history: ['"q"', "2"] })],
    ],
  },
  {
    name: "response-dependent security refusal has a probability",
    rule: "§3.3 ⇓-Send no-high-upgrade check under §B.3 — the refusal is an outcome with mass 1/3",
    program: letIn(
      "r",
      index(fork(prompt(str("q"))), num(1)),
      ifThenElse(
        binop("==", v("r"), num(1)),
        // The response chose to run the Fenton–Denning gadget:
        ifThenElse(labelLit(S, bool(true)), send(str("leak")), num(0)),
        num(0),
      ),
    ),
    oracle: () => [
      ["1", third],
      ["2", rat(2, 3)],
    ],
    expected: [
      [third, security],
      [rat(2, 3), ok(ev(BOTTOM, 0))],
    ],
  },
  {
    name: "retry once on unparseable response",
    rule: "§2.2 retry pattern under §B.3 — one- and two-recv paths mix in one distribution",
    program: letIn(
      "a",
      prompt(str("q")),
      ifThenElse(
        index(v("a"), num(0)),
        index(v("a"), num(1)),
        letIn(
          "b",
          prompt(str("q")),
          ifThenElse(index(v("b"), num(0)), index(v("b"), num(1)), num(-1)),
        ),
      ),
    ),
    oracle: (_history, callIndex) =>
      callIndex === 0
        ? [
            ["bad{", half],
            ["5", half],
          ]
        : [["7", ONE]],
    expected: [
      [half, ok(ev(BOTTOM, 5), { history: ['"q"', "5"] })],
      [half, ok(ev(BOTTOM, 7), { history: ['"q"', "bad{", '"q"', "7"] })],
    ],
  },
];
