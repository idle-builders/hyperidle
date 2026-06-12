# Design Critique: AG1 — Team screen composes at desktop widths

Reviewer (Phase 2). Scored the three variants from their committed screenshots
(`*/screenshot.png` @ 2000px, C also @ 2560px) against the 9-dimension rubric,
the Hearth token system (`packages/design-system/DESIGN.md`, `src/tokens.css`),
and `.claude/rules/aesthetic-quality.md`. Chosen variant: **B** (slug
`b-summary-grid`).

DESIGN-CRITIQUE: variant=b-summary-grid score=8/10  rounds=0  axes: H:9 S:9 T:8 C:9 Co:9 St:8 A:8 AS:7 PP:8

## Verdict per variant (from screenshots)

| Variant | Score | Read |
|---|---|---|
| A — constrained column | 7/10 | Correct root-cause fix, zero new shapes. But the burn block still renders a vertical KeyValue list inside the 760px card, so label/value pairing is "tight-ish by cap", not by construction; the health read is buried mid-page. Lowest risk, weakest morning-scan hierarchy. |
| **B — summary header + column** | **8/10** | Identity → 4-tile vitals strip → work is the exact morning-scan order. Label-over-value pairing is structural (impossible to drift). Reuses the 960px Work-view column family. Single risk: the 4-tile strip flirts with the AI-dashboard tell. |
| C — two-column instrument | 7/10 | Right status rail is elegant on very wide windows but collapses to single-column (= A) at the founder's actual 1280px daily width, leaves the right two-thirds empty at 2560px, and adds a breakpoint no sibling page uses. Most regression surface for the least daily payoff. |

B is the right pick. The comparison/synthesis reasoning is sound and the
rejections (C's rail, AppShell `<main>`, KeyValue edits, new shared primitive,
3-col grid, >960px column) are all correctly scoped away from AG1 into AG5/AG6.

## Dimension scores for B (chosen)

- **Hierarchy 9** — eye lands on identity, then the four vitals in one sweep, then work. Screenshot confirms the strip is the second-strongest block.
- **Spacing 9** — every value on the 6px grid: tiles `p-[18px]`, column `p-[24px]`, strip `gap-[12px]`, section `gap-[24px]`. All in `{3,6,9,12,18,24,36,48}` (AQ-001 clean).
- **Typography 8** — value `text-[20px]` semibold (on scale), label `11px` mono uppercase + `--tracking-caps`, tabular-nums on every number (AQ-006). Docked one point: see WARNING on the 4th-tile spec inconsistency, which is a typography/content ambiguity the builder must resolve.
- **Color 9** — warm tokens only in the mockup; forest accent on Status value, paired with the text label ("Healthy"/"Attention"), never color-alone (AQ-010 honored). No cool grays, no hardcoded hex outside the mockup's `:root` stand-ins (which map 1:1 to real tokens).
- **Coherence 9** — adopts the same `flex-1 overflow-y-auto` + `max-w-[960px] mx-auto w-full` column WorkPortfolio and KnowledgeDetail already use (verified in code). Tiles echo WorkBet's `flex-1 ... p-[18px] flex flex-col gap-[6px]` stat cards.
- **States 8** — summary bar renders zeros in the empty state so an empty team looks measured not abandoned; loading uses tile-shaped skeletons; error/404 centered in column. Strong. Docked one point: the empty-state composition is described but not rendered as a screenshot (no empty-team mockup), so "looks intentional" is asserted, not yet shown — the E2E must prove it.
- **Accessibility 8** — tiles are display-only (no new interactive targets); existing rows keep their 44px targets and focus rings. Status meaning carried by text, not color. No new a11y surface introduced.
- **Anti-slop 7** — the one real risk. A 4-card top strip is the single most common AI-dashboard tell. Mitigated correctly (flex + flex-wrap not `grid-cols-3`; four tiles of *different* content, not an identical `.map`; productivity context, no hero) so AQ-108's lint will not fire — but the lint only catches the mechanical form. The *visual* read is the open question and only the rendered screenshot at 1280/2000/2560 closes it. This is why anti-slop is 7 not 9.
- **Premium polish 8** — tabular-nums throughout, the stat strip is a distinctive instrument-like gesture, warm shadows on bet cards keep tactile weight. No off-scale radius (tiles `--r-subtle` 10px, on-scale).

