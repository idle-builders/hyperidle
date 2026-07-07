# AV2 — Design (approved variant + rubric)

## Phase 0 — extract | build | mixed gate

Per the track frame and `feedback_design_extract_before_invent`, classify each surface:

| Surface | Class | Rationale |
|---|---|---|
| Agents list (incl. Assistant) | **extract** | `ItemList`/`Row` `variant="flush"` — same as Connections/Credentials/Knowledge lists already do. |
| Agent detail/edit pane | **extract** | `SplitView` origin=list, destination=editor — same shape as Conversations dial-in (`Conversations.tsx:461`). |
| Agent backends list + detail | **extract** | `ItemList`/`Row` + `SplitView`; built-in-harness detail = model tiers (SettingsModels) + credentials moved into the destination pane. |
| Backend + Worker consolidation | **extract** | Plain stacked section; Worker's existing shared-mode gate reused. |
| Email hint fix | **extract** | One-line copy change; make it backend-aware. |
| **Role combobox** | **build** | No existing catalog-plus-custom / combobox control in the DS. This is the one genuinely new control. |

So AV2 is **mixed**: ~90% extract (reuse `SplitView`/`Row`/`ItemList`/`EmptyState` verbatim), one
`build` surface (the role combobox). Variant exploration is therefore focused: **one** IA layout family
(there is only one right answer per the frame — the app's own list+split-pane), scored against
alternatives to prove it; and **three** variants for the role combobox (the real design decision).

---

## IA restructure — the settings surface

### Considered (and rejected) IA options

- **IA-A: keep the ~13-section stacked page, just swap inline editors for split-pane.** Rejected: leaves
  Settings as a long scroll where "editing" competes with a full-page scroll context; SplitView needs a
  stable full-height origin/destination, which a stacked page doesn't give.
- **IA-B (CHOSEN): section nav on the left (already exists — `SETTINGS_SECTIONS` + AppShell settings
  overlay), and the heavy sections (Agents, Agent backends) render their *own* `SplitView` as their body
  — list on the left of the pane, editor on the right.** This is exactly how Conversations works: a view
  whose body is a SplitView. Extract, no invention.
- **IA-C: a single global master-detail over *all* settings.** Rejected: over-generalizes; most sections
  (Profile, Appearance) are simple forms with no list, so a global split-pane is dead weight and unlike
  any existing surface.

**Chosen: IA-B.** The section nav already exists; we (a) make Agents + Agent backends render a `SplitView`
body, (b) delete the Assistant section, (c) merge Worker into Backend. Minimal net-new structure.

### SplitView ratio persistence (applies to every SplitView surface below)

`SplitView` is presentational — `surfaceKey` alone does **not** persist the ratio (`SplitView.tsx:45`
`@lore AM5 T6`: the prop is "informational for the stories viewer only"). The container owns persistence,
exactly as Conversations does (`Conversations.tsx:285,461-465`):

```
const [ratio, setRatio] = useUiPreference("settings.agents", 0.42);
<SplitView surfaceKey="settings.agents" dividerRatio={ratio} onRatioChange={setRatio} ... />
```

`onRatioChange={setRatio}` is the load-bearing wire — without it the "persisted ratio" AC silently
no-ops. The stories render a static ratio; the running container must wire `onRatioChange`.

### Agents section (IA-B body)

```
┌ Agents ─────────────────────────────────────────────────────────┐
│ ItemList(flush)              │  SplitView.destination            │
│  ▸ Row  Nova     Assistant   │  ┌ Agent editor ────────────────┐ │
│  ▸ Row  Atlas    Builder     │  │ Name  [__________]           │ │
│  ▸ Row  Iris     Designer  ◄─┼──│ Role  [ combobox ▾ ]         │ │
│  ▸ Row  …                    │  │ Harness [▾]  Model [▾ filtered]│ │
│  + Add agent                 │  │ System prompt [ textarea ]   │ │
│                              │  │ Filesystems […]              │ │
│                              │  │        [Cancel] [Save]       │ │
└──────────────────────────────┴──────────────────────────────────┘
```

- Origin = `ItemList variant="flush"` of `Row`s. Each row: title=name, subtitle=role label, a
  `harnessType` cell, and a `StatusChip status="behind"` "Harness unavailable" when the agent's harness
  isn't registered (keeps the AH2 warning). The Assistant is just a row — no special styling beyond
  perhaps a subtle "You" hint in the subtitle.
- Selecting a row sets `selectedAgentId`; SplitView `mode` goes to `split`; destination = the shared
  `AgentEditor` panel (the edit form extracted from `SettingsAgents.renderEditForm`, moved into the
  destination pane, no longer an inline `<tr>`).
- "+ Add agent" opens the same editor with an empty draft (destination), origin stays the list.
- Ratio: `const [ratio, setRatio] = useUiPreference("settings.agents", 0.42)` +
  `<SplitView surfaceKey="settings.agents" dividerRatio={ratio} onRatioChange={setRatio} ...>` (list a bit
  narrower than editor — mirrors Conversations' 0.6 origin but inverted since the editor is the focus).
- **Model dropdown** = `modelOptionsForHarness(selectedHarnessDescriptor)`: options come from the
  harness's **DISCOVERED** `descriptor.models` (from the loaded `/api/harnesses` payload) — NOT
  `MODEL_CATALOG` (founder concept-review tweak). Per harness the discovered set differs (builtin = the
  gateway `/models` list; opencode = `opencode models`; claude-code = the `claude models` table).
  - **Empty-models affordance (codex case):** when `descriptor.models` is empty — codex (no enumeration
    surface), or a provider that needs an absent key — the editor renders an **affordance in place of the
    select**: a short read-only line "This harness manages its own model" (optionally the configured
    `~/.codex/config.toml` model shown read-only), NOT an empty `<select>` and NOT a fallback to the global
    catalog. The affordance sits in the same grid slot the Model select occupies; no new spacing/token.
  - The visual SHAPE is unchanged (a labelled select in the split-pane editor); only the option source +
    the empty-state affordance change.
  - The editor still reconciles a stale `modelProvider` on harness change (reads `modelProviders`, the
    validator's field, not `models`): reset to a compatible model for a non-empty harness, or send `null`
    for an empty-`modelProviders` (provider-agnostic) harness — so a previously-set incompatible provider
    never reaches the save. (See architecture §5(e) discovery + §5(c) reconcile + requirements §5.)
- Empty state via `ItemList.empty` (EmptyState) — deferred to build (design shows populated only).

### Agent backends section (IA-B body)

- Origin = `ItemList variant="flush"` of harness `Row`s (name, version cell, status subtitle, a
  `StatusChip` for state). Replaces the hand-rolled bordered container in `SettingsHarnesses` + the
  hand-rolled `HarnessCard` row markup.
- Destination = harness detail: status + auth command (from `harness-presentation.ts` mappers) and, for
  **builtin**, the model-tier config (the three `TierRow`s from `SettingsModels`) + LLM credential status
  (from `CredentialsTab`) grouped together. For a configurable (non-builtin) harness, its
  capabilities/models — this pane opens for configurable harnesses too, not only builtin.
- The **Show/Hide** affordance is gone as a per-row control — the detail *is* the expansion now (opening
  the split-pane replaces the fold). Where an inline fold remains (if any), gate it on real foldable
  content: `hasCaps(d) && d.models.length > 0`.
- Ratio: `const [ratio, setRatio] = useUiPreference("settings.backends", 0.42)` +
  `<SplitView surfaceKey="settings.backends" dividerRatio={ratio} onRatioChange={setRatio} ...>`.

### Backend + Worker

- Backend section renders the existing `SettingsBackend` mode block, then — only when
  `window.__HYPERIDLE__?.backendMode === "shared"` — the Worker controls inline below a divider. The
  Worker section is removed from `SETTINGS_SECTIONS` and from SettingsPage; its shared-mode body moves
  under Backend. (Worker already self-gates to shared mode — reuse that guard.)

### Email hint

`SettingsProfile.tsx:99` hint becomes backend-aware: shared/web → "Used for notifications and login.";
local (laptop) → "Used for notifications." (no login in local mode). Derive from
`window.__HYPERIDLE__?.backendMode` like `SettingsBackend` does.

---

## Role combobox — the one `build` surface (3 variants)

### Variant R1 — Select + "＋ New role" row that swaps to an Input

The `<select>` gains a trailing "＋ Define a new role…" option; choosing it swaps the select for an
`Input` (with a "back to list" affordance). **Score 6.8.** Simple, but modal-ish: you lose the list while
typing, and it's two clicks to a custom role.

### Variant R2 (CHOSEN) — inline combobox (type-to-filter list, free-text commit)

A single control: a text input with a popover list beneath it. Typing filters the catalog by label;
matching entries show label + description; if the typed text matches no catalog role, a pinned
"Use new role: **<typed>**" item sits at the bottom. Enter/click commits either a catalog role or the
custom string. Known-role selection shows the friendly label in the closed control; a custom role shows
the raw string. **Score 8.4.** One control, one gesture, keeps catalog discoverability *and* the
escape hatch visible simultaneously. This is the pattern the guide describes.

### Variant R3 — free-text Input with a datalist

`<input list="roles">` + a `<datalist>` of catalog labels. **Score 5.9.** Cheapest, but native datalist
styling is inconsistent across platforms/Electron, gives no descriptions, and reads as an unfinished
text field — fails the "distinctive, not generic" bar and the warm Hearth aesthetic.

### Chosen: **R2 — inline combobox.** Rendered as the `.stories.tsx` design artifact (populated state).

Anatomy (built from DS tokens, no new color/spacing):
- Closed: a bordered field (`Input`-like chrome, `--r-subtle`, `--border-default`) showing the current
  role's friendly label (or raw custom string) + a chevron.
- Open: a popover (`--surface-elevated`, `--shadow-elevated`, `--r-default`) with a filter input at top
  and a scrollable `Row`-like list: each item = label (13px/500) + description (12px tertiary). The
  "Use new role: X" affordance pinned at the bottom with an accent-tinted lead.
- Keyboard: ↑/↓ move, Enter commits highlighted (or custom if none highlighted), Esc closes. **Build
  obligations** (noted here so they aren't lost — DoD AC-3 tests commit behavior, these are focus/return
  details): the popover filter input takes focus on open; Esc (and commit) returns focus to the closed
  field; the popover traps focus while open. These are build-time a11y obligations on top of the tested
  commit behavior.

---

## 9-dimension rubric (chosen composite: IA-B + role R2)

| Dimension | Score | Note |
|---|---|---|
| Hierarchy | 8.5 | List → editor split makes the edit target unambiguous; role combobox foregrounds the current role. |
| Spacing | 8.5 | All 6px-grid; SplitView + Row own their spacing (extracted). |
| Typography | 8.5 | Reuses Row (13/12) + Input label scale; combobox items match Row type. |
| Color | 8.0 | Warm tokens only; accent used sparingly for "Use new role". |
| Coherence | 9.0 | Settings now matches Conversations/review — the whole point of the WP. |
| States | 7.5 | Populated designed; empty/loading/error deferred to build per policy. |
| A11y | 8.0 | SplitView + Row a11y inherited; combobox needs role="combobox"/aria-activedescendant + focus-return-on-Esc (build). |
| Anti-slop | 8.5 | No new card grid, no hero, no modal; extracts the solved pattern. |
| Premium polish | 8.0 | Floating-card SplitView + tactile combobox popover. |
| **Composite** | **8.3** | |

## Viewer routes for human review

Stories render at **`/designsystem`** (dev-only React Router route; auto-discovers `*.stories.tsx`).
New stories to review:
- `SettingsAgentsSplit` (title "SettingsAgentsSplit") — the agents list + split-pane editor, populated.
  The Model select shows the selected harness's **discovered** `descriptor.models` (fixture descriptor with
  a real per-harness model set, per the founder tweak) — NOT `MODEL_CATALOG`. Ideally add a second
  populated render (or a codex-row variant) showing the **empty-models affordance** ("this harness manages
  its own model") in the Model slot, so the reviewer sees both the discovered-list and the affordance
  states. Populated-state only per `feedback_no_skeleton_error_in_initial_designs` — the affordance is a
  real populated state (a harness that legitimately exposes no selectable models), not a loading/error skeleton.
- `RoleCombobox` (title "RoleCombobox") — the chosen R2 role control, populated (a known role selected +
  the "Use new role" affordance visible).

Both land in the DS catalog under their titles; the founder opens `/designsystem`, selects the story, and
annotates the live render.
