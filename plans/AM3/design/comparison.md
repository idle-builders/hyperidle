# AM3 Session view — variant comparison + Phase-2 critique

All three render the SAME realistic session fixture (the AI-SDK-5→6 chat-bug session) so the founder compares **placement**, not content. The shared stream, tool/reasoning renderers, queued bubble, and descriptor-driven composer are identical across variants; only the entry surface + diff affordance + status placement differ.

| Dimension | A · Focused Route | B · Companion Panel | C · Split + Diff Rail |
|---|---|---|---|
| Signature (one tell) | one calm centered column, whole screen | wide dock over a dimmed conversation | persistent diff rail beside the stream |
| Entry surface (Q1) | full-page route | 620px right dock (conversation mounted) | full-width route, two-pane split |
| Diff affordance (Q5) | per-turn CHANGED FILES panel | inline diff chip per edit row | always-on diff rail |
| Status (Q7) | top-bar roll-up | condensed in panel header | rail header + Ready-for-review |
| Reading column width | 760px | 620px | 680px (− 440px rail) |
| Component count | stream + panel + composer | stream(+chips) + composer | stream + composer + rail |
| Density | medium (airy, calm) | high (condensed header) | highest (two panes) |
| Primary action surface | bottom composer | dock composer | left composer + rail CTA |
| State strategy | one column, panel for diff | one dock, inline diff | two panes, diff persistent |
| Motion budget | pin + caret + expands | + slide-in open | + live rail append |
| Best at | calm validation, long prose | not leaving the conversation | code-heavy, watch edits land |
| Worst at | diff is one click away; you leave | narrowest column; dims conv. | empty rail on non-coding sessions |
| **Phase-2 critique** | **8.4** | **8.1** | **8.0** |

## Phase-2 critique (9 dimensions, 0–10)

### A · Focused Route — 8.4
- Hierarchy 9 — eye lands squarely on the agent column; tool noise recedes; one clear focus.
- Spacing 9 — 6px grid throughout; airy 760px column matches the references' `max-w-3xl` calm.
- Typography 8 — 15px prose / 13px rows / 12px meta; mono targets; tabular diff stats. Reasoning italic reads as distinct.
- Color 9 — monochrome restraint; only failure (✗) uses `--status-error`, running uses `--accent-secondary`. No floods.
- Coherence 8 — reuses `PartList` grouping, `ReviewCodeDiff` tints, `Fold` device, descriptor pills.
- States 7 — populated + streaming + queued shown; empty/error deferred (correct for initial design).
- A11y 8 — role=button tool rows, aria-expanded, motion-safe pulses, close ✕ labelled.
- Anti-slop 9 — zero AI-aesthetic tells; no gradient/hero/3-col grid; dense + purposeful.
- Premium polish 8 — streaming caret, live dot, calm aggregate verb. Loses 0.6: diff a click away.

### B · Companion Panel — 8.1
- Hierarchy 8 — clear in the dock; the dimmed conversation is a deliberate recessive layer.
- Spacing 8 — tighter rhythm; condensed status header is dense but legible.
- Typography 8 — same scale; inline diff chips read cleanly.
- Color 9 — same restraint; dim layer via opacity only.
- Coherence 9 — best "fits the existing app" (the kept attempt-1 entry mechanism + the Fold to the session).
- States 7 — same as A.
- A11y 7 — focus-trap-in-dock needed (build); otherwise parity.
- Anti-slop 9 — clean.
- Premium polish 7 — strong, but 620px is the narrowest calm column and the dim layer eats width.

### C · Split + Diff Rail — 8.0
- Hierarchy 8 — two co-equal foci is powerful for code but splits attention.
- Spacing 8 — dense two-pane; rail hunk uses the review tint vocabulary faithfully.
- Typography 8 — mono diff in the rail is crisp; stream column slightly tighter.
- Color 9 — review tints reused exactly; restrained elsewhere.
- Coherence 9 — strongest diff reuse (the rail IS the review look, live).
- States 6 — the non-coding empty-rail case is the weak state (deferred but real).
- A11y 7 — two-pane tab order needs care (build).
- Anti-slop 9 — clean, distinctly not-AI.
- Premium polish 8 — "diff always on" is the most impressive when the session is code; the most awkward when it isn't.
