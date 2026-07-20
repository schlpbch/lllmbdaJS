# Talking Points — Call with Prof. Andrew D. Gordon

## Time: Tuesday, 21st of July, 11:00 to 11:30 CEST

- **Tone**: Curious, humble, and respectful.
- **Aim**: I want to learn from Andy Gordon, and to engage in a meaningful
  discussion with a potentially long-term collaborator.

---

## Opening (5 min)

- About myself: My day job is a enterprise/solution architect at Swiss Federal
  Railways (SBB) working with +25 teams on business critical systems with ~20
  years of experience. Currently I'm also tech lead AI/ML and agentic systems
  initiatives both for the SDLC as well as business opportunities.

  I have a PhD in (applied) machine learning/pattern recognition and a master's
  in computer science.

- When not at work, I've started to read and write papers on one hand on Machine
  Learning and on the other hand on applying formal methods to agentic
  protocols. Currently also joining the MCP transport working group.

- In my master's thesis I worked on Picoola, a pure composition language under
  the supervision of Prof. Nierstrasz. This is also when I studied your work the
  first time: _"Typing a Multi-Language Intermediate Code" (with Don Syme, POPL
  '01)_ — read the Microsoft Research Report and cited it in my own master's
  thesis on JPicoola.

- Prof. Nierstrasz also suggested I reach out to people active in the field to
  get feedback and guidance.

## 1. Competitive/comparative landscape (~4 min)

- The paper directly demonstrates two concrete gaps in **CaMeL**: an
  untaken-branch implicit-flow leak, and an untracked retry-loop bit-leak
  channel.
- **FIDES** deliberately doesn't track control-flow-carried secrets. Ask if he
  sees that as a reasonable engineering trade-off or a real weakness.

- **LBAC/TypeGuard** and **tacit** take a static-typing/capability route instead
  of dynamic IFC. Do you see these as competitors, or as solving a genuinely
  different problem that could combine with LLMbda later.

## 2. Questions about the Paper on LLMbda (~9 min)

- What if the Boolean Untrusted vs Secure Principle are e.g. likelihoods or
  probabilities? IMHO, the fundamental question is to get the labeling right,
  and then the calculus should work with any labeling scheme.

- In how far is information leakage through termination equivalent to examining
  the current continuation?

- Inter-agent vs intra-agent information flow. In my paper I tried to look at an
  agent as a black box, and only looked at the information flow between agents.
  In the calculus, the agent is not a black box, and the information flow within
  an agent is also tracked. Could this somehow be unified, or is that a
  fundamentally different problem?

- To quite some degree, the appendix reminded me of a stack based VM like the
  JVM. I assume that's intentional.

## 3. Question about Future Work on LLMbda (~9 min)

- Tool I/O modeling is the paper's own stated gap (NFR-2) — Am I correctly
  assuming that monadic I/O is what you have in mind, or is there a more
  specific design pattern you have in mind?

- Ask how they see LLMbda relating to the static-typing camp (LBAC/TypeGuard,
  tacit) — genuinely complementary, or is one discipline going to subsume the
  other over time?

## Close (2 min)

- Would you kindly provide me access to the **LEAN** test set. I just finished a
  PoC of a VM in JS/TS that tries to run the LLMBda calculus as specified in the
  paper by Andy Gordon. I now have 100% statement/branch coverage across 29
  regression examples — though of course that's not a soundness proof, which is
  exactly what I'd want to check against your Lean test set.

  However I do not know whether it implements your test set, test set being an
  implicit specification of the calculus as well. I would like to run the test
  set against my implementation to see whether it is complete as well.

- Looking for a mentor and affiliation. Lack of both is a showstopper for me to
  continue my research in this field. I would like to ask whether you would be
  willing to mentor me, and/or whether you could provide me with an affiliation
  (e.g. as a visiting researcher) to continue my research in this field.
