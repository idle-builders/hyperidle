# AM4 — Approved design

DESIGN-CLASS: novel (see brief.md) → after `/design-critique`, this triggers `/human-design-review`.

## Chosen: Variant C — Providers list (t3code Providers grammar, refined)

A calm, dense **single bordered container with hairline-divided rows** — refined from the founder's real t3code Settings → Providers reference (`Screenshot 2026-06-16 at 22.15.42.png`). Rendered story: `packages/web/src/settings/AM4HarnessVariantC.stories.tsx` (`Settings/AM4 Harnesses · C Cards`, variants `Cards` = light, `Dark`).

**Pulled in:** actionable-first ordering (from B), copyable mono command in the auth zone (from A/C).

## Reference-refinement (this round — founder direction: "refine from the real t3code screenshot")

The prior round was boxy: oversized `--surface-elevated` cards with `--shadow-default` + 18px padding, big tinted auth insets, loud uppercase `StatusChip` pills, no re-detect, no toggle. Refined to the reference's quiet density. **No color/token changes** — density, rhythm, structure, affordances only.

| Aspect | Before (boxy) | After (t3code-aligned) |
|---|---|---|
| Container | one shadowed card *per* backend, 12px gaps between | ONE bordered `--surface-elevated` container; rows split by `--border-subtle` hairlines |
| Row rhythm | 18px card padding, 17px name | 12px row padding, 14px/600 name; tight, scannable |
| Status | loud uppercase `StatusChip` pill ("SIGN IN NEEDED") | tiny 6px status **dot** (same `--status-*` family) + ONE quiet line of muted sub-text ("Authenticated as …@… · Claude Max subscription" / "Disabled — …") — no shouting chip |
| Header | section title + counts paragraph | "PROVIDERS" caps label · "Checked just now" · ghost **Refresh** button (the re-detect affordance) |
| Re-detect | none | ghost `Button` top-right → `POST /api/harnesses/redetect` |
| Toggle | non-interactive "Enabled" text label, ready-only (R1 below) | REAL right-aligned enable/disable **Toggle** per toggleable row (R1 reversal) |
| Auth zone | tinted inset card, full-width | quiet inline row (CTA + mono command), indented under the row, only when actionable |
| Badge | none | "Early Access" `Tag` inline after name+version, matching the reference |

Identity line now reads exactly like the reference: **dot · bold name · muted-mono `v2.1.178` · optional badge**, with the status sentence muted beneath.

### R1 — REVERSED: restore a REAL enable/disable toggle (founder review + AC2)

**Decision (this round):** restore an interactive right-aligned **Toggle** per row, backed by a **persisted `harness.disabled` setting** that `AdapterPool.select()` honors. A disabled backend is not selected and renders "Disabled — …" (toggle OFF), exactly like the reference's Codex/Cursor/Grok rows. The toggle is shown ONLY for backends that can meaningfully be enabled/disabled — `ready` / `installed` / `unauthenticated` (computed from `discovery.state` via `showsToggle`, **not** a per-family table). `missing` / `unavailable` show NO toggle (nothing to disable — Cursor Agent in the story has none).

**Why the reversal (supersedes the prior R1 "non-interactive Enabled label, no persisted state"):**
- The founder pointed directly at the t3code reference where a real enable/disable switch is the **headline affordance** on every provider row, and disabling actually disables the provider.
- **AC2** (`.pipeline/work-packages/TRACK-AM.md` § AM4) explicitly requires "A user can enable, **disable**, and configure an in-scope backend." The prior round satisfied "enable/configure" but left "disable" as N/A — the founder's signal makes disable a real requirement.
- The prior R1 rejected the toggle because "nothing in the runtime consumes a disable flag." That objection is **resolved by adding the consumer**: this round makes `disabled` a persisted setting that `AdapterPool.select()` reads and skips. The toggle is no longer dead state — it changes selection behavior. This is a **deliberate scope addition** (persisted setting + `select()` honoring it + a `POST` to set it); flagged in `architecture.md` so the architecture-critique can re-check it.

