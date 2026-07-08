# Settings Consistency Contract

Developer reference: what the contract is, how it is enforced, and what the exceptions are.

Settings has 13 sections. 10 are under the static gate; Connections, Filesystems, and Harnesses rely on `eslint-plugin-design` and the AM4 descriptor rule only. See the coverage-gap note under [Enforcement](#enforcement-the-ag7-static-gate).

---

## The contract in one paragraph

Every gated Settings section uses the canonical primitives for every control kind: `Input` for text/number/password, `Select` for dropdowns, `Toggle` for booleans (including the `labelHidden` variant for right-aligned switches), `Button` for actions, `Skeleton`/`SkeletonList` for loading, `ErrorState compact` for load failure, `EmptyState compact` for empty lists, `StatusChip` for labeled connection/configuration states, `Tag` for identity labels (role), and `Row`/`ItemList` for list rows. All primitives live in `packages/design-system/src/`. No raw DaisyUI control classes (`input input-*`, `btn btn-*`, `toggle toggle-*`, `badge badge-*`) appear in any gated file. No inline `style={{}}` for colors, font sizes, or spacing.

---

## Card-vs-flat rule

One rule governs every section's wrapper shape:

| Section content kind | Treatment |
|---|---|
| Row that contains an inline form (mini-form or add/edit form expansion) | **Card** — `border-[1.5px] border-[var(--border-subtle)] rounded-[var(--r-subtle)]` + `p-[12px]` (data row mini-form) or `p-[18px]` (form expansion). No shadow. Note: Models tier data-row cards use 1px `border`, not `border-[1.5px]` — the 1.5px spec applies to form expansions only. |
| Pure display row (label + value + optional inline edit reveal) | **Flush** — `ItemList variant="flush"` with hairline `border-b` separators. |
| Section that renders form fields directly (no rows) | **Flat** — fields on the section background, `gap-[18px]` stack, no wrapper card. |

The distinguishing factor is **does the row contain a form**, not whether the section shows list data.

**Per-section treatment:**

| Section | Content kind | Treatment |
|---|---|---|
| Profile | form fields | flat |
| Org chart | edge table + add form | table flat; add-edge form = card (18px) |
| Models | 3 tier rows (each is a mini-form) | each tier = card (12px), 1px border |
| Agents | table + inline edit/add forms | table flat; edit + add forms = card (12px/18px) |
| Assistant | textarea | flat |
| Appearance | swatch buttons | flat (swatches are self-contained controls) |
| Credentials | catalog rows (pure display) | flush (`ItemList variant="flush"`) |
| Notifications | toggles | flat |
| Worker | form fields + status | flat |
| Backend | read-only labels | flat |
| **Agent backends (Harnesses)** | dense harness list (pure display + toggles per row) | ONE `--surface-elevated` container with `--border-subtle` hairline row separators (`overflow-hidden`); no individual row cards; section header flat above the container |
| Connections | pure display rows + add form | flush (`ItemList variant="flush"`); add form = card |
| Filesystems | display rows with inline controls | `--surface-elevated` container with card border; no per-row cards |

---

## Spacing grid

Allowed grid values: `{3, 6, 9, 12, 18, 24}` px. `gap-4` (16 px) is off-grid and forbidden (AQ-001).

- Field stack gap: `gap-[18px]`
- Card internal padding: `p-[12px]` (data row) or `p-[18px]` (form expansion)
- Tight clusters (button rows, status dot + label): `gap-[9px]` or `gap-[6px]`

Prefer literal `gap-[Npx]` (and `ml-[Npx]`, `mr-[Npx]`, `mt-[Npx]`, `mb-[Npx]`) over DaisyUI aliases. The aliases pass `eslint-plugin-design` but are caught by the AG7 static gate.

---

## StatusChip color = meaning

Connection and configuration states use `StatusChip`. The `status` prop determines color — pick the member whose **color** carries the correct meaning:

| Section | State | `status=` | Rendered color | Why |
|---|---|---|---|---|
| Worker | connected | `healthy` | green | steady healthy state |
| Worker | connecting | `paused` | blue (info) | transitional/in-progress |
| Worker | disconnected | `behind` | amber | attention-needed: device should be connected |
| Models | credential set | `healthy` | green | configured and ready |
| Models | no credential | `unknown` | neutral grey | absence, not an error |
| Agents | harness unavailable | `behind` | amber | degraded/recoverable config problem |

**Agent backends** (AM4) uses a 6px inline **dot** (not `StatusChip`) — the section uses `--status-*` CSS variables directly via pure mappers in `packages/web/src/settings/harness-presentation.ts`:

| State | Dot tone | Status line |
|---|---|---|
| `ready` | `healthy` (green) | "Authenticated …" |
| `ready` + disabled | `unknown` (grey, dimmed) | "Disabled — …" |
| `unauthenticated` | `behind` (amber) | "Present — not signed in yet." |
| `installed` | `behind` (amber) | "Installed — auth status not yet confirmed." |
| `missing` | `paused` (blue) | reason ("Not installed.") |
| `unavailable` | `unknown` (grey) | reason text, no CTA |

**Hard constraint:** "Connecting" (blue) must read *calmer* than "Disconnected" and "Harness unavailable" (both amber). Never swap these assignments. `paused`/blue is reserved for transitional states; `behind`/amber is the only attention/degraded color.

Color mapping: `STATUS_STYLES` in `packages/design-system/src/StatusChip.tsx:68-97` — healthy→`--status-success`, behind→`--status-warning`, paused→`--status-info`, unknown→`--text-tertiary`. Tests assert label text only; color correctness verified by code-read through `status` prop → `STATUS_STYLES[status]` → CSS token.

---

## AG6 Row/ItemList adoption in Settings

Two list surfaces use `Row` + `ItemList`:

**Credentials catalog** (native fit): `title={entry.label}`, `subtitle={entry.description}`, `actions={<StatusChip/> + <Button> actions}`. Inline edit reveal stays a sibling `div` below `Row`. `ItemList variant="flush"` preserves hairline separators. `data-testid="credential-row-*"` lives on the `Row` (`CredentialsTab.tsx:221-222`).

**Org-chart edge table** (explicit slot mapping): `title={userName(edge.fromUserId)}` (13px sans), `subtitle={edge.target}` (12px tertiary), `cells=[{content: edge.mechanism}]` (11px mono — mechanism was already mono). `actions=<Button variant="destructive">`. The 1px subtitle shrink and 2px mono shrink are accepted trade-offs for shared-primitive adoption; no primary-value sans→mono downgrade occurs.

**Agents table retained as `<table>`** — deliberate a11y exception (not annotated in code). The inline colSpan edit-row expand pattern (`SettingsAgents.tsx:817`) fights `Row`'s flat anatomy, and `Row`'s nested-button heuristic would regress keyboard/screen-reader semantics for the true tabular grid. All other AG7 targets (Button/Input/Tag/StatusChip/state components) apply.

---

## Allowed exceptions (do not "fix" these)

- **Appearance swatch hex values** (`#faf8f5`/`#1c1a17`): intentional. CSS vars resolve to the *active* theme — a swatch previewing the *inactive* theme must use a literal. Lore-documented in `SettingsAppearance.tsx` (@lore W3 AC-50).
- **Backend read-only group labels** (`text-[13px] font-[500] text-[var(--text-primary)]` spans with no associated form control): the one category of label not emitted by a primitive that is correct. Backend is the reference baseline: the fully-compliant section before AG7.
- **Agents `<table>` construction**: documented a11y exception above.
- **`StatusChip` `status="unknown"` prop**: widened to `Status | "unknown"` in `packages/design-system/src/StatusChip.tsx:15-20` (@lore AG7 W1). No cast required; `SettingsModels.tsx` passes `"unknown"` directly.

---

## Enforcement: the AG7 static gate

`scripts/ag7-no-divergent-classes.ts` — a committed Node script wired into `npm run lint`. Also available standalone as `npm run check:ag7-consistency`.

**Why it exists.** `eslint-plugin-design` rules only flag *arbitrary-value* utilities (`gap-[16px]`, `text-[14px]`). They pass the *alias* utilities that are the actual Settings divergences (`gap-3`, `gap-4`, `gap-6`, `text-sm`, `text-xs`, `ml-1..4`, `mr-1..4`, `mt-1..4`, `mb-1..4`) and pass DaisyUI control classes. The static gate closes this gap.

**What it checks.** Scans exactly 10 files (the `SETTINGS_FILES` array; guard hard-fails unless `length === 10`):

```
packages/web/src/settings/SettingsBackend.tsx
packages/web/src/settings/SettingsNotifications.tsx
packages/web/src/settings/SettingsProfile.tsx
packages/web/src/settings/SettingsAppearance.tsx
packages/web/src/settings/SettingsAssistant.tsx
packages/web/src/settings/SettingsModels.tsx
packages/web/src/settings/SettingsWorker.tsx
packages/web/src/settings/SettingsOrgChart.tsx
packages/web/src/settings/SettingsAgents.tsx
packages/web/src/components/CredentialsTab.tsx
```

**Coverage gap:** `SettingsHarnesses.tsx`, `SettingsConnections.tsx`, and `SettingsFilesystems.tsx` are NOT in the gate. These three sections rely on `eslint-plugin-design` + the AM4 descriptor rule alone. Adding them to the gate requires appending their paths to `SETTINGS_FILES` and bumping the hardcoded length constant (`ag7-no-divergent-classes.ts:49-55`).

**Forbidden tokens** (whole-token bounded by quote/space/backtick):

| Token group | Catches |
|---|---|
| `gap-3`, `gap-4`, `gap-6` | DaisyUI spacing aliases (`gap-4` also off-grid) |
| `text-sm`, `text-xs` | DaisyUI font-size aliases |
| `ml-1`, `ml-2`, `ml-3`, `ml-4` | Margin-left aliases (ml-1/2/4 off-grid) |
| `mr-1`, `mr-2`, `mr-3`, `mr-4` | Margin-right aliases |
| `mt-1`, `mt-2`, `mt-3`, `mt-4` | Margin-top aliases |
| `mb-1`, `mb-2`, `mb-3`, `mb-4` | Margin-bottom aliases |
| `input input-` | DaisyUI input classes |
| `btn ` (trailing space) | DaisyUI button classes |
| `toggle toggle-` | DaisyUI toggle classes |
| `badge badge-` | DaisyUI badge classes |
| `text-error`, `text-success` | DaisyUI color aliases |
| `bg-success`, `bg-warning`, `border-base-300` | DaisyUI palette leaks |
| `loading loading-spinner` | DaisyUI spinner chrome |

**Running it manually:**

```bash
npx tsx scripts/ag7-no-divergent-classes.ts
# or
npm run check:ag7-consistency
```

Exit 0 = clean. Non-zero = prints `file:line  matched-token`.

**Adding a new Settings section.** Append its file path to `SETTINGS_FILES` in `scripts/ag7-no-divergent-classes.ts` AND bump the hardcoded length constant on the line below. The guard asserts the exact count; a wrong count fails fast regardless of whether the path is valid.

---

## Agent backends section — descriptor-driven contract

`SettingsHarnesses.tsx` and `HarnessCard.tsx` are governed by an additional ESLint rule (`no-restricted-syntax`, `eslint.config.ts:958-981`) that bans string-literal comparisons against harness type names (`claude-code|codex|opencode|cursor-agent|aider|goose|cline|continue|avante`) inside those files and `harness-presentation.ts`. `"builtin"` is the one allowed literal — built-in is not disableable (founder rule), so the single `builtin` carve-out in `showsToggle`/`select()` is intentional, not per-family branching.

All status dot tone, toggle visibility, auth zone visibility, and capabilities fold visibility are computed from `discovery.state`, `discovery.disabled`, and `authAction.kind` via pure mappers in `packages/web/src/settings/harness-presentation.ts:40-81`. No per-family switch statement is permitted in the rendered surface.

The `Toggle` used in `SettingsHarnesses`/`HarnessCard` is the `labelHidden` variant — the right-aligned switch with only an `aria-label` and no visible text. This variant is reusable for any settings row toggle without adjacent text.

**To add a new harness type:** update the `no-restricted-syntax` selector string in `eslint.config.ts:976-977` and the type assertions in `harness-presentation.ts`.

---

## Contributor checklist

- New Settings section: follow the per-section pattern (flat/flush/card as appropriate, on-grid, primitives only), add the file to `SETTINGS_FILES`, and bump the length constant.
- Changing a StatusChip status assignment: update the color=meaning table above and the code comment in the same PR.
- Adding a harness type: edit the `no-restricted-syntax` selector and `harness-presentation.ts` types.
