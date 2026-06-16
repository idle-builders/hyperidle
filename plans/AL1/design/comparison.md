# AL1 Review Experience — Variant Comparison (Phase 2)

Three rendered variants of the Review surface, same fixture (Atlas's "Handle Stripe refund webhooks"). Screenshots: `verdict-brief/screenshot.png`, `examination-bench/screenshot.png`, `reasoning-ledger/screenshot.png` (live at `:8098` → `Page: Review/A|B|C`).

| Dimension | A — Verdict Brief | B — Examination Bench | C — Reasoning Ledger |
|---|---|---|---|
| **Signature (one tell)** | "Needs you" panel *above* the diff | anchored-comment gutter on the diff | confidence-sorted decision ledger |
| **Spine / lands first** | Triage (what needs me) | Examine (the artifact content) | Judge (reasoning × intent) |
| **Examine↔converse** | Nested inline, one column | Split three-pane, persistent | Ledger-primary, evidence one click down |
| **Component count** | Lowest (≈all reuse) | Highest (gutter + rail filter + per-artifact state) | Medium (ledger row + meter) |
| **Density** | Medium / document | High / three-column | Medium / calm list |
| **Primary action surface** | Pinned bottom verdict bar | Right-rail verdict header | Sticky top verdict bar |
| **State strategy** | One layout, sections expand | Persistent panes, content swaps | Ledger rows expand; sort/filter |
| **Motion budget** | Section/artifact expand | Pane swap + gutter dot pop | Row expand + sort reflow |
| **Reading mode served** | Fast read (the 80%) | Slow read (deep, multi-artifact) | Reasoning-first read |
| **Best at** | Responsible approve in 5s; lowest build cost; most native | Deep code review; per-artifact tracking; anchored comments | Owns the white space (intent × structured why × risk routing) |
| **Worst at** | Cross-artifact pivoting; large Subjects scroll | Re-centers the diff the research demotes; tightest; costliest | Degrades when Rationale is empty; novel grammar |

## In-session critique (designer self-score, 9 dimensions, 0–10)

| Dimension | A | B | C | Note |
|---|---|---|---|---|
| Hierarchy | 9 | 7 | 9 | A & C invert to lead with attention/reasoning; B leads with the artifact (against the research). |
| Spacing | 8 | 8 | 9 | All on-grid; C's calm Linear rhythm is the most composed. |
| Typography | 8 | 8 | 8 | Mono anchors/IDs, tabular nums, quiet caps headers throughout. |
| Color | 8 | 8 | 9 | C's confidence meter bands (red/amber/green) carry real meaning, not decoration. |
| Coherence | 9 | 7 | 8 | A is ~all-reuse (most native); B's gutter is the most bespoke shape. |
| States | 8 | 7 | 8 | A: populated/empty-needs-you/resolved. C: populated/risk-only/no-rationale. B: populated/rationale-tab/loading. |
| A11y | 8 | 7 | 8 | All keyboard-specified; B's three columns tighten <1100px; A's anchor links are small. |
| Anti-slop | 9 | 8 | 9 | Warm, dense, distinctive; zero AI tells; left-aligned; no hero/gradient/centered body. |
| Premium polish | 8 | 8 | 9 | C's hover-lift cards + meter + inline evidence read most finished. |
| **Average** | **8.3** | **7.6** | **8.6** | |

## Defects found and fixed in this pass (proof, not vibes)
- **B center pane rendered 0-width** (panes sized to content; `flex-1` collapsed). Root cause: viewer Tailwind `content` never scanned `web/src` → page-unique `w-[Npx]` classes weren't generated. Fixed `viewer/tailwind.config.ts` (added `../../web/src/**`). B now: nav 240 / center 832 / rail 320, diff + gutter visible.
- **B & C verdict bars used non-binding actions** (Snooze / Explain / Ask) instead of the 5 binding verdicts. Fixed to `Approve · Approve w/ comments · Request changes · Edit · Reject` (A/C/R/E/X), matching `verdict-actions.md`. Concept hard-rule 8 (verdict grammar untouched) restored.

## The honest read
- **C is the most on-thesis** — it is the only variant whose *spine* is the white space the AL1 research says no tool owns (structured Rationale × Intent traceability × confidence-based attention routing). It leads with the why, sorted by risk, diff one click down.
- **A is the most accessible and cheapest** — its "Needs you" panel is the cleanest embodiment of "pull the human in only where it matters," and the pinned verdict bar makes the fast-read 80% case a 5-second responsible action. Near-zero new shapes.
- **B is the strongest *examine* mechanism** — the anchored-comment gutter is table-stakes for deep code review and is the one net-new interaction both A and C still need for drilling into a code decision. But as a *spine* it re-centers the diff the research demotes, and it costs the most.

→ Synthesis (next): C as the base, grafting A's triage panel + pinned verdict bar and B's gutter as the in-evidence examine mechanism.