**What this replaces:** the non-interactive "Enabled" text label and `showsEnabledIndication` are retired from the row (a thin `showsEnabledIndication` alias is kept in the mapper only so the legacy variant-A scaffold compiles until the builder deletes A/B). The row now uses `showsToggle(d)` + `isEnabled(d)` + `statusLine(d)`.

**Component-budget note (HARD — builder must resolve, not hand-roll):** DS `Toggle` always renders a visible text label beside the track; the reference switch is **bare** (no adjacent text). The story renders a switch with `Toggle`'s exact visual + a11y contract (`role="switch"`, spring thumb, `--accent-primary` track) inline with an **sr-only `aria-label`**. The builder must add a **label-less / sr-only-label affordance to the DS `Toggle`** (reused by every settings row that toggles without adjacent text — clears the 2+-context bar) rather than hand-rolling a second switch. Do NOT ship the inline copy as production; fold it into `Toggle`.

## Design-it-twice resolutions (post-critique — bind before build)

Two findings from `design-critique.md` + the architecture-critique enable/disable ruling are resolved here. The variant C story (`AM4HarnessVariantC.stories.tsx`) and the `harness-presentation` mapper spec below already reflect these.

### R1 — SUPERSEDED (see "R1 — REVERSED" above)

The original R1 (non-interactive "Enabled" indication, ready-only, no persisted state) is **superseded by the R1 reversal above** (founder review + AC2): a real interactive toggle backed by a persisted `harness.disabled` setting that `AdapterPool.select()` honors. The original rationale — "nothing in the runtime consumes an on/off flag" — is resolved by adding the consumer this round. Text retained below for the record.

> *Original R1 (retired):* there is NO interactive toggle and NO persisted `harness.disabled` state; a ready backend shows a quiet non-interactive "Enabled" label, non-ready states show no indication. Considered a flippable `Toggle` and rejected it because a disabled switch read as broken and nothing consumed the flag. — **Now reversed:** the switch is real, `missing`/`unavailable` simply show no toggle (so it never reads as broken), and `select()` consumes the flag.

### R2 — Capabilities Fold shows proven caps only (honest production shape)

**Decision:** the fold renders declared models, then **only the runtime capabilities that are `true`** as a single "Capabilities" line. When no runtime cap is proven (the production shape), it renders **"Capabilities confirmed after first run"** instead of a row-per-cap wall of "No".

**Why:** production discovery does NOT run the session probe (AM2 `@lore`); re-detect doesn't either (same probe gating). Real `ready` backends therefore return runtime caps **all-`false`**. The original fixtures masked this by hardcoding `true`; the fixtures + story now render the all-`false` production shape, and "File editing: No / MCP: No / Sub-agents: No" never appears (it read as a degraded backend — design-critique WARNING 2, arch-critique WARNING re: runtime caps). Fold visibility is itself descriptor-driven via a `hasCaps(d)` mapper (models OR any proven cap) — addresses the SUGGESTION that the old inline `hasCaps` omitted `toolUse`/`subAgents`.

## The list anatomy (one container, hairline rows, descriptor-conditional zones)

A **section header** + ONE `--surface-elevated` container (`--r-default`, `border --border-subtle`, `--shadow-default`, `overflow-hidden`), 640px max-width column. Each backend = one **row** split from the next by a `--border-subtle` hairline (last row none). No per-card shadow, no per-card gap — the calm reference shape.

