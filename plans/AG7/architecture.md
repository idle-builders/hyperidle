# AG7 — Settings Consistency Pass: Architecture

Input contracts (fixed, not re-litigated): `plans/AG7/concept.md`, `plans/AG7/design/approved.md`.
This plan maps the approved consistency target to exact file edits, primitive swaps, token fixes, test updates, and validation methods. No behavior, persistence, route, or section-set change.

## Required reading (before implementing)
- `plans/AG7/design/approved.md` — the per-section target (the visual contract).
- `plans/AG7/concept.md` — card-vs-flat rule, locked primitives.
- `packages/design-system/src/{Input,Select,Toggle,Button,Skeleton,ErrorState,EmptyState,Row,ItemList,StatusChip,Tag}.tsx` — target primitive APIs.
- `.claude/rules/aesthetic-quality.md` — AQ hard rules (lint-enforced).
- `.claude/rules/visual-regression.md` — snapshot net + re-bless flow.

## Plan reconciliation (spec ⇆ reality)

| Spec/design assumption | Reality | Plan handling |
|---|---|---|
| `Toggle` replaces Worker's `<input type=checkbox toggle>` | `Toggle` renders `role="switch"` (Toggle.tsx:42), NOT `role="checkbox"` | **Update `packages/web/src/settings/__tests__/SettingsWorker.test.tsx`** all `getByRole("checkbox", {name:/register.*worker/i})` → `getByRole("switch", …)`. 6 call sites (lines 158,206,283,286,301,305 — verified exact). |
| `Skeleton`/`SkeletonList` replaces `<div className="skeleton">` | `Skeleton` uses `animate-[skeleton-pulse]` + `role="status"`, NOT class `.skeleton` (Skeleton.tsx:29-30) | **Update `packages/web/src/settings/__tests__/X4-SettingsModels.test.tsx:162` and `packages/web/src/settings/__tests__/X3-SettingsAgents.test.tsx:195`** `querySelectorAll(".skeleton")` → `querySelectorAll('[role="status"]')` or `getAllByTestId(/skeleton/)`. (Line numbers verified exact.) |
| `StatusChip` replaces Worker badge / Models dots | StatusChip renders `label` as visible text (StatusChip.tsx:120); `Status` union = `healthy\|behind\|blocked\|paused\|done\|error`. Token colors (verified StatusChip.tsx:73-92): `healthy/done`=green, `behind`=**amber** (the only amber), `blocked/error`=red, `paused`=**blue (info)**, `unknown`=neutral grey. | Worker badge text tests (`getByText(/connected\|connecting/i)`) **survive** (label preserved). **Pinned color map (design §1.9 — color=meaning):** connected→`healthy` (green) "Connected"; connecting→`paused` (blue/in-progress) "Connecting"; disconnected→`behind` (**amber**) "Disconnected"; Models credential set→`healthy` (green); Models no credential→`unknown` (neutral); Agents harness-unavailable→`behind` (**amber**) "Harness unavailable". `paused`/blue is used ONLY for the transitional "Connecting" — never for a degraded/warning state. |
| `Tag` replaces Agents role `badge-ghost` | Tag renders `label` as text (Tag.tsx:32) | Agents role tests (`getByText("builder")`) **survive**; markup-coupled assertions: none found (tests are text-based). |
| `ErrorState compact` needs `onRetry` reload fn | Profile has no local reload (uses `useCurrentUser`); OrgChart/Models/Agents have `loadOrg`/`loadConfig`/`loadAgents` | Profile: `ErrorState compact` **without** `onRetry` (or expose refetch — prefer no-retry, minimal change). Others: pass `onRetry={loadX}`. |
| `Input` className width override (numeric fields) | `Input` spreads `className` onto the **wrapper div** (Input.tsx:63), not the `<input>` | Numeric width (`w-16`) must go on the wrapper as a max-width OR architect uses a wrapping `<div className="w-[...]">`. **Decision:** wrap the numeric `Input` in `<div className="w-[88px]">` (88px = on-grid-ish; use `w-[72px]`→not grid; use a px width — width is layout not spacing-token-bound here, but prefer a clean value). Lands width on the field via wrapper width + Input's own `w-full`. |
| Appearance focus ring uses hardcoded `rgba(22,118,79,0.1)` | AQ-008 violation (SettingsAppearance.tsx:88) | Replace with `--accent-primary-dim` token via className `focus-visible` shadow, matching Input/Select focus ring. |
| AI1 fixed `--color-error`/`--color-success`/`--border` dead tokens | Confirm AI1 landed on this branch | AG7 styles on top; if AI1 not present, the inline-style→className token swaps in Assistant/Credentials still resolve to valid `--status-*`/`--border-subtle` tokens (AG7's own changes don't depend on AI1's token defs since AG7 uses the canonical `--status-*`/`--border-subtle` set). |
| `gap-4` used in Worker | 16px — off-grid, AQ-001 violation | Fix to `gap-[18px]`. |

## Acceptance criteria → validation method

| AC | Verification method |
|---|---|
| AC-1 Same header/label/hint/spacing, no off-grid | **Primary gate: the committed forbidden-token static check (see "AC-1/AC-2 static check" below) — UNCONDITIONAL.** `npm run lint` (eslint-plugin-design AQ-001/AQ-004) is a SECONDARY net: it only catches *arbitrary-value* classes (`gap-[16px]`, `text-[14px]`), NOT the *alias* classes (`gap-4`, `gap-3`, `text-sm`, `text-xs`) that are the actual AG7 divergences (verified against no-off-grid-spacing.ts:21 + no-off-scale-font-size.ts:16 — the regexes do not match aliases). The static check is what enforces AC-1. Manual: all field labels via primitive `label` prop. |
| AC-2 One component per control kind, no raw inline styles/divergent controls | **The committed forbidden-token static check (below) — UNCONDITIONAL, not "only if a rule gap exists" (the gap DOES exist).** It asserts zero `input input-`, `btn ` (space), `toggle toggle-`, `badge ` (space) across the 10 files. `npm run lint` adds the AQ hard-rule net (hardcoded color etc.) on top. |
| AC-3 All dropdowns via `Select`, lists via `Row`/`ItemList` | `npm run check` (Select imported, used). **TWO list surfaces on the primitive** — component tests assert `data-ds-component="Row"` (or testid) present for (a) OrgChart edge rows and (b) Credentials catalog rows. Agents `<table>` retained (documented a11y exception, design §4); Models tiers are mini-forms (not list rows). |
| AC-4 Loading/error/empty via shared components | Component tests: each section's loading state asserts `[role="status"]` (Skeleton); error state asserts `ErrorState` testid `error-state`; empty asserts `EmptyState` testid `empty-state`. Update X3/X4 skeleton selectors (reconciliation). |
| AC-5 Card-vs-flat one rule | Manual + snapshot: Models tiers & form expansions carded; Profile/Notifications/Worker/Backend/Assistant/Appearance flat. Documented in approved §2. Snapshot diff review. |
| AC-6 No persistence/reachability regression | All existing settings component + integration tests stay green (`npm run test`, `npm run test:integration`). No test deleted. |
| AC-7 Visual coherence, zero AQ hard-rule violations | **Regression gate = catalog-snapshot DOM net (re-blessed with reviewed diff) + `npm run lint` zero AQ violations.** **Coherence + COLOR sign-off = Phase-4 `/review` (local, running app): screenshot Settings section-by-section top to bottom, verify cross-section coherence AND the StatusChip colors render per design §1.9** (Connecting≠amber-conflict, Disconnected→amber, Harness-unavailable→amber, not blue/red). The snapshot net cannot catch a wrong token-color behind an unchanged class, and tests assert label TEXT only — the rendered color is a HUMAN visual gate, explicitly owned by Phase-4. No Playwright CI job (e2e/screenshots are local-only per MEMORY). |
| AC assistant heading conforms | Component test: SettingsAssistant renders no internal `<h2>`; the only heading is the SettingsPage `SectionTitle`. Assert `queryByRole("heading", {name:"Assistant"})` count via page render = 1 (the SectionTitle), or unit: SettingsAssistant alone has no `<h2>`. |

## AC-1/AC-2 static check — committed, deterministic, UNCONDITIONAL (CRITICAL-1 fix)

**Why it exists:** `npm run lint` cannot detect AG7's core divergences. The eslint-plugin-design rules only flag *arbitrary-value* utilities (`gap-[16px]`, `text-[14px]`); they pass on the *alias* utilities that ARE the divergence (`gap-4`, `gap-3`, `gap-6`, `text-sm`, `text-xs`) and pass on DaisyUI component classes (`input input-…`, `btn `, `toggle toggle-…`, `badge `). Verified: `no-off-grid-spacing.ts:21` regex `/\b(p|m|gap)([xytrbl])?-\[(\d+)px\]/g` does NOT match `gap-4`; `no-off-scale-font-size.ts:16` `/\btext-\[(\d+)px\]/g` does NOT match `text-sm`. So AC-1/AC-2 had NO enforcing gate. This check IS the gate.

**Nature:** a **static codebase-property check** (forbidden tokens must not appear in source text), so per CLAUDE.md it is a **lint/build script, not a vitest test** (grepping the filesystem is not a behavior test). Implement as a committed Node script.

- **Location:** `scripts/ag7-no-divergent-classes.ts` (sibling of `scripts/verify-attest.ts`).
- **Wiring:** add npm script `"check:ag7-consistency": "tsx scripts/ag7-no-divergent-classes.ts"` and chain it into `npm run lint` (so it runs in `verify` and CI; it is pure text inspection — cross-platform, no browser, no Docker, runs in the live CI lint lane). Exit non-zero on any match, printing `file:line  matched-token`.
- **Scope — the exactly-10 settings files it scans:**
  1. `packages/web/src/settings/SettingsBackend.tsx`
  2. `packages/web/src/settings/SettingsNotifications.tsx`
  3. `packages/web/src/settings/SettingsProfile.tsx`
  4. `packages/web/src/settings/SettingsAppearance.tsx`
  5. `packages/web/src/settings/SettingsAssistant.tsx`
  6. `packages/web/src/settings/SettingsModels.tsx`
  7. `packages/web/src/settings/SettingsWorker.tsx`
  8. `packages/web/src/settings/SettingsOrgChart.tsx`
  9. `packages/web/src/settings/SettingsAgents.tsx`
  10. `packages/web/src/components/CredentialsTab.tsx`
- **Forbidden-token list (exact — match as the listed substring; for the spacing/font aliases match as a whole class token bounded by quote/space/backtick so `gap-[12px]` is NOT a false positive):**

| Token | Catches | Forbidden because |
|---|---|---|
| `gap-3` (whole token) | DaisyUI 12px alias | use literal `gap-[12px]` |
| `gap-4` (whole token) | 16px alias — **off-grid** | use `gap-[18px]` (or `gap-[12px]`) |
| `gap-6` (whole token) | 24px alias | use literal `gap-[24px]` or `gap-[18px]` |
| `text-sm` (whole token) | 14px alias | use literal `text-[13px]` |
| `text-xs` (whole token) | 12px alias | use literal `text-[12px]` |
| `input input-` (substring) | DaisyUI input (`input-sm`/`input-xs`/`input-bordered`) | use design-system `Input` |
| `btn ` (substring, trailing space) | DaisyUI button (`btn btn-…`) | use design-system `Button` |
| `toggle toggle-` (substring) | DaisyUI toggle | use design-system `Toggle` |
| `badge ` (substring, trailing space) | DaisyUI badge (`badge badge-…`) | use `StatusChip` / `Tag` |
| `text-error` (whole token) | DaisyUI error color alias | use `text-[var(--status-error)]` |
| `text-success` (whole token) | DaisyUI success alias | use `text-[var(--status-success)]` |
| `bg-success` / `bg-warning` / `border-base-300` (whole tokens) | DaisyUI palette leaks | use `--status-*` / `--border-subtle` tokens |
| `loading loading-spinner` (substring) | DaisyUI spinner chrome | replaced by text-only "Saving…" (see Task 3/6/9) |

- **Allowed (must NOT be flagged):** `gap-[12px]`, `gap-[18px]`, `gap-[24px]`, `gap-[9px]`, `gap-[6px]`, `text-[13px]`, `text-[12px]`, `Input`/`Select`/`Toggle`/`Button`/`StatusChip`/`Tag` JSX, `var(--status-*)`, `var(--border-subtle)`. The whole-token matching (bounded by `"` `'` `` ` `` space `{` `}`) prevents `gap-[12px]` matching `gap-1`-style patterns and prevents substrings of legitimate identifiers.
- **Red phase:** the check FAILS on the current 10 files (they contain `gap-4`, `input input-sm`, `btn btn-…`, etc.) — this is the validation-before-implementation red state for AC-1/AC-2. It goes green only when every task below lands. Commit the check FIRST (it will be red), then implement.
- **Self-test:** the script should assert the forbidden-token list is non-empty and the file list length === 10 (guard against a vacuous green if a path is mistyped) — mirror the snapshot-net enumeration-guard discipline.

## Ordered task list

Order = lowest-risk / reference-baseline first, highest-coupling last. Each task: files, primitive swap, test impact.

### Task 0 — Pre-flight (no code)
- **Test-file locations (CORRECTED — every settings unit test lives under a `__tests__/` segment):**
  - Section-level: `packages/web/src/settings/__tests__/<File>.test.tsx` — `AD3-SettingsNotifications-solo`, `AD3-SettingsOrgChart-solo`, `AD8b-SettingsAssistant`, `AF15-SettingsBackend`, `AF15-SettingsOrgChart-teams`, `AH2-SettingsAgents`, `AH2-SettingsModels`, `SettingsWorker`, `X3-SettingsAgents`, `X4-SettingsModels`.
  - **Root-level (TWO files previously OMITTED — both render AG7-changed surfaces, must be enumerated so the builder runs them, not discovered red at Task 11):**
    - `packages/web/src/__tests__/SettingsAgents.test.tsx` (196 lines; asserts `getByText(/no teams/i)` — text-based, expected to SURVIVE the Agents rewrite).
    - `packages/web/src/__tests__/SettingsProfile.test.tsx` (loading test ~line 164; asserts absence of the Save button during load — absence-based, expected to SURVIVE the Profile Skeleton swap; but Profile loading now renders `SkeletonList` `[role="status"]` — confirm the absence assertion still holds).
  - Also: `packages/web/src/__tests__/AF15-SettingsPage.test.tsx`, `packages/web/src/__tests__/W2-settings-appearance.test.tsx`, `packages/web/src/__tests__/AD5-settings-notifications.test.tsx` exist at root and render Settings surfaces — run them in the baseline, text/behavior-based, expected to survive.
- Run `npm run test packages/web/src/settings packages/web/src/__tests__` + `CredentialsTab.test.tsx` to capture green baseline across BOTH locations.
- Commit the AC-1/AC-2 static check (`scripts/ag7-no-divergent-classes.ts`, wired into `npm run lint`) — it is RED on the current 10 files (validation-before-implementation). Confirm it fails for the expected reason (alias/DaisyUI tokens present), then proceed.
- Confirm AI1 token fixes present (`grep -r "color-error\|--border\b" packages/web/src/settings packages/web/src/components/CredentialsTab.tsx` — expect none; if present, note for AI1).

### Task 1 — Backend (reference baseline, verify-only)
- File: `packages/web/src/settings/SettingsBackend.tsx`.
- No change expected (already at target: token-based, flat, on-scale). Verify label/hint sizes match approved §1.2/§1.3. If `max-w-[400px]` differs from other flat sections, leave (harmless). 
- Test: `AF15-SettingsBackend.test.tsx` unchanged.

### Task 2 — Notifications (lowest churn)
- File: `SettingsNotifications.tsx`.
- Swap intro `<p style={{fontFamily,fontSize:"13px"…}}>` → `<p className="text-[13px] text-[var(--text-secondary)]">`. Drop inline style.
- `Toggle` already adopted. Gap `18px` ✓.
- Test: `AD3-SettingsNotifications-solo.test.tsx` — text-based (`getByText(type.label)`), survives unchanged.

### Task 3 — Profile
- File: `packages/web/src/settings/SettingsProfile.tsx`.
- Loading: `<div className="skeleton h-8 w-full">` ×2 → `<SkeletonList rows={2} ariaLabel="Loading profile" />`.
- Error: `<p className="text-sm text-error">` → `<ErrorState compact title="Couldn't load profile" description="…" />` (no `onRetry` — no local reload; see reconciliation).
- Save spinner inside `Button` (`loading loading-spinner loading-xs`) → keep child but replace DaisyUI spinner with a token-safe spinner or keep (DaisyUI `loading` is animation chrome, not palette — acceptable; if lint flags, use Button's built-in disabled state + plain text "Saving…"). **Decision:** replace inline spinner with text-only "Saving…" to avoid DaisyUI class; Button already conveys disabled.
- Flat, gap `18px` ✓.
- Test: **`packages/web/src/__tests__/SettingsProfile.test.tsx`** (loading test ~line 164) renders this component — it asserts the Save button is ABSENT during load. After the Skeleton swap, loading renders `SkeletonList` (`[role="status"]`); confirm the absence-of-Save assertion still holds (it should — Save still doesn't render during load). Add an assertion that loading now shows `[role="status"]` and error shows the `error-state` testid. This file is the Profile component test (the plan previously claimed none existed — corrected).

### Task 4 — Appearance
- File: `SettingsAppearance.tsx`.
- Fix AQ-008: inline `boxShadow:"0 0 0 3px rgba(22,118,79,0.1)"` → token `box-shadow:0 0 0 3px var(--accent-primary-dim)` (via className `focus`/active state or inline style with token var). Keep swatch hex (lore-documented exception).
- Swatches kept as bespoke (approved §3 / rejected list).
- "Theme" group label kept (label-exception §1.2).
- Test: no dedicated test; W3 AC-50 swatch behavior unchanged — verify `data-theme-option` attrs intact.

### Task 5 — Assistant
- File: `SettingsAssistant.tsx`.
- **Delete internal `<h2>Assistant</h2>` + wrapping `<div>`**; move descriptive `<p>` to intro shape `<p className="text-[13px] text-[var(--text-secondary)]">` directly under (SectionTitle is supplied by SettingsPage).
- Inline-style error `<p style={{color:"var(--status-error)"}}>` → `<p role="alert" className="text-[12px] text-[var(--status-error)]">`.
- "Saved" `<p style={{color:var(--status-success)}}>` → `className="text-[13px] text-[var(--status-success)]"`.
- Textarea `Input` ✓ (AH3), Save `Button` ✓ (AH3). Gap `gap-6`→`gap-[18px]`, inner `gap-3`→`gap-[12px]`.
- Test: `packages/web/src/settings/__tests__/AD8b-SettingsAssistant.test.tsx` — uses `getByRole("textbox")`, `getByRole("button",{name:/save/i})`, text matches. **Add assertion:** no internal `<h2>` (heading conformance AC). Verify error/saved text still found by `getByText`/`role=alert`. Likely survives; add the heading assertion.

### Task 6 — Models
- File: `SettingsModels.tsx`.
- Non-anthropic model `<input className="input input-sm input-bordered">`, baseUrl `input-sm`, apiKey `input-sm` → `Input` (with `label` prop; drop DaisyUI `label`/`label-text` form-control wrappers).
- Provider/model `Select size="sm"` ✓ — verify uniform.
- Status dots `bg-success`/`bg-warning` + "Credential set/No credential" → `StatusChip` (healthy/"Credential set", behind/"No credential"). apiKey-stored dot likewise.
- Loading: `skeleton h-[60px]` ×3 → `<SkeletonList rows={3} ariaLabel="Loading model config" />`.
- Error: `<p className="text-sm text-error">` → `<ErrorState compact title="Couldn't load model config" description="…" onRetry={loadConfig} />`.
- Helper copy → intro shape (already `text-[12px] text-tertiary`, keep). "Saving…" keep 12px tertiary.
- Each tier = card 12px ✓. `gap-3`→`gap-[12px]` (literal grid).
- Tests: `packages/web/src/settings/__tests__/X4-SettingsModels.test.tsx:162` skeleton selector → `[role="status"]` (reconciliation). `packages/web/src/settings/__tests__/AH2-SettingsModels.test.tsx` — combobox/role queries survive. Verify credential-status assertions (if any text-based) still match StatusChip labels ("Credential set"/"No credential").

### Task 7 — Worker (highest control churn)
- File: `SettingsWorker.tsx`.
- Raw `<input type="checkbox" className="toggle toggle-sm">` + label → `<Toggle on={status.enabled} label="Register this device as a worker" onChange={() => void handleToggle()} />`.
- `<input type="number" className="input input-xs input-bordered w-16">` → `<div className="w-[88px]"><Input type="number" … min/max /></div>` (fixes undersized input; width via wrapper per reconciliation).
- `ConnectionBadge` (`badge badge-sm badge-success/warning/ghost`) → `StatusChip` with PINNED colors (design §1.9): connected→`healthy` (green) "Connected"; connecting→`paused` (blue, in-progress) "Connecting"; disconnected→`behind` (**amber**) "Disconnected". The amber attention state is Disconnected; Connecting stays the calmer blue — color hierarchy must not invert.
- `btn btn-ghost btn-sm` Pause/Resume → `<Button variant="ghost" size="sm">`.
- `border-base-300` → `border-[var(--border-subtle)]`.
- `gap-4`→`gap-[18px]`, `gap-3`→`gap-[12px]`. Non-electron/non-shared guidance → `text-[13px] text-secondary` + `text-[12px] text-tertiary` (already token-based; verify on-scale `text-sm`/`text-xs` → literal `text-[13px]`/`text-[12px]` if lint flags arbitrary). 
- Tests: `packages/web/src/settings/__tests__/SettingsWorker.test.tsx` — **update 6 `getByRole("checkbox", {name:/register.*worker/i})` → `getByRole("switch", …)`** at lines 158,206,283,286,301,305 (Toggle role). Badge `getByText(/connected|connecting/i)` survives (label text preserved). Pause/Resume button queries survive. `getByRole("spinbutton")` (numeric Input) survives. NOTE: tests assert label TEXT only — they do NOT catch the StatusChip color; color is the Phase-4 screenshot gate (AC-7).

### Task 8 — Org chart (inline styles + AG6 adoption)
- File: `SettingsOrgChart.tsx`.
- **Delete `inputStyle` `CSSProperties` object.** Function-mechanism free-text input → `Input` (with `label` prop).
- Add-form Selects: add `size="sm"`; replace uppercase 12px/600 field labels with Select/Input `label` prop ("From"/"Mechanism"/"Target").
- Hand-rolled pill `<button>`s: Delete → `Button variant="destructive" size="sm"`; +Add Edge → `Button variant="ghost"`/`secondary` `self-start`; Cancel → `Button variant="ghost"`; Add → `Button variant="primary"`.
- Loading: `skeleton h-8` ×2 → `SkeletonList`.
- Error: `<p text-[13px] text-[var(--status-error)]>` → `ErrorState compact onRetry={loadOrg}`.
- Empty: `<p>No edges defined.</p>` → `EmptyState compact title="No edges yet" description="…"`.
- **AG6: edge `<table>` → `ItemList variant="flush"` + `Row`** with the EXPLICIT slot mapping (design §4, resolves the anatomy mismatch — naive all-cells would downsize from/target 13px sans → 11px mono):
  - `title = userName(edge.fromUserId)` — Row title 13px sans, **preserves** current "from" 13px sans.
  - `subtitle = edge.target` — Row subtitle 12px tertiary (target was 13px sans; 1px shrink + tertiary tone, acceptable for the secondary "to-whom" line).
  - `cells = [{ text: edge.mechanism }]` — ONE neutral 11px-mono cell; `mechanism` is ALREADY mono today (no sans→mono regression, only 13px→11px on a secondary tag).
  - `actions = <Button variant="destructive" size="sm" aria-label="Delete edge …">` (preserve `aria-label`).
  This is ONE of the TWO AG6 Settings adoptions (the other is Credentials, Task 10).
- Inline `formError` → standardized `<p role="alert" className="text-[12px] text-[var(--status-error)]">`.
- Section gap `12px`→`18px`. Add form card 18px ✓.
- Tests: `packages/web/src/settings/__tests__/AD3-SettingsOrgChart-solo.test.tsx`, `packages/web/src/settings/__tests__/AF15-SettingsOrgChart-teams.test.tsx` — text/role-based (`getByText`, `getByRole`). Verify: `data-testid="add-edge-btn"`, `org-add-submit`, `org-form-error` testids **preserved** on the new `Button`/alert. Empty "No edges" assertion (if any) → update to EmptyState copy. Delete-button `aria-label` preserved on `Button` action. After Row migration, edge values are read from `Row` (title=from, subtitle=target, cell=mechanism) — confirm any `getByText(from/target/mechanism)` assertions still resolve (Row renders all three as text).

### Task 9 — Agents (table + inline forms, heaviest)
- File: `SettingsAgents.tsx`.
- Name/sessions `<input className="input input-sm input-bordered">` → `Input` (label prop; sessions wrapped for width).
- DaisyUI `label`/`label-text` → primitive `label` prop.
- `btn btn-ghost/primary btn-sm/xs` (Edit, Delete, Confirm?, Cancel, Save, +Add Agent) → `Button` (ghost/primary/destructive).
- Role `badge badge-ghost font-mono` → `Tag label={agent.role}`; harness-unavailable `badge badge-warning` → **`StatusChip status="behind" label="Harness unavailable"`** (`behind`=`--status-warning` amber — the ONLY warning color; NOT `paused`/blue, NOT `blocked`/red. Resolves the Task-9 "behind/blocked" ambiguity the critique flagged — pinned to `behind`/amber per design §1.9).
- Loading: `skeleton h-8` ×2 → `SkeletonList`.
- Error: `<p text-sm text-error>` → `ErrorState compact onRetry={loadAgents}`.
- Empty: `<p>No agents configured.</p>` → `EmptyState compact`.
- Inline 422 `editError`/`addError` → standardized `<p role="alert" className="text-[12px] text-[var(--status-error)]">`.
- Save spinner `loading loading-spinner` → text "Saving…" (drop DaisyUI class).
- `gap-2`/`gap-3`→`gap-[9px]`/`gap-[12px]`. Edit/add forms = card ✓.
- **AG6 decision:** agents table keeps `<table>` construction (inline expand-below-row pattern fights `Row` anatomy; the a11y nested-button constraint + colSpan edit row is costly to port — verified Row.tsx:181-185, SettingsAgents.tsx:612-625). Adopt all OTHER targets (Button/Input/Tag/StatusChip/state components). Justify in design §4 (the deliberate a11y exception). **AC-3 is satisfied by TWO list surfaces on `Row` — Credentials (Task 10, native fit) + org-chart (Task 8, explicit mapping) — plus uniform control/state adoption on the Agents table.** Agents is 1-of-3, retained for tabular a11y; Models tiers are mini-forms (not list rows).
- Tests: `packages/web/src/settings/__tests__/X3-SettingsAgents.test.tsx:195` skeleton → `[role="status"]` (reconciliation). Role-badge text (`getByText("builder")`) survives Tag. `getAllByText("Default")`, combobox/button/textbox queries survive. Confirm "Harness unavailable" text preserved on StatusChip (text only — amber color is the Phase-4 screenshot gate). `packages/web/src/settings/__tests__/AH2-SettingsAgents.test.tsx` — role/combobox/button queries survive. **Also: `packages/web/src/__tests__/SettingsAgents.test.tsx`** (root, 196 lines; asserts `getByText(/no teams/i)` — text-based, expected to SURVIVE) — run it; previously omitted from the plan.

### Task 10 — Credentials
- File: `packages/web/src/components/CredentialsTab.tsx`.
- `btn btn-ghost/primary btn-xs` (Validate, Update/Set, Remove, Save, Cancel) → `Button` (ghost/primary/destructive size="sm").
- Password `<input className="input input-sm input-bordered">` → `Input type="password"`.
- `StatusChip` ✓ (precedent — keep). Inline `saveError` → standardized alert. `loadError` warning → keep (soft-degrade, not ErrorState). Missing-secret box → keep (token-based) or normalize to alert shape.
- **AG6: catalog rows → `ItemList variant="flush"` + `Row`** (design §4 — native fit, the stronger 2-of-3 AC-3 surface). Mapping: `title={entry.label}` (Row title 13px sans = current label span 13px/500 — 1:1, no regression), `subtitle={entry.description}` (Row subtitle 12px tertiary = current description span 12px tertiary — 1:1), `actions={<><StatusChip…/><Button>Validate</Button><Button>Update/Set</Button><Button variant="destructive">Remove</Button></>}`. The inline edit reveal **stays a sibling div below the `Row`** (it already is, CredentialsTab.tsx:281) — no colSpan-expand problem, no a11y regression. `ItemList variant="flush"` preserves the hairline `border-b` separators per §2. **Preserve `data-testid="credential-row-*"`** — put it on the `Row` (`data-testid` prop, Row.tsx supports it) so the existing test keeps resolving; keep `data-testid="credential-state-chip"` wrapping the StatusChip in `actions`.
- Tests: `packages/web/src/components/__tests__/CredentialsTab.test.tsx` (verify exact path in baseline; root if not under `__tests__/`) — verify `data-testid="credential-row-*"` (now on `Row`), `credential-state-chip`, button text/role queries survive the `Button`+`Row` swap. If any assertion relies on the old `<div>` row structure (vs `Row`'s markup), update selector to the preserved testids (selector-tracking, not behavior change).

### Task 11 — Static check + snapshot re-bless + lint + full suite
- **`npm run check:ag7-consistency`** (the AC-1/AC-2 forbidden-token static check) → MUST be green (was red in Task 0). This is the AC-1/AC-2 gate.
- `npm run lint` → static check chained in + zero AQ hard-rule violations.
- `npm run test` (runs BOTH `packages/web/src/settings/__tests__` and `packages/web/src/__tests__`) → catalog-snapshot net diffs for any touched stories (`SettingsAgents.stories.tsx`, `SettingsModels.stories.tsx`, `SettingsWorker.stories.tsx`, `SettingsAssistant.stories.tsx`, `SettingsPage.stories.tsx`). **Review each text diff**, confirm it matches intended swaps, then `npm run ds:bless`. Never blind `-u`.
- `npm run check`, `npm run test:integration`.
- Phase-4 `/review` (local running app): per-section screenshot top-to-bottom for AC-7 coherence + StatusChip COLOR sign-off (design §1.9).

## Type signatures / contracts (unchanged)
No new types, routes, or schemas. All API calls (`/api/users/:id`, `/api/model-gateway`, `/api/org`, `/api/agents`, `/api/credentials`, `/api/users/:id/assistant`, worker bridge) unchanged. Component prop surfaces unchanged (SettingsAssistant still takes `userId`). Internal-only JSX swaps.

## Migrations (renamed/removed constructions → call-site updates)
| Removed/changed | Call sites to update |
|---|---|
| `.skeleton` class loaders | `packages/web/src/settings/__tests__/X4-SettingsModels.test.tsx:162`, `…/X3-SettingsAgents.test.tsx:195` → `[role="status"]` |
| Worker `<input type=checkbox>` → Toggle (`role=switch`) | `packages/web/src/settings/__tests__/SettingsWorker.test.tsx` lines 158,206,283,286,301,305 → `getByRole("switch", …)` |
| Credentials/OrgChart rows → `Row`/`ItemList` | `packages/web/src/components/__tests__/CredentialsTab.test.tsx` + OrgChart solo/teams tests: row testids/aria preserved on `Row`; if any selector keys on the old `<div>`/`<table>` row markup, update to the preserved testid (selector-tracking, not behavior change) |
| `inputStyle` object (OrgChart) | delete; no external import (file-local) |
| `ConnectionBadge` (Worker) → StatusChip | file-local; tests text-based, survive (color is the screenshot gate, not a test) |
| Empty "No edges/No agents" copy | if asserted, update to EmptyState copy (verify in solo/teams tests) |

## protectedTests (assertions must NOT change — behavior contracts) — ALL PATHS CORRECTED
- `packages/web/src/settings/__tests__/AF15-SettingsBackend.test.tsx` (backend mode resolution)
- `packages/web/src/settings/__tests__/AD3-SettingsNotifications-solo.test.tsx` (registry-driven toggles)
- `packages/web/src/settings/__tests__/AD3-SettingsOrgChart-solo.test.tsx` (org solo path)
- `packages/web/src/settings/__tests__/AF15-SettingsOrgChart-teams.test.tsx` (team-source correctness)
- `packages/web/src/settings/__tests__/AH2-SettingsAgents.test.tsx`, `…/AH2-SettingsModels.test.tsx` (AH2 functional contracts)
- `packages/web/src/settings/__tests__/AD8b-SettingsAssistant.test.tsx` (assistant save/text)
- `packages/web/src/components/__tests__/CredentialsTab.test.tsx` (credential state mapping)
- **`packages/web/src/__tests__/SettingsAgents.test.tsx`** (root — asserts `getByText(/no teams/i)`; text-based, expected to SURVIVE the Agents rewrite — previously OMITTED from the plan)
- **`packages/web/src/__tests__/SettingsProfile.test.tsx`** (root — loading test ~line 164 asserts Save absent during load; expected to SURVIVE the Skeleton swap — previously OMITTED). Add a NEW assertion (not a change to existing) that loading shows `[role="status"]`.
- `packages/web/src/__tests__/AF15-SettingsPage.test.tsx`, `…/W2-settings-appearance.test.tsx`, `…/AD5-settings-notifications.test.tsx` (render Settings surfaces; behavior/text-based; expected to survive)
- Integration/persistence tests for all settings routes.

Allowed to change (selector-only, behavior-preserving): `packages/web/src/settings/__tests__/X3-SettingsAgents.test.tsx` (skeleton selector), `…/X4-SettingsModels.test.tsx` (skeleton selector), `…/SettingsWorker.test.tsx` (checkbox→switch role), and any `Row`-migrated row-selector in CredentialsTab/OrgChart tests. **These selector updates do not change asserted behavior** — they track the primitive's role/class/testid, not the requirement (MEMORY: tests must not drive behavior — the production change is correct per design; tests follow the new DOM contract).

## sharedFiles
- `packages/web/src/pages/SettingsPage.tsx` (only if SectionTitle touched — NOT planned; SettingsAssistant heading removal is in SettingsAssistant.tsx, SettingsPage unchanged).
- No schema/router/seed/shared-type files touched. AG7 is presentation-only; low overlap risk.

## Security & abuse cases
- Rate-limit POST/PATCH: N/A — no new endpoints; existing routes unchanged.
- Input-trust boundary: N/A — no new agent-authored fields; same payloads.
- Secret handling: Credentials/Models apiKey — **unchanged**; AG7 swaps `<input>`→`Input` (both `type="password"`); GET still never returns key (X4 lore A-SEC-2 preserved). No new secret surface.
- Path-traversal / SSRF: N/A — no path/URL inputs added.

## Risks & ambiguities
1. **StatusChip status→COLOR** (was under-specified, now PINNED — design §1.9 table). `Status` union has no "connecting"; "Connecting"→`paused` (blue/in-progress, NOT amber). Critical correctness point: `paused`=blue and `behind`=amber, so the ONLY warning/attention chips (Disconnected, Harness-unavailable) MUST use `behind`/amber, never `paused`/blue — otherwise a degraded state reads calmer than a transitional one. Tests assert label TEXT only and CANNOT catch a wrong color → color correctness is the Phase-4 screenshot gate (AC-7), explicitly assigned. Medium risk if unchecked; mitigated by the pinned map + the human visual gate.
2. **Snapshot churn** — every section change diffs the catalog-snapshot net + Settings stories. Must review-then-bless, not blind. Medium effort, contained.
3. **AG6 Row adoption scope** — TWO surfaces (Credentials native + org-chart explicit-mapping); Agents `<table>` retained on documented a11y grounds (design §4). This is a much stronger AC-3 story than single-surface. Residual risk: a strict reading of "all list/table surfaces" could still want Agents on `Row` — mitigated by the concrete inline-expand a11y cost (colSpan edit row + nested-button heuristic, verified) and by 2-of-3 surfaces now migrated. Org-chart anatomy mismatch resolved via the explicit title/subtitle/cell slot mapping (no primary-value sans→11px-mono downsize).
3b. **Models tiers not on Row** — explicitly not a list row (mini-form); documented.
4. **Input width override** — `className` lands on wrapper; numeric fields need wrapper-width pattern. Verified, planned.
5. **Profile retry** — `ErrorState compact` without `onRetry` leaves no retry affordance (parity with today's dead "Please try again." — acceptable; not a regression).
6. **DaisyUI `loading loading-spinner`** in save buttons — animation chrome, not palette; replaced with text to keep zero DaisyUI control classes (AC-2 strictness).

## Design-it-twice (one non-trivial decision)
**Models credential status: tokenized dot vs StatusChip.**
- (A) Tokenize the existing 2×2 dot (`bg-[var(--status-success)]`) — minimal diff, keeps current shape. Trade-off: still a bespoke dot+text construction, diverges from CredentialsTab's StatusChip on the same page. Reject: leaves a status vocabulary split AG7 exists to close.
- (B) StatusChip (healthy/behind) — one status vocabulary across Models + Credentials + Worker. Trade-off: slightly heavier chip vs tiny dot in a dense tier row. **Chosen** — cross-section status consistency is the AC; CredentialsTab sets the precedent in the same page; chip at `sm` is acceptable density.
