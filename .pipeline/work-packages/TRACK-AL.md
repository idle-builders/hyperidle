# Track AL: Review Experience

Source: the kernel/strategy USP analysis of 2026-06-13 (`plans/AK/kernel-strategy-usp-analysis.md`, founder-annotated) and the empirical verification of 2026-06-14. The founder's stated USP is a review experience that eclipses anything on the market — "review for anything," pulling the human in only where guidance matters. Verification confirms the foundation is real: thread-native review with five binding verdicts posts and resolves live, and live session dial-in (watch tool-calls / reasoning / cost while an agent works) is genuinely built. The gap is the async-polish layer that separates "good" from "best ever" — and, crucially, an honest admission that **no tool does this well today**, and that the non-code review space (design, marketing, docs, data) is unmapped territory for us.

**Why a separate track.** The founder asked for review work to be its own worktrack, and to register the *research* alongside the *build*. Review polish can proceed in parallel with the kernel-loop track (AK); it shares no code seam with it.

**Scope rules.** The review *experience* only — the interaction layer over the existing thread/verdict/artifact system, and the research that informs it. No changes to the verdict semantics, the thread model, or the kernel work-loop. `npm run verify` must pass after each workpackage merges.

**Reference docs:** `plans/AK/kernel-strategy-usp-analysis.md` (§3), `docs/product/human-ai-collaboration.md`, `docs/blocks/`, `packages/shared/src/thread.ts`, `.claude/rules/` (web-research wariness).

---

### AL1 — Competitive research dossier of review experiences

**Workpackage.** As the founder shaping HyperIdle's review experience, I want a researched, cited dossier of how the best tools handle review — across code *and* non-code domains (design, marketing/docs, data) — so that we design our differentiator grounded in what already exists and where the real white space is, instead of guessing. Today we have a strong instinct ("none of the existing experiences are great") but no map of the field, and an explicit blind spot on non-code review (what does Figma do, what do marketing approval tools do).

**Why this matters.** The review experience is the headline USP, and we are about to invest in it (AL2 and beyond). Designing the differentiator blind is the expensive failure mode; a grounded dossier is cheap insurance and the necessary input to a founder-led concept act on the review experience. The founder is the direct beneficiary — this is the raw material for deciding what "best review ever" actually means for agent-produced work. Without it, AL2 risks reinventing a worse version of patterns that already exist.

**What exists today.** Nothing — this is greenfield research. (Separately, our *own* review surface is partly built: verdicts and dial-in work; inline anchored comments do not — that gap is AL4, not this WP.)

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

**Plan calls.** Run `/concept` to lock the review nouns (Subject, Intent, Rationale, Reviewer, Anchor) and the shape of the reviewing experience. Run `/design` only to the extent needed to produce the founder-approved design document (`plans/AL1/design/approved.md`) and supporting design artifacts — the design itself is the output, not production code. Do NOT commit TSX components to AL1; any rendered design exploration stays in the design viewer as throwaway reference or is moved directly to the build workpackage that owns it. Skip `/architecture`; AL2 runs its own architecture pass. Output the dossier and design docs to `plans/AL1/`.

**Contracts / constraints.**
- Web claims are critically sourced and cross-checked (per the CLAUDE.md web-research rule — the web is full of wrong/marketing content).
- No fabricated screenshots or claims about tools we cannot directly observe; list them as founder-access follow-ups instead.
- The dossier is research input, not a design — it must not prescribe HyperIdle's UI.

**Out of scope.** Designing HyperIdle's review UI (that is the founder-led concept act plus the follow-on build workpackages). The access-gated screenshot deep dive of paywalled tools.

**Effort.** M (~1d)

> **Build note (AL2–AL5).** AL1 produced the founder-approved design (`plans/AL1/design/approved.md`, locked 2026-06-18) **as a design document, not as committed production code.** The four workpackages below build it: the proof-family canvases (AL2), the composition surface (AL3), inline anchored comments (AL4), and the tool-tailored/community canvas override (AL5). AL2–AL3 build to the locked design (skip `/design`); AL4 needs its own anchoring design; AL5 is concept-introducing. Design exploration may produce throwaway TSX in the design-system viewer during the track's `/design` phase, but those files are either deleted after convergence or moved directly into the owning build workpackage — they do not ship with AL1.

---

