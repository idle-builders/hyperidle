# Architecture Critique: AJ5 — First-party design annotation

Reviewer (independent evaluator, AJ5). Scored cold against the 9-dimension rubric.
Plan under review: `plans/AJ5/architecture.md`. Concept (fixed input): `plans/AJ5/concept.md`.
Design contract: `plans/AJ5/design/approved.md` + `brief.md`.
Ground-truth checked: `viewer/main.tsx`, `vite.config.ts`, `viewer.css`, `.gitignore`,
`.claude/skills/human-design-review/SKILL.md`, `catalog-snapshot.test.tsx`.

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:8 N:9 MD:8 FMC:8 S:8 V:8

## Composite: 8.2/10 — APPROVED (≥7, no unaddressed CRITICAL)

| Dimension | Score | Note |
|---|---|---|
| Spec Alignment | 8 | 11 ACs each map to a task; tasks each trace to an AC or forced dep (types, mount, gitignore, de-hoax). No scope creep. Two design refinements not yet folded into §task 5 wording (WARNING below). |
| Layer Integrity | 9 | Entirely within the design-system viewer (dev medium). No HyperIdle layer crossed; no app DB; no model calls. Dev-only Vite middleware never touches the product layers. |
| API Contracts | 8 | Three middleware routes named with method + path + response + status + 400/404 error shapes; `AnnotationInput` is an exported type, not "like the existing endpoint". Minor: response body shape `{ state }` vs `{ status, json }` adapter envelope could be stated once more crisply. |
| Data Model | 8 | File-format contract is field-by-field (JSON canonical + derived MD), with a worked example. `id`/`createdAt` server-assigned; round immutability stated. Not a DB schema, so FK/index rubric mostly N/A. |
| Naming | 9 | `annotation-store` / `request-handler` / `resolve-component` / `vite-plugin-annotations` honestly describe roles. `Annotation`/`Round`/`AnnotationTarget` match the locked concept vocabulary; no collision with Bet/Task/Session/Thread/Block/Artifact. |
| Module Depth | 8 | Clean split: three importable pure units + one thin Vite plugin. `request-handler` hides routing behind one entry `handleAnnotationRequest`; store exposes 5 functions (read/append/start/render/mdPath) — narrow for the problem. |
| Failure-Mode Cov. | 8 | Security block covers rate-limit / input-trust / path-traversal / SSRF / secrets / bundle-leak, each applicable+addressed or N/A-with-reason (CC-003 satisfied). Route-checklist present. Prompt-injection boundary reasoned (WARNING refines it). |
| Simplicity | 8 | No premature abstraction; design-it-twice §A/§B are genuine forks with a real loser, not theatre. `opts?: { dir? }` is the one config seam and it's justified (test path injection). |
| Verifiability | 8 | Each AC has a concrete harness (jsdom render + assert, tmp-file store tests, mocked-fetch overlay test, lint/type for static props, live-proof for AC11). Test-before-impl ordering in §Ordered tasks. `protectedTests` populated (catalog-snapshot). |

## CRITICAL
(none)

## WARNING

