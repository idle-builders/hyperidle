# AJ3 — Concept (light pass)

**Scope of this concept.** AJ3 introduces **process nouns**, not a product primitive. No Thread / Block / Artifact / Bet / Cost is created or reshaped. The pipeline's `concept-missing` fail-fast (which gates *product* primitives) therefore does **not** apply. This is a deliberately light concept pass: it pins the four new process nouns sharply enough that `/architecture` and the builder cannot silently re-decide their shape.

The four new process nouns:

1. **`/human-design-review`** — a conditional pipeline phase.
2. **The isolation harness** — the one code-bearing noun (fixtures + mock providers).
3. **`awaiting-human-design-review`** — a park state on a workpackage's progress file.
4. **The planning-time review estimate** — an advisory forecast field in a WP's track doc.

A fifth noun, **`DESIGN-CLASS`**, already exists (emitted by `/design`). AJ3 does not reshape it — it *reads* it. Stating that explicitly is half the concept.

---

## Noun 1 — `/human-design-review` (the phase)

**Definition.** A conditional, stakes-gated pipeline phase that runs *after* `/design-critique` and *before* the build phases, in which a human (the founder) opens the chosen design variant rendered live in the component viewer, attaches element-anchored spatial feedback, and the designer agent revises the actual TSX until the founder approves.

**Essential properties.** Every run of `/human-design-review`:
- is **triggered by reading `DESIGN-CLASS == novel`** — it never re-classifies, never adds a second classifier;
- operates on **the live TSX variant in the viewer** (the same `.stories.tsx` the build will ship), never on a throwaway mockup;
- drains **element-anchored feedback over MCP** (Vibe Annotations / MCP Pointer), revises the TSX, and loops until founder approval or the autonomous-park terminal state;
- alters **no committed artifact set or phase order** beyond inserting itself conditionally after critique.