### AL2 — Review proof-family canvases

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

**Contracts / constraints.** Hearth + the AQ rules (tokens by name; no off-grid/off-scale/AI-aesthetic); the snapshot net covers each canvas story. Relevance-ordering is by significance, never file/row/alphabetical. No per-artifact verdict (the verdict is over the Subject — AL3).

**Out of scope.** The composition that wraps them (AL3). Inline anchored comments (AL4). Tool-tailored/community overrides (AL5). Execution of staged actions (AL7).

**Effort.** L (~5d)

---

### AL3 — Review composition surface

**Workpackage.** As a reviewer, I want to open one review of a Subject (a task's or bet's output) and see the whole thing — where it came from (the bet/task and the prompt), what was achieved (the outcome plus a visible result), what needs me, the artifacts (each openable to examine), the discussion, and the verdict — and resolve it with one decision. This builds the founder-approved review surface that composes the family canvases into one coherent review.

**Why this matters.** This *is* the review experience — the headline USP. Without it there is no place to review a Subject as a whole, and the canvases (AL2) have nowhere to live. The reviewer gets one surface to orient, judge, examine, and decide. The design is approved (`ReviewCompositionRefined`).

**What exists today.** Verdicts post and resolve inline in the host thread (RichMessageCard, ThreadShell, the 5 verdict actions). The approved composition exists as a design story (`ReviewCompositionRefined`). No production review surface that composes a Subject's artifacts with the dual-anchor frame, the right-pane examine, and the header verdict.

**What's genuinely missing.** The production review destination: the frame (bet/task + prompt + outcome + KPIs + needs-you), the artifact set with right-pane examine, one global conversation, and the Subject-level verdict — selecting each artifact's family canvas (AL2) by kind.

**Depends on.** AL2 — the composition renders the family canvases as the artifacts' examine content; cannot be built until the canvases exist.

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

**Out of scope.** The family canvases (AL2). Anchored comments (AL4). The review-queue/inbox surface. Execution of staged actions (AL7). The conversation's eventual AM-redesigned style (adopt later).

**Effort.** L (~5d)

---

### AL4 — Inline anchored review comments

**Workpackage.** As a reviewer, I want to attach a comment to a specific spot in what I'm reviewing — a diff line, a paragraph, a block, a region — so my feedback is precise and threaded at the exact point it refers to and survives edits to the content. The approved review carries only a textual reference-chip placeholder; this builds real content-following anchored comments across the artifact kinds the review renders.

**Why this matters.** Precise, point-of-reference feedback is table-stakes for serious review, and the AL1 research names robust anchoring as a *loved* differentiator (and fragile anchoring as the universally-hated failure). The reviewer gets to say "this line is wrong" anchored to the line; without it, feedback stays generic. Scaffolding (block identity) exists but no UI wires it.

**What exists today.** Block-reference scaffolding (`PlainPayloadWithBlockId`, stable block IDs); `CommentRow` renders an `inlineAnchor` label only; the approved composition uses a textual reference chip as a placeholder. No UI to create or display a content-following anchored comment.

**What's genuinely missing.** The interaction + wiring to anchor a comment to a specific spot within a rendered canvas (at least code diffs and prose/block content), render it at the anchor, thread replies, and keep it bound to content (block identity) so it survives edits.

**Depends on.** AL3 — anchored comments live in the review's conversation and anchor into the canvases the composition renders; cannot start until the review surface + canvases exist.

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

### AL5 — Tool-tailored review canvases (override the family floor)

**Workpackage.** As HyperIdle and its ecosystem, I want a tool or a third party to supply a **tailored review canvas** for a specific tool's output that replaces the generic family canvas — either shipped by the tool itself (its MCP server returns the review UI) or contributed via a registered template — so reviewing, say, a Stripe refund or a Figma design is purpose-built without HyperIdle hand-building every tool's canvas. This opens the canvas slot to tool-shipped and community-contributed overrides, with the family canvas as the always-present floor.

**Why this matters.** "Review for anything across every tool" cannot scale if HyperIdle builds every tool's canvas. The override tiers let the long tail be covered by the tool vendor (MCP Apps) or the community (a template/registry). The founder and the ecosystem benefit; without it, every non-family-generic tool gets only the generic canvas.

