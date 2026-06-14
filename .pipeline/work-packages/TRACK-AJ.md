# Track AJ: Interactive Pipeline & TSX-First Design

Founder direction (2026-06-13): the build pipeline is powerful but illegible and unsteerable in the moments that matter, and the design system carries a dual-medium tax that no longer earns its keep. The pipeline runs fully autonomously and silently — every phase writes artifact files, nothing surfaces to the founder — so concept and ship decisions, the two most expensive to get wrong, happen out of sight. Separately, every design-system component exists twice (an HTML reference under `packages/design-system/html/` and its TSX implementation under `src/`), policed by a ≤5% pixel-parity gate, with a whole HTML-mode path in the viewer and a hard rule (`.claude/rules/visual-parity.md`) enshrining HTML as truth. This track makes the pipeline legible and steerable to the founder when present, and collapses the design medium to TSX — one source of truth, authored and reviewed as the code that ships.

**Relationship to the autonomous pipeline.** The concept and ship summaries (AJ2) are strictly additive — they surface information when the founder is present and never block the unattended path. The one deliberate exception is `/human-design-review` (AJ3): it is gated on **stakes, not presence** — a high-stakes design (a large redesign or a new essential / base component) always gets human review, so a `novel` design **parks** an autonomous run for the founder rather than auto-shipping. This is intentional: high-stakes design is the one thing the pipeline must not ship without a human look. Routine work is untouched and never blocks.

**Track-wide proof bar.** The two process workpackages (AJ2, AJ3) are proven by founder walkthrough of a real run — an interactive pass that surfaces the touchpoints, plus an autonomous-parity check proving the unattended path is unchanged. The design-system inversion (AJ1) is proven by code: `npm run verify` green on the inverted tree with the visual-regression net intact, the HTML reference set gone, and the viewer rendering only TSX.

**Scope rules.** Tooling, skills, the design-system source-of-truth, and the design medium only. AJ1 removes the HTML reference layer without restyling a single component — it changes the reference, never the rendered appearance. AJ2 and AJ3 change `.claude/skills/` and pipeline process, never product behavior. `npm run verify` must pass after every workpackage merges. The annotation tool adopted in AJ3 is a standalone dev tool wired over MCP — never a dependency embedded in HyperIdle's bundle.

**Reference docs:** `.claude/skills/pipeline/SKILL.md`, `concept/SKILL.md`, `design/SKILL.md`, `ship/SKILL.md`, `.claude/rules/visual-parity.md`, `packages/design-system/viewer/main.tsx`, `packages/design-system/DESIGN.md`, `AESTHETICS.md`.

---

### AJ1 — TSX is the single design source of truth

**Workpackage.** As the founder maintaining the design system, I want one design medium — the TSX components themselves — so that I stop paying the dual-artifact tax of keeping ~49 HTML reference files in pixel-parity with their TSX implementations, and design work happens directly in the code that ships. The HTML reference layer and its parity machinery are removed; the visual-regression safety net is re-pointed at the live TSX renders so components are still protected from accidental visual change.

**Why this matters.** HTML-first earned its place at the start — a fast, dependency-free medium to establish the visual language before the React app existed. It is now pure overhead: every primitive is authored and maintained twice, a pixel-diff gate (≤5%) polices the gap, the viewer carries an HTML-mode iframe path with feature-detection, and `visual-parity.md` makes "always fix the TSX, never the HTML" a hard rule. The founder maintains two representations of every component and the pipeline burns review cycles on parity instead of on the product. The cost of not building this is a tax that compounds with every new component — and the TSX-first design lifecycle (AJ3) cannot exist while HTML is still the source of truth.

**What exists today.** 49 HTML reference files in `packages/design-system/html/` (plus L11 subdirectories). The viewer (`viewer/main.tsx`, `viewer/discovery.ts`) already renders every component as a live TSX story at `:8098` and *also* offers an HTML mode (iframe over the `.html` reference) behind an HTML/TSX toggle with build-time availability detection. Visual regression runs through three Playwright configs (`playwright.config.ts`, `playwright.l1.config.ts`, `playwright.workbench.config.ts`) and two web scripts (`packages/web/scripts/visual-compare.ts`, `visual-compare-map.ts`) that diff TSX renders against the HTML references at ≤5%. `.claude/rules/visual-parity.md` mandates HTML-as-truth; `package.json` exposes `test:visual`, `sync-check`, `serve:static`, `visual:compare`. The `.stories.tsx` convention already renders the full catalog live — the TSX surface is complete and is what the app actually ships.

**What's genuinely missing.** The inversion: TSX becomes the only reference, the HTML files and their parity machinery are removed, the viewer drops its HTML path, and visual regression is re-pointed to screenshot the live TSX stories against committed golden baselines — so a component that changes appearance is still caught, now against TSX rather than HTML.

