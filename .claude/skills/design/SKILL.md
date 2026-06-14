---
name: design
description: "Explore one to three UX/UI variants (gated by routine vs novel), score them in-session against the 9-dimension rubric, settle on one. Runs BEFORE /architecture when a story has any UI surface — a new page, primitive, component shape, interaction flow, or redesign of an existing surface."
argument-hint: "[story-id-or-feature-name]"
user-invocable: true
min_tool_calls: 25
---

# Design

UX/UI counterpart to `/architecture`. Architecture decides *how* (file paths, schemas, types, endpoints); design decides *what the user sees and does* (shape, hierarchy, density, interaction grammar, motion, copy, states). Forces a multi-variant pass so the chosen design isn't the first thing that came to mind.

**Skip when:** the workpackage has no UI surface, OR an approved design already exists and this is a pure layout tweak (go straight to `/design-critique`).

Inspired by:
- Garry Tan's **gstack** `/design-shotgun` — three variants on a comparison board.
- Matt Pocock / **`/interface-design`** — *Design It Twice* from "A Philosophy of Software Design", with parallel sub-agents under different constraints.
- **`/find-design-language`** — broad → variants → spec → embodied artifacts.

## When this runs

- **In the pipeline:** Architect persona, after `/concept` and before `/architecture`.
- **On `/design <story-id>`:** explicit invocation for any story with a UI surface, especially the L-track primitives (Thread L1, Block L2, Artifact L3) where multiple plausible shapes exist.
- **Skip when:** the story has no user-facing surface, OR an approved design already exists for this surface and the change is a pure layout tweak (then run only the in-session Phase 2 critique on the existing `approved.md`).

**Fixed input from `/concept`:** the relevant `docs/concept/*.md` section is the conceptual model these variants must respect. Variants explore the *visual / interaction shape* of a Thread / Block / Artifact — they do not redefine what a Thread / Block / Artifact IS. If a variant only works by changing the concept, that's a `/concept` issue, not a design issue.

## Inputs

Read all of the following in one parallel batch of Read calls — these files are independent (anchor-scoped where possible):

1. The workpackage in `.pipeline/work-packages/TRACK-<letter>.md`.
2. The per-workpackage concept output at `plans/<workpackage-id>/concept.md` and the specific `docs/<topic>/<file>.md` files it cites in its **Required reading**. The concept tells you which existing layout/component-budget files matter — do not browse `docs/` directly.
3. `packages/design-system/PRINCIPLES.md`, `AESTHETICS.md`, `DESIGN.md`, `src/tokens.css`.
4. `.claude/rules/aesthetic-quality.md`, `.claude/rules/visual-regression.md`.
5. If `plans/<workpackage-id>/design/` exists, you may be resuming.

For deeper reference material on specific critique dimensions (read on demand when scoring in Phase 2 — each cross-links a section of `packages/design-system/AESTHETICS.md`):

- `references/hierarchy.md` — visual-hierarchy tactics; primary / secondary / tertiary text levels.
- `references/spacing.md` — 4px grid, density tiers, sub-grid exceptions.
- `references/typography.md` — type scale (11/12/13/14/18/24), weight limits, monospace usage.
- `references/color.md` — semantic token usage, halation guard, contrast rules.
- `references/finishing.md` — hover / focus / pressed states, motion tokens, polish details.

Without these, the Phase 2 critique becomes vibes-grading. Read the relevant reference before assigning a score on its dimension.

## Phase 0a — Classify: routine vs novel

Before interrogation, classify the story along two axes:

1. **Existing component reference** — does the spec name an existing component family (e.g. "extend `ThreadRow`", "another tab in `SessionDrawer`")?
2. **Pattern match** — does a similar embodied pattern exist in the live catalog at `:8098` or in the `packages/design-system/src/*.stories.tsx` files?

Both yes → `routine`. Both no → `novel`. Mixed → `routine` with low-confidence flag (see below).

| Class | Variants in Phase 1 | Phase 2 critique |
|---|---|---|
| `novel` | 3, full constraint-and-thesis spread | per-variant + on `approved.md` |
| `routine` | 1, with a "did we consider X / Y / Z?" check on the rejected directions | only on `approved.md` |
| `routine` (low-confidence) | 2, A vs. B | per-variant + on `approved.md` |

**Low-confidence trigger.** If only one of the two axes matched (e.g. spec references an existing component but the live catalog has nothing analogous, or vice versa), or the in-session critique on the single-variant flags Anti-slop / Hierarchy / States below 5, fall back to 2 variants. Better to spend one extra variant than to ship unexplored UI.

