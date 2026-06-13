# AH2 Approved Design — Constrained selectors

**Input contract to `/architecture`.** The architect does NOT re-decide hierarchy, component vocabulary, or interaction grammar below.

## Chosen direction
"Constrained selectors" — two equal-weight `Select`s (Model, Harness) in the Settings → Agents inline form, both fed from live system truth (ModelCatalog + adapter registry); Settings → Models demoted to "system default models" with the same catalog-backed model picker.

## Surfaces

### Settings → Agents (`SettingsAgents.tsx`)
- **Table columns**: `Name | Role | Model | Harness | Sessions | Actions`. Remove "Model Tier" column. Add "Model" column (renders friendly label, `font-mono text-[var(--text-secondary)] truncate`).
- **Harness cell**: shows `harnessType`; if the agent's harness is NOT in the registered set, render `StatusChip status="warning"` reading "Harness unavailable" instead of the raw string.
- **Inline edit + add form** (both): replace the free-text harness `<input>` and the old tier `Select` with:
  - **Model `Select`** — label "Model"; `options = MODEL_CATALOG.map(m => ({ value: m.id, label: `${m.label} (${m.id})` }))`; no placeholder; value = agent's `modelId`.
  - **Harness `Select`** — label "Harness"; `options` from registered harness types (new `GET /api/harnesses`, architecture defines). If agent's stored `harnessType` ∉ registered set: prepend `{ value: stored, label: `${stored} — not available`, disabled: true }` shown selected.
- **Save gating**: Save disabled when name empty (add path) OR the selected harness option is the disabled "not available" one.
- Field row layout: `flex gap-[12px] flex-wrap`; Model + Harness fields `flex-1 min-w-[140px]`; Max Sessions `min-w-[100px]`. Soul Prompt textarea full-width below (unchanged).

### Settings → Models (`SettingsModels.tsx`)
- Add helper `<p className="text-[13px] text-[var(--text-tertiary)]">`: *"System default models. Used only when an agent has no model of its own — set per-agent models in Settings → Agents."* above the tier rows.
- `TierRow` anthropic model field: replace `KNOWN_ANTHROPIC_MODELS` with `MODEL_CATALOG` ids (label `${friendly} (${id})`). Kills the stale `*-20250514` / `claude-haiku-3-5-*` strings.
- No structural change to tier rows, provider select, openai-compatible fields, or the debounced auto-save.

## Component mapping (zero new components)
| Slot | Component | Props |
|---|---|---|
| Model picker | `Select` (`@hyperidle/design-system`) | `size="sm"`, `options` from `MODEL_CATALOG`, `value=modelId`, `aria-label="Model"` |
| Harness picker | `Select` | `size="sm"`, `options` from registry (+ disabled stale option), `value=harnessType`, `aria-label="Harness"` |
| Unavailable-harness flag (table) | `StatusChip` | `status="warning"`, label "Harness unavailable" |
| Save error (server 422) | plain `<p>` | `text-[13px] text-[var(--status-error)]`, content = server `{ error }`, placed above Save/Cancel |
| Save / Cancel | existing `btn btn-primary` / `btn btn-ghost` | unchanged |
| Models helper | plain `<p>` | `text-[13px] text-[var(--text-tertiary)]` |

## States with copy
- **Populated** — table + inline form as above.
- **Loading** — existing `skeleton` rows (unchanged).
- **Error** — `Failed to load agents. Please try again.` / `Failed to load model configuration. Please try again.` (unchanged).
- **Empty (Agents)** — `No agents configured.` (unchanged).
- **Degraded harness** — disabled "<type> — not available" option selected + `StatusChip status="warning"` "Harness unavailable" in table; Save blocked client + server.
- **Save error (server 422)** — when POST/PATCH `/api/agents` returns 422 (`UNKNOWN_HARNESS` / `UNKNOWN_MODEL` / `INCOMPATIBLE_HARNESS_MODEL` / `UNSUPPORTED_PROVIDER`, or a harness that de-registered between form-open and Save), the form **stays open** with values intact and renders the server `{ error }` message inline directly above the Save/Cancel actions: `<p className="text-[13px] text-[var(--status-error)]">{error}</p>`. This replaces the current swallow-and-generic-toast path (`showToast("Failed to save agent")`) — the server's specific message reaches the user, not silence. Use the real design-system error token `--status-error` (the `--color-error` / `text-error` tokens are dead — AI1 removed them). Error clears on the next field change or successful Save.
- **Overflow** — long model ids truncate in cell (`truncate`); full label in open `Select`.
- **Toasts** — `Agent saved` / `Agent created` / `Models saved` (existing). Toasts remain for *success* and for transport-level failure (network/parse); the inline `--status-error` line is specifically for the structured 422 `{ error, code }` rejections so the user sees *why* the config was refused.

## Behavior / motion / keyboard
- Agents: explicit Save (local state until then). Models: existing 500ms debounced auto-save.
- Escape closes inline form (existing).
- `Select` focus ring = existing forest-green `focus:shadow-[0_0_0_3px_rgba(22,118,79,0.1)]`.
- Zero new motion.

## Mobile adaptation
`flex-wrap` stacks Model/Harness full-width at ≤768px. **AQ-005 — DECIDED (option a):** the two AH2 `Select`s (Model + Harness, in both edit and add forms) get `className="max-md:text-[16px]"` so AH2's new controls render ≥16px at ≤768px and avoid iOS focus-zoom. We do **not** change the design-system `Select` base (`text-[15px]`) — a global font bump is out of scope for AH2 and would touch every Select in the app. This is AH2's committed decision, not a deferral; the architecture wires it (see architecture Risks → AQ-005). The pre-existing settings-form Selects elsewhere keep `text-[15px]`; bringing them to compliance is a separate follow-up, out of AH2 scope.

## Rejected (do not re-litigate — see rejected.md)
Per-agent provider control (X); combined model+harness preset (Y); removing Settings → Models (Z); free-text+typeahead harness (W); modal edit (V).

## Open questions for the architect
1. **ModelCatalog location + shape** — concept proposes `@hyperidle/shared` (closed, code-owned): `{ id, label, provider, contextWindow? }`. Confirm and define `MODEL_CATALOG` constant + friendly labels (Opus 4.8 / Sonnet 4.6 / Haiku 4.5 / Fable 5).
2. **Registered-harness endpoint** — design assumes a `GET /api/harnesses` (or reuse `GET /api/workers`, which already returns `AdapterInfo[]` with `type` but requires `X-API-Key`). Architect picks: a new lightweight founder-auth endpoint vs. reusing workers. UI needs `type` strings only.
3. **Column names** — new `users.model_id` + `users.model_provider` (concept Phase 3). Confirm.
4. **Default model + harness on create** — concept recommends `claude-sonnet-4-6` + `builtin` (or `claude-code`). Architect locks; must be applied at onboarding + team creation + add-agent form initial values.
5. **Save-time validation contract** — RESOLVED by architecture: server returns 422 `{ error, code }` for `UNKNOWN_HARNESS` | `UNKNOWN_MODEL` | `INCOMPATIBLE_HARNESS_MODEL` (cross-axis harness↔provider) | `UNSUPPORTED_PROVIDER` (per-agent openai-compatible). UI surfaces `error` inline per the **Save error** state above.
