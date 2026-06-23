# Settings Consistency Contract

AG7 brought all 10 Settings sections onto shared design-system primitives and enforced the contract with a static gate. This document is the developer reference: what the contract is, how it is enforced, and what the exceptions are.

---

## The contract in one paragraph

Every Settings section uses the canonical primitives for every control kind: `Input` for text/number/password, `Select` for dropdowns, `Toggle` for booleans, `Button` for actions, `Skeleton`/`SkeletonList` for loading, `ErrorState compact` for load failure, `EmptyState compact` for empty lists, `StatusChip` for labeled connection/configuration states, `Tag` for identity labels (role), and `Row`/`ItemList` for list rows. No raw DaisyUI control classes (`input input-*`, `btn btn-*`, `toggle toggle-*`, `badge badge-*`) appear in any Settings file. No inline `style={{}}` for colors, font sizes, or spacing.

---

## Card-vs-flat rule

One rule governs every section's wrapper shape:

| Section content kind | Treatment |
|---|---|
| Row that contains an inline form (mini-form or add/edit form expansion) | **Card** — `border-[1.5px] border-[var(--border-subtle)] rounded-[var(--r-subtle)]` + `p-[12px]` (data row) or `p-[18px]` (form expansion). No shadow. |
| Pure display row (label + value + optional inline edit reveal) | **Flush** — `ItemList variant="flush"` with hairline `border-b` separators. |
| Section that renders form fields directly (no rows) | **Flat** — fields on the section background, `gap-[18px]` stack, no wrapper card. |

The distinguishing factor is **does the row contain a form**, not whether the section shows list data.

**Per-section treatment:**

| Section | Content kind | Treatment |
|---|---|---|
| Profile | form fields | flat |
| Org chart | edge table + add form | table flat; add-edge form = card (18px) |
| Models | 3 tier rows (each is a mini-form) | each tier = card (12px) |
| Agents | table + inline edit/add forms | table flat; edit + add forms = card (12px/18px) |
| Assistant | textarea | flat |
| Appearance | swatch buttons | flat (swatches are self-contained controls) |
| Credentials | catalog rows (pure display) | flush (`ItemList variant="flush"`) |
| Notifications | toggles | flat |
| Worker | form fields + status | flat |
| Backend | read-only labels | flat |
| **Agent backends** | dense harness list (pure display + toggles per row) | ONE `--surface-elevated` container with `--border-subtle` hairline row separators (`overflow-hidden`); no individual row cards; section header flat above the container |

---

## Spacing grid

Allowed grid values: `{3, 6, 9, 12, 18, 24}` px. `gap-4` (16 px) is off-grid and forbidden (AQ-001).

- Field stack gap: `gap-[18px]`
- Card internal padding: `p-[12px]` (data row) or `p-[18px]` (form expansion)
- Tight clusters (button rows, status dot + label): `gap-[9px]` or `gap-[6px]`

Prefer literal `gap-[Npx]` over DaisyUI aliases (`gap-3`, `gap-4`, `gap-6`). The aliases pass the design-token linter but are caught by the AG7 static gate (see below).

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

**Agent backends** (AM4) uses a 6px inline **dot** (not `StatusChip`) — the section uses `--status-*` CSS variables directly:

| State | Dot tone | Status line |
|---|---|---|
| `ready` | `healthy` (green) | "Authenticated …" |
| `ready` + disabled | `unknown` (grey, dimmed) | "Disabled — …" |
| `unauthenticated` | `behind` (amber) | "Present — not signed in yet." |
| `installed` | `behind` (amber) | "Installed — auth status not yet confirmed." |
| `missing` | `paused` (amber) | reason ("Not installed.") |
| `unavailable` | `unknown` (grey) | reason text, no CTA |

**Hard constraint:** "Connecting" (blue) must read *calmer* than "Disconnected" and "Harness unavailable" (both amber). Never swap these assignments. `paused`/blue is reserved for transitional states; `behind`/amber is the only attention/degraded color.

Tests assert label text only. Color correctness is verified by code-read: `status` prop → `STATUS_STYLES[status]` → `--status-*` token (no cascade ambiguity).

---

## AG6 Row/ItemList adoption in Settings

Two list surfaces use `Row` + `ItemList`:

**Credentials catalog** (native fit): `title={entry.label}`, `subtitle={entry.description}`, `actions={<StatusChip/> + <Button> actions}`. Inline edit reveal stays a sibling `div` below `Row`. `ItemList variant="flush"` preserves hairline separators. `data-testid="credential-row-*"` lives on the `Row`.

