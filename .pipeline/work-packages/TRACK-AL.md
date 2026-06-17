# Track AL: Review Experience

Source: the kernel/strategy USP analysis of 2026-06-13 (`plans/AK/kernel-strategy-usp-analysis.md`, founder-annotated) and the empirical verification of 2026-06-14. The founder's stated USP is a review experience that eclipses anything on the market — "review for anything," pulling the human in only where guidance matters. Verification confirms the foundation is real: thread-native review with five binding verdicts posts and resolves live, and live session dial-in (watch tool-calls / reasoning / cost while an agent works) is genuinely built. The gap is the async-polish layer that separates "good" from "best ever" — and, crucially, an honest admission that **no tool does this well today**, and that the non-code review space (design, marketing, docs, data) is unmapped territory for us.

**Why a separate track.** The founder asked for review work to be its own worktrack, and to register the *research* alongside the *build*. Review polish can proceed in parallel with the kernel-loop track (AK); it shares no code seam with it.

**Scope rules.** The review *experience* only — the interaction layer over the existing thread/verdict/artifact system, and the research that informs it. No changes to the verdict semantics, the thread model, or the kernel work-loop. `npm run verify` must pass after each workpackage merges.

**Reference docs:** `plans/AK/kernel-strategy-usp-analysis.md` (§3), `docs/product/human-ai-collaboration.md`, `docs/blocks/`, `packages/shared/src/thread.ts`, `.claude/rules/` (web-research wariness).

---

### AL1 — Competitive research dossier of review experiences

**Workpackage.** As the founder shaping HyperIdle's review experience, I want a researched, cited dossier of how the best tools handle review — across code *and* non-code domains (design, marketing/docs, data) — so that we design our differentiator grounded in what already exists and where the real white space is, instead of guessing. Today we have a strong instinct ("none of the existing experiences are great") but no map of the field, and an explicit blind spot on non-code review (what does Figma do, what do marketing approval tools do).

**Why this matters.** The review experience is the headline USP, and we are about to invest in it (AL2 and beyond). Designing the differentiator blind is the expensive failure mode; a grounded dossier is cheap insurance and the necessary input to a founder-led concept act on the review experience. The founder is the direct beneficiary — this is the raw material for deciding what "best review ever" actually means for agent-produced work. Without it, AL2 risks reinventing a worse version of patterns that already exist.

**What exists today.** Nothing — this is greenfield research. (Separately, our *own* review surface is partly built: verdicts and dial-in work; inline anchored comments do not — that gap is AL2, not this WP.)

**What's genuinely missing.** A structured, cited dossier covering, per domain, the dominant review interaction patterns — inline/anchored commenting, threading, comment-vs-suggestion, approval gating, async-vs-live, notification/attention routing — for code review (e.g. GitHub, GitLab, Graphite, Gerrit), design review (Figma), document/marketing review (Google Docs, Notion, marketing approval tools), and data/notebook review; with screenshots where obtainable and a synthesis of the white space for reviewing *agent-produced* work specifically.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- The dossier captures, per domain (code, design, doc/marketing, data), the dominant review interaction patterns, each with a cited source.
- It explicitly names what no surveyed tool does well for reviewing agent-produced work — the white space.
- A reader can come away able to name the handful of patterns worth adopting and the white space HyperIdle should own.
- Deep dives that require founder-provided access to gated tools are listed as explicit follow-ups, not fabricated — no invented screenshots of tools we cannot access.

**Validation scenarios.**
- Human walkthrough: given the dossier, the founder can identify the patterns to adopt and the white space to own, and every non-obvious claim traces to a cited source.
- Given a domain we could not access without credentials, when the founder reads that section, then it clearly states the limitation and lists the access-gated deep dive as a follow-up.

**Plan calls.** Skip `/design` and `/architecture` — this is a research/writing workpackage (web research in the spirit of `/deep-research`). Output to `plans/reviews/`. The collaborative, access-gated deep dive (screenshotting gated tools together with the founder) is a follow-on `/concept` act and is out of scope here.

