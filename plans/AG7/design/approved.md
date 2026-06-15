# AG7 — Settings Consistency Target (approved design)

```
DESIGN-CLASS: routine  ref=Input,Select,Toggle,Button,Skeleton,ErrorState,EmptyState,Row,StatusChip  pattern=SettingsPage(existing)
DESIGN-CRITIQUE: score=8/10 APPROVED (reviewer Phase 2). See design-critique.md.
  REVISED post-critique (Phase 2 corrections folded in — see §1.9, §2, §4):
  (1) StatusChip status→color pinned explicitly per chip (§1.9 table). color=meaning holds:
      Connecting/Harness-unavailable must NOT render blue; Disconnected→behind(amber).
      Phase-4 screenshot review owns color sign-off (tests assert label text only).
  (2) primitive label prop enlarges dense Models/Agents sub-labels 12px→13px — intended page-wide
      unification; confirm dense tier rows fit at 13px labels (Phase-4 visual sign-off).
  (3) card-vs-flat headline REWRITTEN (§2) to the one operative rule:
      "row containing an inline form → card; pure display row → flush; direct form-field section → flat".
  (4) AG6 adoption is now TWO surfaces (§4): Credentials (native Row fit) + org-chart edge table
      (Row with explicit title/cells/subtitle mapping). Agents <table> retained (a11y rationale).
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
- Worker connection state, Models credential-present dots, and Agents harness/role badges all express "status". Where the thing is a labeled state chip, use **`StatusChip`** (already adopted by CredentialsTab — it is the precedent). Models' tiny 2×2 colored dot + "Credential set" text is the heaviest divergence; convert to a `StatusChip` matching CredentialsTab's credential-state pattern. Agents' role `badge badge-ghost font-mono` → `Tag` (design-system).

### Explicit status→color mapping (REVISED — color = meaning)
The `StatusChip` `Status` union (StatusChip.tsx:4) resolves to fixed tokens: `healthy`→`--status-success` (green), `behind`→`--status-warning` (**amber**), `blocked`/`error`→`--status-error` (red), `paused`→`--status-info` (**blue**), `done`→green, `unknown`→tertiary (neutral grey). **`paused`/blue is WRONG for any warning/degraded state.** Pin each chip to the status whose *color* carries the intended meaning, not just a union member that fits semantically:

| Section | State | `status=` | Resolves to | Label text | Why this color |
|---|---|---|---|---|---|
| Worker | connected | `healthy` | green | "Connected" | healthy steady state |
| Worker | connecting | `paused` | blue (info) | "Connecting" | transitional/in-progress — info, NOT amber. Acceptable as "in progress"; must NOT be neutral/grey. |
| Worker | disconnected | `behind` | **amber** | "Disconnected" | attention-needed: device is meant to be connected and isn't |
| Models | credential set | `healthy` | green | "Credential set" | configured/ready |
| Models | no credential | `unknown` | neutral grey | "No credential" | absence, not an error (optional config) — neutral, NOT amber/red |
| Agents | harness unavailable | `behind` | **amber** | "Harness unavailable" | degraded/attention-needed config problem — amber, NOT blue, NOT red (recoverable) |

- **Hard constraint (color=meaning):** "Connecting" and "Harness unavailable" must NEVER render blue together with an amber "Disconnected" inverting the hierarchy. Connecting = blue (in-progress) is fine ONLY because Disconnected is the amber attention state and Harness-unavailable is amber; the transitional state must read calmer than the degraded states, never more alarming.
- **Sign-off owner:** color correctness is a Phase-4 **screenshot review** item (architecture.md AC-7). Tests assert label TEXT only (`getByText(/connecting/i)`) and CANNOT catch a wrong color — the rendered-color check is a human visual gate, not an automated one.

---

## 2. Card-vs-flat rule (confirmed from concept)

**The rule (one sentence, REVISED — matches the per-section table exactly):** A **row that contains an inline form** (a mini-form or an add/edit form expansion) gets a **card**; a **pure display row** (label + value + a single inline edit reveal) stays **flush** (hairline `border-b` separators); a section that renders **form fields directly** (no rows) is **flat** (no wrapper card).

This is the one operative rule. It is NOT "list/table data → card" — that headline contradicted the table (Credentials is list data yet flush; Agents is a table yet flat). The distinguishing factor is **does the row contain a form**, not whether the section shows list data. Worked examples:
- Models tier rows → **card**: each tier is a provider/model/key mini-form → needs containment.
- Org-chart add-edge form → **card**: form expansion.
- Agents edit/add forms → **card**: form expansion. The Agents table rows themselves are pure display → flat table.
- Credentials catalog rows → **flush**: pure display (label + StatusChip + a single inline edit reveal) → hairline `border-b`, not carded (4 stacked cards would be heavier than the data warrants).
- Profile / Notifications / Worker / Backend / Assistant / Appearance → **flat**: direct form fields, no rows.

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

**Resolved (was "open question for architect"):** Credentials rows flush vs Models tiers carded is NOT a contradiction under the revised rule — Models tiers contain a *mini-form* (card), Credentials rows are *pure display + a single inline edit reveal* (flush). The rule above settles it. AG6 `Row`/`ItemList` adoption (§4) lands on **Credentials** (native Row fit, stays flush via `ItemList variant="flush"`) and the **org-edge table** (Row with explicit mapping). Models tiers stay bespoke cards (they are forms, not rows). See §4.

---

## 3. Per-section current-construction → target mapping

### Profile (`SettingsProfile.tsx`)
- Already on `Input` + `Button`. **Loading:** `skeleton h-8` ×2 → `SkeletonList rows={2}` or two `Skeleton` bars. **Error:** `<p className="text-sm text-error">` → `ErrorState compact` with `onRetry` (needs a reload — currently relies on `useCurrentUser`; architect: add retry or drop onRetry). Save spinner `loading loading-spinner` inside Button → keep (Button accepts children) but tokenize. Flat. Field gap already `18px`. ✓ closest to target.

### Org chart (`SettingsOrgChart.tsx`)
- **`inputStyle` inline-style object → deleted;** function-mechanism free-text input becomes `Input`. Add-form Selects: add `size="sm"`, replace uppercase 12px/600 field labels with Select/Input `label` prop. **Hand-rolled pill buttons** (Delete, +Add Edge, Cancel, Add) → `Button` (destructive/ghost/primary). **Loading:** `skeleton h-8` ×2 → `SkeletonList`. **Error:** `<p text-[13px] text-[var(--status-error)]>` → `ErrorState compact onRetry={loadOrg}`. **Empty:** `<p>No edges defined.</p>` → `EmptyState compact`. **Edge table → AG6 `ItemList variant="flush"` + `Row`** with the explicit mapping in §4 (title=from / subtitle=target / one neutral mono cell=mechanism / Delete `Button` action). Add form = card 18px ✓ (already). Inline `formError` → standardized inline alert (§1.7). Gap `12px` → `18px` for the section stack.

### Models (`SettingsModels.tsx`)
- Provider/model Selects already `Select size="sm"` ✓. **Non-anthropic model `<input className="input input-sm input-bordered">`, baseUrl `input-sm`, apiKey `input-sm` → `Input`.** DaisyUI `label`/`label-text` wrappers → Input/Select `label` prop. **Status dots `bg-success`/`bg-warning` → `StatusChip`** (or tokenized dots). **Loading:** `skeleton h-[60px]` ×3 → `SkeletonList rows={3}` (60px-ish). **Error:** `<p text-sm text-error>` → `ErrorState compact onRetry={loadConfig}`. Helper copy → §1.4 intro shape. "Saving…" line → keep as 12px tertiary (consistent). Each tier row = card 12px ✓ (already bordered). Gap `gap-3` → `gap-[12px]` (same value, drop DaisyUI alias for literal grid).

### Agents (`SettingsAgents.tsx`)
- Selects already `Select` ✓. **Name/sessions `<input className="input input-sm input-bordered">` → `Input`.** DaisyUI `label`/`label-text` → `label` prop. **`btn btn-ghost/primary btn-sm/xs` (Cancel, Save, Edit, Delete, Confirm, +Add Agent) → `Button`** (primary/ghost/destructive). **Role `badge badge-ghost font-mono` → `Tag`; harness-unavailable `badge-warning` → `StatusChip status="behind"` (amber, NOT blue — §1.9), label "Harness unavailable".** **Loading:** `skeleton h-8` ×2 → `SkeletonList`. **Error:** `<p text-sm text-error>` → `ErrorState compact onRetry={loadAgents}`. **Empty:** `<p>No agents configured.</p>` → `EmptyState compact`. **Table RETAINS `<table>` (NOT migrated to `Row` — a11y rationale, §4)**; edit/add forms = card ✓ (already bordered). Inline 422 `editError`/`addError` → standardized inline alert (§1.7). Gap `gap-2`/`gap-3` → grid (`gap-[9px]`/`gap-[12px]`).

### Assistant (`SettingsAssistant.tsx`)
- **Delete internal `<h2>Assistant</h2>` + descriptive `<p>` block** (duplicates the SectionTitle). Descriptive sentence → §1.4 intro `<p text-[13px] text-secondary>`. Textarea already `Input textarea` ✓ (AH3). Save already `Button` ✓ (AH3). **Inline-`style={{color:"var(--status-error)"}}` error `<p>` → standardized inline alert** (className tokens, drop inline style). "Saved" `<p style={{color:var(--status-success)}}>` → `text-[var(--status-success)]` className (drop inline style). Flat. Gap `gap-6` → `gap-[18px]`; inner `gap-3` → `gap-[12px]`.

### Appearance (`SettingsAppearance.tsx`)
- Swatch buttons are bespoke controls (theme preview), **kept as-is** — they are not a "form control of a given kind" that another section solves with a shared component; they are a one-off visual picker. Verify tokens: the `boxShadow: "0 0 0 3px rgba(22,118,79,0.1)"` inline ring uses a **hardcoded rgba (AQ-008 violation)** → replace with `--accent-primary-dim` token (`focus:shadow-[0_0_0_3px_var(--accent-primary-dim)]` style, matching Input/Select focus ring). Swatch preview fixed hex (`#faf8f5`/`#1c1a17`) are an **intentional, lore-documented exception** (CSS vars resolve to active theme; can't preview inactive theme) — keep, lore stays. "Theme" label = group label exception (§1.2). Flat.