**What exists today.** HyperIdle speaks MCP (the harness). The built-in family canvases + the kind→family selection (AL2/AL3). No mechanism for a tool's MCP server to return an embeddable review canvas, and no community template/registry for a per-tool canvas.

**What's genuinely missing.** The resolution layer above the family floor: render a tool-shipped canvas (a sandboxed UI returned by the tool's MCP server) when present, and/or a community-registered per-tool template, selected by (tool, kind) ahead of the generic family canvas — safely (sandboxed, trust-tiered).

**Depends on.** AL3 — there must be a review surface with a canvas slot (and the family floor) to override; cannot start until the composition exists.

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

**Out of scope.** The built-in family canvases (AL2). Building per-tool MCP connectors. Any specific tool's canvas content.

**Effort.** L (~6d)

> **Scope note (AL6–AL7).** The two workpackages below deliberately extend Track AL beyond its original "interaction layer only" scope into the **review→act loop**: getting work *into* review (AL6, harness domain) and what *approve* triggers (AL7, agent-runtime domain). Both flow from the AL1 review-system note (`plans/AL1/design/review-system.md` §4, founder-parked) and are concept-introducing — each runs its own `/concept` first.

---

### AL6 — Harness review-return hooks

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

**Out of scope.** What an approve triggers (the execution loop — AL7). The payload schema of each return action (architecture). New harness types.

**Effort.** L (~3-4d)

---

### AL7 — Review execution loop

**Workpackage.** As a reviewer, I want approving a review to let the *trusted* agent's irreversible action actually happen — through the agent's own tools — so that "approve" means the work proceeds, not just that it's marked accepted. We trust the agent: it holds its own credentials and runs its own tools (like a real employee with broad self-permission). When it attempts an irreversible call (a refund, a deploy, a send, a record write), that one call is routed to a human as a **collaboration checkpoint** and captured as the subject the human reviews; everything reversible flows. On approve, the agent re-engages and does the approved work itself — then keeps working (closes the story, updates docs, proceeds). A non-approving verdict holds it. Today approval records a verdict but nothing proceeds — the review has no teeth.

**Why this matters.** This is the *act* in plan→review→act, the founder's core loop. Without it, the review experience is a viewer: a human can approve, but nothing happens, and consequential agent work either never proceeds or proceeds without the checkpoint. The reviewer and the founder benefit directly — approve becomes the moment a human steers the consequential, while the agent does real work freely on everything reversible. The checkpoint **fades as trust grows** (ETHOS §4) — more autonomy is the goal.

**What exists today.** Verdicts post, resolve, and emit events (thread/verdict system); a tool registry + `registry.invoke` participation point exist; live session dial-in exists; the AL1/AL2 design includes an action-operation review canvas. The harness adapters expose native permission features (Claude `canUseTool`; Codex native PreToolUse hooks already wired by AL6; opencode native `permission` + `serve`; builtin owns its loop). **A first AL7 shipped a kernel-executor model (HyperIdle re-ran the op via a curated `executeCapability`/`KERNEL_DISPATCHABLE_CAPABILITIES` map) — that code is superseded and replaced by this trust-first loop; do not preserve its credential-withholding / capability-split / dispatcher framing.** What's missing is the trust-first loop itself.

**What's genuinely missing.** The trust-first loop: route a trusted agent's irreversible call to a human checkpoint and capture it; on approve, re-engage the agent so its own session/tools run the approved work and then continue; record the real Outcome and surface it against the review. Carried by each supported harness's native permission mechanism as a workflow — never a HyperIdle-side executor.