**Hard rule for new design-system primitives.** L1 (Thread), L2 (Block), L3 (Artifact) and any future named primitive in TRACK-L are **always `novel`** regardless of axis match. The shape itself is what's being decided.

Output one machine-greppable line at the top of `brief.md`:

```
DESIGN-CLASS: <routine|routine-low-conf|novel>  ref=<existing-component-or-none>  pattern=<story-name-or-none>
```

## Phase 0b — Reuse inventory (hard gate)

Read `packages/design-system/src/index.ts` — the barrel export is the live inventory. Write a **Reuse inventory** into `brief.md`: every visual element the workpackage needs, mapped to the existing component that renders it, the component that could with one new prop, or `NEW`. A `NEW` entry must state why extension is impossible — "doesn't quite fit" is a prop request, not a reason. Existing components carry already-tuned states, a11y, grid, and motion; the variant with zero new shapes beats the one that needs two unless the critique proves the new shape earns its cost.

## Phase 0 — Interrogate the user task

Pick only the questions that are actually unsettled — skip what the brief, the design system rules, or existing mockups already answer. For each remaining question, propose your read with evidence, then ask the human (or reviewer in autonomous mode) to confirm. Issue all probes in one parallel batch — independent questions don't need separate round-trips.

**Few, important questions.** Three sharp probes force a real decision; ten low-stakes ones get answered with shrugs. The bar: "will the answer change a variant constraint?" If no, don't ask.

Sample probes (adapt):
- "Who is doing this and what decision are they making? My read: X. Confirm?"
- "What's the smallest UI surface that delivers the outcome? My read: just A, not B."
- "Primary state — populated / empty / loading / error — which is most common in real use?"
- "New primitive (variants explore shape) or extension (variants explore application)?"
- "What gets overflowed/truncated when dense? My read: …"
- "Which existing component or DaisyUI primitive does this compose from? My read: …"

Stop when the brief is clear. 3-7 branches typical.

## Phase 1 — Generate variants in parallel (count from Phase 0a)

For `routine`: produce **one** variant honoring the named existing component / pattern, plus an explicit `rejected.md` block listing the X / Y / Z directions you considered and rejected (one line each). Do NOT regenerate the rejected directions.

For `routine-low-conf`: produce **two** variants — A "stay close to existing pattern" and B "challenge the existing pattern".

For `novel` (and all L1/L2/L3 primitives): produce **three radically different** variants. Anti-convergence is a hard rule: variants that all feel like minor tweaks of one idea = fail.

Each variant uses the workpackage brief + design-system pointers + a different **constraint-and-thesis pairing** so the spread is intentional, not accidental:

```
Variant A — "Minimal scaffold"
  Constraint: smallest possible component count; reuse existing primitives without
              inventing anything new. The shape is whatever falls out of recombining
              what's already in packages/design-system/src/.
  Thesis: prove the feature can ship inside the existing catalogued component budget
          with zero new shapes (the Phase 0b reuse inventory is this variant's spec).

Variant B — "Power-density rethink"
  Constraint: optimise for the single most common power-user task. Cut everything
              else from the primary view; push it to a detail/secondary surface.
  Thesis: density and speed beat completeness. Show what the user actually does
          80% of the time at maximum information density.

Variant C — "Reference-borrowed"
  Constraint: take inspiration from a SPECIFIC named reference (Linear / Notion /
              Slack / Figma / Linear's command palette / Stripe Dashboard) — pick
              one whose interaction grammar fits, and embody it cleanly without
              copying chrome. The orchestrator names the reference per workpackage.
  Thesis: a proven interaction grammar shortens the user's learning curve.
```

If the workpackage is for a *new design-system primitive* (L1 / L2 / L3 / future primitives), substitute the constraints to explore the **shape itself**:

```
Variant A — "Container with payload" (the shape is a thin container; the payload
            does the work; minimal API surface).
Variant B — "Self-contained block" (the primitive owns its layout, states, and
            affordances; consumers parameterise but don't recompose).
Variant C — "Layered" (a base layer that always renders + extension slots that
            consumers fill — the React `children`-as-slot pattern).
```

Anti-convergence requirement — verify before Phase 2:
- Variants must differ on **at least 3 of these axes per pair**: hierarchy (where the eye lands first), density (how much fits per row/screen), state strategy (one canonical layout vs distinct shapes per state), motion (where it moves), action surface (where verbs live), composition (one component vs three), copy register (terse vs guided).

If two variants converge, regenerate. Do not proceed with three flavours of one thing.

### Output per variant — the spec is concrete OR it doesn't count

Each variant produces, in `plans/<workpackage-id>/design/<variant-slug>/`:

