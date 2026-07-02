# AO3 — Agent output becomes reviewable and landable — Refinement (post-AL7 re-check, Round 2)

> Gate type: **NEEDS-RESEARCH + CONCEPT**. Both deps merged to main (AL7 #351, AO2 #376). This pass re-measures the residual gap against shipped code (file:line on origin/main), then verdicts. **Round 2 revises** per `refine-critique.md`: one AL7-faithful loop (CRITICAL), explicit at-most-once landing AC, AC5 wording, diff-canvas evidence.

## VERDICT: **SCOPE-RESIDUAL** (tight, ETHOS-compliant, non-duplicative)

AL7 shipped the *execution* spine (capture → review → approve → agent re-runs its own tool → Outcome) and replaced the singular review fixture with real generation. **But the specific gap the AO3 problem statement flagged is real and unbuilt: an agent's actual captured filesystem change (AO2's `filesystem_captures`) has no path to (a) be rendered as a review subject through a proof canvas, nor (b) be landed to the connected git target.** The AL7 proof-vehicle (`commit_file`) only writes to the sandbox; nothing pushes/PRs; the `filesystem_captures` row has **zero readers**. The residual is small and rides AL7's machinery — it does not rebuild it.

The spec's "the system triggers the connected target" contract is **superseded** by AL7's trust-first model and reconciled below: landing is performed by the **agent's own AL7-gated registered tool** (the `commit_file` precedent), never a HyperIdle system executor.

---

## The single AL7-faithful loop (Round-2 re-seam — resolves the CRITICAL)

**One review subject, one proof pane, one grant.** The captured multi-file diff is rendered as the **proof pane of the `land_change` Proposed Call** — not as a separate session-end review. This is exactly AL7's own model: *"the reviewer always sees two things: the proof (diff …) and the one captured commit verb (the Proposed Call)"* (`staged-operation.md:28`). The loop:

1. Agent edits N files in an AO2-mounted worktree; on a real code task it then attempts its **landing tool** `land_change` (the irreversible verb). AL7's router captures it as a **Proposed Call** (`tool-registry.ts:661-679`), anchored to a review message + subject thread; session 1 ends.
2. The review (`reviews.ts` `GET /:reviewMessageId`) renders that Proposed Call. **AO3's only review-surface change:** the proof pane carries the **captured multi-file diff** (the `code_diff` canvas), sourced from the AO2 `filesystem_captures` row the call references — instead of a bare `toolId` placeholder artifact.
3. Human approves → `threads.ts:1486-1525` composes the **tailored grant** keyed on `proposedCalls.reviewMessageId` (the real, existing path) → `proposed_call_granted` → session 2.
4. Session 2: the agent re-attempts `land_change`; the router CAS-consumes the grant (`tool-registry.ts:626-637`) and runs the handler, which performs the **real authenticated push** of the captured commit; `recordOutcome` writes the pushed SHA. The agent continues.

### Why NOT the `items`/session-review-creator path (scoped out)
`session-review-creator.ts` writes an `items` row (`kind:"review"`, titled `"Session completed: <outcome>"`) with **no `reviewMessageId`, no Proposed Call, no payload diff**, and **`reviews.ts` never reads it**. The verdict endpoint composes a grant **only** for a `proposedCalls` row found by `reviewMessageId` (`threads.ts:1475-1479`); an `items` review composes **no grant**. Bridging `items` → grant would require **new grant-composition machinery = duplication of AL7's grant spine** — forbidden by the hard "NO duplication of AL7" contract. **Therefore `session_ended` / `items` / session-review-creator is OUT OF SCOPE for AO3.** AO3 touches only the `messages` / `proposedCalls` actionable path. (A proofless session-end summary is an AL-track concern, not AO3's.)

After this re-seam, **the old AC1 collapses into AC3**: there is exactly one review subject — the `land_change` Proposed Call — whose proof renders the multi-file capture diff; approving it composes the real grant; session 2 executes the landing.

---

## Evidence table — the re-check questions (origin/main)

