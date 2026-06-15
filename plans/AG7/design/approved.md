# AG7 — Settings Consistency Target (approved design)

```
DESIGN-CLASS: routine  ref=Input,Select,Toggle,Button,Skeleton,ErrorState,EmptyState,Row,StatusChip  pattern=SettingsPage(existing)
```

This is a **consistency/presentation pass**, not a redesign. No new surface, no new primitive, no behavior change. Every visual element already has a canonical component. The "design" is the per-section mapping from today's divergent construction onto the one shared set of patterns, plus the unified header/label/hint/spacing/control spec and the card-vs-flat rule.

`approved.md` is the input contract to `/architecture`. The architect maps these targets to exact file edits and validation methods; it does not re-decide which component renders what.

---

## 1. The one consistency grammar (applies to every section)

### 1.1 Section header
- **One pattern only:** the existing `SectionTitle` in `SettingsPage.tsx` — `<h2>` 13px / 600 / uppercase / `tracking-[0.06em]` / `text-tertiary` / `pb-[6px]` / `border-b border-[var(--border-subtle)]`.
- No section renders its own heading. **SettingsAssistant's internal `<h2>Assistant</h2>` + descriptive paragraph block is deleted** — the page already wraps it in a `SectionTitle`. The assistant's descriptive sentence becomes intro copy (see 1.4 hint/intro), not a duplicate heading. (AC: assistant heading conforms to the shared section-title pattern.)

### 1.2 Field labels
- **One label component:** the `label` prop of `Input` / `Select` (13px / 500 / `text-primary`, emitted by the primitive). No hand-rolled `<label className="label"><span className="label-text …">` DaisyUI form-control wrappers. No standalone `<span className="text-[13px] font-[500]">` field labels.
- The org-chart add-form's 12px/600 uppercase field labels ("From"/"Mechanism"/"Target") are **replaced by the Select/Input `label` prop** so all field labels read at one size. (The uppercase-tracking style belongs to SectionTitle only, not field labels.)
- Backend's "Mode" and Appearance's "Theme" standalone labels stay as `text-[13px] font-[500] text-[var(--text-primary)]` spans — these are read-only group labels, not control labels, and already match the primitive's label style. Keep them; they are the one allowed exception (a label with no associated form control).

### 1.3 Hint / helper text
- **One hint style:** 12px / `text-tertiary` / `leading` — the `hint` prop of `Input`, or a bare `<p className="text-[12px] text-[var(--text-tertiary)]">` where the hint is section-level (not field-attached).
- Replace Notifications' inline-`style={{fontSize:"13px"…}}` intro paragraph and Models' `text-[12px] text-tertiary` helper so both read identically.
- Backend's mode hint (`text-[12px] text-tertiary`) is already correct — keep.