**Org-chart edge table** (explicit slot mapping): `title={userName(edge.fromUserId)}` (13px sans), `subtitle={edge.target}` (12px tertiary), `cells=[{content: edge.mechanism}]` (11px mono — mechanism was already mono). `actions=<Button variant="destructive">`. The 1px subtitle shrink and 2px mono shrink are accepted trade-offs for shared-primitive adoption; no primary-value sans→mono downgrade occurs.

**Agents table retained as `<table>`** — deliberate a11y exception. The inline colSpan edit-row expand pattern (SettingsAgents.tsx:612-625) fights `Row`'s flat anatomy, and `Row`'s nested-button heuristic would regress keyboard/screen-reader semantics for the true tabular grid. All other AG7 targets (Button/Input/Tag/StatusChip/state components) apply. Documented in `SettingsAgents.tsx` with a `@lore` comment.

---

## Allowed exceptions (do not "fix" these)

- **Appearance swatch hex values** (`#faf8f5`/`#1c1a17`): intentional. CSS vars resolve to the *active* theme — a swatch previewing the *inactive* theme must use a literal. Lore-documented in `SettingsAppearance.tsx`.
- **Backend read-only group labels** (`text-[13px] font-[500] text-[var(--text-primary)]` spans with no associated form control): these are the one category of "label not emitted by a primitive" that is correct. Backend is also the reference baseline: the fully-compliant section before AG7.
- **Agents `<table>` construction**: documented a11y exception above.
- **`"unknown" as Status` cast in SettingsModels.tsx**: `"unknown"` is handled internally by StatusChip but is not in the public `Status` union. The cast is correct at runtime (neutral grey) and lore-documented. The clean fix is to widen `StatusChip`'s public prop — tracked as W1 in the AG7 review.

---

## Enforcement: the AG7 static gate

`scripts/ag7-no-divergent-classes.ts` — a committed Node script wired into `npm run lint`.

**Why it exists.** `npm run lint`'s `eslint-plugin-design` rules only flag *arbitrary-value* utilities (`gap-[16px]`, `text-[14px]`). They pass the *alias* utilities that are the actual Settings divergences (`gap-4`, `gap-3`, `text-sm`, `text-xs`) and pass DaisyUI control classes (`input input-*`, `btn btn-*`). The static gate closes this gap.

**What it checks.** Scans exactly 11 files:

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
packages/web/src/settings/SettingsHarnesses.tsx
```

**Forbidden tokens (whole-token bounded by quote/space/backtick so `gap-[12px]` is not a false positive):**

| Token | Catches |
|---|---|
| `gap-3`, `gap-4`, `gap-6` | DaisyUI spacing aliases (`gap-4` is also off-grid) |
| `text-sm`, `text-xs` | DaisyUI font-size aliases |
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
```

Exit 0 = clean. Non-zero = prints `file:line  matched-token`. It is also chained into `npm run lint` so it runs in CI.

**Adding a new Settings section.** Add its file path to the `FILES` array in `scripts/ag7-no-divergent-classes.ts`. The self-test guard asserts `FILES.length` so it fails fast if a path is mistyped.

---

---

## Agent backends section — descriptor-driven contract

`SettingsHarnesses.tsx` and `HarnessCard.tsx` are governed by an additional ESLint rule (`no-restricted-syntax`) that bans string-literal comparisons against known harness type names (`"codex"`, `"claude-code"`, `"opencode"`, `"builtin"`, `"cursor-agent"`) inside those files and `harness-presentation.ts`. The sole allowed `type` check is the `builtin` exemption in `showsToggle` / `select()` (founder rule: built-in is not disableable — intentional, not per-family branching).

All status dot tone, toggle visibility, auth zone visibility, and capabilities fold visibility are computed from `discovery.state`, `discovery.disabled`, and `authAction.kind` via pure mappers in `packages/web/src/settings/harness-presentation.ts`. No per-family switch statement is permitted in the rendered surface.

The `Toggle` used in `SettingsHarnesses` / `HarnessCard` is the label-less variant (DS `Toggle` with `labelHidden`) added in AM4 — the right-aligned switch with only an `aria-label` and no visible text. This variant is reusable for any settings row toggling without adjacent text.

---

## Next steps for contributors

- To add a new Settings section: follow the per-section pattern (flat, on-grid, primitives only) and add the file to the static gate's scan list.
- To change a StatusChip status assignment: update the color=meaning table above and the code comment in the same PR.
- To widen the `Status` union to include `"unknown"`: edit `StatusChip.tsx` `Status` type and remove the `as Status` cast in `SettingsModels.tsx`. No behavior change.
- To add a new harness type to the descriptor-driven ESLint rule: update the `no-restricted-syntax` selector string in the ESLint config and the `harness-presentation.ts` type assertions.
