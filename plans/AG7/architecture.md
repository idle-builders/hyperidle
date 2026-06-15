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
| `Toggle` replaces Worker's `<input type=checkbox toggle>` | `Toggle` renders `role="switch"` (Toggle.tsx:42), NOT `role="checkbox"` | **Update `SettingsWorker.test.tsx`** all `getByRole("checkbox", {name:/register.*worker/i})` → `getByRole("switch", …)`. 6 call sites (lines 158,206,283,286,301,305). |
| `Skeleton`/`SkeletonList` replaces `<div className="skeleton">` | `Skeleton` uses `animate-[skeleton-pulse]` + `role="status"`, NOT class `.skeleton` (Skeleton.tsx:29-30) | **Update `X4-SettingsModels.test.tsx:162` and `X3-SettingsAgents.test.tsx:195`** `querySelectorAll(".skeleton")` → `querySelectorAll('[role="status"]')` or `getAllByTestId(/skeleton/)`. |
| `StatusChip` replaces Worker badge / Models dots | StatusChip renders `label` as visible text (StatusChip.tsx:120); `Status` union = `healthy\|behind\|blocked\|paused\|done\|error` | Worker badge text tests (`getByText(/connected\|connecting/i)`) **survive** if label preserved. Map: connected→`healthy` label "Connected"; connecting→`paused`/`blocked` label "Connecting"; disconnected→`behind` label "Disconnected". |
| `Tag` replaces Agents role `badge-ghost` | Tag renders `label` as text (Tag.tsx:32) | Agents role tests (`getByText("builder")`) **survive**; markup-coupled assertions: none found (tests are text-based). |
| `ErrorState compact` needs `onRetry` reload fn | Profile has no local reload (uses `useCurrentUser`); OrgChart/Models/Agents have `loadOrg`/`loadConfig`/`loadAgents` | Profile: `ErrorState compact` **without** `onRetry` (or expose refetch — prefer no-retry, minimal change). Others: pass `onRetry={loadX}`. |
| `Input` className width override (numeric fields) | `Input` spreads `className` onto the **wrapper div** (Input.tsx:63), not the `<input>` | Numeric width (`w-16`) must go on the wrapper as a max-width OR architect uses a wrapping `<div className="w-[...]">`. **Decision:** wrap the numeric `Input` in `<div className="w-[88px]">` (88px = on-grid-ish; use `w-[72px]`→not grid; use a px width — width is layout not spacing-token-bound here, but prefer a clean value). Lands width on the field via wrapper width + Input's own `w-full`. |
| Appearance focus ring uses hardcoded `rgba(22,118,79,0.1)` | AQ-008 violation (SettingsAppearance.tsx:88) | Replace with `--accent-primary-dim` token via className `focus-visible` shadow, matching Input/Select focus ring. |
| AI1 fixed `--color-error`/`--color-success`/`--border` dead tokens | Confirm AI1 landed on this branch | AG7 styles on top; if AI1 not present, the inline-style→className token swaps in Assistant/Credentials still resolve to valid `--status-*`/`--border-subtle` tokens (AG7's own changes don't depend on AI1's token defs since AG7 uses the canonical `--status-*`/`--border-subtle` set). |
| `gap-4` used in Worker | 16px — off-grid, AQ-001 violation | Fix to `gap-[18px]`. |

## Acceptance criteria → validation method

| AC | Verification method |
|---|---|
| AC-1 Same header/label/hint/spacing, no off-grid | `npm run lint` (eslint-plugin-design AQ-001 off-grid, AQ-004 off-scale) zero violations on all 10 files. Manual: all field labels via primitive `label` prop. |
| AC-2 One component per control kind, no raw inline styles/divergent controls | `npm run lint` + grep guard: zero `className="input input-`, zero `className="btn `, zero `className="toggle `, zero `className="badge `, zero inline `style={{` for controls in the 10 settings files. (Static property → grep-based assertion in a `.test.ts` that imports nothing but is really a lint check — preferred: ESLint. Use existing AQ lints; add a targeted grep in CI only if a rule gap exists.) |
| AC-3 All dropdowns via `Select`, lists via `Row`/`ItemList` | `npm run check` (Select imported, used). OrgChart edge table renders via `ItemList`/`Row` — component test asserts edge rows present + `data-ds-component="Row"`. |
| AC-4 Loading/error/empty via shared components | Component tests: each section's loading state asserts `[role="status"]` (Skeleton); error state asserts `ErrorState` testid `error-state`; empty asserts `EmptyState` testid `empty-state`. Update X3/X4 skeleton selectors (reconciliation). |
| AC-5 Card-vs-flat one rule | Manual + snapshot: Models tiers & form expansions carded; Profile/Notifications/Worker/Backend/Assistant/Appearance flat. Documented in approved §2. Snapshot diff review. |
| AC-6 No persistence/reachability regression | All existing settings component + integration tests stay green (`npm run test`, `npm run test:integration`). No test deleted. |
| AC-7 Visual coherence, zero AQ hard-rule violations | `npm run lint` zero AQ violations; catalog-snapshot net re-blessed with reviewed diff; Playwright screenshot of full Settings page each section (manual review in /review). |
| AC assistant heading conforms | Component test: SettingsAssistant renders no internal `<h2>`; the only heading is the SettingsPage `SectionTitle`. Assert `queryByRole("heading", {name:"Assistant"})` count via page render = 1 (the SectionTitle), or unit: SettingsAssistant alone has no `<h2>`. |

## Ordered task list

Order = lowest-risk / reference-baseline first, highest-coupling last. Each task: files, primitive swap, test impact.

### Task 0 — Pre-flight (no code)
- Run `npm run test packages/web/src/settings` + `CredentialsTab.test.tsx` to capture green baseline.
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
- File: `SettingsProfile.tsx`.
- Loading: `<div className="skeleton h-8 w-full">` ×2 → `<SkeletonList rows={2} ariaLabel="Loading profile" />`.
- Error: `<p className="text-sm text-error">` → `<ErrorState compact title="Couldn't load profile" description="…" />` (no `onRetry` — no local reload; see reconciliation).
- Save spinner inside `Button` (`loading loading-spinner loading-xs`) → keep child but replace DaisyUI spinner with a token-safe spinner or keep (DaisyUI `loading` is animation chrome, not palette — acceptable; if lint flags, use Button's built-in disabled state + plain text "Saving…"). **Decision:** replace inline spinner with text-only "Saving…" to avoid DaisyUI class; Button already conveys disabled.
- Flat, gap `18px` ✓.
- Test: no existing Profile-specific test file found (covered by integration). Add/confirm a component test asserts `[role="status"]` loading + `error-state` testid if a Profile test exists; otherwise rely on integration persistence.

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
- Test: `AD8b-SettingsAssistant.test.tsx` — uses `getByRole("textbox")`, `getByRole("button",{name:/save/i})`, text matches. **Add assertion:** no internal `<h2>` (heading conformance AC). Verify error/saved text still found by `getByText`/`role=alert`. Likely survives; add the heading assertion.

### Task 6 — Models
- File: `SettingsModels.tsx`.
- Non-anthropic model `<input className="input input-sm input-bordered">`, baseUrl `input-sm`, apiKey `input-sm` → `Input` (with `label` prop; drop DaisyUI `label`/`label-text` form-control wrappers).
- Provider/model `Select size="sm"` ✓ — verify uniform.
- Status dots `bg-success`/`bg-warning` + "Credential set/No credential" → `StatusChip` (healthy/"Credential set", behind/"No credential"). apiKey-stored dot likewise.
- Loading: `skeleton h-[60px]` ×3 → `<SkeletonList rows={3} ariaLabel="Loading model config" />`.
- Error: `<p className="text-sm text-error">` → `<ErrorState compact title="Couldn't load model config" description="…" onRetry={loadConfig} />`.
- Helper copy → intro shape (already `text-[12px] text-tertiary`, keep). "Saving…" keep 12px tertiary.
- Each tier = card 12px ✓. `gap-3`→`gap-[12px]` (literal grid).
- Tests: `X4-SettingsModels.test.tsx:162` skeleton selector → `[role="status"]` (reconciliation). `AH2-SettingsModels.test.tsx` — combobox/role queries survive. Verify credential-status assertions (if any text-based) still match StatusChip labels.

### Task 7 — Worker (highest control churn)
- File: `SettingsWorker.tsx`.
- Raw `<input type="checkbox" className="toggle toggle-sm">` + label → `<Toggle on={status.enabled} label="Register this device as a worker" onChange={() => void handleToggle()} />`.
- `<input type="number" className="input input-xs input-bordered w-16">` → `<div className="w-[88px]"><Input type="number" … min/max /></div>` (fixes undersized input; width via wrapper per reconciliation).
- `ConnectionBadge` (`badge badge-sm badge-success/warning/ghost`) → `StatusChip` (connected→healthy "Connected", connecting→paused "Connecting", disconnected→behind "Disconnected").
- `btn btn-ghost btn-sm` Pause/Resume → `<Button variant="ghost" size="sm">`.
- `border-base-300` → `border-[var(--border-subtle)]`.
- `gap-4`→`gap-[18px]`, `gap-3`→`gap-[12px]`. Non-electron/non-shared guidance → `text-[13px] text-secondary` + `text-[12px] text-tertiary` (already token-based; verify on-scale `text-sm`/`text-xs` → literal `text-[13px]`/`text-[12px]` if lint flags arbitrary). 
- Tests: `SettingsWorker.test.tsx` — **update 6 `getByRole("checkbox", {name:/register.*worker/i})` → `getByRole("switch", …)`** (Toggle role). Badge `getByText(/connected|connecting/i)` survives. Pause/Resume button queries survive. `getByRole("spinbutton")` (numeric Input) survives.

### Task 8 — Org chart (inline styles + AG6 adoption)
- File: `SettingsOrgChart.tsx`.
- **Delete `inputStyle` `CSSProperties` object.** Function-mechanism free-text input → `Input` (with `label` prop).
- Add-form Selects: add `size="sm"`; replace uppercase 12px/600 field labels with Select/Input `label` prop ("From"/"Mechanism"/"Target").
- Hand-rolled pill `<button>`s: Delete → `Button variant="destructive" size="sm"`; +Add Edge → `Button variant="ghost"`/`secondary` `self-start`; Cancel → `Button variant="ghost"`; Add → `Button variant="primary"`.
- Loading: `skeleton h-8` ×2 → `SkeletonList`.
- Error: `<p text-[13px] text-[var(--status-error)]>` → `ErrorState compact onRetry={loadOrg}`.
- Empty: `<p>No edges defined.</p>` → `EmptyState compact title="No edges yet" description="…"`.
- **AG6: edge `<table>` → `ItemList variant="flush"` + `Row`** (cells: from / mechanism(mono) / target; trailing action: Delete `Button`). This is the primary AG6 Settings adoption.
- Inline `formError` → standardized `<p role="alert" className="text-[12px] text-[var(--status-error)]">`.
- Section gap `12px`→`18px`. Add form card 18px ✓.
- Tests: `AD3-SettingsOrgChart-solo.test.tsx`, `AF15-SettingsOrgChart-teams.test.tsx` — text/role-based (`getByText`, `getByRole`). Verify: `data-testid="add-edge-btn"`, `org-add-submit`, `org-form-error` testids **preserved** on the new `Button`/alert. Empty "No edges" assertion (if any) → update to EmptyState copy. Delete-button `aria-label` preserved on `Button`.

### Task 9 — Agents (table + inline forms, heaviest)
- File: `SettingsAgents.tsx`.
- Name/sessions `<input className="input input-sm input-bordered">` → `Input` (label prop; sessions wrapped for width).
- DaisyUI `label`/`label-text` → primitive `label` prop.
- `btn btn-ghost/primary btn-sm/xs` (Edit, Delete, Confirm?, Cancel, Save, +Add Agent) → `Button` (ghost/primary/destructive).
- Role `badge badge-ghost font-mono` → `Tag label={agent.role}`; harness-unavailable `badge badge-warning` → `StatusChip status="behind"/"blocked" label="Harness unavailable"`.
- Loading: `skeleton h-8` ×2 → `SkeletonList`.
- Error: `<p text-sm text-error>` → `ErrorState compact onRetry={loadAgents}`.
- Empty: `<p>No agents configured.</p>` → `EmptyState compact`.
- Inline 422 `editError`/`addError` → standardized `<p role="alert" className="text-[12px] text-[var(--status-error)]">`.
- Save spinner `loading loading-spinner` → text "Saving…" (drop DaisyUI class).
- `gap-2`/`gap-3`→`gap-[9px]`/`gap-[12px]`. Edit/add forms = card ✓.
- **AG6 decision:** agents table keeps `<table>` construction (inline expand-below-row pattern fights `Row` anatomy; the a11y nested-button constraint + colSpan edit row is costly to port). Adopt all OTHER targets (Button/Input/Tag/StatusChip/state components). Justify in approved §4 (already documented). Architect-confirmed: control+state consistency satisfies AC; org-chart provides the AG6 list-primitive adoption.
- Tests: `X3-SettingsAgents.test.tsx:195` skeleton → `[role="status"]` (reconciliation). Role-badge text (`getByText("builder")`) survives Tag. `getAllByText("Default")`, combobox/button/textbox queries survive. Confirm "Harness unavailable" text preserved on StatusChip. `AH2-SettingsAgents.test.tsx` — role/combobox/button queries survive.

### Task 10 — Credentials
- File: `packages/web/src/components/CredentialsTab.tsx`.
- `btn btn-ghost/primary btn-xs` (Validate, Update/Set, Remove, Save, Cancel) → `Button` (ghost/primary/destructive size="sm").
- Password `<input className="input input-sm input-bordered">` → `Input type="password"`.
- `StatusChip` ✓ (precedent — keep). Rows stay flush `border-b` (approved §2 — not carded). Inline `saveError` → standardized alert. `loadError` warning → keep (soft-degrade, not ErrorState). Missing-secret box → keep (token-based) or normalize to alert shape.
- Tests: `CredentialsTab.test.tsx` — verify `data-testid="credential-row-*"`, `credential-state-chip`, button text/role queries survive `Button` swap.

### Task 11 — Snapshot re-bless + lint + full suite
- `npm run lint` → fix any residual AQ violations.
- `npm run test` → catalog-snapshot net diffs for any touched stories (`SettingsAgents.stories.tsx`, `SettingsModels.stories.tsx`, `SettingsWorker.stories.tsx`, `SettingsAssistant.stories.tsx`, `SettingsPage.stories.tsx`). **Review each text diff**, confirm it matches intended swaps, then `npm run ds:bless`. Never blind `-u`.
- `npm run check`, `npm run test:integration`.

## Type signatures / contracts (unchanged)
No new types, routes, or schemas. All API calls (`/api/users/:id`, `/api/model-gateway`, `/api/org`, `/api/agents`, `/api/credentials`, `/api/users/:id/assistant`, worker bridge) unchanged. Component prop surfaces unchanged (SettingsAssistant still takes `userId`). Internal-only JSX swaps.

## Migrations (renamed/removed constructions → call-site updates)
| Removed/changed | Call sites to update |
|---|---|
| `.skeleton` class loaders | `X4-SettingsModels.test.tsx:162`, `X3-SettingsAgents.test.tsx:195` → `[role="status"]` |
| Worker `<input type=checkbox>` → Toggle (`role=switch`) | `SettingsWorker.test.tsx` lines 158,206,283,286,301,305 → `getByRole("switch", …)` |
| `inputStyle` object (OrgChart) | delete; no external import (file-local) |
| `ConnectionBadge` (Worker) → StatusChip | file-local; tests text-based, survive |
| Empty "No edges/No agents" copy | if asserted, update to EmptyState copy (verify in solo/teams tests) |

## protectedTests (assertions must NOT change — behavior contracts)
- `AF15-SettingsBackend.test.tsx` (backend mode resolution)
- `AD3-SettingsNotifications-solo.test.tsx` (registry-driven toggles)
- `AF15-SettingsOrgChart-teams.test.tsx` (team-source correctness)
- `AH2-SettingsAgents.test.tsx`, `AH2-SettingsModels.test.tsx` (AH2 functional contracts)
- `CredentialsTab.test.tsx` (credential state mapping)
- Integration/persistence tests for all settings routes.

Allowed to change (selector-only, behavior-preserving): `X3-SettingsAgents.test.tsx` (skeleton selector), `X4-SettingsModels.test.tsx` (skeleton selector), `SettingsWorker.test.tsx` (checkbox→switch role). **These selector updates do not change asserted behavior** — they track the primitive's role/class, not the requirement (MEMORY: tests must not drive behavior — here the production change is correct per design; tests follow the new DOM contract).

## sharedFiles
- `packages/web/src/pages/SettingsPage.tsx` (only if SectionTitle touched — NOT planned; SettingsAssistant heading removal is in SettingsAssistant.tsx, SettingsPage unchanged).
- No schema/router/seed/shared-type files touched. AG7 is presentation-only; low overlap risk.

## Security & abuse cases
- Rate-limit POST/PATCH: N/A — no new endpoints; existing routes unchanged.
- Input-trust boundary: N/A — no new agent-authored fields; same payloads.
- Secret handling: Credentials/Models apiKey — **unchanged**; AG7 swaps `<input>`→`Input` (both `type="password"`); GET still never returns key (X4 lore A-SEC-2 preserved). No new secret surface.
- Path-traversal / SSRF: N/A — no path/URL inputs added.

## Risks & ambiguities
1. **StatusChip status mapping** for Worker "Connecting" — `Status` union has no "connecting"; map to `paused` or `blocked`. Label text "Connecting" preserves the test assertion. Low risk.
2. **Snapshot churn** — every section change diffs the catalog-snapshot net + Settings stories. Must review-then-bless, not blind. Medium effort, contained.
3. **AG6 Row adoption scope** — org-chart only (Agents/Credentials keep table/flush-row + control consistency). If reviewer reads AC-3 "all list/table surfaces via the primitive" strictly, the Agents `<table>` retention needs the documented justification (approved §4) to hold; risk the reviewer pushes for Agents migration. Mitigation: justification is concrete (inline-expand a11y cost). 
3b. **Models tiers not on Row** — explicitly not a list row (mini-form); documented.
4. **Input width override** — `className` lands on wrapper; numeric fields need wrapper-width pattern. Verified, planned.
5. **Profile retry** — `ErrorState compact` without `onRetry` leaves no retry affordance (parity with today's dead "Please try again." — acceptable; not a regression).
6. **DaisyUI `loading loading-spinner`** in save buttons — animation chrome, not palette; replaced with text to keep zero DaisyUI control classes (AC-2 strictness).

## Design-it-twice (one non-trivial decision)
**Models credential status: tokenized dot vs StatusChip.**
- (A) Tokenize the existing 2×2 dot (`bg-[var(--status-success)]`) — minimal diff, keeps current shape. Trade-off: still a bespoke dot+text construction, diverges from CredentialsTab's StatusChip on the same page. Reject: leaves a status vocabulary split AG7 exists to close.
- (B) StatusChip (healthy/behind) — one status vocabulary across Models + Credentials + Worker. Trade-off: slightly heavier chip vs tiny dot in a dense tier row. **Chosen** — cross-section status consistency is the AC; CredentialsTab sets the precedent in the same page; chip at `sm` is acceptable density.