0. **Section header** — "PROVIDERS" caps label (11px/600, `--tracking-caps-sm`, `--text-tertiary`) on the left; right side = "Checked just now" muted text + a ghost **Refresh** `Button` (`size="sm"`, `aria-label="Re-detect backends"`) → `POST /api/harnesses/redetect`.
1. **Row** — 12px padding. Left: tiny 6px status **dot** (color from `statusLine(d).tone`, same `--status-*` family) · then a stack of [ `name` 14px/600 + muted-mono `v{version}` + optional "Early Access" `Tag` ] over [ ONE muted status line `statusLine(d).text` (12px, `--text-tertiary`) ]. Right (right-aligned): `Fold` chevron ("Models") when `hasCaps(d)` + enable/disable **Toggle** when `showsToggle(d)`. A disabled row reads dimmed (name → `--text-secondary`, dot at 50% opacity) and its status line is "Disabled — …".
2. **Auth zone** — rendered ONLY when `hasActionableNextStep(d)`. Quiet inline row indented under the row (no tinted card): primary `Button` (`authAction.label`) + copyable mono `code` command (from `authAction.command`). The "actionable next step, not a silent failure" AC.
3. **Unavailable** — `state === "unavailable"` carries no toggle, no auth zone; the reason renders as the row's muted status line (no separate inset). Cursor Agent in the story.
4. **Capabilities Fold** — `hasCaps(d)` only; the "Models" chevron expands inline (indented under the row) to `KeyValue` model rows by provider, then a single "Capabilities" line of proven caps OR the "confirmed after first run" line (R2). A disabled backend hides the fold (nothing runs while disabled).

Row order: `unauthenticated` → `installed` → `ready` → `missing` → `unavailable` (actionable first).

## Descriptor-driven contract (HARD — reviewer must verify)

All presentation routes through `packages/web/src/settings/AM4HarnessPresentation.ts` mappers — `statusLine`, `accessModeLabel`, `hasActionableNextStep`, `showsToggle`, `isEnabled`, `hasCaps`, `provenCapabilities`, `commandText`, `capabilitySummary` (+ `readinessToStatus`/`showsEnabledIndication` retained for legacy variant A only). **There is no `type === "codex"` (or any family) branch in the rendered surface.** Every zone's presence — including the **toggle's visibility (`showsToggle`)** — is computed from `discovery.state` + `discovery.disabled` + `authAction.kind`, NOT a family table. The builder lifts this file into production; the readiness→`Status` half belongs with the design-system `status-mapping` family.

## Readiness → presentation

| `discovery.state` | status dot tone | status line (`statusLine.text`) | Auth zone | Toggle | Capabilities Fold |
|---|---|---|---|---|---|
| `ready` | healthy (green) | "Authenticated …" (`authSummary`/reason) | no | **yes** (on) | yes (if `hasCaps`) |
| `ready` + `disabled` | unknown (dimmed) | "Disabled — …" | no | **yes** (off) | no |
| `unauthenticated` | behind (amber) | "Present on this machine — not signed in yet." | yes (CTA + command) | **yes** (on) | if `hasCaps` |
| `installed` | behind (amber) | "Installed — auth status not yet confirmed." | yes (CTA + command) | **yes** (on) | if `hasCaps` |
| `missing` | paused (amber) | reason ("Not installed.") | no (build: install hint) | **no** | no |
| `unavailable` | unknown (grey) | reason, no CTA | no | **no** | no |

Note: with the production shape (runtime caps all-`false`), a `ready` row's fold still renders because the descriptor declares models (`hasCaps` is models OR proven cap); the cap line falls back to "confirmed after first run" (R2). A disabled row hides the fold.

Auth CTA copy is always `authAction.label`. `native_cli_login` → reveal + copy `command` (HyperIdle surfaces the step; the CLI owns the secret — no token harvesting). `enter_api_key` → build opens a credential input (credential STORAGE is AM4-out-of-scope; surface the action + status only).

## Component mapping (reuse — ONE DS enhancement: label-less `Toggle`)