**Depends on.** None.

**Complexity.** L

**Human design review.** No — infrastructure and source-of-truth change with no UI surface; introduces no new component and is not a redesign.

**Acceptance criteria.**
- The design system has exactly one visual source of truth — the TSX components; no `.html` reference files remain under `packages/design-system/`, and no rule, skill, or script names HTML as the design reference.
- Visual regression still protects every catalogued component: a change that alters a component's rendered appearance is caught by a gate that screenshots the live TSX story and compares it against a committed baseline.
- The component viewer renders only TSX — the HTML mode, the HTML/TSX toggle, and the iframe path are gone, and every catalogued component remains reachable and renders.
- `npm run verify` passes on the inverted tree with no skipped or weakened visual checks.
- The five skills that referenced HTML-as-truth (`/design`, `/design-critique`, `/review`, `/product-deep-review`, `/visual-polish`) describe the TSX-first reality, and `visual-parity.md` is either removed or rewritten to describe TSX-baseline regression.

**Validation scenarios.**
- Given the merged change, when `packages/design-system/` is searched for `.html` reference files and the rules/skills/scripts are searched for `visual:compare` / `pixel-for-pixel` / HTML-as-truth language, then none remain.
- Given a contributor changes a component's rendered output, when the visual-regression gate runs, then it fails and names the component whose baseline drifted.
- Given the viewer served at `:8098`, when each catalogued component is opened, then it renders as live TSX with no HTML toggle present and no iframe/404.
- Given the full `npm run verify` on the clean inverted branch, when it runs, then it passes.

**Plan calls.** Standard architecture pass; no `/design`. The replacement regression mechanism — Playwright screenshots of the live TSX story diffed against a committed golden PNG — is the central decision: it must cover the same component set the HTML-diff gate covered, define where baselines live, and define how a baseline is intentionally updated. Plan the viewer simplification and the script/config removals as part of the same pass.

**Contracts / constraints.**
- No component's rendered appearance changes as part of the inversion — this removes the reference, it does not restyle. Golden baselines are captured from the current TSX render.
- The visual-regression safety net is *replaced*, never merely deleted — `verify` must still fail on unintended visual change.
- `.stories.tsx` remains the catalog contract; every component keeps a story.

**Out of scope.** New components or restyling (Tracks AG/AI/W). The `/design` rewrite to author variants in TSX (AJ3). Any product-surface change.

**Effort.** L (~2d)

---

### AJ2 — The founder can see and steer the pipeline

**Workpackage.** As the founder running the pipeline on my own machine, I want it to tell me in plain language what it decided at the two moments that are expensive to get wrong — after it locks a concept, and just before a change merges — so that I can confirm or redirect early instead of discovering a wrong turn after the work is built and merged. This is an opt-in interactive mode; the unattended cron pipeline is unchanged.

**Why this matters.** The pipeline runs fully autonomously and silently (`pipeline/SKILL.md`: "There is NO human. Never pause."). Every phase writes artifact files; nothing surfaces to chat. That is correct for unattended runs, but when the founder *is* present and wants to steer, there is no legible touchpoint: `/concept` writes "a concept doc, not a chat summary", and `/ship` stops at a CI-green PR with no readable account of what shipped. The founder either reads raw artifact files or approves a merge blind. The concept is the single most expensive thing to get wrong — it ripples through every downstream variant and contract — yet it is locked with no founder-facing recap. Cost of not building: the founder cannot course-correct the concept before design and architecture build on it, and merges without an at-a-glance picture of the change.

**What exists today.** `/pipeline` orchestrates six phases under a hardcoded autonomous stance. `/concept` and `/design` already carry dormant "if the founder is reachable" branches (`AskUserQuestion`) that the pipeline's autonomy overrides. `/ship` ends at a CI-green draft PR and explicitly leaves the merge to the human, but emits no summary. There is no mode switch and no founder-facing summary surface anywhere in the flow.

**What's genuinely missing.** An explicit interactive mode that, when enabled, makes the pipeline emit a plain-English concept recap with a confirm/redirect gate after `/concept`, and a readable ship summary before the human merge — while leaving the autonomous path's artifacts and behavior unchanged.

**Depends on.** None.

**Complexity.** M

**Human design review.** No — process/skill change with no UI surface.

**Acceptance criteria.**
- The pipeline runs in one of two modes; in autonomous mode its artifacts and behavior are unchanged from today, and in interactive mode it additionally surfaces founder touchpoints.
- After a concept is locked in interactive mode, the founder is shown a plain-language recap (what the noun is, what it is not, what it commits to) and can confirm it or send it back before design/architecture proceed.
- Before a change merges in interactive mode, the founder is shown a readable ship summary — what shipped, which acceptance criteria were covered, which files changed, the retro cost signal, and any residual risk — distinct from the raw CI pass/fail.
- The autonomous (cron) path never blocks on a founder touchpoint and produces the same committed artifacts it does today.

