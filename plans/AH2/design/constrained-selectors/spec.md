# Variant — "Constrained selectors" (the chosen + only variant; routine)

**User task.** Founder sets each agent's model and harness from real, runnable options inside Settings → Agents, and the global tier table becomes a clearly-labeled system default in Settings → Models.

## Component composition
- **Settings → Agents table**: existing `table table-xs`. Columns change from `Name | Role | Harness | Model Tier | Sessions | Actions` → **`Name | Role | Model | Harness | Sessions | Actions`**. "Model Tier" column is removed (tier is no longer per-agent). Model cell renders the friendly label (`Sonnet 4.6`) in `font-mono text-[var(--text-secondary)] truncate`; Harness cell renders `harnessType` + a `StatusChip status="warning"` when unregistered.
- **Inline edit/add form**: two `Select`s replace the old free-text harness `<input>` and the old tier `Select`:
  - **Model** `Select` — `options` from `MODEL_CATALOG` → `{ value: id, label: "<Friendly> (<id>)" }`. No placeholder (always has a value).
  - **Harness** `Select` — `options` from `GET /api/harnesses` (registered adapter types) → `{ value: type, label: <type> }`. If the agent's stored harness is not in the list, prepend a `disabled` option `{ value: stored, label: "<stored> — not available", disabled: true }` shown as selected, forcing a re-pick.
- **Settings → Models**: existing `TierRow` reused verbatim; anthropic model field swaps `KNOWN_ANTHROPIC_MODELS` → `MODEL_CATALOG` ids (kills stale `*-20250514`). One new helper `<p>` above the rows.

## Information hierarchy (Agents inline form)
1. **Name** (text input) + **Role** (`Select`) — identity, first row.
2. **Model** (`Select`) + **Harness** (`Select`) — the two AH2 controls, same row, equal weight. Brain then body, left to right.
3. **Max Sessions** (number) — secondary.
4. **Soul Prompt** (textarea) — full-width below.
5. Cancel / Save — bottom-right.

## Information hierarchy (Models)
1. Section helper: *"System default models. Used only when an agent has no model of its own — set per-agent models in Settings → Agents."* (`text-[13px] text-[var(--text-tertiary)]`).
2. Three tier rows (Reasoning / Workhorse / Fast), each: tier label · Provider `Select` · Model `Select`.

## All states
- **Populated**: as above.
- **Loading**: existing `skeleton` (unchanged).
- **Error**: existing `text-error` (unchanged).
- **Empty (Agents)**: `No agents configured.` (unchanged).
- **Degraded harness**: disabled flagged option in the `Select` + `StatusChip status="warning"` "Harness unavailable" in the table cell. Save with the stale value is blocked client-side (Save disabled while the selected harness is the disabled option) AND server-side (concept hard rule).
- **Save error (server 422)**: form stays open, values intact; server `{ error }` rendered inline above Save/Cancel as `<p className="text-[13px] text-[var(--status-error)]">` (use `--status-error`; `text-error`/`--color-error` are dead). Covers `UNKNOWN_HARNESS` / `UNKNOWN_MODEL` / `INCOMPATIBLE_HARNESS_MODEL` / `UNSUPPORTED_PROVIDER` and harness de-registered between open and Save. Replaces the generic `showToast("Failed to save agent")` swallow. Clears on next field change or success.
- **Overflow**: long model ids truncate in the table cell; full label visible in the open `Select`.

## Behavior / motion
- Field change → local state (no auto-save in Agents; explicit Save, matching existing). Models keeps its existing 500ms debounced auto-save.
- `Select` focus ring: existing `focus:shadow-[0_0_0_3px_rgba(22,118,79,0.1)]` (forest-green accent) — no new motion.
- Escape closes the inline form (existing).
- Save disabled when: name empty (add) OR selected harness is the unavailable/disabled option.
- Motion budget: zero new motion. Inherits `--motion-fast` border transition on `Select`.

## Mobile adaptation
`flex-wrap` on the field row stacks Model/Harness full-width at ≤768px (existing). **AQ-005 — DECIDED (option a):** the two new `Select`s get `className="max-md:text-[16px]"` so they render ≥16px at ≤768px (no iOS focus-zoom). Design-system `Select` base stays `text-[15px]` (global bump out of scope). Committed AH2 decision, wired by architecture — not a deferral.

## Signature
**Two equal-weight `Select`s — "Model" then "Harness" — side by side, both populated from live system truth (catalog + registry), zero free-text.** The agent is runnable the moment the form closes.

## Trade-offs
- Bad at: per-agent provider diversity (no provider control; Anthropic-only picker). Acceptable — concept scopes it out; tier table covers non-Anthropic.
- Bad at: showing *why* a harness is unavailable beyond "not available" (no remediation link). Acceptable for AH2 — the founder picks a working one.