### 1.4 Section intro copy
- Sections that open with a sentence of guidance (Notifications, Models, Assistant) use one shape: a single `<p className="text-[13px] text-[var(--text-secondary)]">` directly under the SectionTitle, no inline styles. (Assistant's old descriptive paragraph lands here.)

### 1.5 Spacing scale
- **Section internal vertical rhythm:** `gap-[18px]` for form-field stacks (already the SettingsPage section gap and Profile's gap). All sections that currently use `gap-3` (12px), `gap-4` (16px — off-grid!), or `gap-6` (24px) for their primary field stack move to the Hearth grid. `gap-4` (16px) is **off-grid and forbidden** (AQ-001) — Worker uses it; fix to `gap-[18px]` or `gap-[12px]`.
- **Allowed grid values:** `{3,6,9,12,18,24}` px. Card internal padding = `12px` (small) or `18px` (form expansion). Field-stack gap = `18px`. Tight control clusters (button rows, status dot + label) = `9px` or `6px`.
- **Card form-expansion padding:** `18px` (matches org-chart AddEdgeForm). Models/Agents data-row card padding: `12px`.

### 1.6 Form controls — one component per control kind
| Control kind | Canonical component | Replaces |
|---|---|---|
| Text / number / url / password input | `Input` (design-system) | all `<input className="input input-sm input-bordered">`, `<input className="input input-xs">`, org-chart `inputStyle` inline-style input, credentials `<input className="input input-sm">` |
| Textarea | `Input textarea` | (already adopted in Assistant/Agents per AH3 — keep) |
| Dropdown | `Select` (AG5) | org-chart `inputStyle` was not a select; all selects already on `Select` — verify `size="sm"` is uniform |
| Boolean | `Toggle` (design-system) | Worker's raw `<input type="checkbox" className="toggle toggle-sm">` |
| Action button | `Button` (design-system) | all `btn btn-primary/ghost btn-sm/xs`, org-chart's hand-rolled pill `<button>`s, credentials' `btn btn-ghost btn-xs` |

- **Input `size`:** the design-system `Input` has one size (15px, 10px vertical pad). DaisyUI `input-sm`/`input-xs` are gone — the "undersized input" the founder flagged (Worker's `input-xs w-16`, ~24px tall) is fixed by adopting `Input` (with a width override class for the numeric max-sessions field).
- **Select `size`:** use `size="sm"` uniformly in dense settings rows (Models tiers, Agents edit/add). Org-chart add-form Selects currently use default `md` — set to `sm` for consistency with the other settings forms. (Confirmed: `Select` size sm = py-6px, min-h-44px ≤1024px for touch.)
- **Button variants:** save = `Button` default (primary). Cancel = `Button variant="ghost"` or `variant="secondary"`. Delete/destructive = `Button variant="destructive"` (or `ghost` with destructive intent where it's a low-emphasis table action — Agents/Credentials inline Delete/Remove keep `ghost` register but become `Button` not `btn`). Add-row trigger = `Button variant="ghost"` / `secondary`, `self-start`.

### 1.7 Loading / error / empty — shared state components (currently ZERO adoption)
| State | Canonical component | Replaces |
|---|---|---|
| Loading | `Skeleton` / `SkeletonList` | all `<div className="skeleton h-8 w-full">` / `skeleton h-[60px]` hand-rolled bars (Profile, OrgChart, Models, Agents) |
| Error | `ErrorState` `compact` | all `<p className="text-sm text-error">` / `text-[13px] text-[var(--status-error)]` hand-rolled error lines (Profile, OrgChart, Models, Agents) |
| Empty | `EmptyState` `compact` | all `<p>No X defined./No agents configured.</p>` hand-rolled empties (OrgChart, Agents) |

- `ErrorState compact` is the in-pane variant (18px pad, surface-page, no shadow, no 48px icon, with optional `onRetry`). Settings panes that have a `loadX` reload function pass `onRetry={loadX}` — turns today's dead "Please try again." copy into a working retry.
- `EmptyState compact` for in-pane empties (18px pad, no icon block). Title = noun-forward ("No edges yet", "No agents configured"); description = one short line.
- **Inline form-validation errors** (org-chart `formError`, agents 422 `editError`/`addError`, credentials `saveError`) are NOT `ErrorState` — they are field/form-level `role="alert"` messages. Standardize them on one style: `<p role="alert" className="text-[12px] text-[var(--status-error)]">`. Keep them inline; they are a distinct concern from pane-level load failure.

### 1.8 DaisyUI palette / off-token leaks → Hearth tokens
| Leak | Location | Fix |
|---|---|---|
| `bg-success` / `bg-warning` (status dots) | Models | `bg-[var(--status-success)]` / `bg-[var(--status-warning)]` — or replace dot+label with `StatusChip` (see 1.9) |
| `badge badge-sm badge-success/warning/ghost` | Worker (ConnectionBadge) | `StatusChip` (design-system) with status mapping |
| `badge badge-sm badge-warning` ("Harness unavailable"), `badge badge-sm badge-ghost` (role) | Agents | `StatusChip` / `Tag` (design-system) |
| `border-base-300` | Worker (status divider) | `border-[var(--border-subtle)]` |
| `text-error` | Profile, Agents, CredentialsTab | `text-[var(--status-error)]` (via the shared components above, so most disappear) |
| `text-success` token check | (AI1 already fixed `--color-error`/`--color-success`) | n/a — AG7 styles on top |

### 1.9 Status indicators — one vocabulary
- Worker connection state, Models credential-present dots, and Agents harness/role badges all express "status". Where the thing is a labeled state chip, use **`StatusChip`** (already adopted by CredentialsTab — it is the precedent). Models' tiny 2×2 colored dot + "Credential set" text is the heaviest divergence; convert to a `StatusChip` (healthy/behind) matching CredentialsTab's credential-state pattern, OR at minimum tokenize the dot color. Architect picks based on cost; StatusChip is preferred for cross-section consistency since CredentialsTab already sets the precedent in the same page.
- Agents' role `badge badge-ghost font-mono` → `Tag` (design-system); harness-unavailable `badge-warning` → `StatusChip status` warning.

---

## 2. Card-vs-flat rule (confirmed from concept)

**The rule (one sentence):** A Settings section that renders **list/table data** wraps each data-row (or the add/edit form expansion) in a **card**; a section that renders **form fields directly** is **flat** (no wrapper card).

- **Card** = `border-[1.5px] border-[var(--border-subtle)] rounded-[var(--r-subtle)]` + `p-[12px]` (data row) or `p-[18px]` (form expansion). No shadow (these are inline list items, not floating surfaces — `--shadow-default` is reserved for true cards/popovers).
- **Flat** = fields rendered directly on the section background, gap-stacked.

| Section | Content kind | Treatment |
|---|---|---|
| Profile | form fields | flat |
| Org chart | list (edge table) + add form | table flat; **add-edge form = card (18px)** |
| Models | list (3 tier rows) | **each tier row = card (12px)** |
| Agents | table + inline edit/add forms | table flat; **edit form & add form = card (12px→18px)** |
| Assistant | form field (textarea) | flat |
| Appearance | swatch buttons | flat (swatches are their own bordered controls, not cards) |
| Credentials | list (catalog rows) | rows are hairline-separated, **not carded** — they use `border-b` row separators, which is the list-row separator treatment, consistent with a flush row list. Keep flush-separated (do not card every credential row — 4 stacked cards would be heavier than the data warrants). |
| Notifications | toggles (form) | flat |
| Worker | form fields + status | flat |
| Backend | read-only labels | flat |

**Open consistency question for architect:** Credentials rows are flush-separated while Models tiers are carded. Both are "list data". The distinguishing factor: Models tiers each contain a *mini-form* (provider/model/key controls) that needs visual containment; Credentials rows are *display + a single inline edit reveal*. The rule holds — "row containing a form expansion = card." Document this in the section so it's not read as a violation. If AG6 `Row`/`ItemList` adoption is in scope, Credentials and the org-edge table are the candidates; Models tiers stay bespoke cards (they are forms, not rows). See §4.

---

## 3. Per-section current-construction → target mapping

### Profile (`SettingsProfile.tsx`)
- Already on `Input` + `Button`. **Loading:** `skeleton h-8` ×2 → `SkeletonList rows={2}` or two `Skeleton` bars. **Error:** `<p className="text-sm text-error">` → `ErrorState compact` with `onRetry` (needs a reload — currently relies on `useCurrentUser`; architect: add retry or drop onRetry). Save spinner `loading loading-spinner` inside Button → keep (Button accepts children) but tokenize. Flat. Field gap already `18px`. ✓ closest to target.

### Org chart (`SettingsOrgChart.tsx`)
- **`inputStyle` inline-style object → deleted;** function-mechanism free-text input becomes `Input`. Add-form Selects: add `size="sm"`, replace uppercase 12px/600 field labels with Select/Input `label` prop. **Hand-rolled pill buttons** (Delete, +Add Edge, Cancel, Add) → `Button` (destructive/ghost/primary). **Loading:** `skeleton h-8` ×2 → `SkeletonList`. **Error:** `<p text-[13px] text-[var(--status-error)]>` → `ErrorState compact onRetry={loadOrg}`. **Empty:** `<p>No edges defined.</p>` → `EmptyState compact`. Edge table → flat (or AG6 `Row`/`ItemList`, §4). Add form = card 18px ✓ (already). Inline `formError` → standardized inline alert (§1.7). Gap `12px` → `18px` for the section stack.

### Models (`SettingsModels.tsx`)
- Provider/model Selects already `Select size="sm"` ✓. **Non-anthropic model `<input className="input input-sm input-bordered">`, baseUrl `input-sm`, apiKey `input-sm` → `Input`.** DaisyUI `label`/`label-text` wrappers → Input/Select `label` prop. **Status dots `bg-success`/`bg-warning` → `StatusChip`** (or tokenized dots). **Loading:** `skeleton h-[60px]` ×3 → `SkeletonList rows={3}` (60px-ish). **Error:** `<p text-sm text-error>` → `ErrorState compact onRetry={loadConfig}`. Helper copy → §1.4 intro shape. "Saving…" line → keep as 12px tertiary (consistent). Each tier row = card 12px ✓ (already bordered). Gap `gap-3` → `gap-[12px]` (same value, drop DaisyUI alias for literal grid).

### Agents (`SettingsAgents.tsx`)
- Selects already `Select` ✓. **Name/sessions `<input className="input input-sm input-bordered">` → `Input`.** DaisyUI `label`/`label-text` → `label` prop. **`btn btn-ghost/primary btn-sm/xs` (Cancel, Save, Edit, Delete, Confirm, +Add Agent) → `Button`** (primary/ghost/destructive). **Role `badge badge-ghost font-mono` → `Tag`; harness-unavailable `badge-warning` → `StatusChip`.** **Loading:** `skeleton h-8` ×2 → `SkeletonList`. **Error:** `<p text-sm text-error>` → `ErrorState compact onRetry={loadAgents}`. **Empty:** `<p>No agents configured.</p>` → `EmptyState compact`. Table flat; edit/add forms = card ✓ (already bordered). Inline 422 `editError`/`addError` → standardized inline alert (§1.7). Gap `gap-2`/`gap-3` → grid (`gap-[9px]`/`gap-[12px]`).

### Assistant (`SettingsAssistant.tsx`)
- **Delete internal `<h2>Assistant</h2>` + descriptive `<p>` block** (duplicates the SectionTitle). Descriptive sentence → §1.4 intro `<p text-[13px] text-secondary>`. Textarea already `Input textarea` ✓ (AH3). Save already `Button` ✓ (AH3). **Inline-`style={{color:"var(--status-error)"}}` error `<p>` → standardized inline alert** (className tokens, drop inline style). "Saved" `<p style={{color:var(--status-success)}}>` → `text-[var(--status-success)]` className (drop inline style). Flat. Gap `gap-6` → `gap-[18px]`; inner `gap-3` → `gap-[12px]`.

### Appearance (`SettingsAppearance.tsx`)
- Swatch buttons are bespoke controls (theme preview), **kept as-is** — they are not a "form control of a given kind" that another section solves with a shared component; they are a one-off visual picker. Verify tokens: the `boxShadow: "0 0 0 3px rgba(22,118,79,0.1)"` inline ring uses a **hardcoded rgba (AQ-008 violation)** → replace with `--accent-primary-dim` token (`focus:shadow-[0_0_0_3px_var(--accent-primary-dim)]` style, matching Input/Select focus ring). Swatch preview fixed hex (`#faf8f5`/`#1c1a17`) are an **intentional, lore-documented exception** (CSS vars resolve to active theme; can't preview inactive theme) — keep, lore stays. "Theme" label = group label exception (§1.2). Flat.

### Credentials (`CredentialsTab.tsx`)
- Already `StatusChip` ✓ (the precedent). **`btn btn-ghost/primary btn-xs` (Validate, Update/Set, Remove, Save, Cancel) → `Button`.** **Password `<input className="input input-sm input-bordered">` → `Input`.** Missing-secret warning box: already token-based (`color-mix(... --status-warning ...)`) — keep, or normalize to the inline-alert shape. `loadError` `<p text-status-warning>` → keep as warning (it's a soft-degrade, not a hard error; the rows still render neutral chips — this is correct, do not convert to `ErrorState`). Inline `saveError` → standardized inline alert (§1.7). Rows stay flush-separated (`border-b`), per §2. Gap `gap-[12px]`/`gap-[9px]` ✓ grid.

### Notifications (`SettingsNotifications.tsx`)
- Already `Toggle` ✓. **Intro `<p style={{fontFamily,fontSize:"13px"…}}>` inline-style → `<p className="text-[13px] text-[var(--text-secondary)]">`** (§1.4). Flat. Gap `18px` ✓. No loading/error/empty (synchronous hook). ✓ near-target.

### Worker (`SettingsWorker.tsx`)
- **Raw `<input type="checkbox" className="toggle toggle-sm">` + label → `Toggle`** (label + description). **`badge badge-sm badge-success/warning/ghost` ConnectionBadge → `StatusChip`** (healthy/working-or-paused/idle mapping). **`<input type="number" className="input input-xs input-bordered w-16">` (the undersized input) → `Input type="number"`** with width override. **`btn btn-ghost btn-sm` (Pause/Resume) → `Button variant="ghost"`.** `border-base-300` → `border-[var(--border-subtle)]`. **`gap-4` (16px, off-grid) → `gap-[18px]`**; `gap-3` → `gap-[12px]`. The non-electron / non-shared guidance text blocks → §1.4 intro shape (`text-[13px] text-secondary` + `text-[12px] text-tertiary`). Flat. (Worker tab is gated invisible in non-shared mode by AppShell — styling still applies for shared mode.)

### Backend (`SettingsBackend.tsx`)
- Read-only labels. Already token-based, on-scale, flat. **"Mode" group label + value + hint** — verify against §1.2/§1.3: `text-[13px] font-[500] text-primary` / `text-[13px] text-secondary` / `text-[12px] text-tertiary`. ✓ at target. No controls, no states. The one fully-compliant section — use it as the reference baseline.

---

## 4. AG6 (`Row`/`ItemList`) adoption decision

AG7 depends on AG6. Per the AG7 spec, "all list/table surfaces in Settings render through the shared item-row/table primitive." Candidate surfaces:
- **Org-chart edge table** — `from | mechanism | target | delete` → `Row` with `cells` + trailing `actions` (Delete `Button`), wrapped in `ItemList variant="flush"`. Good fit.
- **Agents table** — `name | role | harness | model | sessions | actions` + inline-expand edit form → `Row` per agent with `cells` + actions, `ItemList`. The inline-expand edit form is a `Row`-adjacent card, not a `Row` cell. Fit: moderate (the expand-below-row pattern needs the form rendered as a sibling, as today).
- **Credentials list** — label/description + StatusChip + actions + inline edit reveal → `Row` with subtitle + trailing cells/actions. Fit: good for the row header; the edit reveal stays a sibling.
- **Models tiers** — NOT a `Row` (each tier is a mini-form, not a list row). Stays bespoke card.

**Decision:** Adopt `Row`/`ItemList` for the **org-chart edge table** (cleanest fit, lowest risk) as the primary AG6 adoption in Settings. Agents and Credentials are **assessed by the architect** for cost — if the inline-expand pattern fights `Row`'s anatomy, they keep their `<table>`/flush-row construction but adopt every *other* consistency target (Button/Input/StatusChip/state components). The AG7 AC is satisfied by ≥1 Settings list surface on the primitive plus uniform control/state adoption everywhere. Architect quantifies the Agents/Credentials `Row` migration cost and decides; do not force a migration that regresses the inline-edit a11y.

---

## 5. Rejected directions (do not re-litigate)

- **Redesign the Settings page into a tabbed / sidebar nav.** Rejected — the stacked single-page layout is the approved W3 design; AG7 is consistency, not IA. Out of scope per spec.
- **Introduce a new `SettingsField` / `SettingsRow` wrapper component.** Rejected — violates the component budget. `Input`/`Select` already own the label+field+hint composition; a wrapper would duplicate it. The `SectionTitle` local helper is the only Settings-specific shared piece and it already exists.
- **Card every section uniformly (all flat → all carded, or all carded → all flat).** Rejected — uniform carding adds chrome to flat form sections (heavier, not more consistent); uniform flattening removes the containment that list/form-expansion rows need. The data-kind rule (§2) is the principled middle.
- **Convert inline form-validation errors to `ErrorState`.** Rejected — `ErrorState` is a pane-level load-failure affordance; field/form validation is a different concern (inline, `role="alert"`, adjacent to the control). Conflating them would over-weight a single bad field as a whole-pane failure.
- **Build a new status-dot component for Models.** Rejected — `StatusChip` already expresses labeled status and is already used by Credentials on the same page. Reuse beats a new dot.
- **Migrate Models tiers to AG6 `Row`.** Rejected — tiers are mini-forms, not list rows; `Row`'s title/subtitle/cells anatomy doesn't fit a provider/model/key control cluster. Keep bespoke cards.
- **Replace Appearance swatches with a `Select`.** Rejected — W3 AC-50 explicitly specified visual swatch cards over a `<select>`; the swatch is an intentional one-off, not a control divergence to unify.

---

## 6. Open questions for the architect

1. **Retry handlers:** Profile relies on `useCurrentUser` (no local reload). Either expose a refetch or render `ErrorState compact` without `onRetry`. OrgChart/Models/Agents have `loadX` callbacks → pass `onRetry`.
2. **StatusChip status mapping** for Worker (connected/connecting/disconnected) and Models (credential present/absent) — reuse the CredentialsTab `credentialStateToStatus` precedent shape; confirm the available `Status` union covers these.
3. **AG6 Agents/Credentials migration cost** (§4) — architect decides Row adoption vs control-only consistency for these two.
4. **Snapshot re-bless:** every section change touches DOM/class text → the catalog-snapshot net and any Settings story snapshots will diff. Architect lists which `.stories.tsx` (SettingsAgents, SettingsModels, SettingsWorker, SettingsAssistant, SettingsPage) and which `__snapshots__` need review + re-bless.
5. **Numeric `Input` width:** Worker max-concurrent and Agents max-sessions need a narrow `Input` — confirm `Input` accepts a width-override className (it spreads `className` onto the wrapper, not the input — architect verifies the width lands on the `<input>` or uses a wrapper width).