1. **`spec.md`** — opinionated spec, no hand-waving:
   - User workpackage (1 sentence — who, what, why)
   - Component composition: which existing components are used where (named, not "a card-like thing")
   - Information hierarchy: numbered 1/2/3, with one-line content per slot
   - All states: empty / loading / error / populated / overflow — described with copy and component names
   - Behavior: hover, focus, keyboard shortcuts, focus-trap rules, transitions (named: motion/fast/medium/slow)
   - Mobile adaptation: how it maps to the three-tab mobile layout
   - The **signature** — the one thing that makes this variant unmistakably itself
   - Trade-offs: what this variant is bad at
2. **`mockup.html`** (preferred) — a self-contained HTML file that **embodies** the variant. Imports the design system tokens (link to `packages/design-system/src/tokens.css`), uses real data shapes from the workpackage, demonstrates the primary state. The mockup IS the variant; describing motion in prose while the mockup uses default 200ms transitions = fail.
3. **`screenshot.png`** — Playwright screenshot of `mockup.html` at desktop width. (Run `npx playwright screenshot file://<absolute-path>/mockup.html screenshot.png --wait-for-timeout=1000`.)

If HTML mockups are too heavy for the workpackage (small primitive, well-understood shape), produce *spec + a TSX sketch in the design-system playground* instead. The hard rule is: each variant must produce a **looked-at artifact**, not just prose.

## Phase 2 — Build the comparison

Produce `plans/<workpackage-id>/design/comparison.md`:

| Dimension | Variant A | Variant B | Variant C |
|---|---|---|---|
| Signature (one tell) | … | … | … |
| Component count | … | … | … |
| Density | … | … | … |
| Primary action surface | … | … | … |
| State strategy | … | … | … |
| Motion budget | … | … | … |
| Best at | … | … | … |
| Worst at | … | … | … |
| Phase-2 critique score | … /10 | … /10 | … /10 |

Plus the three screenshots side by side.

## Phase 3 — Synthesize

Often the best design combines insights from multiple variants. Write `plans/<workpackage-id>/design/synthesis.md`:

- Which variant is the strongest base?
- Which elements from the other two are worth pulling in?
- What gets explicitly **rejected** and why (this list matters as much as the chosen direction — it prevents re-litigation)?

If the project is in autonomous mode, the orchestrator picks based on:
1. Highest critique score
2. Lowest component-budget cost
3. Best fit with founder filter (no cargo-culted patterns from the rejection list in TRACK-L scope rules: no keyboard-verb shortcuts, no optimistic-UI bragging, no sidebar drag-reorder, no emoji reactions, no cycles UI, no search-modifier mini-language, no customizable dashboards)

If the founder is reachable, surface the comparison and **let them pick**. One AskUserQuestion, with the three options + your recommendation. Never batch design decisions across multiple AskUserQuestions.

## Phase 4 — Approve and write the chosen design

Once a direction is chosen, write `plans/<workpackage-id>/design/approved.md`:

- The chosen variant + any pulled-in elements from siblings
- The rejected list (so `/architecture` and `/write-code` don't re-litigate)
- Component mapping: which design-system components are used, where, what props
- All states with copy
- Behavior + motion + keyboard shortcuts
- Mobile adaptation
- Open questions for the architect (data shape, route, action endpoints)

`approved.md` is the **input contract** to `/architecture`. The architect does NOT re-decide visual hierarchy, component vocabulary, or interaction grammar.

## Anti-patterns

- Three flavors of one thing. Variants must differ on shape, not accent.
- Specs without concrete values. Use named tokens, not "clean, modern".
- Mockups that describe instead of embody.
- Skipping Phase 2 critique gate.
- Re-litigating the visual contract in `/architecture`.
- AI-aesthetic defaults — see `packages/design-system/AESTHETICS.md` § AI-Aesthetic Anti-Patterns.

## Output artifacts

```
plans/<workpackage-id>/design/
├── brief.md                    # the interrogated brief
├── <variant-a-slug>/
│   ├── spec.md
│   ├── mockup.html
│   └── screenshot.png
├── <variant-b-slug>/
│   ├── spec.md
│   ├── mockup.html
│   └── screenshot.png
├── <variant-c-slug>/
│   ├── spec.md
│   ├── mockup.html
│   └── screenshot.png
├── comparison.md               # side-by-side table + screenshots
├── synthesis.md                # which variant wins, what gets pulled in, rejection list
└── approved.md                 # the locked design — input to /architecture
```


- `/architecture` — consumes `approved.md` as fixed input; never re-litigates the visual contract; runs its own in-session architectural critique
- `/visual-polish` — used later, AFTER implementation, to bring the rendered TSX to pixel parity with the approved mockup