| Element | Component | Props/notes |
|---|---|---|
| Status | 6px `<span>` dot + muted `<span>` line | dot color from `statusLine(d).tone` (`--status-*`), line = `statusLine(d).text`. NOT `StatusChip` — no uppercase pill (calm reference grammar) |
| Enable/disable | `Toggle` (label-less variant — see budget note) | `on={isEnabled(d)}`, rendered when `showsToggle(d)`; sr-only `aria-label`. **Real persisted control** (R1 reversal) |
| Re-detect | `Button` `variant="ghost" size="sm"` | header right; `aria-label="Re-detect backends"` → `POST /api/harnesses/redetect` |
| Badge | `Tag` | "Early Access" when descriptor carries `badge` |
| Auth CTA | `Button` | `variant="primary" size="sm"`, children = `authAction.label` |
| Copy command | mono `code` block (SettingsModels idiom) + build adds ghost "Copy" `Button` | `commandText(d)` |
| Capabilities reveal | `Fold` | `cta` Models/Hide, local open state; visible when `hasCaps(d)` |
| Model rows | `KeyValue` | inline layout, one per declared model |
| Capability line | `KeyValue` (inline) when `provenCapabilities(d)` non-empty, else quiet `<span>` "Capabilities confirmed after first run" (R2) | never a per-cap Yes/No grid |
| Empty / loading / error | `EmptyState` / `SkeletonList` / `ErrorState` | DEFERRED to build |

**One DS enhancement, not a new component:** the label-less / sr-only-label `Toggle` variant (see the budget note under R1). Reused by any settings row toggling without adjacent text → clears the 2+-context bar. Builder folds it into DS `Toggle`; do not hand-roll.

## States with copy

- **Populated** (designed): see screenshot (`/tmp` capture this round; builder re-renders).
- **Loading** (build): `SkeletonList rows={3}` — match SettingsAgents.
- **Error** (build): `ErrorState compact title="Couldn't detect backends" onRetry`.
- **Empty / nothing detected** (build): `EmptyState` "No agent backends detected" + the builtin always-present note.
- **All ready** (build): no auth zones render — naturally handled by the conditional.

## Behavior · motion · keyboard

- Fold expand: `--motion-default`. Toggle thumb: `--motion-fast` + `--easing-expressive` (DS `Toggle` signature). Row hover: none (config rows are not navigational — no AQ-010 lift).
- The toggle IS interactive (`role="switch"`, focusable) — R1 reversal. Flipping it persists `harness.disabled` and re-renders the row to/from "Disabled — …".
- Tab order per row: auth CTA → copy → fold → toggle.
- Focus: control-ring on Button/Fold/Toggle (DS default).

## Mobile (three-tab layout)

Settings is reached from the mobile Settings surface; the list goes full-width, 12px gutter, the toggle stays right-aligned on the row, auth-zone buttons wrap. The toggle's 44px track already meets the AQ-015 touch target. Inputs (build's API-key entry) ≥16px font (AQ-005).

## Placement / where it lives

A new `SettingsHarnesses` section + `HarnessCard` sub-component in `packages/web/src/settings/`, registered in `SettingsPage.tsx` as a stacked section ("Agent backends") near Models/Agents. First-run: `SetupFlow` links to or embeds the detection summary (architect decides the read path; the surface is the same component). The story renders the section bare for review.

## Open questions for the architect

1. Read path: `SettingsHarnesses` fetches `GET /api/harnesses` on mount (same as SettingsAgents) → `HarnessCapabilityDescriptor[]`. Confirm no new endpoint needed (it isn't — AM2 ships it).
2. **REVERSED this round (R1 reversal — founder review + AC2):** a REAL persisted `harness.disabled` setting now backs the toggle, and `AdapterPool.select()` honors it (a disabled backend is not selected, renders "Disabled — …"). This is a deliberate scope addition: persisted setting + `select()` consumer + a `POST` to flip it. Architect: spec the persistence (one settings key `harness.disabled: string[]`, or a `disabled?: boolean` on the descriptor read alongside it), the `select()` gate, and the write endpoint. Flagged in `architecture.md` for architecture-critique re-check.
3. First-run entry: does `SetupFlow` embed the section or link to Settings? Architect decides; design is identical either way.
4. `enter_api_key` action: opens the existing credential flow (Electron `safeStorage` bridge / SettingsModels path) — credential storage is out of scope; the architect wires the action to the existing surface, AM4 does not build new storage.