**Depends on.** None for the loop. (The review primitive and verdict system are locked/exist. The Codex lane reuses AL6's already-wired `.codex/hooks.json` PreToolUse hook.)

**Complexity.** L

**Human design review.** No — no novel UI; rides the existing action-operation review canvas (`reviews.ts` / `ReviewComposition.tsx`), surfacing the concrete captured call (tool id + verbatim args) and the Outcome. The approve→proceed affordance extends the existing canvas rather than introducing a new base primitive. (`/design`'s DESIGN-CLASS is authoritative at design time.)

**Acceptance criteria.** *(Outcome-level — what becomes true; the concept/architecture own the mechanism.)*
- Approving a review whose subject is the trusted agent's irreversible call lets that action actually happen — run by the **agent's own session and tools**, not re-executed by HyperIdle — without the human leaving the review.
- An irreversible call the agent attempts is routed to a human checkpoint and captured as the reviewed subject; the human sees the concrete proposed call (tool id + verbatim args). A reversible call flows without review.
- A non-approving verdict (request-changes / reject / edit) does not let the call happen; it stays held and un-run.
- After the call runs, the real result (success or failure) returns to HyperIdle and is visible against the review; failure surfaces, never silently swallowed.
- A given approval lets the call happen at most once — re-opening or re-showing the review does not double-run it.
- A call the human never approves never happens.
- After the approved call runs, the agent **continues working** — it does not stop at the call (closes the story / updates docs / proceeds). (Folds in the former AL10.)
- The loop is proven **LIVE against the real installed harnesses** — for every supported harness (builtin, Claude, Codex, opencode), end-to-end, never a stub. A harness whose real binary/SDK is absent makes its lane fail, never silently pass.

**Validation scenarios.**
- Given a review of an agent's attempted irreversible op (e.g. a refund / a file commit), when the human approves, then the agent's own tools perform it and its real result shows against the review.
- Given the same review, when the human requests changes instead, then nothing happens and the call stays held.
- Given an already-approved-and-run op, when the review is re-opened, then it does not run a second time.
- Given an approved op that has run, when the agent's session resumes, then the agent keeps working past the op (continues the story).
- Given each supported harness with its real binary/SDK installed, when the loop runs end-to-end, then it completes live on that harness.

**Plan calls.** Concept locked (`plans/AL7/concept.md`, trust-first) — re-anchored on ETHOS §4 "Trust Agents": review = a collaboration checkpoint carried by the harness's native permission mechanism, not a containment gate; the noun is `Proposed Call`. Run a standard architecture pass against that concept. Spans the agent-runtime / harness-permission domain.

**Contracts / constraints.** *(Outcome-level — what must hold, not the mechanism.)*
- **Trusted collaboration, not paranoia (ETHOS §4).** We trust the agent; we do not withhold credentials a tool needs, do not build "the only path" containment, and do not design against a hypothetical rogue agent. The checkpoint is where a human chooses to weigh in on the irreversible.
- **HyperIdle executes nothing of its own.** The agent's own session/tools/creds run the call; HyperIdle captures, routes-to-review, records, and re-engages — it never authors or re-runs a tool.
- **The work continues after the result** — the agent keeps working past the approved call (closes the story / updates docs / proceeds).
- **At-most-once** — a given approval lets the call happen at most once; re-show/re-open never double-runs it.
- **Only irreversible calls gate; reversible flows.** Descriptive artifacts (a code diff, a document) do not "run" on approve.
- **The verdict grammar is unchanged** — approve stays approve; it gains a consequence, not a new action.
- **The gate fades as trust grows** (verdict-history trust signal); reversible auto-flow + autonomy widening is AL8. AL7 ships the gated arm.
- **Proven LIVE on the real installed harnesses** — all four supported harnesses, end-to-end, no stub-as-proof; an absent binary fails its lane.

**Out of scope.** Reversibility-driven auto-flow + autonomy widening (AL8). Multi-step transactional rollback beyond a single call's own semantics. Broad per-tool coverage beyond proving the loop live per harness with at least one real irreversible op.

**Effort.** L (~5-6d — four harness lanes proven live)

---

### AL8 — Reversibility-driven auto-flow for staged operations

**Workpackage.** As a founder who has built trust with an agent, I want that agent's *reversible* staged operations to flow without me approving each one — while *irreversible* ones still gate — so that my approval effort concentrates on what genuinely can't be undone instead of every consequence. Today every staged operation from AL7 waits for an explicit human approve regardless of reversibility or how much the agent has earned my trust. The system already auto-resolves high-trust, low-risk review *items* via the policy engine, but staged operations bypass it entirely. This wires the two together so trust actually translates into less work.

**Why this matters.** This is the other half of AL7's founding principle (ETHOS §3): *never put a human in front of a reversible one.* AL7 shipped only the gated arm, so the system currently interrupts the human for reversible work too — the exact approval fatigue ETHOS warns against. The founder and every reviewer benefit directly: as an agent's approval-rate history climbs, its reversible operations stop demanding clicks. The cost of not building it: the review queue stays full of reversible no-brainers, earned trust never reduces the human's load, and HyperIdle feels like every other approval-fatigued agent tool.

**What exists today.** AL7's staged-operation model — `staged_operations` (carrying a `reversibility` field), the dispatcher, at-most-once execution on approve. The policy engine (`packages/fabric/src/services/policy-engine.ts`) already decides push / queue / auto_resolve for review *items* using the agent's approval-rate trust signal (verdict history over a factory-settings window, cold-start protection) and a `riskTier` (high/low). The two are unconnected: staged operations always gate, and the policy engine never sees them. AL7's `reversibility` axis and the policy engine's `riskTier` axis are two parallel, unreconciled risk vocabularies.

**What's genuinely missing.** A path where a staged operation's reversibility, crossed with the agent's trust signal, lets a *reversible* operation execute without a human verdict — plus a single reconciled risk model so "reversible" and "low riskTier" are not two conflicting axes. Irreversible operations must still always gate.

**Depends on.** AL7 — this consumes the staged-operation model and its execution path; it cannot be built or verified until AL7 is `done`.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Required — run `/pipeline:refine AL8` first. It reshapes the gating classifier: reconcile AL7's `reversibility` axis with the shipped policy engine's `riskTier` + approval-rate trust signal into one model, and define when a staged operation auto-executes vs gates. A load-bearing reshape of how the gate decides — point at `docs/process-layer/staged-operation.md` and `packages/fabric/src/services/policy-engine.ts`.
- **Design:** Light — extends existing review/outcome surfaces (an auto-executed staged op appears with its outcome, like the existing item auto_resolve path); no novel surface. Single-variant `/pipeline:design` to place auto-execution provenance, no human-review park.

**Human concept review.** No — backend gating reconciliation; the only surface change is showing auto-execution provenance on existing review/outcome surfaces, not a new primitive.

**Acceptance criteria.**
- A reversible staged operation from a sufficiently-trusted agent executes without requiring a human verdict, and its outcome is still recorded and visible against the review.
- An irreversible staged operation always requires a binding human approval, regardless of trust level, and never auto-executes.
- An agent with insufficient trust history has all its staged operations gated — reversible or not — until it accumulates enough verdict history.
- For any staged operation, a reader can tell why it gated or flowed under one coherent risk model, without reconciling two separate risk vocabularies.
- An auto-executed operation is distinguishable from a human-approved one wherever outcomes are surfaced (its provenance is recorded).
- At-most-once execution holds for auto-flowed operations exactly as for approved ones.

**Validation scenarios.**
- Given a high-trust agent and a reversible staged operation, when the agent stages it, then it executes without a human verdict and its outcome is recorded.
- Given any agent and an irreversible staged operation, when the agent stages it, then nothing executes until a human approves.
- Given a new agent with no verdict history, when it stages a reversible operation, then it is gated (cold-start protection), not auto-executed.
- Given an auto-executed operation, when a human views the review, then it is shown as auto-executed rather than human-approved.

**Plan calls.** Concept-reshaping — run `/pipeline:refine AL8` first (reconcile reversibility × riskTier × approval-rate trust into one classifier). Then a standard architecture pass plus a light `/pipeline:design` to place auto-execution provenance on the existing review surfaces. Spans the fabric policy-engine and the staged-operation-dispatcher domains.

**Contracts / constraints.**
- Irreversible + any trust level → always gated; never auto-executes. The ETHOS §3 floor is preserved.
- One reconciled risk model — `reversibility` and `riskTier` are unified or one is defined in terms of the other; no two parallel conflicting axes survive.
- Cold-start protection holds — insufficient verdict history → gated regardless of reversibility.
- At-most-once execution is preserved for auto-flowed operations (no weaker guarantee than the gated path).
- The trust signal stays Kernel/Strategy-owned (approval-rate from verdict history); an agent never sets its own flow eligibility.
- Auto-execution provenance is recorded and surfaced — an auto-executed operation is never indistinguishable from a human-approved one.

**Out of scope.** The layer-3 pre-call interception backstop (deferred). Broad per-tool dispatch coverage (Track AN). Any change to the verdict grammar or the human-approval path for irreversible ops. Re-introducing per-skill autonomy levels (removed by AD4; this uses the verdict-history trust signal — see AL9).

**Effort.** L (~4-5d)

---

### AL9 — Trust-model consolidation: remove vestigial per-skill autonomy

**Workpackage.** As a developer or agent reading the codebase, I want one trust model — the verdict-history approval-rate signal AD4 introduced — with no leftover per-skill autonomy-level data, routes, or types, so that nobody mistakes the dead L1→L4 dial for the live gating mechanism. AD4 replaced per-skill autonomy in the policy engine but left the `autonomyLevel` CRUD endpoint, settings field, and types in place; they are stored and editable yet consumed by nothing for gating decisions.

**Why this matters.** This dead code already caused a concrete failure: an audit (and nearly an AL7 follow-up planning pass) mistook the vestigial per-skill autonomy CRUD for the live trust model, because the data and routes still exist. Every future reader, agent, and reviewer pays that confusion tax, and AL7's gate concept cannot be explained cleanly while two trust models appear to coexist. The cost of not building it: the next person re-derives the same wrong conclusion. Removing it makes the one real model legible — a maintainability cost already being paid in misreads.

**What exists today.** AD4 (merged, PR #220) rewrote `packages/fabric/src/services/policy-engine.ts` to gate on `getAgentTrustSignal` (approval-rate from verdict history) and removed `getAutonomyLevel`. But the per-skill autonomy level survives as unconsumed vestige: the `PATCH /:id/skills/:skillId` route in `packages/server/src/routes/users.ts` (still emits `autonomy_change` events), `autonomyLevel` in `packages/server/src/routes/settings.ts`, and the `AutonomyLevel` type in `packages/fabric/src/types.ts` and `packages/web/src/settings/settings-types.ts`. `packages/shared/src/agent-profile.ts` already records that the review track record "replaces per-skill autonomy level."

**What's genuinely missing.** The removal of the per-skill autonomy data model, routes, types, and any residual UI surface AD4 left behind — so the verdict-history trust signal is the only trust mechanism present in the code. Whether routine `autonomyLevel` (a distinct axis for recurring routines) is the same dead path or a genuinely live one is for the architect to determine before deleting.

**Depends on.** None — AD4 is `done`; this finishes its cleanup.

**Complexity.** M

**Pre-build gates.**
- **Refinement:** Not required — consumes the already-locked AD4 trust model (verdict-history approval rate, settled in `policy-engine.ts` + `agent-profile.ts`); introduces no noun.
- **Design:** Not required — backend/data/route removal. Any residual autonomy UI field is removed as dead UI, not a design decision; if a surface genuinely needs rework, that is flagged back, not pre-resolved here.

**Human concept review.** No — vestigial-code removal; no new or reshaped surface.

**Acceptance criteria.**
- The per-skill autonomy level can no longer be set or read through any API — the route that mutated it is gone.
- No code path stores, reads, or emits events for a per-skill autonomy level.
- The codebase contains exactly one agent trust model (the verdict-history approval-rate signal); a search for autonomy-level types/fields returns only genuinely-distinct live concepts, nothing vestigial tied to the removed per-skill dial.
- Gating behavior is unchanged after the removal (proof the autonomy level was already unused).

**Validation scenarios.**
- Given the cleaned codebase, when a client calls the former per-skill autonomy endpoint, then it no longer exists and no other behavior regresses.
- Given the policy engine, when it makes a gating decision, then it relies solely on the verdict-history trust signal (unchanged behavior).
- Given a code search for the per-skill autonomy type, when run after the change, then it returns no vestigial references.

**Plan calls.** Skip `/pipeline:design`. Standard architecture pass — locate every reference to the per-skill autonomy level (routes, settings, types, events, any UI), confirm none feeds a live gating decision, and remove them. Distinguish the dead per-skill dial from any genuinely-live axis (e.g. routine autonomy) before deleting. Spans server routes + fabric/web types.

**Contracts / constraints.**
- Gating behavior is unchanged — removal is provably behavior-neutral (the data was unconsumed for decisions).
- After this WP, the verdict-history approval-rate signal is the only agent trust mechanism in the code.
- Forward-only — no migration that preserves the dead column's data; it is removed.
- Do not touch any genuinely-distinct live axis (routine autonomy) unless proven to be the same dead path.

**Out of scope.** The reversibility-driven auto-flow wiring (AL8). Any change to the verdict-history trust signal itself (AD4 owns it). Routine autonomy, if it is a separate live mechanism.

**Effort.** M (~3-4h)