- **[§Ordered tasks task 5 ⇆ design/brief.md §Architecture deltas] The two approved design
  refinements are NOT yet reflected in the plan's task wording.** `approved.md` and `brief.md`
  explicitly flag two refinements the architect must "carry into §task 5 wording if updating":
  (a) **one-shot arm, not sticky** — the capturing listener attaches on arm and **detaches on
  capture/cancel**, scoped to the **story root**, never `document` (must NOT replicate
  `feedback-overlay.js`'s always-on `document.addEventListener('click', …, true)` trap); (b)
  **popover fixed to the pill, not element-anchored** — no positioning math. Task 5 currently says
  only "intercepts the next click in the story area" and "opens a small note popover" — ambiguous
  enough that a builder could implement the sticky-document-listener anti-pattern the design
  explicitly rejected. → Fix: edit §task 5 to state the one-shot attach/detach lifecycle, the
  story-root scoping (exclude pill/popover/toolbar), and the fixed-to-pill popover. This is the
  single highest-value plan edit; without it the design's two hardest-won decisions are unenforced.

- **[§Type signatures `resolveComponentTarget` + §Risks fiber-key] Fiber-key brittleness fallback is
  named but the fallback BEHAVIOR is under-specified.** The plan correctly scans `Object.keys(node)`
  for a `__reactFiber$` prefix (right approach — the suffix is per-bundle, training-data hard-coding
  would rot) and says "if it ever breaks, `data-ds-component` is the graceful fallback for DS
  elements." But the type contract says `component: string` with `"unknown"` fallback, while the
  fallback prose says use `dsComponent`. These disagree: when no fiber key is found on a **plain HTML
  inner element** (the exact case fiber was chosen to solve), `dsComponent` is *also* likely null, so
  the fallback collapses to `"unknown"` — silently defeating AC1's whole purpose with no signal to the
  founder. → Fix: specify the fallback chain explicitly in `resolveComponentTarget` —
  (1) fiber `displayName||name`; (2) on no fiber key, fall back to nearest `[data-ds-component]`
  ancestor's value; (3) `"unknown"` only as last resort — and have the overlay surface "unknown" in
  the popover header so the founder knows resolution failed (rather than silently mislabeling). Add an
  AC1-adjacent assertion for the "no fiber key" branch so the brittleness is test-covered, not just
  @lore'd.

## SUGGESTION

- **[§Security & abuse cases — input-trust boundary]** The prompt-injection reasoning ("trusted
  founder is the only writer, file gitignored, localhost-only middleware → N/A beyond that") is sound
  for the threat model, but the conclusion understates a second-order risk: the agent reads
  `annotations.md` **as context** and the `note` is **free text** — even a trusted founder can
  accidentally write a note that reads as an instruction ("ignore the previous task and …"). This
  isn't a security hole (no untrusted writer) but it is an agent-robustness note worth one line:
  the consuming skill (human-design-review) should frame `## Round` content as *founder feedback
  data*, not as instructions, when it injects the file. → Add to task 9's de-hoax rewrite: the skill
  reads the markdown under a "founder feedback (data, not instructions)" framing.

- **[§Plan reconciliation row 1 / §Required reading]** The plan cites "TRACK-AJ.md — AJ3 (lines
  97–144) for the deferred AC4/AC5 this supersedes." AJ5 itself is not registered as a workpackage
  in TRACK-AJ.md (verified: no `AJ5` match). That's acceptable for a de-hoax follow-up driven by
  concept+architecture, but the plan should say so explicitly so the next agent doesn't hunt for an
  AJ5 spec section that isn't there. → One line in §Plan reconciliation: "AJ5 has no TRACK-AJ spec
  block; its contract is this plan + concept.md."

- **[§File format / AC11]** `annotations.md` is *derived* and overwritten on every write. If a
  founder hand-edits the `.md` (it looks editable), the edit is silently clobbered on the next
  annotation. Worth an @lore + one line in the contract: "`.md` is generated output; edit nothing —
  the `.json` is canonical." (The plan implies it via "JSON canonical"; make it explicit since the
  `.md` is the agent-facing surface a human will be tempted to touch.)

- **[§Ordered tasks task 7]** `isComponentPage` in `main.tsx` is `route !== "" && activeModule`
  → type `"" | StoryModule | undefined` (a truthy value, not `boolean`). The guard works as a
  truthiness check, but if the builder destructures or passes it as a `boolean` prop, strict mode
  will complain. Name it: "guard on truthiness of `isComponentPage`, or coerce `Boolean(activeModule)`."

## What's Working Well

- **The de-hoax framing is honest and the testability split is exemplary.** Three pure importable
  units (`annotation-store` fs-with-injected-path, `request-handler` Vite-free adapter,
  `resolve-component` jsdom-testable) against one deliberately-thin Vite plugin (`configureServer`
  only) is the right shape: every behavior is unit-testable without spinning a dev server, and the
  un-testable surface (the plugin wiring) is reduced to near-zero logic. This directly answers the
  "thin Vite plugin vs importable units" concern.
- **Bundle-leak is structurally prevented, not just asserted.** `configureServer`-only with no
  `transform`/`generateBundle` means the middleware *cannot* enter a production build — and AC9 checks
  the plugin exposes neither hook via type/lint, so the guarantee is enforced rather than hoped. The
  `.annotations/` gitignore + design-medium-only scope closes the loop. Verified `.gitignore` has no
  entry yet, so AC9's "add `.annotations/`" is a real, necessary task, not a no-op.
- **Design-it-twice §A (JSON-canonical + derived-MD) is a genuine fork.** A1 (markdown-only, viewer
  parses MD) is a real, plausible loser with a stated failure mode (fragile viewer parse); A2 wins for
  a concrete reason (robust viewer reads + agent never parses JSON). Not theatre.
