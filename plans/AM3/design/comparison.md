# AM3 Session View — variant comparison (content-rendering axis)

> **HISTORICAL (design exploration).** Record of the three-variant comparison. **Column "1 · Calm Transcript" is the chosen + founder-approved direction, renamed "Session View"** — final state in `approved.md`. Two rows below were superseded at review: the **permission Allow/Deny** prompt was REMOVED (review is the allow point) and the **status roll-up bar** was REMOVED; and authorship is the **unified self/other pattern** (my own = right grey box; everyone else incl. agents = left-plain), fixed at the source in the shared `PartList`. Read `approved.md` for the truth.

All three render the SAME session fixture inside the SAME `ConversationSurface` shape. They differ ONLY in the **rendering vocabulary of the session content** — how a tool call is displayed at rest and how its I/O & diffs reveal. **Placement is settled, not compared.** Screenshots: `variants/v1.png`, `v2.png`, `v3.png`.

| Dimension | 1 · Calm Transcript | 2 · Glanceable Activity | 3 · Activity Timeline |
|---|---|---|---|
| Signature (one tell) | a calm ledger; tool runs fold to one line | every row shows its I/O inline at rest | a threaded gutter rail + side reveal panel |
| Disclosure at rest | minimal — bare row, no I/O | maximal — one-line I/O preview per row | medium — node + verb; detail on select |
| Tool-row grammar | indented one-liner | icon + verb + inline I/O block | gutter NODE (icon = node on a rail) |
| Aggregation | HARD — one verb, count, fold-to-rows | SOFT — verb header, rows stay visible | one aggregate node, reveals steps to side |
| How tool I/O reveals | inline `<pre>` on click | inline preview always; full body on click | docked right reveal panel on select |
| How a diff reveals | inline diff chip → panel (click) | inline compact hunk under the edit row | side reveal panel (`ReviewCodeDiff` gutter) |
| How a FAILURE reads | ✗ glyph; stderr on expand | destructive left rule + inline error line | red node + ✗; stderr in reveal panel |
| Reading column | 760px, one column | 760px, one column | 680px + 400px reveal panel |
| Density | medium (airy, calm) | high (substance on every row) | high (two panes) |
| Best at | calm validation, long-prose sessions | watch-it-work, low-click scanning | code-heavy, see-structure + watch edits land |
| Worst at | substance is one click away | busiest; long previews can crowd | reveal panel competes for width; rail faint on prose-only turns |
| Motion budget | pin + caret + expands | + inline preview reflow | + panel slide |

## Where they converge (the shared spine)
Unified self/other authorship (my own = right grey box; everyone else incl. agents = left-plain) · reasoning fold · descriptor composer (model/effort/mode pills; a model declaring none → its pills vanish) · queued row + ✕ · plan list · artifact chip · session-total cost (header) · scroll-to-bottom · Stop while streaming. *(Historical: a permission Allow/Deny + status roll-up were in this spine; both REMOVED at review.)* All three pass the calm-rendering principles (collapse-by-default, aggregation over enumeration, monochrome restraint, no per-line chrome).

## The decision the founder is making
Not *where* the session opens (settled) — but **how much each tool call reveals at rest, and how I/O & diffs surface**:
- pick **1** if the session should read like a calm document and activity should recede;
- pick **2** if the founder wants to read the agent's actual I/O without clicking;
- pick **3** if the structure of the work (order, branching, edits) should be carried spatially with detail docked beside it.

The pick is a **rendering language**, not a layout — and the three are composable: e.g. "1's calm spine with 2's inline preview on edits only" is a legitimate founder synthesis to express in `/human-design-review`.

## Per-aspect demonstration (all three render the full taxonomy)
| Aspect (concept Part 7) | 1 Transcript | 2 Glance | 3 Timeline |
|---|---|---|---|
| c — MCP call | folded in aggregate; verb on expand | inline `→ 1 issue ENG-411…` | aggregate node; in reveal |
| c — sub-agent | bare row, "Background" | row + nested mini-stream inline | (in stream; running node) |
| d — failed tool | ✗ + stderr on expand | destructive rule + inline error | red node + stderr in reveal (shown selected) |
| f — diff | chip → changed-files panel | inline compact hunk | side `ReviewCodeDiff` reveal (shown) |
| h — permission | inline Allow/Deny card | inline Allow/Deny card | inline Allow/Deny card |
| k — plan | foldable step list | foldable step list | foldable step list |
| p — status | top-bar roll-up | top-bar roll-up | top-bar + Ready-for-review CTA |
