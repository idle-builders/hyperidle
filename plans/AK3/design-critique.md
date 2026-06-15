# Design Critique: AK3 — Bet detail honest task state

DESIGN-CRITIQUE: variant=honest-task-state score=8/10  rounds=1  axes: H:8 S:9 T:9 C:8 Co:9 St:9 A:7 AS:9 PP:7

Scored from `spec.md` + `variant.tsx` against the real primitives (viewer down at :8098; variant is a story-only sketch, not catalogued). All composition claims were verified against `packages/design-system/src/EmptyState.tsx` and `tokens.css` — every prop, token, and `role` the variant uses exists and behaves as the spec asserts. This is pure copy/icon/action composition over an already-shipped, already-screenshotted primitive, so code/spec scoring is appropriate; there is no new rendered surface to evaluate visually.

## Verified against reality (not just claimed)
- `EmptyState` exposes `title`, `description`, `icon?`, `iconBg?` (default `--accent-primary-dim`), `action?`, `dataTestId?`, and renders `role="status"` — exactly the API the variant uses.
- `--accent-primary-dim`, `--accent-secondary` (#d97706 amber), `--accent-secondary-dim` all exist in `tokens.css` (both Dark and Light variants). The amber-not-red call is honored by tokens.
- The status quo it replaces is real: `WorkBet.tsx:1504-1507` renders the unconditional `EmptyState title="No tasks yet" description="Tasks will appear here once agents start work on this bet."` — the precise C1 violation.

## CONCEPT-FIDELITY (does it satisfy AC3 / AC4?)
- **AC3 (never a permanent false promise):** SATISFIED. The four-state switch with the precedence rule (`tasks>0 → draft → blocked → decomposing`) makes the empty slot conditional on real state. The permanent "Tasks will appear" string is removed. The one residual is the "Decomposing" state, which is only honest if architecture guarantees it terminates — correctly flagged as an architecture obligation in `spec.md` §Trade-offs and design `approved.md` Open-Q2, not papered over.
- **AC4 (explicit no-eligible-agent blocker):** SATISFIED. `bet-tasks-blocked` (reason `no_eligible_agent`) carries explicit copy ("No one can take this work" / "This team has no agent eligible to own tasks…") plus a recovery action ("Add an agent"). It is a state to act on, not a generic empty.

### WARNING
- [spec.md §States — precedence] The two `spec.md` files disagree with `approved.md` on precedence ORDER, and one of them is buggy. `approved.md` (the contract `/architecture` follows) lists `tasks>0 → draft → blocked → decomposing`. `variant.tsx:38` and `honest-task-state/spec.md:38` BOTH list `draft → populated(tasks>0) → blocked → decomposing` — putting **draft before tasks-exist**. These produce different output for a hypothetical `status==='draft'` bet that already has tasks: approved.md shows the task list, the variant spec shows the draft empty-state and HIDES real tasks. That contradicts the variant's own stated invariant ("Tasks existing always beats any blocker"). → Architecture/builder MUST follow `approved.md`'s order (`tasks>0` first). Flag the variant-spec ordering as superseded so the builder does not copy the buggy precedence from the lower doc. Not CRITICAL only because `approved.md` is the binding contract and it is correct.

### WARNING
- [variant.tsx:73 / approved.md "Add an agent"] The recovery action's target route is unresolved (design Open-Q3, arch R4: "builder confirms the team-agents settings route"). A "recovery, not a dead end" affordance that links nowhere is a dead end. → The route MUST be pinned before `/write-code`, and the component test for AC4 should assert the link `href`/handler targets a real route, not just that the button renders. As-is the affordance is unverifiable.

### SUGGESTION
- [variant.tsx:9-25] The amber alert glyph is an inline hardcoded SVG duplicated across `BlockedNoAgent` and `BlockedEmpty`. Two call sites of an identical 16-line SVG inside one feature is the threshold where a shared `<AlertGlyph>` (or a design-system icon) is cleaner — but it does NOT meet the "2+ contexts" bar for a new design-system primitive, so an inline module-local const in `WorkBet.tsx` is correct. Just define it once, not twice.
- [spec.md §A11y / approved.md §A11y] The `role="status"` decision for the blocked state (vs `role="alert"`) is sound and well-argued (persistent honest state discovered on view, not an interrupt). No change. Worth noting the blocked state is the one a founder "must never miss" (brief Probes) yet is `role=status` — acceptable because it is in-place persistent content, not transient. Keep.
- [spec.md §States — Decomposing trigger] "`decompositionStatus === "running"` **or unset-but-recent**" smuggles a time-based heuristic into the UI ("unset-but-recent"). The UI must not guess decomposition state from clock math. → Rely solely on the server-provided `decompositionStatus`; drop "unset-but-recent." (Architecture already models a real `running` status, so the fallback is unnecessary and dishonest.) Belongs in arch critique too — see FMC there.

## States / Completeness
- States dimension is the whole point of the workpackage and it is thorough: draft / decomposing / blocked(×2 reasons) / populated, each with final copy + testid. The empty/blocked/loading paths are explicit. No missing hover/focus on the one interactive element (Button owns those). 9/10.

## What's Working Well
- Zero new components, every state is `EmptyState` (states 1–3) or the existing list (state 4) — the reuse gate is genuinely honored and verified against the real primitive API. This is the right altitude for a routine surface.
- The amber-not-red semantic and `LiveDot`-as-planning-signal (instead of a fake progress bar or a sub-second spinner) are correct, honest judgment calls — and the rejected-directions list (BlockerBanner / ErrorState / progress bar / toast / retry button) is specific and well-reasoned, not strawmanned.
