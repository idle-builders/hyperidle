# Settings Consistency Contract

Developer reference: what the contract is, how it is enforced, and what the exceptions are.

Settings is a stacked single-page layout (`SettingsPage.tsx`); every section relies on `eslint-plugin-design` for token/scale rules, and the harness section additionally has the AM4 descriptor rule (see [Enforcement](#enforcement)). There is no per-section static gate script.

---

## The contract in one paragraph

Every Settings section uses the canonical primitives for every control kind: `Input` for text/number/password, `Select` for dropdowns, `Toggle` for booleans (including the `labelHidden` variant for right-aligned switches), `Button` for actions, `Skeleton`/`SkeletonList` for loading, `ErrorState compact` for load failure, `EmptyState compact` for empty lists, `StatusChip` for labeled connection/configuration states, `Tag` for identity labels (role), and `Row`/`ItemList` for list rows. All primitives live in `framework/design-system/src/`. No raw DaisyUI control classes (`input input-*`, `btn btn-*`, `toggle toggle-*`, `badge badge-*`) appear in any Settings file. No inline `style={{}}` for colors, font sizes, or spacing.

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
| Agents | `ItemList`/`Row` agent list (assistant is a row, not a separate section) + add form | flush (`ItemList variant="flush"`); add form = card |
| Appearance | swatch buttons | flat (swatches are self-contained controls) |
| Notifications | toggles | flat |
| Backend (Worker folded in) | read-only labels + Worker form fields/status | flat |
| **Agent backends (Harnesses)** | dense harness list (pure display + toggles per row) | ONE `--surface-elevated` container with `--border-subtle` hairline row separators (`overflow-hidden`); no individual row cards; section header flat above the container |
| Connections | pure display rows + add form | flush (`ItemList variant="flush"`); add form = card |
| Filesystems | display rows with inline controls | `--surface-elevated` container with card border; no per-row cards |

---

## Spacing grid

Allowed grid values: `{3, 6, 9, 12, 18, 24}` px. `gap-4` (16 px) is off-grid and forbidden (AQ-001).

- Field stack gap: `gap-[18px]`
- Card internal padding: `p-[12px]` (data row) or `p-[18px]` (form expansion)
- Tight clusters (button rows, status dot + label): `gap-[9px]` or `gap-[6px]`

Prefer literal `gap-[Npx]` (and `ml-[Npx]`, `mr-[Npx]`, `mt-[Npx]`, `mb-[Npx]`) over DaisyUI aliases. The aliases pass `eslint-plugin-design` — see [Enforcement](#enforcement) for why no current tooling catches them.

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

**Agent backends** (AM4) uses a 6px inline **dot** (not `StatusChip`) — the section uses `--status-*` CSS variables directly via pure mappers in `layers/core-ui/src/settings/harness-presentation.ts`:

| State | Dot tone | Status line |
|---|---|---|
| `ready` | `healthy` (green) | "Authenticated …" |
| `ready` + disabled | `unknown` (grey, dimmed) | "Disabled — …" |
| `unauthenticated` | `behind` (amber) | "Present — not signed in yet." |
| `installed` | `behind` (amber) | "Installed — auth status not yet confirmed." |
| `missing` | `paused` (blue) | reason ("Not installed.") |
| `unavailable` | `unknown` (grey) | reason text, no CTA |

**Hard constraint:** "Connecting" (blue) must read *calmer* than "Disconnected" and "Harness unavailable" (both amber). Never swap these assignments. `paused`/blue is reserved for transitional states; `behind`/amber is the only attention/degraded color.

Color mapping: `STATUS_STYLES` in `framework/design-system/src/StatusChip.tsx:68-97` — healthy→`--status-success`, behind→`--status-warning`, paused→`--status-info`, unknown→`--text-tertiary`. Tests assert label text only; color correctness verified by code-read through `status` prop → `STATUS_STYLES[status]` → CSS token.

---

## AG6 Row/ItemList adoption in Settings

Two list surfaces use `Row` + `ItemList`:

**Org-chart edge table** (explicit slot mapping): `title={userName(edge.fromUserId)}` (13px sans), `subtitle={edge.target}` (12px tertiary), `cells=[{content: edge.mechanism}]` (11px mono — mechanism was already mono). `actions=<Button variant="destructive">`. The 1px subtitle shrink and 2px mono shrink are accepted trade-offs for shared-primitive adoption; no primary-value sans→mono downgrade occurs.

**Agents list uses `ItemList`/`Row`** (AV2 rewrite): the agent list is a `SplitView` origin pane — `ItemList variant="flush"` of `Row`s (one per agent, including the assistant, which is a plain row with no role filter). Adding a new agent expands an `AgentEditor` form inline below the list; editing an existing one opens it in the `SplitView` destination pane. No inline table expansion. Button/Input/Tag/StatusChip/state components apply throughout.

---

## Allowed exceptions (do not "fix" these)

- **Appearance swatch hex values** (`#faf8f5`/`#1c1a17`): intentional. CSS vars resolve to the *active* theme — a swatch previewing the *inactive* theme must use a literal. Lore-documented in `SettingsAppearance.tsx` (@lore W3 AC-50).
- **Backend read-only group labels** (`text-[13px] font-[500] text-[var(--text-primary)]` spans with no associated form control): the one category of label not emitted by a primitive that is correct. Backend was the reference baseline: the fully-compliant section before the AG7 sweep.
- **`StatusChip` `status="unknown"` prop**: widened to `Status | "unknown"` in `framework/design-system/src/StatusChip.tsx:15-20` (@lore AG7 W1). No cast required; `SettingsModels.tsx` passes `"unknown"` directly.

---

## Enforcement

No script or lint rule currently checks Settings files against this contract by name — the dedicated static gate that once scanned a fixed list of Settings files for divergent classes has been removed. `eslint-plugin-design` still catches *arbitrary-value* off-scale utilities repo-wide (`gap-[16px]`, `text-[14px]`), but not the *alias* utilities this contract targets. Treat the rules on this page as convention, checked by hand at review time.

**Watch for these alias-utility divergences** (they pass `eslint-plugin-design` because it only flags arbitrary-value syntax):

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

---

## Agent backends section — descriptor-driven contract

`SettingsHarnesses.tsx` and `HarnessCard.tsx` are governed by an additional ESLint rule (`no-restricted-syntax`, `eslint.config.ts:943-969`) that bans string-literal comparisons against harness type names (`claude-code|codex|opencode|cursor-agent|aider|goose|cline|continue|avante`) inside those files and `harness-presentation.ts`. There are **no** allowed literals. `"builtin"` used to be the one carve-out — the built-in harness was the always-present fallback and could not be disabled — and it went with that harness, along with the matching hard-exemption in `select()`.

All status dot tone, toggle visibility, auth zone visibility, and capabilities fold visibility are computed from `discovery.state`, `discovery.disabled`, and `authAction.kind` via pure mappers in `layers/core-ui/src/settings/harness-presentation.ts:35-84`. No per-family switch statement is permitted in the rendered surface.

The `Toggle` used in `SettingsHarnesses`/`HarnessCard` is the `labelHidden` variant — the right-aligned switch with only an `aria-label` and no visible text. This variant is reusable for any settings row toggle without adjacent text.

**To add a new harness type:** update the `no-restricted-syntax` selector string in `eslint.config.ts:962-963` and the type assertions in `harness-presentation.ts`.

---

## Contributor checklist

- New Settings section: follow the per-section pattern (flat/flush/card as appropriate, on-grid, primitives only).
- Changing a StatusChip status assignment: update the color=meaning table above and the code comment in the same PR.
- Adding a harness type: edit the `no-restricted-syntax` selector and `harness-presentation.ts` types.