**Validation scenarios.**
- Given the pipeline invoked in interactive mode on a concept-introducing workpackage, when `/concept` finishes, then a plain-language concept recap appears with a confirm/redirect choice, and choosing "redirect" returns to concept work rather than proceeding.
- Given the pipeline invoked in interactive mode, when `/ship` reaches CI-green, then a readable ship summary is presented before any merge, and the merge still waits for the human.
- Given the pipeline invoked in autonomous mode, when it runs end-to-end, then no founder prompt is emitted and the committed artifact set matches the pre-change behavior.

**Plan calls.** Process/skill change across `/pipeline`, `/concept`, and `/ship` — no product code, no `/design`. Plan how the mode is selected and threaded through the orchestrator, and the exact content contract of the concept recap and the ship summary. Validation is by founder walkthrough of an interactive run plus an autonomous-parity check.

**Contracts / constraints.**
- Autonomous mode is the default; interactive touchpoints are strictly additive and never alter what gets committed.
- The concept recap and ship summary are human-readable prose surfaced in chat, not new artifact files the pipeline must maintain.
- No change to the phase order, the persona separation, or the ship gate — CI-green before merge stays mandatory.

**Out of scope.** The in-browser design annotation loop (AJ3 — the third checkpoint). Any change to autonomous decision-making. New CI behavior.

**Effort.** M (~1d)

---

### AJ3 — Design variants are real TSX, reviewed and annotated in the browser

**Workpackage.** As the founder steering a UI workpackage, I want the pipeline's design variants to be real components I can open in the browser and mark up element-by-element — pointing at a control and saying "move this here" or "tighten this spacing" — and have the designer agent revise the actual component from my notes, so that design feedback is spatial and lands in the code that ships, not prose on a screenshot of a throwaway mockup. This human review is a **conditional** pipeline phase — `/human-design-review`, run after `/design` and `/design-critique` only when the stakes justify it (a large redesign or a new essential / base component), and skipped for routine tweaks so it never becomes an always-on tax.

**Why this matters.** Today `/design` produces self-contained `mockup.html` files that are screenshotted and scored; the founder's only feedback channel is markdown on those screenshots, and the chosen mockup is later rebuilt as TSX with parity drift. The founder cannot give spatial feedback ("this, here, smaller"), and the design medium is discarded at build time. Once TSX is the sole source of truth (AJ1), variants can be authored as live components and the founder can annotate the running render directly, every note tied to a real element, with the designer agent revising the component the app will actually ship. Cost of not building: design misses get baked in before the founder sees rendered output, and the design→build handoff keeps losing fidelity.

**What exists today.** `/design` emits `plans/<wp>/design/<variant>/mockup.html` + a Playwright screenshot + `spec.md`, scored against the 9-dimension rubric, with founder choice (when reachable) via a single `AskUserQuestion`. The design-system viewer already renders `.stories.tsx` live at `:8098` (`viewer/main.tsx`, `viewer/discovery.ts`); AJ1 makes TSX the sole medium and drops the viewer's HTML path. No in-browser annotation channel exists — design feedback is markdown only. Standalone annotation tools provide element-level human→agent feedback over MCP: Vibe Annotations (Chrome extension + local MCP server on `:3846`, wired to Claude Code via `claude mcp add`), with MCP Pointer (MIT, captures React component → source file) as the fallback.

**What's genuinely missing.** Two things. (1) `/design` authoring variants as `.stories.tsx` rendered in the viewer instead of HTML mockups. (2) A new **stakes-gated** pipeline phase, `/human-design-review`, that runs after `/design-critique`: the founder annotates the rendered variant in the browser, the designer agent reads the element-anchored feedback over MCP and revises the TSX, iterating until the founder approves. The single gate is stakes — it fires whenever the design is high-stakes (a `novel` `DESIGN-CLASS`: a large redesign or a new essential / base / primitive component) and is skipped for routine tweaks. It is **not** gated on whether a human happens to be present: a high-stakes design always gets human review, so in an autonomous run a `novel` design **parks** for the founder rather than auto-shipping — high-stakes design is not autonomously shippable.

