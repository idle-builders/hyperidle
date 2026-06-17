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

> **Build note (AL4–AL7).** AL1 produced the founder-approved design (`plans/AL1/design/approved.md`, locked 2026-06-18). The four workpackages below build it: the proof-family canvases (AL4), the composition surface (AL5), inline anchored comments (AL6), and the tool-tailored/community canvas override (AL7). AL4–AL5 build to the locked design (skip `/design`); AL6 needs its own anchoring design; AL7 is concept-introducing.

---

### AL4 — Review proof-family canvases

**Workpackage.** As a reviewer, I want each kind of thing an agent produces — a code change, a record/field write, a money-moving action, a rendered document/email, moved metrics, a visual before/after, a batch of items — shown as a purpose-built **review canvas** that makes that kind legible at a glance and drillable on demand, tool-grounded with the source app's logo and a link back. This implements the founder-approved family canvases so a reviewer can examine any kind of agent work without dropping to raw output.

**Why this matters.** The reviewer is the beneficiary: "review for anything" is only real if every artifact kind has a canvas that shows the *proof* (the running result, the deltas, the receipt, the rendered asset) rather than a raw dump. Without it, non-code work is unreviewable and code review is a bare diff. The design is approved; this is the build.

**What exists today.** Thin per-kind renderers exist (`packages/design-system/src/kinds/`: CodeRenderer, DataRenderer, TextRenderer, ImageRenderer, UrlRenderer, FallbackRenderer + `getRenderer`). The richer canvas designs exist as approved design stories in `packages/web/src/pages/review/` (ReviewCodeDiff, ReviewFieldChangeSet, ReviewActionOperation, ReviewRenderedInContext, ReviewMetricsMoved, ReviewVisualDiff, ReviewBatch, ReviewOutcomeSummary + ToolLogo/CanvasSourceHeader) — prototypes, not wired into a real review.

**What's genuinely missing.** Production canvases implementing the approved per-family designs (3-layer drill-down, tool-grounding, relevance-ordering), plus a registration so an artifact's declared kind selects its family canvas.

**Depends on.** AL1 — the approved design (`plans/AL1/design/approved.md`) is the contract these implement; cannot start until it is locked (it is).

**Complexity.** L

**Human design review.** No — the canvases are designed and approved in `plans/AL1/design/approved.md`; this builds to the lock.

**Acceptance criteria.**
- Each artifact kind (code · record/field-change · action/operation · rendered document/email · metrics/data · visual · batch) renders through its purpose-built family canvas; a reviewer grasps the result without opening raw output.
- Every canvas shows its source tool (a recognizable mini-logo) and offers a link back to the original record.
- Each canvas reads at three layers — a one-glance summary, the structured proof, on-demand detail — with trivia collapsed and the most-relevant/outlier surfaced first.
- The code canvas is excellent: relevance-ranked changes (logic before generated), the meaningful change summarized, minor/generated changes clearly separated, checks shown inline.
- An artifact whose kind has no tailored canvas still renders through a generic fallback (never breaks).

**Validation scenarios.**
- Given an agent code change, when reviewed, then it renders as the code canvas with relevance-ranked, summarized changes and inline checks.
- Given a money-moving action, when reviewed, then it renders as a pre-commit receipt showing amount, consequence, and how to undo.
- Given an artifact kind with no tailored canvas, when reviewed, then it renders through the fallback without error.

**Plan calls.** Design is approved — skip `/design` (read `plans/AL1/design/approved.md` + the building-block stories). Standard architecture pass: how each family canvas consumes its artifact payload, how a kind registers its canvas, the ToolLogo source. Likely decomposes per family during `/architecture`.

**Contracts / constraints.** Hearth + the AQ rules (tokens by name; no off-grid/off-scale/AI-aesthetic); the snapshot net covers each canvas story. Relevance-ordering is by significance, never file/row/alphabetical. No per-artifact verdict (the verdict is over the Subject — AL5).

**Out of scope.** The composition that wraps them (AL5). Inline anchored comments (AL6). Tool-tailored/community overrides (AL7). Execution of staged actions (AL3).

**Effort.** L (~5d)

---

### AL5 — Review composition surface

**Workpackage.** As a reviewer, I want to open one review of a Subject (a task's or bet's output) and see the whole thing — where it came from (the bet/task and the prompt), what was achieved (the outcome plus a visible result), what needs me, the artifacts (each openable to examine), the discussion, and the verdict — and resolve it with one decision. This builds the founder-approved review surface that composes the family canvases into one coherent review.