| # | Question | Answer | Evidence (file:line) |
|---|---|---|---|
| 1 | Does AL7 render the **actual captured code change** as a review proof subject? | **NO.** Real generation exists for **proposed-call** reviews (`reviews.ts:106-194` nests the captured `{toolId, args}` on an artifact), but `commit_file`'s proof is a single sandbox write, never a multi-file git diff, and the AO2 capture is never read. Session-end `items` reviews are proofless (`session-review-creator.ts:104-112`) and compose no grant. | `reviews.ts:106-194` (real DB generation, verbatim args). `session-review-creator.ts:104-112` (`items` row, no diff, no PC, no grant link). |
| 2 | Does AL7's execute-on-approve cover **landing a filesystem change** (push/PR)? | **NO.** `commit_file` writes **only to the sandbox** (`commit-file.ts:34-69`, no git). The only production `runner.push` is **knowledge-export** (`git-export.ts:478`), unrelated to agent-session captures. The AO2 `filesystem_captures` row has **no consumer at all**. | `commit-file.ts:34-69`; `git-export.ts:478`; `capture-store.ts` (only writer; comment line 5 promises "AO3 reads this" — grep confirms no reader). |
| 3 | Does AL7 enforce **at-most-once** on the captured op? | **YES, generically** — Outcome PK (= Proposed-Call id, 0..1) + a single-statement atomic CAS that consumes the grant once (`tool-registry.ts:626-637`). But `land_change` is a **NEW handler** that must demonstrably ride this (a double-push fabricates duplicate commits on a real remote). | `tool-registry.ts:626-637` (CAS `consumed:false → true`, `returning()`); `recordOutcome` PK on `proposedCallId`. |
| 4 | Is a **multi-file git-diff canvas** present (DESIGN gate)? | **YES.** `code_diff` is a registered review canvas (`canvas-registry.ts:27`) with a multi-file, relevance-ranked, per-file-hunk view (`ReviewCodeDiff.tsx`); `mapCodeDiffPayload` (`:796-838`) maps a real `payload.files[].hunks[].lines` shape — not single-file. **DESIGN-none holds.** | `canvas-registry.ts:27`; `ReviewCodeDiff.tsx:151-178,796-838`. |
| 5 | **Net residual** | (i) Render the captured multi-file diff as the **`land_change` Proposed Call's proof pane** (`code_diff` canvas), sourced from the AO2 capture; (ii) the `land_change` tool that performs the authenticated push, riding AL7's router/grant/Outcome unchanged; (iii) finally **consume the orphaned `filesystem_captures` seam**. AL7 owns gate/grant/Outcome; AO3 supplies the capture→proof renderer + the landing tool. | Synthesis of Q1–Q4 + `capture-store.ts:5` + `tool-registry.ts:610-684` (the router AO3 rides — no rebuild). |

### Reconciling "system lands" vs AL7 "agent executes" (the flagged tension)
AL7 hard-rule 2: *"HyperIdle executes nothing of its own."* The spec's "the system triggers the connected target" is the **pre-trust-first** framing and is **superseded**. Reconciliation uses the **`commit_file` precedent**: `land_change` is a HyperIdle-registered, irreversible tool the *agent invokes*; AL7 gates it; session 2 the agent's invocation executes it under the tailored grant. HyperIdle **provides** the tool and **books the checkpoint**; it never pushes of its own accord. Trust-first compliant; contradicts nothing in AL7.

---

## Sharpened goal

**As** a human reviewing an AI agent's work on a code filesystem, **I want** the agent's real captured change rendered as the proof pane of a single landing review (the multi-file diff, through the `code_diff` canvas I already use) and **approval to land it** to the connected git target, **so that** the plan→act→review→land loop closes on *real output* — not on a synthetic single-file proof tool, not on a bare "Session completed" line, not on a fixture.

- **User value:** the build loop's final stage works end-to-end on the actual artifact an agent produces (multi-file worktree edits via its native editor — the normal case), not just AL7's `commit_file` proof vehicle.
- **Impact:** today a real code task's output (AO2 worktree edits) dead-ends — the only landing review would be a proofless `items` title that composes no grant, and the `filesystem_captures` bundle is orphaned. A CLI agent *can* `git push` via shell (AL7 gates it), but **builtin has no landing path at all**, and the capture seam AO2 promised is unconsumed.
- **Success definition:** agent edits files in an AO2-mounted worktree → attempts `land_change` → AL7 captures it as one Proposed Call whose proof pane renders the captured multi-file diff (`code_diff`) → human approves → the real grant is composed → session 2's `land_change` pushes the captured commit to the connected target → Outcome records the receipt (pushed SHA), surfaced on the review.

### Out of scope
- The review experience/canvases themselves (Track AL — AO3 **wires into** the existing `code_diff` canvas, never builds it).
- The AL7 gate/grant/Outcome machinery (dep — reused verbatim, no rebuild).
- AO2 mount/capture-back (dep).
- **`session_ended` / `items` / session-review-creator** — composes no grant; bridging it would duplicate AL7's grant spine. AO3 uses the `messages`/`proposedCalls` actionable path only.
- `doc_set`/`file` landing (publish snapshot) — **code filesystem first**; doc_set landing is a follow-up.
- Merge automation / multi-step PR review workflows / branch-protection orchestration.
- A HyperIdle-side "system executor" that pushes of its own accord (rejected — AL7 hard-rule 2).
- Re-importing the purged "broker is the only path" containment (`staged-operation.md:41-43`) — AC5 is a self-code constraint, **not** a cage on the agent.

