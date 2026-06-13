DESIGN-CLASS: routine  ref=SettingsAgents.tsx,SettingsModels.tsx  pattern=existing-inline-form

# AH2 Design Brief — Per-agent model picker + constrained harness selector

## Classification rationale
- **Existing component reference: YES** — spec names `SettingsAgents.tsx` (table + inline edit/add form) and `SettingsModels.tsx` (tier rows). Both exist and are being extended.
- **Pattern match: YES** — the inline-form-in-table-row and the `Select`-per-field patterns already exist in these very files. The mechanical change is: replace one free-text `<input>` (harness) with a constrained `<Select>`, and add a per-agent model `<Select>`.
- → **routine.** One variant + rejected directions. No shape invention; this is constraint application inside a locked concept.

## User task
The founder, in Settings → Agents, configures an agent's **brain** (model) and **body** (harness) so the agent is runnable by construction. The decision: "which model does this agent think with, and which harness runs it?" Today the harness is a blank text box (typo → dead session) and the model is a global tier table, not a per-agent property. The founder wastes time guessing harness names and cannot give two agents on one team different models.

## Reuse inventory (Phase 0b — hard gate)
| Visual element needed | Existing component | New prop? |
|---|---|---|
| Per-agent model picker (edit + add forms) | `Select` (design-system) with `options` + `placeholder` | none — `options` from ModelCatalog |
| Constrained harness selector (replaces free-text input) | `Select` with `options` from registry | none |
| Harness "unavailable" / legacy-value affordance | `Select` `options[].disabled` + `StatusChip` warning | none |
| Agent table columns (Model, Harness) | existing `table table-xs` cells | none — relabel content |
| Settings → Models tier rows | existing `TierRow` flat layout | none — relabel + reuse same `Select` model picker |
| Models section "system default" framing | plain `<p>` helper text (text-tertiary) | none |
| Save / cancel buttons | existing `btn btn-primary` / `btn btn-ghost` | none |
| Loading / error / empty states | existing `skeleton` / `text-error` / empty `<p>` | none |

**Zero NEW components.** Both Settings surfaces ship inside the existing catalogued budget. The only library swap is free-text `<input>` → `<Select>` (a component already imported in both files). This satisfies the component-budget hard rule emphatically.

## Interrogation — resolved reads (autonomous)

1. **Model picker grouping — flat list or grouped by provider?** Read: **flat list**, Anthropic catalog only for AH2 (concept Phase 4 scopes the picker to the Claude catalog; other providers remain reachable via the demoted tier table). Label shows friendly name + id, e.g. `Opus 4.8 (claude-opus-4-8)`. No provider sub-grouping — 4 items don't earn `<optgroup>` complexity.

2. **What happens to an agent whose stored harness is no longer registered (legacy null, or a CLI tool that left the PATH)?** Read: the `Select` shows the current value as a **disabled, flagged option** ("aider — not available") so the founder sees what's set and why it's broken, and a `StatusChip status="warning"` "Harness unavailable" appears in the row. Saving forces a re-pick from the registered set; the server rejects the stale value (concept hard rule: server-side validation). Never silently coerce.

3. **Does the model picker also need a provider control per agent?** Read: **no provider control in the AH2 picker.** The schema carries `modelProvider`, but every catalog entry is `anthropic`, so the provider is derived from the chosen catalog entry — one control, not two. (Concept: per-agent provider is allowed by schema but out of picker scope. Avoids a second axis the founder doesn't need yet.)

4. **Settings → Models: keep, demote, or remove?** Read: **demote in place.** Same 3 tier rows, relabeled. Section helper copy changes from "configure which model handles each tier" to a "system default models — used only when an agent has no model of its own" framing. Model field uses the SAME ModelCatalog `Select` for `anthropic` (fixes the stale-IDs defect in `KNOWN_ANTHROPIC_MODELS`). No structural change — concept allows "removed OR demoted"; demotion preserves the cost-posture fallback the Scheduler still needs.

5. **Most common state?** Read: **populated** (agents already exist post-onboarding). Empty only on a fresh, agent-less factory (rare). Design optimizes the populated edit/add path.

## States to handle (both surfaces)
- **Populated** (primary): table rows show Model + Harness; inline form has two `Select`s.
- **Loading**: existing `skeleton` rows (unchanged).
- **Error**: existing `text-error` message (unchanged).
- **Empty** (Agents): existing "No agents configured." `<p>` (unchanged).
- **Overflow**: model labels can be long (`claude-haiku-4-5-20251001`); `Select` truncates natively, table cell uses existing `font-mono text-secondary` with `truncate`. The dropdown shows full label.
- **Degraded** (new): harness stored but unregistered → disabled flagged option + warning chip.

## Mobile adaptation
Settings is desktop-primary. On mobile (≤768px) the inline form's `flex-wrap` already stacks the fields full-width (existing `min-w-[140px]` + `flex-1`). Model and Harness `Select`s inherit `size="sm"`; AQ-005 requires ≥16px input font at ≤768px — `Select` base is `text-[15px]`; **flag for architecture**: the harness/model selects must hit 16px on mobile (existing `input input-sm` in these forms may already violate AQ-005 — out of AH2 scope to fix globally, but the two new `Select`s must comply).
