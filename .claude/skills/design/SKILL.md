---
name: design
description: "Explore multiple UX/UI variants in parallel, compare them, run /design-critique, then settle on one. Use BEFORE /architecture when a story has any UI surface — a new page, a new primitive, a new component shape, a new interaction flow, or a redesign of an existing surface."
argument-hint: "[story-id-or-feature-name]"
user-invocable: true
---

# Design

**Why:** Your first idea is rarely the best one. Without forcing yourself to design it twice, you lock onto a local optimum and call it the answer. This skill makes the multi-variant pass cheap so the founder picks from a real spread, not from "the first thing that came to mind."

This is the **UX/UI counterpart to `/architecture`**. Where architecture decides the *how* (file paths, schemas, types, endpoints), design decides the *what the user sees and does* (component shape, hierarchy, density, interaction grammar, motion, copy, states).

Inspired by:
- Garry Tan's **gstack** `/design-shotgun` — three variants on a comparison board.
- Matt Pocock / nimmly **`/interface-design`** — *Design It Twice* from "A Philosophy of Software Design", with parallel sub-agents under different constraints.
- nimmly **`/find-design-language`** — broad → variants → spec → embodied artifacts.

## When this runs

- **In the pipeline:** step 2, after `/concept` and before `/design-critique` and `/architecture`.
- **On `/design <story-id>`:** explicit invocation for any story with a UI surface, especially the L-track primitives (Thread L1, Block L2, Artifact L3) where multiple plausible shapes exist.
- **Skip when:** the story has no user-facing surface, OR an approved design already exists for this surface and the change is a pure layout tweak (then go straight to `/design-critique`).

**Fixed input from `/concept`:** the relevant `docs/concept/*.md` section is the conceptual model these variants must respect. Variants explore the *visual / interaction shape* of a Thread / Block / Artifact — they do not redefine what a Thread / Block / Artifact IS. If a variant only works by changing the concept, that's a `/concept` issue, not a design issue.

## Inputs

`$ARGUMENTS` is the story ID (e.g. `L1`) or a feature name. Read:

1. The story in `docs/work-packages/TRACK-<letter>.md` — what user task is this serving? What contracts does the architect expect?
2. `docs/UI_DESIGN.md`, `docs/HUMAN_INTERFACE_LAYER.md`, `docs/INFORMATION_ARCHITECTURE.md` — existing layout, component budget, journeys.
3. `packages/design-system/PRINCIPLES.md`, `packages/design-system/AESTHETICS.md`, `packages/design-system/DESIGN.md`, `packages/design-system/src/tokens.css` — the design system rules these variants must respect.
4. `.claude/rules/aesthetic-quality.md`, `.claude/rules/visual-parity.md` — hard rules.
5. Any approved design references in `docs/design-references/` and live components in `packages/design-system/html/` or `packages/design-system/src/`.
6. If a `docs/design-explorations/<story-id>/` directory already exists, read it — you may be resuming.

## Phase 0 — Interrogate the user task

Before generating, walk the decision tree. Ask hard questions ONE AT A TIME, propose your read, let the human (or in autonomous mode the adversary) confirm.

**One question at a time.** A list of ten dumps invites the easy ones to be answered and the hard ones to become silent assumptions.

Sample lines (adapt):
- "Who is doing this and what decision are they making? My read: X. Confirm?"
- "What's the smallest UI surface that delivers the user's outcome? My read: just A, not B."
- "What's the primary state — populated / empty / loading / error — and which is most common in real use?"
- "Are we creating a *new* primitive (then variants must explore the shape) or extending an existing one (then variants must explore the *application*)?"
- "What gets overflowed, truncated, or hidden when content is dense? My read: …"
- "What existing component or DaisyUI primitive does this compose from? My read: …"

Stop when the brief is clear, not when you run out of questions. Three to seven branches is typical.

## Phase 1 — Generate three variants in parallel

Spawn **three `designer` sub-agents in parallel**. Each must produce a **radically different** approach. Anti-convergence is a hard rule: variants that all feel like minor tweaks of one idea = fail.

Each agent receives the story brief + design-system pointers + a different **constraint-and-thesis pairing** so the spread is intentional, not accidental:

```
Variant A — "Minimal scaffold"
  Constraint: smallest possible component count; reuse existing primitives without
              inventing anything new. The shape is whatever falls out of recombining
              what's already in packages/design-system/src/.
  Thesis: prove the feature can ship inside the 19-component budget with zero new shapes.

Variant B — "Power-density rethink"
  Constraint: optimise for the single most common power-user task. Cut everything
              else from the primary view; push it to a detail/secondary surface.
  Thesis: density and speed beat completeness. Show what the user actually does
          80% of the time at maximum information density.

Variant C — "Reference-borrowed"
  Constraint: take inspiration from a SPECIFIC named reference (Linear / Notion /
              Slack / Figma / Linear's command palette / Stripe Dashboard) — pick
              one whose interaction grammar fits, and embody it cleanly without
              copying chrome. The orchestrator names the reference per story.
  Thesis: a proven interaction grammar shortens the user's learning curve.
```

If the story is for a *new design-system primitive* (L1 / L2 / L3 / future primitives), substitute the constraints to explore the **shape itself**:

```
Variant A — "Container with payload" (the shape is a thin container; the payload
            does the work; minimal API surface).
Variant B — "Self-contained block" (the primitive owns its layout, states, and
            affordances; consumers parameterise but don't recompose).
Variant C — "Layered" (a base layer that always renders + extension slots that
            consumers fill — the React `children`-as-slot pattern).
```