---

## Acceptance criteria

| # | Criterion | Verification method |
|---|---|---|
| AC1 | A registered, **irreversible** `land_change` tool exists. Invoked in session 1 it routes to AL7 review (Proposed Call status `captured`, anchored to a review message + subject thread); invoked in a grant-bearing session 2 it CAS-consumes the grant and writes an Outcome — **reusing the AL7 router unchanged** (no parallel gate). | **Runtime test** (`*.integration.test.ts`, real db+app): call the tool via `buildToolRegistry` with a session-1 workflow → assert `AWAITING_REVIEW` + a `captured` `proposedCalls` row; with a grant-bearing session-2 workflow → assert the grant CAS-consumes and an `operationOutcomes` row is written. |
| AC2 | The `land_change` Proposed Call's review payload (`reviews.ts` `GET /:reviewMessageId`) carries the **captured multi-file diff** shaped for the existing `code_diff` canvas (changed files + per-file hunks), **sourced from the AO2 `filesystem_captures` row** the call references (`filesystem_captures.id` / `commitSha`) — provably the captured change, no fixture, no re-derivation. | **Runtime test**: seed a real `filesystem_captures` row from a worktree with N changed files, capture a `land_change` Proposed Call referencing it, GET the review → assert the payload is a valid `code_diff` shape (`files[].hunks[].lines`) whose files equal the capture's diff AND references the seeded capture `id`/`commitSha`. |
| AC3 | On approve, the verdict composes the tailored grant through the **real existing path** (`threads.ts` verdict → `composeTailoredGrant`, keyed on `proposedCalls.reviewMessageId`) and session 2's `land_change` performs a **real authenticated push** of the captured commit to the connected git target via `GitRunner.push` (inherited `$HOME` auth, AQ1/AO2), recording the pushed SHA / target ref as the Outcome receipt. | **Harness-/git-facing integration test** (real git, real repo, real push to a **local bare remote**, zero stubs of `GitRunner`): drive approve → grant → session-2 `land_change`; assert the remote ref advances to the captured `commitSha` and the Outcome receipt carries it. |
| AC4 | **At-most-once landing (idempotent).** A given capture / consumed grant cannot be pushed twice: a second `land_change` attempt under an already-consumed grant does **not** advance the remote and mints **no** second commit/PR (rides AL7's Outcome PK + consume-once CAS; the `land_change` handler must demonstrably honor it). | **Extends AC3's zero-stub git harness**: after a successful push, fire a second `land_change` for the same capture → assert the remote ref is unchanged (same SHA, no new commit) and no second Outcome row. (TRACK-AO.md:145 "inherit AL7 at-most-once/outcome semantics.") |
| AC5 | **HyperIdle's own code never pushes of its own accord** (AL7 hard-rule 2): no HyperIdle source module calls `GitRunner.push` **except** the two legitimate pushers — the existing knowledge-export (`git-export.ts:478`) and the `land_change` handler. This is a constraint on **HyperIdle's code**, not on the agent: a CLI agent's shell `git push` is trusted and AL7-gated (`staged-operation.md:175`) and is unaffected. | **Lint rule** (ESLint, static): forbid `GitRunner.push` (or equivalent runner push) references outside a hardcoded module allowlist `{git-export, land_change handler}`; an `@lore` documents the allowlist + why it is self-code-only, not agent-containment (`staged-operation.md:41-43`). |
| AC6 | A non-approving verdict never lands the change; a failed push surfaces a `failed` Outcome with the error (never silent) — inherited from AL7 semantics. | **Runtime test**: held Proposed Call → no push, no remote movement; forced push failure → `operationOutcomes.status="failed"` with the error. |

### Validation scenarios
1. Agent edits 3 files in an AO2 worktree, attempts `land_change` → one review whose proof pane shows the 3-file diff through the `code_diff` canvas, sourced from the capture (AC2).
2. Human approves → `composeTailoredGrant` runs on the real `reviewMessageId` path → session 2 → `land_change` pushes the captured commit to the connected **bare remote** → review shows Outcome "pushed `<sha>`" (AC1/AC3).
3. Re-fire `land_change` for the same capture after a successful push → remote unchanged, no second commit, no second Outcome (AC4).
4. Human requests changes → nothing lands; remote unchanged (AC6).
5. Push fails (no remote / auth) → `failed` Outcome with the error surfaced on the review (AC6).
6. Static: no HyperIdle code path calls `GitRunner.push` outside `{git-export, land_change handler}` (AC5).

---

## Sizing & classes

- **Complexity:** **M (~2–3d).** Two seams, both riding existing machinery: (1) capture→proof renderer — the review payload reads the referenced `filesystem_captures` row and shapes the captured diff into the **existing** `code_diff` payload (no new canvas — confirmed Q4); (2) `land_change` registered tool (mirrors `commit_file`, calls `GitRunner.push`) riding the AL7 router/grant/Outcome unchanged. No new gate, no new outcome model, no new canvas. Re-confirmed M after the diff-canvas evidence (no net-new canvas to build).
- **DESIGN-CLASS:** **none.** The captured diff renders through the **existing, registered** `code_diff` canvas (`canvas-registry.ts:27`, `ReviewCodeDiff.tsx`, multi-file via `mapCodeDiffPayload`). No new UI surface. `/design` **skipped** (evidence-backed, not assumed).
- **DOC-CLASS:** **light.** A short addition to `docs/process-layer/staged-operation.md` (or an AO note) documenting the capture→`land_change`→push bridge, the single-loop seam (proof pane = captured diff), and the superseded "system lands" framing. No new primitive, no significant rewrite — reuses Proposed Call + Outcome + capture.
- **Human concept review:** **No.** Not novel design, not significant-doc; reuses the existing review experience + `code_diff` canvas.
- **Next plan call:** `/pipeline:architecture AO3` (skip `/design`).

---

## Trade-offs & honest open questions
- **R2 overlap with AL7 (stated honestly):** a CLI agent could already `git push` via shell and AL7 would gate it. `land_change`'s marginal value is (a) a landing path for **builtin** (no shell; can hold an AO2 git mount), (b) **deterministic testability** without a CLI harness (the `commit_file` rationale), (c) anchoring the landing to the **rendered-diff** proof pane (AC2), and (d) finally **consuming the AO2 capture seam**. The value center of gravity is AC2 (review the real output); AC1/AC3/AC4 are the smaller, reconciling half. A reviewer may argue R2 is subsumed — counter: builtin + the unconsumed capture + the proofless landing review are concrete gaps.
- **`land_change` granularity:** push-existing-commit vs open-PR. v1 = **push the captured branch/commit** (simplest, matches AO2's per-session `agent/<sessionId>` branch); PR-open is a thin follow-up arg, not v1.
- **`land_change` ↔ capture reference:** the tool's args must carry (or resolve) the `filesystem_captures` id whose commit it lands — architecture settles whether the agent passes it or it is resolved from session/task. Either way AC2 asserts the review payload references the capture.
- **doc_set landing** deliberately deferred — code first; snapshot publish has no "push" analog and needs its own connector.
- **Skeptic's check on the verdict:** CLOSE-SUBSUMED was seriously considered. Rejected because the *real* code-task output (native multi-file worktree edits, not `commit_file`) has **no** proof pane and **no** landing path today, and the `filesystem_captures` seam is provably orphaned — exactly the "final stages don't work on real output" problem the spec names.

---

## User/dev guide draft (light)
**For the human reviewer:** when an agent finishes work on a connected code repo, the review shows the **actual change** it made — the changed files and diff, in the same code view you already use — and approving it **lands** the change: the agent pushes its branch to your connected git target, and the review shows the result (the pushed commit). Request changes and nothing is pushed.

**For the developer:** AO3 adds two things on top of AL7 + AO2 — it does not rebuild either. (1) The review payload loader (`reviews.ts`) reads the AO2 `filesystem_captures` row the `land_change` Proposed Call references and shapes the captured multi-file diff into the **existing** `code_diff` canvas payload — the proof pane of one landing review (AL7's "proof + captured verb" model, `staged-operation.md:28`). (2) A registered, irreversible `land_change` tool (sibling of `commit_file`) calls `GitRunner.push` to land the captured commit; it rides the **same** AL7 workflow router — captured in session 1, executed by the agent's invocation in session 2 under the tailored grant composed on the real `reviewMessageId` path, Outcome = pushed SHA. The push is **idempotent** (AL7's Outcome PK + consume-once CAS — a second attempt for the same capture is a no-op). HyperIdle's own code never pushes outside `{git-export, land_change handler}` (lint-enforced) — a self-code rule, **not** a cage on the agent (the agent's trusted shell `git push` is AL7-gated and untouched). The `session_ended`/`items` summary path is untouched — it composes no grant and is out of AO3's scope.