### Credentials (`CredentialsTab.tsx`)
- Already `StatusChip` ✓ (the precedent). **`btn btn-ghost/primary btn-xs` (Validate, Update/Set, Remove, Save, Cancel) → `Button`.** **Password `<input className="input input-sm input-bordered">` → `Input`.** Missing-secret warning box: already token-based (`color-mix(... --status-warning ...)`) — keep, or normalize to the inline-alert shape. `loadError` `<p text-status-warning>` → keep as warning (it's a soft-degrade, not a hard error; the rows still render neutral chips — this is correct, do not convert to `ErrorState`). Inline `saveError` → standardized inline alert (§1.7). **AG6: catalog rows → `ItemList variant="flush"` + `Row`** (title=label / subtitle=description / StatusChip+Buttons as actions / inline edit reveal stays a sibling div) — native fit, preserves flush `border-b` separators per §2, no readability regression (title/subtitle sizes match current spans 1:1). See §4. Gap `gap-[12px]`/`gap-[9px]` ✓ grid.

### Notifications (`SettingsNotifications.tsx`)
- Already `Toggle` ✓. **Intro `<p style={{fontFamily,fontSize:"13px"…}}>` inline-style → `<p className="text-[13px] text-[var(--text-secondary)]">`** (§1.4). Flat. Gap `18px` ✓. No loading/error/empty (synchronous hook). ✓ near-target.

### Worker (`SettingsWorker.tsx`)
- **Raw `<input type="checkbox" className="toggle toggle-sm">` + label → `Toggle`** (label + description). **`badge badge-sm badge-success/warning/ghost` ConnectionBadge → `StatusChip`** (healthy/working-or-paused/idle mapping). **`<input type="number" className="input input-xs input-bordered w-16">` (the undersized input) → `Input type="number"`** with width override. **`btn btn-ghost btn-sm` (Pause/Resume) → `Button variant="ghost"`.** `border-base-300` → `border-[var(--border-subtle)]`. **`gap-4` (16px, off-grid) → `gap-[18px]`**; `gap-3` → `gap-[12px]`. The non-electron / non-shared guidance text blocks → §1.4 intro shape (`text-[13px] text-secondary` + `text-[12px] text-tertiary`). Flat. (Worker tab is gated invisible in non-shared mode by AppShell — styling still applies for shared mode.)

### Backend (`SettingsBackend.tsx`)
- Read-only labels. Already token-based, on-scale, flat. **"Mode" group label + value + hint** — verify against §1.2/§1.3: `text-[13px] font-[500] text-primary` / `text-[13px] text-secondary` / `text-[12px] text-tertiary`. ✓ at target. No controls, no states. The one fully-compliant section — use it as the reference baseline.

---

## 4. AG6 (`Row`/`ItemList`) adoption decision

AG7 depends on AG6. Per the AG7 spec, "all list/table surfaces in Settings render through the shared item-row/table primitive." **Adopt Row on TWO surfaces** (single-surface adoption was a thin reading of "all … surfaces"). The three candidate surfaces, with resolved decisions:

**(1) Credentials list — ADOPT `Row` (primary, native fit).** Today each row is `label + description (subtitle) + StatusChip (trailing) + Validate/Update/Remove (actions) + inline edit reveal as a sibling div` (CredentialsTab.tsx:227-238). This maps onto `Row` natively with **zero anatomy strain**:
- `title` = `entry.label` (13px sans — preserved exactly, Row title is 13px sans).
- `subtitle` = `entry.description` (12px tertiary — preserved exactly, Row subtitle is 12px tertiary).
- `actions` = `<StatusChip …/>` + `Button` Validate/Update/Remove (trailing cluster).
- The inline edit reveal stays a **sibling div** below the Row (it already is — CredentialsTab.tsx:281), so there is no colSpan-expand problem and no a11y regression. Wrap the catalog in `ItemList variant="flush"` (preserves the hairline `border-b` separators per §2). **No readability regression** — title/subtitle sizes match the current hand-rolled spans 1:1.

**(2) Org-chart edge table — ADOPT `Row`, with explicit mapping (resolves the reviewer's anatomy mismatch).** Today: `from (13px sans) | mechanism (13px MONO secondary) | target (13px sans) | Delete` (SettingsOrgChart.tsx:236-240). `Row` requires a non-optional `title` and renders `cells` at 11px mono — naively dumping all three columns into `cells` would downsize the two human-readable values (from/target) from 13px sans → 11px mono = a readability regression. Resolve by mapping the values to the slots whose typography already matches:
- `title` = `userName(edge.fromUserId)` (Row title = 13px sans — **preserves** the current "from" 13px sans).
- `subtitle` = `edge.target` (Row subtitle = 12px tertiary — `target` was 13px sans; a 1px shrink + tertiary tone, acceptable for a secondary line; the *primary* identity is "who", the target is "to whom").
- `cells` = `[{ text: edge.mechanism, tone: undefined (neutral) }]` — ONE cell at 11px mono. `mechanism` is **already mono** today (font-mono, SettingsOrgChart.tsx:237), so 13px-mono → 11px-mono is only a 2px shrink of an already-secondary mono tag, NOT a sans→mono regression. Neutral tone (no color) keeps it as a quiet category marker.
- `actions` = Delete `Button variant="destructive" size="sm"` (preserve `aria-label`).
- Wrap in `ItemList variant="flush"`.
- **Trade-off accepted:** loses the strict 3-column `from | mechanism | target` alignment of the `<table>`; gains the shared primitive. Both human-readable values (from at 13px sans as title; target at 12px as subtitle) stay readable; only the already-mono `mechanism` tag drops 2px. No sans→11px-mono downsize of a primary value. This is the documented resolution to the reviewer's WARNING — Row IS used, and readability is preserved by slot choice.

**(3) Agents table — RETAIN `<table>` (documented a11y rationale, NOT a Row).** The agents grid is `name | role | harness | model | sessions | actions` with an **inline-expand edit form rendered as a colSpan row below** the agent row (SettingsAgents.tsx:612-625). `Row`'s nested-button heuristic forces a `div[role=button]` wrapper when `actions` are present, and the colSpan edit-row expand pattern genuinely fights Row's flat anatomy. Forcing it would regress the inline-edit keyboard/screen-reader semantics. **Keep the semantic `<table>`** (correct row/cell a11y for a true tabular grid) and adopt every *other* consistency target on it (Button/Input/Tag/StatusChip/Skeleton/ErrorState/EmptyState). This is the deliberate exception, justified by a11y.

**Decision summary — AC-3 satisfied by 2-of-3 list surfaces on `Row`/`ItemList` (Credentials native + org-chart with explicit mapping) plus uniform control/state adoption on all three.** Agents retains `<table>` for tabular a11y. Models tiers are mini-forms, not list rows → bespoke cards (not a "list surface"). This is a much stronger AC-3 story than single-surface adoption.

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
3. **AG6 migration — RESOLVED** (§4): Credentials → `Row` (native fit), org-chart → `Row` (explicit mapping), Agents → retain `<table>` (a11y). No longer an open question.
4. **Snapshot re-bless:** every section change touches DOM/class text → the catalog-snapshot net and any Settings story snapshots will diff. Architect lists which `.stories.tsx` (SettingsAgents, SettingsModels, SettingsWorker, SettingsAssistant, SettingsPage) and which `__snapshots__` need review + re-bless.
5. **Numeric `Input` width:** Worker max-concurrent and Agents max-sessions need a narrow `Input` — confirm `Input` accepts a width-override className (it spreads `className` onto the wrapper, not the input — architect verifies the width lands on the `<input>` or uses a wrapper width).
