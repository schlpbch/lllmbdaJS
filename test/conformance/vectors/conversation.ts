/**
 * Conversation-state conformance vectors — send/recv/fork/clear (§3.1,
 * §3.3), run under singleton-support oracles so each still denotes a
 * point distribution, but the *conversation* part of the outcome (label
 * and history) now carries the content. Adapted from TestComprehensive
 * phases 14, 15, 17, 18.
 *
 * History entries are exactly what the model serialises/receives:
 * `defaultSerialise(str "q")` is the JSON string `"q"` (with quotes),
 * and recv appends the raw response text.
 */
import { app, binop, bool, fork, ifThenElse, index, labelLit, letIn, num, prompt, send, str, v } from "../../../src/ast.js";
import { BOTTOM, S, U } from "../../../src/lattice.js";
import { ev, ok, security, type FiniteOracle, type Vector } from "../harness.js";
import { ONE } from "../rat.js";

const emptyRec = ev(BOTTOM, { rec: {} });
const always = (response: string): FiniteOracle => () => [[response, ONE]];
const noRecv: FiniteOracle = () => [];

export const conversationVectors: ReadonlyArray<Vector> = [
  {
    name: "send returns {} and appends the serialised prompt",
    rule: "§3.3 ⇓-Send",
    program: send(str("hi")),
    oracle: noRecv,
    expected: [[ONE, ok(emptyRec, { history: ['"hi"'] })]],
  },
  {
    name: "send joins the prompt's deep label into the conversation label",
    rule: "§3.3 ⇓-Send — C′ label is l_c ⊔ deepLabel(V)",
    program: send(labelLit(U, str("hi"))),
    oracle: noRecv,
    expected: [[ONE, ok(emptyRec, { label: U, history: ['"hi"'] })]],
  },
  {
    name: "two sends accumulate in order",
    rule: "§3.3 ⇓-Send",
    program: letIn("_", send(str("a")), send(str("b"))),
    oracle: noRecv,
    expected: [[ONE, ok(emptyRec, { history: ['"a"', '"b"'] })]],
  },
  {
    name: "prompt round-trip: @e parses the response as [true, value]",
    rule: "§3.1 @e ≜ (λ_.recv)(send e); §3.3 ⇓-Recv; §2.1 parse convention",
    program: index(prompt(str("q")), num(1)),
    oracle: always("5"),
    expected: [[ONE, ok(ev(BOTTOM, 5), { history: ['"q"', "5"] })]],
  },
  {
    name: "a tainted conversation taints every response",
    rule: "§3.3 ⇓-Recv — the parsed response evaluates at pc = conv.label (closes Leak 3)",
    program: index(prompt(labelLit(U, str("q"))), num(1)),
    oracle: always("5"),
    expected: [[ONE, ok(ev(U, 5), { label: U, history: ['"q"', "5"] })]],
  },
  {
    name: "unparseable response yields [false, …] for agent-side retry",
    rule: "§2.1 parse convention (defaultParse wraps failure, doesn't throw)",
    program: index(prompt(str("q")), num(0)),
    oracle: always("not json"),
    expected: [[ONE, ok(ev(BOTTOM, false), { history: ['"q"', "not json"] })]],
  },
  {
    name: "fork discards conversation effects, keeps the value",
    rule: "§3.1 ⇓-Fork (ADR-0007)",
    program: index(fork(prompt(str("q"))), num(1)),
    oracle: always("5"),
    expected: [[ONE, ok(ev(BOTTOM, 5))]],
  },
  {
    name: "quarantine prelude: fork + clear + @, returning the parsed value",
    rule: "§5.1 quarantine ≜ λp. (fork(let _ = clear in @p)).[1]",
    // `quarantine` is a prelude binding (a real object-language closure,
    // ADR-0002) — the program just applies it by name, the same way
    // recv'd agent code would.
    program: app(v("quarantine"), str("q")),
    oracle: always("7"),
    expected: [[ONE, ok(ev(BOTTOM, 7))]],
  },
  {
    name: "send inside a secret-tainted branch is refused",
    rule: "§3.3 ⇓-Send no-high-upgrade check (closes Leak 1, Fenton–Denning §3.4)",
    program: ifThenElse(labelLit(S, bool(true)), send(str("x")), num(0)),
    oracle: noRecv,
    expected: [[ONE, security]],
  },
  {
    name: "response arithmetic joins conversation-inherited labels",
    rule: "§3.3 ⇓-Recv + §B.1 binop",
    program: binop("+", index(prompt(labelLit(U, str("q"))), num(1)), num(1)),
    oracle: always("41"),
    expected: [[ONE, ok(ev(U, 42), { label: U, history: ['"q"', "41"] })]],
  },
];
