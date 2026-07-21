# ADR-0008: Conformance against the probabilistic semantics via finite-oracle enumeration

## Status
Accepted

## Context
The paper's semantics is probabilistic (§B.3; the Lean development's
`PBigStep`/`peval`/`denotMass`): a program denotes a *sub-distribution
over outcomes*, where `recv` is the sole source of nondeterminism, a
run's weight is the product of the per-response weights along its trace,
and runs ending in the same (conversation, result) aggregate by summing.
We wanted a conformance suite testing this port against that semantics —
but ADR-0003 deliberately keeps weight/probability tracking out of
`src/`, and Article 1 makes "just eyeball a few runs" insufficient.

Alternatives considered:

- **Thread weights through the interpreter.** Rejected: reverses
  ADR-0003 for a purely testing-side concern, and taints every rule
  implementation with proof-machinery the executable semantics doesn't
  need.
- **Diff against the Lean interpreter directly** (run the same programs
  through `lake exe repl` and compare). The strongest form of
  conformance, but it needs a shared program syntax (this port has no
  parser; the Lean side has no JSON AST reader) and the Lean toolchain
  wherever tests run. Still worth doing — it remains on the README's
  "where this could go" list — but it tests agreement with *another
  implementation*, not with the semantics' distribution-level content.
- **Enumerate finite-support oracles outside the interpreter.** Chosen.

## Decision
`test/conformance/` holds a harness (`harness.ts`, `rat.ts`) and vector
corpus (`vectors/*.ts`), with `examples/conformance.ts` as the entry
point so `test/run.ts` picks the whole suite up as one pass/fail script.

- A vector pairs a program with a **finite-support oracle**: for each
  (history, callIndex), the complete list of responses with non-zero
  rational mass, summing to ≤ 1 (the analog of `PModel.weight` +
  `isSubDist`). Because the interpreter is deterministic given its
  oracle (oracle.ts), the full outcome distribution is computable by
  depth-first enumeration: replay the run with each scripted response
  prefix, branch at the first unscripted `recv` (signaled by a probe
  oracle throwing a control-flow marker), multiply weights along each
  path, and aggregate outcomes by a canonical key covering the value
  (every label, however deeply nested), the final conversation label and
  history, and error kind.
- Masses are **exact rationals** (bigint), so distribution comparison is
  equality, never a float tolerance.
- Expected distributions are **hand-derived from the paper's rules**,
  each vector citing which rule(s). Pair checks additionally compare two
  enumerated distributions against each other (equal-by-theorem-shape
  cases and one deliberately-detectable difference), and self-tests
  prove the checker's failure paths actually fire.

## Consequences
- `src/` is untouched: weights exist only in vectors and the harness,
  preserving ADR-0003. The c8 gate (`--src src`) is unaffected; the
  harness itself is typechecked via `tsconfig.examples.json`'s existing
  `test/**` include.
- The suite checks distribution-level facts no per-run example could:
  product weights across dependent recvs, pushforward aggregation,
  sub-distribution mass, security refusals occurring with a probability,
  and TIPNI-shaped distribution equality on secret-varying pairs.
- Limits, stated so they aren't rediscovered the hard way: expectations
  are hand-derived (not machine-extracted from Lean — agreement with the
  Lean interpreter is still future work); only finite response trees are
  enumerable (a depth guard turns accidental infinity into a vector
  error); error outcomes carry no final conversation (this port throws
  host exceptions where the Lean semantics returns `.error msg` with a
  conversation) and compare by `SecurityError`/`RuntimeError` kind only;
  closures render without their captured environment; replay-based
  enumeration costs O(paths × path length) full runs, which is trivial
  at test scale.
- Per Article 2: a passing suite is regression evidence that these
  programs' distributions match the rules as we read them — it is not a
  proof, and no claim beyond that may cite it.
