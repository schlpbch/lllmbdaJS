/**
 * Distribution-equality pairs — finite, TIPNI-flavored regressions.
 *
 * TIPNI (the paper's Theorem 1, machine-checked only in Lean) says the
 * distribution of what an observer below the secret's label can see is
 * independent of the secret. These pairs check a finite instance of that
 * *shape*: run the same program with two different high-labeled inputs
 * and require the full outcome distributions to coincide. That is
 * evidence on these programs, not a proof of the theorem — and full-
 * outcome equality is only a reasonable expectation when the program is
 * arranged so the secret can't lawfully surface anywhere in the outcome
 * (here: it only ever enters a fork-isolated conversation whose oracle
 * support ignores history content).
 *
 * The `expectEqual: false` case exists so the equal cases mean something:
 * it lets the in-fork oracle's support *read the secret from the
 * conversation history*, and requires the comparator to detect that the
 * distributions now differ. Note where the difference lives: entirely in
 * ["S"]-labeled components — consistent with the theorem, which only
 * promises indistinguishability to observers *below* S.
 */
import { bool, clear, fork, index, labelLit, labelTest, letIn, num, prompt, send, str } from "../../../src/ast.js";
import { S } from "../../../src/lattice.js";
import { tagArray } from "../../../src/prelude.js";
import { noResponses, type ConformanceProgram, type FiniteOracle, type PairCheck } from "../harness.js";
import { ONE, rat } from "../rat.js";

const half = rat(1, 2);

/**
 * Send an [S]-labeled secret into a fork-isolated, cleared conversation,
 * then ask a question there and return the parsed answer. The answer
 * comes back ["S"]-labeled (the conversation's label after the secret
 * entered it — §3.3 ⇓-Recv), the fork discards the conversation, and
 * nothing else about the outcome can depend on the secret.
 */
const quarantinedSecret = (secret: boolean) =>
  index(
    fork(
      letIn(
        "_c",
        clear,
        letIn("_s", send(labelLit(S, bool(secret))), prompt(str("classify"))),
      ),
    ),
    num(1),
  );

const fairCoin: FiniteOracle = () => [
  ["1", half],
  ["2", half],
];

/** An oracle that (illegitimately, for a pair-equality check) peeks at the secret. */
const peeksAtSecret: FiniteOracle = (history) =>
  history.includes("true") ? [["1", ONE]] : [["2", ONE]];

const prog = (name: string, rule: string, program: ConformanceProgram["program"], oracle: FiniteOracle): ConformanceProgram => ({
  name,
  rule,
  program,
  oracle,
});

export const pairChecks: ReadonlyArray<PairCheck> = [
  {
    name: "quarantined secret does not shift the outcome distribution",
    rule: "Theorem 1 (TIPNI) shape on a finite instance; §3.1 ⇓-Fork isolation",
    a: prog("secret=true", "§3.3", quarantinedSecret(true), fairCoin),
    b: prog("secret=false", "§3.3", quarantinedSecret(false), fairCoin),
    expectEqual: true,
  },
  {
    name: "labelTest depends on the label, not the secret's content",
    rule: "§3.4 ⇓-LabelTest — result stamped with the threshold, content-independent",
    a: prog("content=1", "§3.4", labelTest(tagArray(["S"]), labelLit(S, num(1))), noResponses),
    b: prog("content=2", "§3.4", labelTest(tagArray(["S"]), labelLit(S, num(2))), noResponses),
    expectEqual: true,
  },
  {
    name: "comparator teeth: a secret-peeking oracle is detected",
    rule: "difference confined to [S]-labeled data — visible to this full-outcome comparator, " +
      "invisible to observers below S (which is all TIPNI promises)",
    a: prog("secret=true, peeking oracle", "§B.3", quarantinedSecret(true), peeksAtSecret),
    b: prog("secret=false, peeking oracle", "§B.3", quarantinedSecret(false), peeksAtSecret),
    expectEqual: false,
  },
];