**Contracts / constraints.**
- Web claims are critically sourced and cross-checked (per the CLAUDE.md web-research rule — the web is full of wrong/marketing content).
- No fabricated screenshots or claims about tools we cannot directly observe; list them as founder-access follow-ups instead.
- The dossier is research input, not a design — it must not prescribe HyperIdle's UI.

**Out of scope.** Designing HyperIdle's review UI (that is the founder-led concept act plus the follow-on build workpackages). The access-gated screenshot deep dive of paywalled tools.

**Effort.** M (~1d)

> **Scope note (AL2–AL3).** The two workpackages below deliberately extend Track AL beyond its original "interaction layer only" scope into the **review→act loop**: getting work *into* review (AL2, harness domain) and what *approve* triggers (AL3, agent-runtime domain). Both flow from the AL1 review-system note (`plans/AL1/design/review-system.md` §4, founder-parked) and are concept-introducing — each runs its own `/concept` first.

---

### AL2 — Harness review-return hooks

**Workpackage.** As HyperIdle, I want every agent turn — on every harness — to end by handing its work back to HyperIdle through an accepted "return" action (submit something for review, close a task, send a message), so that no agent work silently escapes the review loop and a human always gets the chance to see and gate what was done. Today an agent can finish a turn without surfacing its output to HyperIdle; this makes "return to HyperIdle" the mandatory last step of any turn, drawn from a defined, closed set of accepted terminal actions, enforced uniformly across every harness.

**Why this matters.** The entire "review for anything / pull the human in where it matters" thesis depends on work actually reaching the review surface. If an agent can end a turn without returning to HyperIdle, its output is invisible and ungoverned — the review system reviews only what agents happen to submit, not what they must. The founder and every reviewer benefit from the guarantee that nothing an agent does, on any harness, escapes the loop. The cost of not building it: silent agent action and a review system that can be bypassed.

**What exists today.** A tool layer exists (`packages/server/src/tools/`), including a `submit-review` tool and a tool registry; agents *can* submit work for review and send messages. A harness adapter layer exists. But nothing *forces* a turn to end with one of these — there is no defined closed set of accepted terminal actions and no harness-level enforcement that a turn cannot complete without returning to HyperIdle.

**What's genuinely missing.** A defined, closed set of accepted "return" actions, and a harness-agnostic enforcement hook that a turn is not complete until the agent invokes one of them — making the return to HyperIdle mandatory, not optional.

**Depends on.** None. (The `submit-review` tool and the harness adapter already exist; the locked AL1 review primitive supplies the semantics of "submit for review." It can be specced and built without waiting on another WP.)

**Complexity.** L

**Human design review.** No — a harness/agent-layer enforcement mechanism; no new user-facing surface or base component.

**Acceptance criteria.**
- Every agent turn, on every harness, ends by invoking one of a defined, closed set of "return to HyperIdle" actions; a turn that would end without one is not accepted as complete.
- HyperIdle can enumerate exactly which actions count as a valid turn ending (the accepted-return set is closed, not open-ended).
- When an agent attempts to end a turn without an accepted return action, the system detects it and the turn does not silently complete — it is redirected to return, or surfaced as not-yet-returned.
- The enforcement holds uniformly regardless of which harness produced the turn.
- Legitimate non-terminal tool use mid-turn is unaffected — only the turn's *ending* must be a return action.

**Validation scenarios.**
- Given an agent finishes its work and submits it for review, when the turn ends, then HyperIdle has received the work and the turn is accepted as complete.
- Given an agent attempts to end a turn without any accepted return action, when the turn would complete, then the system does not accept it as complete (redirected or flagged as not-returned).
- Given two different harnesses, when each ends a turn, then both are held to the same accepted-return set.

**Plan calls.** Concept-introducing — run `/concept` first to define the closed set of accepted "return" actions and the enforcement model (where the hook lives across harnesses; what "a turn cannot end without returning" means operationally). Then a standard architecture pass. Spans the harness/agent-layer domain.