**Depends on.**
- AJ1 — variants cannot be authored as TSX-as-truth while HTML is still the design source and the viewer still carries an HTML path; the inverted foundation must exist first.
- (AJ2 is a sibling, not a blocker — `/human-design-review` is stakes-gated, not mode-gated, so it does not need AJ2's interactive-mode switch.)

**Complexity.** L

**Human design review.** No — builds the review tooling itself; its only UI is the viewer / annotation wiring, not a new base component or a page redesign. (This field is the convention AJ3 establishes — see ACs.)

**Acceptance criteria.**
- `/design` produces each variant as a live TSX story rendered in the component viewer, not as a standalone HTML mockup; the variant artifacts are the component code plus its spec and a screenshot of the live render.
- A `/human-design-review` phase runs after `/design-critique` and is gated purely on stakes: it triggers for a `novel` design (a large redesign or a new essential / base component) and is skipped for routine designs — the trigger is read from the `DESIGN-CLASS` that `/design` already emits, not re-decided, and does not depend on whether a human is present.
- When `/human-design-review` runs, the founder can open a rendered variant in the browser, attach feedback to specific elements (including positional intent such as "move this here"), and the designer agent receives that element-anchored feedback and revises the variant; the loop iterates until the founder approves.
- A `novel` design in an autonomous run parks for human review rather than auto-shipping — the pipeline marks the workpackage awaiting-human-design-review instead of proceeding past the unreviewed design.
- `/work-planning` (primarily) and `/concept` (where it runs) estimate at planning time whether a workpackage will need human design review — based on whether it introduces a new essential / base component or a large redesign — and record that estimate as a highlighted field in the workpackage's track documentation, so the founder sees up front which work will park for review.
- When `/human-design-review` does not fire (routine design), `/design` selects a variant by in-session scoring and the pipeline proceeds without blocking.
- The approved variant flows into `/architecture` and `/write-code` as real component code, with no separate HTML-to-TSX rebuild step.

**Validation scenarios.**
- Given a UI workpackage whose `/design` run is classified `novel`, when `/design-critique` finishes, then `/human-design-review` runs and each variant is reachable as a live TSX render in the viewer for annotation.
- Given the founder annotates a rendered variant ("move this control here", "tighten this spacing"), when the designer agent pulls the feedback over MCP, then it revises the corresponding component and the change is visible on re-render.
- Given a `routine` design, when the pipeline reaches the post-critique step, then `/human-design-review` is skipped and the run proceeds without a founder prompt.
- Given a `novel` design dispatched in an autonomous run, when the pipeline reaches the post-critique step, then it parks the workpackage awaiting human design review rather than shipping the unreviewed design.
- Given the validation workpackage (AG7 or AI7) run end-to-end in interactive mode, then the founder can narrate the full loop on the high-stakes surfaces: variants rendered, annotated, revised, approved, built.

**Plan calls.** Rewrite of `/design` (TSX variants) plus a new `/human-design-review` skill and the annotation-tool wiring; update `/design-critique` and `/pipeline` so the new conditional phase slots in after critique; and update `/work-planning` (primary) and `/concept` to estimate the human-review need and emit it as a highlighted spec field in the track doc. Depends on AJ1's TSX-first viewer and AJ2's interactive-mode switch. Plan: the variant artifact shape (`.stories.tsx` location and naming); the trigger rule (read `DESIGN-CLASS` — do not invent a new classifier, do not add a presence check); the park-for-review behavior when a `novel` design lands in an autonomous run; how each variant's viewer route is served for annotation; and how the agent drains the annotation MCP queue. Prove it by running the loop on a real high-stakes UI workpackage.

**Contracts / constraints.**
- `/human-design-review` is gated purely on stakes, never on presence: it fires whenever `DESIGN-CLASS` is `novel` (large redesign or new essential / base / primitive component), and `routine` / `routine-low-conf` designs skip it. A `novel` design always gets human review — in an autonomous run it parks awaiting the founder rather than shipping unreviewed. The trigger reuses the existing `/design` classification — no parallel gate, no presence check.
- The planning-time human-review estimate (`/work-planning`, `/concept`) is an advisory **forecast** surfaced in the track doc; the authoritative trigger remains `/design`'s `DESIGN-CLASS` at design time. The estimate highlights expected parks early — it does not replace or pre-empt the gate, and a design reclassified `novel` at `/design` time still triggers review even if planning guessed otherwise.
- Variants are real `.stories.tsx` rendered through the existing viewer — no parallel mockup medium reintroduced.
- The annotation tool is a standalone dev tool wired over MCP, never a dependency embedded in HyperIdle's bundle.
- The multi-variant discipline (novel = 3, routine = 1, anti-convergence) and the 9-dimension critique gate survive the medium change.
- Autonomous-mode behavior degrades gracefully with no annotation tool present.

**Out of scope.** The concept and ship summaries (AJ2). Building the annotation tool itself — it is adopted, not built. Post-implementation visual polish (`/visual-polish`). Changes to product features beyond the validation workpackage.

**Effort.** L (~2d)
