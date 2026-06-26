# AO1 — variant comparison

Full 9-dim scoring + rationale in `variants.md`. Screenshots: `/tmp/ao1c-{SettingsFilesystems,AgentFilesystemsInline,FilesystemAttachFlow}.png` (looked-at artifacts, NOT regression baselines — the DOM-snapshot net is the regression mechanism).

| Dimension | A — Settings section | B — Inline agent config | C — Connection-first flow |
|---|---|---|---|
| Signature (one tell) | Sibling to Connections — auth + files as matching Settings sections | Expand-to-`KeyValue` inspect grid; agent-scoped | Connection IS the entry point (Vercel import) |
| Component count | Row/ItemList/SectionLabel/StatusChip/Tag/Dialog/Select/Input/Menu | + KeyValue; − Dialog (inline) | + NavItem; − Menu |
| New shapes | 0 (KindMark inline, AN1 precedent) | 0 | 0 |
| Density | High (fleet list) | Med (one agent, richer per row) | Med-low (wizard) |
| Primary action surface | Page `+ Attach filesystem` + per-group `+ Attach` | Section `+ Attach` in agent panel | Stepped flow + Attach button |
| State strategy | Grouped list, severity-sorted | Card-rows + expand inspect | Flow with selected/attached/available |
| Motion budget | Dialog open; menu | Row expand | Step transitions (none in story) |
| Best at | Fleet scan + lowest learning cost | End-to-end single-agent config + inspect depth | First-time guided attach |
| Worst at | Detached from agent panel; re-pick agent | No fleet view; couples to agent panel | Attach-only; novel wizard grammar; assumes repo-listing AO1 lacks |
| 9-dim total | **80 / 90** | **78 / 90** | **66 / 90** |

**Winner: A**, pulling B's `KeyValue` inspect grid in as the row-expand. C rejected as primary (attach-only, wizard-novel, assumes a live repo-browse capability AO1's contract does not provide in v1).