**Contracts / constraints.**
- The accepted-return set is a closed, enumerable set — no open-ended "any tool counts."
- Enforcement is harness-agnostic: every harness, the same rule.
- The verdict grammar and thread model are unchanged.
- Mid-turn non-terminal tool use is not blocked; only the turn ending is constrained.

**Out of scope.** What an approve triggers (the execution loop — AL3). The payload schema of each return action (architecture). New harness types.

**Effort.** L (~3-4d)

---

### AL3 — Review execution loop

**Workpackage.** As a reviewer, I want approving a review to actually *cause* the agent's staged operation to be carried out through the connected tool, so that "approve" means the work happens — not just that it's marked accepted. When an agent stages an operative action (a refund, a deploy, a send, a record write) and presents it for review, the human's approval is the trigger that executes it via the tool/MCP, and the result returns to HyperIdle; a non-approving verdict holds it. Today approval records a verdict but executes nothing — the staged-action review canvas has no teeth.

**Why this matters.** This is the *act* in plan→review→act, the founder's core loop. Without it, the review experience is a viewer: a human can approve, but nothing happens, and operative agent work either never runs or runs without the gate. The reviewer and the founder benefit directly — approval becomes the safe commit point for operative agent work. The cost of not building it: HyperIdle can show and judge agent work but cannot safely complete it.

**What exists today.** Verdicts post, resolve, and emit events (thread/verdict system); a `submit-review` tool and tool registry exist; live session dial-in exists; the AL1 design includes an action-operation review canvas that *stages* an operation (what it will do, consequence, undo) pre-commit. But nothing dispatches the staged operation to the tool on approve — execution is the gap.

**What's genuinely missing.** The link from a binding approve-verdict to the actual execution of the staged operation through the connected tool/MCP — the verdict becoming a trigger that commits the staged action, with the result returning to HyperIdle.

**Depends on.** None. (The review primitive and verdict system are locked/exist; the loop can be specced and proven against a staged operation in a fixture without waiting on AL2.)

**Complexity.** L

**Human design review.** No — primarily agent-runtime + concept; the approve→execute affordance and the execution-result surface extend the existing action-operation review canvas rather than introducing a new base primitive. (`/design`'s DESIGN-CLASS is authoritative at design time.)

**Acceptance criteria.**
- Approving a review whose subject includes a staged operative action causes that operation to be carried out through the connected tool, without the human leaving the review.
- A non-approving verdict (request-changes / reject / edit) does not execute the staged operation; it remains pending and un-executed.
- After execution, the result (success or failure) returns to HyperIdle and is visible against the review.
- A given approval executes the staged operation at most once — re-opening or re-showing the review does not double-execute.
- A staged operation that the human never approves is never executed.
- Descriptive artifacts (a code diff, a document) do not "execute" on approve — only operative artifacts do.

**Validation scenarios.**
- Given a review with a staged refund, when the human approves, then the refund is actually performed via the tool and its result shows against the review.
- Given the same review, when the human requests changes instead, then no refund is performed and the staged operation remains pending.
- Given an already-approved-and-executed operation, when the review is re-opened, then the operation is not executed a second time.

**Plan calls.** Concept-introducing — run `/concept` first (the execution loop is parked, unbiased, in `plans/AL1/design/review-system.md` §4). The concept act defines how a verdict becomes a trigger, how the staged-operation spec is carried, the descriptive-vs-operative artifact distinction, at-most-once/idempotency, and failure handling. Then a standard architecture pass. Spans the agent-runtime/tool-dispatch domain.

**Contracts / constraints.**
- At-most-once execution per approval (idempotent).
- Only operative artifacts execute on approve; descriptive artifacts do not.
- The verdict grammar is unchanged — approve stays approve; it gains a consequence, not a new action.
- Execution failure surfaces; it is never silently swallowed.
- No bypass of the human gate where a human reviewer is required.

**Out of scope.** The harness return-enforcement (AL2). Broad per-tool dispatch coverage (the loop + at least one real tool path; wide tool coverage is follow-on). Multi-step transactional rollback beyond the single staged operation's own undo.

**Effort.** L (~4-5d)