Anti-convergence requirement — verify before Phase 2 dispatches:
- Variants must differ on **at least 3 of these axes per pair**: hierarchy (where the eye lands first), density (how much fits per row/screen), state strategy (one canonical layout vs distinct shapes per state), motion (where it moves), action surface (where verbs live), composition (one component vs three), copy register (terse vs guided).

If two variants converge, regenerate. Do not proceed with three flavours of one thing.

### Output per variant — the spec is concrete OR it doesn't count

Each sub-agent produces, in `docs/design-explorations/<story-id>/<variant-slug>/`:

1. **`spec.md`** — opinionated spec, no hand-waving:
   - User story (1 sentence — who, what, why)
   - Component composition: which existing components are used where (named, not "a card-like thing")
   - Information hierarchy: numbered 1/2/3, with one-line content per slot
   - All states: empty / loading / error / populated / overflow — described with copy and component names
   - Behavior: hover, focus, keyboard shortcuts, focus-trap rules, transitions (named: motion/fast/medium/slow)
   - Mobile adaptation: how it maps to the three-tab mobile layout
   - The **signature** — the one thing that makes this variant unmistakably itself
   - Trade-offs: what this variant is bad at
2. **`mockup.html`** (preferred) — a self-contained HTML file that **embodies** the variant. Imports the design system tokens (link to `packages/design-system/src/tokens.css`), uses real data shapes from the story, demonstrates the primary state. The mockup IS the variant; describing motion in prose while the mockup uses default 200ms transitions = fail.
3. **`screenshot.png`** — Playwright screenshot of `mockup.html` at desktop width. (Run `npx playwright screenshot file://<absolute-path>/mockup.html screenshot.png --wait-for-timeout=1000`.)

If HTML mockups are too heavy for the story (small primitive, well-understood shape), produce *spec + a TSX sketch in the design-system playground* instead. The hard rule is: each variant must produce a **looked-at artifact**, not just prose.

## Phase 2 — Critique each variant in isolation

For each of the three variants, run `/design-critique` against the screenshot/mockup. Score 0-10 across the nine dimensions. Variants below 5 fail and get regenerated; variants 5-7 get noted findings; variants ≥7 advance.

If all three score below 5, the brief was wrong — go back to Phase 0 and re-interrogate. Do not push three weak variants into the comparison.

## Phase 3 — Build the comparison

Produce `docs/design-explorations/<story-id>/comparison.md`:

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
| `/design-critique` score | … /10 | … /10 | … /10 |

Plus the three screenshots side by side.

## Phase 4 — Synthesize

Often the best design combines insights from multiple variants. Write `docs/design-explorations/<story-id>/synthesis.md`:

- Which variant is the strongest base?
- Which elements from the other two are worth pulling in?
- What gets explicitly **rejected** and why (this list matters as much as the chosen direction — it prevents re-litigation)?

If the project is in autonomous mode, the orchestrator picks based on:
1. Highest critique score
2. Lowest component-budget cost
3. Best fit with founder filter (no cargo-culted patterns from the rejection list in TRACK-L scope rules: no keyboard-verb shortcuts, no optimistic-UI bragging, no sidebar drag-reorder, no emoji reactions, no cycles UI, no search-modifier mini-language, no customizable dashboards)

If the founder is reachable, surface the comparison and **let them pick**. One AskUserQuestion, with the three options + your recommendation. Never batch design decisions across multiple AskUserQuestions.

## Phase 5 — Approve and write the chosen design

Once a direction is chosen, write `docs/design-explorations/<story-id>/approved.md`:

- The chosen variant + any pulled-in elements from siblings
- The rejected list (so `/architecture` and `/write-code` don't re-litigate)
- Component mapping: which design-system components are used, where, what props
- All states with copy
- Behavior + motion + keyboard shortcuts
- Mobile adaptation
- Open questions for the architect (data shape, route, action endpoints)

Then run `/design-critique` once more on the approved design — score must be ≥7. If not, iterate (max 4 iterations, same as `/design-critique`'s loop).

`approved.md` is the **input contract** to `/architecture`. The architect does NOT re-decide visual hierarchy, component vocabulary, or interaction grammar.

## Anti-patterns

- **Three flavors of one thing.** All variants "modern minimalism with different accent colors" or "the same layout with the action button in three places" = fail.
- **Specs without concrete values.** "A clean, modern card" is not a spec; "ThreadRow with KeyValue header, 8px padding, motion-fast hover, surface-1 background" is.
- **Mockups that describe instead of embody.** Don't describe the variant's motion in prose while the mockup uses default 200ms transitions.
- **Skipping the critique gate.** Phase 2 isn't optional. A weak variant that wasn't critiqued is a weak variant in the comparison.
- **Re-litigating in `/architecture`.** Once `approved.md` lands, the visual contract is closed. Architecture asks how, not whether.
- **AI-aesthetic defaults.** Purple gradients, hero sections, decorative icons, oversized padding, generic 3-column card grids — see `packages/design-system/AESTHETICS.md` § AI-Aesthetic Anti-Patterns.

## Output artifacts

```
docs/design-explorations/<story-id>/
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

## Cross-references

- `/design-critique` — the scoring rubric this skill calls per variant and on `approved.md`
- `/architecture` — consumes `approved.md` as fixed input; never re-litigates the visual contract
- `/architecture-critique` — the architectural counterpart of design-critique
- `/visual-polish` — used later, AFTER implementation, to bring the rendered TSX to pixel parity with the approved mockup