**What it is NOT.**
- **Not presence-gated.** It does not fire "because a human is around" and skip "because no human is around." The gate is *stakes* (`DESIGN-CLASS`). The presence of a human only changes what happens *when it fires on a novel design*: human present → interactive loop; no human → **park** (it does not silently proceed). Conflating stakes-gating with presence-gating is the single most load-bearing rejection in this WP.
- **Not a new classifier.** It introduces no `REVIEW-CLASS`, no presence check, no parallel gate. It reuses the `DESIGN-CLASS:` greppable line `/design` already emits. A design re-classified `novel` at design time triggers review even if planning forecast `routine`.
- **Not a product feature.** It is review *tooling* and pipeline *process*. It ships no user-facing surface, no new base component, no page. (This is why AJ3's own "Human design review" field reads **No**.)
- **Not `/design-critique`.** Critique is agent-vs-agent rubric scoring (reviewer persona, automated). Human-design-review is human-vs-agent spatial annotation (founder, interactive). Critique runs first and unconditionally for UI; human-design-review runs second and only for `novel`.
- **Not `/visual-polish`.** Polish runs *after* implementation to bring rendered TSX to fidelity. Human-design-review runs *before* implementation to settle the design shape itself.

**Composition.** Sits between `/design-critique` and `/write-tests` in the pipeline phase order. Consumes: the `DESIGN-CLASS` line, the approved variant's `.stories.tsx` route in the viewer, the MCP annotation queue. Produces: a revised, founder-approved `approved.md` + variant TSX (in-place edits, no new artifact medium) OR the `awaiting-human-design-review` park state.

**Lifecycle.**
```
post-critique reached
  ├─ DESIGN-CLASS == routine | routine-low-conf → SKIP (proceed to build, no prompt)
  └─ DESIGN-CLASS == novel
       ├─ founder reachable (annotation tool present)
       │     → annotate → drain MCP → revise TSX → re-render → repeat
       │     → founder approves → proceed to build
       └─ founder NOT reachable (autonomous run)
             → PARK: status = awaiting-human-design-review, STOP this WP
```

**Authority.** The pipeline orchestrator owns when the phase fires (reads `DESIGN-CLASS`). The designer agent owns the TSX revisions. The founder owns approval. No agent can approve a `novel` design on the founder's behalf — that is the whole point of the park.

**Contracts it commits to.**
- **Trigger contract.** Fires iff `DESIGN-CLASS == novel`. Reads, never re-derives.
- **Park contract.** A `novel` design in an autonomous run parks; it is never auto-shipped. *High-stakes design is not autonomously shippable.*
- **Additive contract.** When it does not fire (routine), the pipeline behaves exactly as today — no prompt, no block, identical committed artifacts.
- **Degradation contract.** With no annotation tool present in an *interactive* run, the phase degrades gracefully (documents the manual fallback) rather than hard-failing.

---

## Noun 2 — The isolation harness (the code-bearing noun)

**Definition.** A shared, dependency-free layer in `packages/design-system` — fixture data + thin mock providers — that lets a page-level, data-fed, or context-dependent design surface mount in the viewer (and in jsdom tests) with **no server, no database, no real routing, no real data**.

**Essential properties.** The harness:
- provides **fixture data** (typed sample objects matching real props/data shapes) and **mock providers** (a router shim + context defaults) — nothing more;
- is **opt-in per story**: a presentational story (props-only, like the existing `TaskSheet`/`GlobalSearchPanel` stories) needs nothing; a context/router-consuming surface wraps its render in the harness;
- imports **zero** of `@hyperidle/server`, `@hyperidle/db`, or any network/IO — proven by the existing mock-data guards plus a dedicated mount test;
- yields **one** artifact per surface: the same story is prototype, annotation surface, and (post-build) catalog entry.

**What it is NOT.**
- **Not a second app shell.** It does not boot the real router config, real data layer, or real providers. It is the *thinnest* shim that makes `useNavigate`/`useContext` not throw.
- **Not a mock-data offender.** It lives in the design-system fixtures path, not in `packages/web/src` production surfaces, so it does not trip `mock-inventory:check` / `demo-fixture-guard` (architecture confirms the path is allowlisted or outside their scope).
- **Not a new render path.** Stories still render through the existing `discoverStories` + viewer. The harness is a wrapper component a story uses, not a parallel viewer mode.
- **Not Storybook.** No new framework. Plain TSX + the existing `.stories.tsx` convention + the existing viewer.

**Composition.** A story that needs it imports `{ MockProviders, fixtures }` and wraps: `<MockProviders><Surface {...fixtures.x} /></MockProviders>`. The viewer discovers it unchanged; the DOM-snapshot net renders it unchanged.

**Authority.** Owned by the design-system package. The harness is the contract between "a real page component" and "a renderable-in-isolation story."

**Contracts it commits to.**
- **No-backend contract (hard rule).** Any surface a design needs can be shown and annotated without a backend, routing, or real data. Proven by an automated test that mounts a router/context-consuming story and asserts it renders without throwing and without importing server/db.
- **Single-medium contract.** Variants are real `.stories.tsx` through the existing viewer — no parallel mockup medium reintroduced.

---

## Noun 3 — `awaiting-human-design-review` (the park state)

**Definition.** A terminal-for-this-run status value on `.pipeline/progress/<id>.json`, set when a `novel` design is reached in an autonomous run, signalling the workpackage is blocked on founder design review and must not proceed to build/ship.

**Essential properties.** It is a **status string**, written to the WP's own progress file by the pipeline orchestrator at the post-critique gate, that stops the WP's pipeline progression (it does not block other WPs).

**What it is NOT.**
- **Not `blocked`.** `blocked` means "something failed / is genuinely stuck." `awaiting-human-design-review` means "working as designed — high-stakes design correctly parked for a human." Distinct status, distinct reason, distinct resolution (founder runs the review, not a bugfix). Folding it into `blocked` would lose the signal that this is intentional.
- **Not a chat verdict.** Unlike `/concept`'s `concept-contested` (chat-only, no progress machinery), this *is* a progress-file write — the pipeline has progress JSON and the park must survive the run ending.
- **Not a pipeline-wide halt.** It parks one WP; siblings in the batch proceed.

**Authority.** Written by the pipeline orchestrator (the same actor that owns `.pipeline/progress/<id>.json`).

**Contracts it commits to.**
- **Park-don't-ship contract.** Setting this status is the mechanism that makes "high-stakes design is not autonomously shippable" real. The orchestrator sets it instead of dispatching the build phases.

---

## Noun 4 — The planning-time review estimate (the forecast field)

**Definition.** An advisory, human-readable field — the existing **"Human design review."** line already present on every TRACK-AJ WP spec — that `/work-planning` (primary) and `/concept` (where it runs) populate at planning time with a forecast of whether the WP will need human design review.

**Essential properties.** It is a **forecast**, recorded as a highlighted spec field in the WP's track doc, derived from "does this introduce a new essential/base/primitive component or a large redesign?"

**What it is NOT.**
- **Not the trigger.** It does not fire or gate `/human-design-review`. The authoritative trigger is `/design`'s `DESIGN-CLASS` at design time. The field highlights expected parks *early* so the founder isn't surprised; a mismatch (planning said No, `/design` says `novel`) resolves in favour of `DESIGN-CLASS` — review still fires.
- **Not a new section.** It reuses the convention TRACK-AJ already shows — AJ3 *formalizes* the field, it doesn't invent a parallel one.

**Authority.** Founder (via `/work-planning`) writes it; `/concept` may refine it where concept work reveals a new component. `/design`'s `DESIGN-CLASS` overrides it.

**Contracts it commits to.**
- **Advisory contract.** The field forecasts; `DESIGN-CLASS` decides. Never pre-empts the gate.

---

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **`/human-design-review`** | Conditional stakes-gated pipeline phase: founder annotates the live variant, agent revises TSX, loops to approval. | "human review" (ambiguous w/ code review), "design approval gate", "annotation phase" |
| **isolation harness** | Fixtures + mock-provider layer so data/context surfaces mount in the viewer with no backend. | "mock app", "test harness", "storybook setup", "preview shell" |
| **`awaiting-human-design-review`** | Progress-file status: a novel design parked in an autonomous run. | "blocked", "paused", "pending review" |
| **planning-time review estimate** | Advisory forecast field in the WP track doc; `DESIGN-CLASS` is authoritative. | "review flag", "the gate" (it is NOT the gate) |
| **`DESIGN-CLASS`** | Existing greppable line from `/design` (`novel` / `routine` / `routine-low-conf`). The authoritative trigger. | "stakes flag" (don't rename), any new classifier |

---

## Probed, unsettled questions — decided autonomously

1. **Is the trigger `DESIGN-CLASS == novel` only, or also `routine-low-conf`?**
   Decided: **`novel` only.** The spec's contract section is explicit: "`routine` / `routine-low-conf` designs skip it." `routine-low-conf` already triggers a 2-variant fallback in `/design`; it does not rise to "new essential/base component or large redesign." Gate table in architecture encodes this.

2. **Is `awaiting-human-design-review` a `status` or a `blocked` reason?**
   Decided: a distinct **`status`** value (not a `blocked` reason), because it is intentional and not a failure, and because the resolution path (founder runs review) differs from a bug-fix loop. Architecture pins the exact progress-file field.

3. **Does the harness need the *real* router/providers or a shim?**
   Decided: a **shim** (MemoryRouter + context defaults via the existing `AssistantContext` default value). Booting the real `router.tsx` would drag in data layers and defeat "no backend." The shim is the smallest thing that stops `useNavigate`/`useContext` throwing. Architecture specifies exact provider list.

4. **Where does the harness live so it doesn't trip mock guards?**
   Decided: under `packages/design-system/src/` (fixtures + providers), which is design-system source, not a `packages/web/src` production surface — outside `mock-inventory` / `demo-fixture-guard` scope (those target web/server production code). Architecture confirms the path against the guards' include lists before the builder writes code.

5. **What is "proven here" vs "deferred to founder walkthrough"?**
   Decided: see the architecture's buildable-vs-deferred line. The live annotation loop is inherently human-in-the-loop + external-tool-dependent and cannot run in this autonomous pipeline; everything buildable (skill rewrites, harness + passing mount test, gate logic, park behavior, planning field, MCP wiring docs + graceful degradation) is built and code-validated.

---

## Required reading (for `/architecture` and the builder)

- `.pipeline/work-packages/TRACK-AJ.md` § AJ3 (the spec; trust the ground-truth corrections in the architecture over stale "golden PNG" language).
- `.claude/rules/visual-regression.md` (the DOM-snapshot net — the actual regression mechanism; no Playwright/Docker).
- `.claude/skills/design/SKILL.md`, `design-critique/SKILL.md`, `pipeline/SKILL.md`, `concept/SKILL.md`, `work-planning/SKILL.md` (the skills AJ3 edits).
- `packages/design-system/viewer/discovery.ts`, `viewer/main.tsx` (story discovery + render path the harness plugs into).
- `packages/web/src/contexts/AssistantContext.tsx` (the context the mock-provider shims).
- Existing data-fed stories as the presentational baseline: `packages/web/src/shell/TaskSheet.stories.tsx`, `components/GlobalSearchPanel.stories.tsx`, `shell/AssistantOverlay.stories.tsx`.

---

## Self-critique (Phase 6)

- **Rejection list distinct?** Yes — the four "is NOT" sets are about genuinely different confusions: presence-gating (the core trap), classifier-proliferation, product-vs-tooling, and `blocked`-vs-park. Not flavours of one thing.
- **Vocabulary collision?** `awaiting-human-design-review` vs `blocked: concept-contested` — deliberately distinguished (status vs chat verdict; intentional vs failure). `DESIGN-CLASS` is reused verbatim, no rename. No collision.
- **Contracts complete?** Trigger, park, additive, degradation, no-backend, single-medium, advisory — cardinality/authority pinned for each noun. The one hard rule (no-backend, provable by test) is the architecture's central testable claim.
- **Rationale concrete?** Yes — driven by the founder reframe (spatial feedback in the code that ships, not prose on a throwaway mockup) and the explicit track-wide stance that high-stakes design must not auto-ship.

**Locked.**