## CRITICAL
- None. No hard-rule (AQ) violation in the chosen mockup; the variant is structurally sound and correctly scoped.

## WARNING
- [b-summary-grid/spec.md:17 vs approved.md:37 / mockup.html:81 / screenshot.png] **The 4th tile is specified two different ways.** The variant `spec.md` names the 4th tile **"Bet vs routine"** (a two-line cost breakdown); `approved.md`, the mockup, and the screenshot all show **"Status" (Healthy/Attention + idle count)**. The locked contract is `approved.md` → Status. The builder must follow approved.md/mockup, not the stale variant spec. Flagging because two committed design docs disagree on the load-bearing 4th tile. → Resolve in favor of approved.md (Status tile, derived from `roster` health, color paired with text). The architecture already encodes Status — good — but the design-doc disagreement should be noted so a future reader doesn't trust spec.md.
- [b-summary-grid/spec.md:18 / approved.md:54] **Status-tile derivation is "best effort, may degrade to 3 tiles."** Both docs sanction shipping 3 tiles if a clean healthy/attention signal isn't cheaply derivable. That is a legitimate fallback, but it means the *signature* gesture (the morning health read — the whole thesis of variant B) is optional. If the builder ships 3 tiles, B effectively becomes "A with a horizontal burn strip" and the headline hierarchy win (health answered before scroll) is lost. `RosterMember.healthLevel` + `operationalStatus` exist in the payload (confirmed in `WorkTeam.tsx:535-537`, already consumed by `AgentRow`), so the 4-tile Status derivation is cheap and SHOULD ship. → Builder should ship 4 tiles; falling back to 3 silently drops the variant's reason for winning.
- [approved.md / no empty-team screenshot] **No empty-state mockup was produced.** AC-3 ("empty team looks intentional") is the spec's explicit, named requirement, and the design only describes the empty composition in prose (approved.md §4) — there is no screenshot of it. The morning-scan hierarchy is proven for the populated state only. → The E2E (architecture T1) must capture and the reviewer must visually approve the empty-team frame; until then AC-3 is unproven at the design layer.

## SUGGESTION
- [mockup.html:81] The Status tile applies the forest accent via inline `style="color:var(--accent-primary)"`. In production this must be a token-driven class, and the "Attention" state should map to `--status-warning` (amber), not the success forest — confirm the builder branches the color by health, with the text label always carrying the meaning (AQ-010).
- [approved.md §2 / mockup] At 1280px four `min-w-[180px]` tiles + `gap-[12px]` inside a 960px column wrap to 2×2 (4×180 + 3×12 = 756px fits, so they likely stay one row at 960 but wrap below). Confirm in the E2E screenshot that the 1280px frame reads as an intentional row/2×2 grid and not a ragged wrap.
- The slug `b-summary-grid` says "grid" but the design is deliberately `flex`/`flex-wrap` (the whole AQ-108 mitigation). Cosmetic, but the slug invites exactly the misreading the design works to avoid. Harmless; noting for the record.

## What's Working Well
- The diagnosis is code-level, not screenshot-level: the designer correctly traced all four founder symptoms to one root cause (WorkTeam is the lone Work page with no `flex-1 overflow-y-auto` + `max-w mx-auto` wrapper, rendered flush inside AppShell's padding-less `overflow-hidden` `<main>`) — verified true against `WorkTeam.tsx:234` and `layouts/AppShell.tsx:538-543`. The fix is the smallest correct one.
- Scope discipline is exemplary: KeyValue (AG6), the shared row/table primitive (AG6), and AppShell `<main>` (AG4) are each explicitly identified and rejected with reasons. The variant stays inside one file and composes from existing primitives — exactly what AG1's boundary with AG5/AG6/AG4 requires.

---
**Score: 8/10. Verdict: PASS** (≥7, no CRITICAL).
