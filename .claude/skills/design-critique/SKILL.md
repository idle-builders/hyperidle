---
name: design-critique
description: "Score design variants against the 9-dimension rubric. Evaluation act — separate from production. Same designer agent, different cognitive mode."
argument-hint: "[workpackage-id]"
user-invocable: true
min_tool_calls: 8
---

# Design Critique

**Why:** The mind that just created variants cannot objectively score them. Switching to evaluation mode — even within the same session — requires a deliberate cognitive break. This skill is that break.

Read the variants produced by `/design` at `plans/<workpackage-id>/design/<variant-slug>/`.

## Score each variant in isolation

For each variant, score it 0-10 against the 9-dimension rubric below.

Variants below 5 fail and get regenerated; variants 5-7 get noted findings; variants ≥7 advance. If all three score below 5, the brief was wrong — go back to `/design` Phase 0 and re-interrogate. Do not push three weak variants into the comparison.

### Design rubric (0-10 each, averaged)

Each dimension links to a reference file under `references/` that explains the underlying tactics. Read the reference before scoring — the rubric line below is the gist, not the rule.

1. **Visual hierarchy** (`references/hierarchy.md`) — clear primary/secondary/tertiary; titles heavier than labels; eye flows naturally.
2. **Spacing & density** (`references/spacing.md`) — 4px grid; density appropriate to context; related items grouped.
3. **Typography** (`references/typography.md`) — font sizes from the type scale (11/12/13/14/18/24); weights limited to 400/500/600; monospace only for data.
4. **Color** (`references/color.md`) — meaning not decoration; only token palette; never sole differentiator; ≥4.5:1 contrast.
5. **Component coherence** (`references/finishing.md` for sibling-treatment rules) — token-based, no hardcoded hex/px; composes from existing primitives; sibling-component consistency.
6. **States & feedback** (`references/finishing.md`) — default/hover/focus/active/disabled/loading/empty/error; motion tokens; visible focus ring.
7. **Accessibility** — focus rings visible; keyboard nav; alt/aria; semantic elements.
8. **Anti-slop** — no purple gradients / centered hero / emoji icons / `rounded-2xl` / generic 3-col card grids; see `packages/design-system/AESTHETICS.md` § AI-Aesthetic Anti-Patterns.
9. **Premium polish** (`references/finishing.md`) — `tabular-nums` on numeric cells; `+0.02em` on uppercase labels; `--motion-fast/medium/slow` with `cubic-bezier(0.2, 0, 0, 1)`; `prefers-reduced-motion`; ≥44px touch targets; ≥16px mobile inputs; halation guard.

### Output line per critique pass

```
DESIGN-CRITIQUE: variant=<slug> score=<int>/10  rounds=<n>  axes: H:_ S:_ T:_ C:_ Co:_ St:_ A:_ AS:_ PP:_
```

Read screenshots, not code, when scoring. Reading code to score visual hierarchy is theatre.

## Iteration

If scores are below threshold, fix and re-score. Max 4 rounds. The loop counter is in the output line so downstream skills (and the retro) can read iteration count.

## Target

$ARGUMENTS