**Why this matters.** This *is* the review experience — the headline USP. Without it there is no place to review a Subject as a whole, and the canvases (AL4) have nowhere to live. The reviewer gets one surface to orient, judge, examine, and decide. The design is approved (`ReviewCompositionRefined`).

**What exists today.** Verdicts post and resolve inline in the host thread (RichMessageCard, ThreadShell, the 5 verdict actions). The approved composition exists as a design story (`ReviewCompositionRefined`). No production review surface that composes a Subject's artifacts with the dual-anchor frame, the right-pane examine, and the header verdict.

**What's genuinely missing.** The production review destination: the frame (bet/task + prompt + outcome + KPIs + needs-you), the artifact set with right-pane examine, one global conversation, and the Subject-level verdict — selecting each artifact's family canvas (AL4) by kind.

**Depends on.** AL4 — the composition renders the family canvases as the artifacts' examine content; cannot be built until the canvases exist.

**Complexity.** L

**Human design review.** No — the composition is designed and approved in `plans/AL1/design/approved.md`.

**Acceptance criteria.**
- A reviewer can open one review of a Subject and, at a glance, see where it came from (the bet/task + the ask) and what was achieved (the outcome + a visible result), without opening any artifact.
- The review surfaces what needs the human (the derived gaps/risks/blocking items), each linking to the relevant artifact.
- A reviewer can open any artifact to examine it at full size (in a pane that gives big artifacts room) and close it to return to the whole review.
- The discussion is one conversation over the Subject; a comment can reference an artifact or spot as context.
- The reviewer resolves the whole Subject with one binding verdict, reachable without it obscuring the content.

**Validation scenarios.**
- Given a completed task's output, when the reviewer opens its review, then they see the ask, the achieved result, what needs them, and the artifacts — and can approve without opening anything.
- Given a review, when the reviewer opens an artifact, then its family canvas fills the examine surface and closing returns the whole review.
- Given a review, when a verdict is posted, then the whole Subject resolves (no per-artifact verdicts).

**Plan calls.** Design approved — skip `/design` (read `approved.md`, `ReviewCompositionRefined`). Standard architecture: the Subject/review data shape, the route/placement (reachable from the work item + the reviewer's attention space), the kind→family canvas selection wiring, the verdict resolution.

**Contracts / constraints.** One verdict over the Subject (never per-artifact). Verdict grammar unchanged. The conversation reuses the Thread (one conversation per Subject). Hearth + AQ rules. The review queue is a lighter secondary surface (not this WP).

**Out of scope.** The family canvases (AL4). Anchored comments (AL6). The review-queue/inbox surface. Execution of staged actions (AL3). The conversation's eventual AM-redesigned style (adopt later).

**Effort.** L (~5d)

---

### AL6 — Inline anchored review comments

**Workpackage.** As a reviewer, I want to attach a comment to a specific spot in what I'm reviewing — a diff line, a paragraph, a block, a region — so my feedback is precise and threaded at the exact point it refers to and survives edits to the content. The approved review carries only a textual reference-chip placeholder; this builds real content-following anchored comments across the artifact kinds the review renders.

**Why this matters.** Precise, point-of-reference feedback is table-stakes for serious review, and the AL1 research names robust anchoring as a *loved* differentiator (and fragile anchoring as the universally-hated failure). The reviewer gets to say "this line is wrong" anchored to the line; without it, feedback stays generic. Scaffolding (block identity) exists but no UI wires it.

**What exists today.** Block-reference scaffolding (`PlainPayloadWithBlockId`, stable block IDs); `CommentRow` renders an `inlineAnchor` label only; the approved composition uses a textual reference chip as a placeholder. No UI to create or display a content-following anchored comment.

**What's genuinely missing.** The interaction + wiring to anchor a comment to a specific spot within a rendered canvas (at least code diffs and prose/block content), render it at the anchor, thread replies, and keep it bound to content (block identity) so it survives edits.

**Depends on.** AL5 — anchored comments live in the review's conversation and anchor into the canvases the composition renders; cannot start until the review surface + canvases exist.

**Complexity.** L

**Human design review.** Yes — the anchoring interaction (how a reviewer creates and sees an anchored comment inside a canvas) needs design; the approved composition only placeholders it with a reference chip.

**Acceptance criteria.**
- A reviewer can anchor a comment to a specific line, paragraph, block, or region of the artifact under review.
- Anchored comments render at their anchor point and support threaded replies.
- Anchors bind to content (block identity), not coordinates — a comment survives edits to surrounding content rather than orphaning.
- Anchoring works across at least code diffs and prose/block content.
- The Subject-level verdict flow is unaffected — a review with anchored comments still resolves via one verdict.

**Validation scenarios.**
- Given a code diff in review, when the reviewer comments on a specific line, then the comment renders anchored to that line and supports replies.
- Given the anchored content changes, when re-rendered, then the comment stays bound to its block rather than orphaning.
- Given a review carrying anchored comments, when a verdict is posted, then the Subject still resolves.

**Plan calls.** `/design` for the anchoring interaction (informed by AL1's research + the approved composition), then `/architecture` for how an anchored comment attaches to a block within a canvas and renders at that anchor.

**Contracts / constraints.** Anchors bind to block identity, never coordinates/offsets. No new on-disk content dialect. Verdict + thread semantics preserved.

**Out of scope.** AI-suggested edits / suggestion mode. Review analytics.

**Effort.** L (~4d)

---

### AL7 — Tool-tailored review canvases (override the family floor)

**Workpackage.** As HyperIdle and its ecosystem, I want a tool or a third party to supply a **tailored review canvas** for a specific tool's output that replaces the generic family canvas — either shipped by the tool itself (its MCP server returns the review UI) or contributed via a registered template — so reviewing, say, a Stripe refund or a Figma design is purpose-built without HyperIdle hand-building every tool's canvas. This opens the canvas slot to tool-shipped and community-contributed overrides, with the family canvas as the always-present floor.

**Why this matters.** "Review for anything across every tool" cannot scale if HyperIdle builds every tool's canvas. The override tiers let the long tail be covered by the tool vendor (MCP Apps) or the community (a template/registry). The founder and the ecosystem benefit; without it, every non-family-generic tool gets only the generic canvas.

**What exists today.** HyperIdle speaks MCP (the harness). The built-in family canvases + the kind→family selection (AL4/AL5). No mechanism for a tool's MCP server to return an embeddable review canvas, and no community template/registry for a per-tool canvas.

**What's genuinely missing.** The resolution layer above the family floor: render a tool-shipped canvas (a sandboxed UI returned by the tool's MCP server) when present, and/or a community-registered per-tool template, selected by (tool, kind) ahead of the generic family canvas — safely (sandboxed, trust-tiered).

**Depends on.** AL5 — there must be a review surface with a canvas slot (and the family floor) to override; cannot start until the composition exists.

**Complexity.** L

**Human design review.** No — primarily an integration + resolution mechanism (the canvas is supplied by the tool/community); any host chrome extends the existing canvas slot. (`/design`'s DESIGN-CLASS is authoritative.)

**Acceptance criteria.**
- When a tool supplies its own review canvas for an artifact, the review renders that canvas (sandboxed) instead of the generic family canvas.
- When a community-registered template matches an artifact's (tool, kind), the review renders that template instead of the generic family canvas.
- When neither is present, the review falls back to the family canvas (the floor always works).
- A tool-supplied/community canvas renders safely — sandboxed, with a trust tier — and cannot compromise the host.
- An action taken in a tool-supplied canvas routes back through HyperIdle's existing connection to that tool, not a re-implemented integration.

**Validation scenarios.**
- Given a tool that ships a review canvas, when its artifact is reviewed, then the tool's canvas renders sandboxed; given a tool that doesn't, then the family canvas renders.
- Given a community-registered template for a (tool, kind), when a matching artifact is reviewed, then the template renders.
- Given a malformed/untrusted contributed canvas, when rendered, then it is sandboxed and cannot break the host review.

**Plan calls.** Concept-introducing — run `/concept` first (the override-resolution model, the MCP-Apps `ui://` integration, the community manifest + trust/registry tiers — building on `plans/AL1/design/tool-ecosystem-and-canvases.md` §3). Then architecture; likely splits (MCP-Apps integration vs the community manifest/registry).

**Contracts / constraints.** The family canvas is always the floor (any override is additive; a missing/failed override degrades to it). Contributed/tool canvases are sandboxed with a trust tier. Selection order is deterministic (tool-shipped > community template > family floor).

**Out of scope.** The built-in family canvases (AL4). Building per-tool MCP connectors. Any specific tool's canvas content.

**Effort.** L (~6d)
