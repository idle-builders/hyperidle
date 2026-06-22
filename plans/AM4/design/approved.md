# AM4 — Approved design

DESIGN-CLASS: novel (see brief.md) → after `/design-critique`, this triggers `/human-design-review`.

## Chosen: Variant C — Provider cards + synthesis pulls

A vertical single-column stack of uniform backend cards. Rendered story: `packages/web/src/settings/AM4HarnessVariantC.stories.tsx` (`Settings/AM4 Harnesses · C Cards`). Screenshot: `plans/AM4/design/c-cards/screenshot.png`.

**Pulled in:** header readiness counts (from B), actionable-first card ordering (from B), copyable mono command inside the auth zone (from A/C).

## Design-it-twice resolutions (post-critique — bind before build)

Two findings from `design-critique.md` + the architecture-critique enable/disable ruling are resolved here. The variant C story (`AM4HarnessVariantC.stories.tsx`) and the `harness-presentation` mapper spec below already reflect these.

### R1 — Toggle → non-interactive "Enabled" indication, ready-only

**Decision:** there is NO interactive toggle and NO persisted `harness.disabled` state. A ready backend shows a quiet, non-interactive **"Enabled"** label (12px/500, `--accent-primary`) right-aligned in the header. Non-ready states (`unauthenticated`/`installed`/`missing`/`unavailable`) show **no indication at all** — the auth CTA is the sole affordance.

**Why (design-it-twice):**
- *Considered:* a flippable `Toggle`, on for ready / disabled-off elsewhere (the original design). *Rejected:* (a) a disabled switch next to "Sign in needed" reads as a broken control, not "auth unlocks this" (design-critique WARNING 1); (b) nothing in the runtime consumes an on/off flag — `AdapterPool.select()` gates on capacity / modelProviders / harnessType only (architecture-critique ruling) — so a flippable switch would lie. A control nothing backs is worse than no control.
- *Chosen:* readiness-derived, non-interactive. "Enable" = complete the auth action (→ ready); "Enabled" is then a truthful status, not a promise of a flag. B1 (a real persisted toggle) is a follow-up ONLY when a runtime consumer exists. `@lore` recorded at the mapper.

### R2 — Capabilities Fold shows proven caps only (honest production shape)

**Decision:** the fold renders declared models, then **only the runtime capabilities that are `true`** as a single "Capabilities" line. When no runtime cap is proven (the production shape), it renders **"Capabilities confirmed after first run"** instead of a row-per-cap wall of "No".

**Why:** production discovery does NOT run the session probe (AM2 `@lore`); re-detect doesn't either (same probe gating). Real `ready` backends therefore return runtime caps **all-`false`**. The original fixtures masked this by hardcoding `true`; the fixtures + story now render the all-`false` production shape, and "File editing: No / MCP: No / Sub-agents: No" never appears (it read as a degraded backend — design-critique WARNING 2, arch-critique WARNING re: runtime caps). Fold visibility is itself descriptor-driven via a `hasCaps(d)` mapper (models OR any proven cap) — addresses the SUGGESTION that the old inline `hasCaps` omitted `toolUse`/`subAgents`.

## The card anatomy (uniform chrome, descriptor-conditional zones)

Each backend = one `--surface-elevated` card, `--shadow-default`, 18px padding, 12px gap between cards, `--r-default` radius, 680px max-width column, left-aligned.

1. **Header row** — `name` (17px/500) + `StatusChip` (readiness) · subline = access-mode label + `· v{version}` (mono) when present · right-aligned non-interactive **"Enabled"** label when `showsEnabledIndication(d)` (ready only; see R1).
2. **Auth zone** — rendered ONLY when `hasActionableNextStep(d)`. Tinted `--surface-page` inset, `--r-subtle`, 12px padding: one sentence (`authAction.description` or default) + primary `Button` (`authAction.label`) + copyable mono `code` command (from `authAction.command`). This is the "actionable next step, not a silent failure" AC, made unmissable.
3. **Unavailable zone** — rendered ONLY when `state === "unavailable"`. Same tinted inset, `discovery.reason`, NO CTA (nothing to install/sign-in).
4. **Capabilities Fold** — rendered ONLY when `hasCaps(d)` (declares models OR proves any runtime cap). `Fold` ("Models & capabilities · Show"), collapsed by default; expands to `KeyValue` model rows by provider, then a single "Capabilities" line of proven caps OR the "confirmed after first run" line (see R2). Progressive disclosure.

Card order: `unauthenticated` → `installed` → `ready` → `missing` → `unavailable` (actionable first).

## Descriptor-driven contract (HARD — reviewer must verify)

All presentation routes through `packages/web/src/settings/AM4HarnessPresentation.ts` mappers — `readinessToStatus`, `accessModeLabel`, `hasActionableNextStep`, `showsEnabledIndication`, `hasCaps`, `provenCapabilities`, `commandText`, `capabilitySummary`. **There is no `type === "codex"` (or any family) branch in the rendered surface.** Every zone's presence is computed from `discovery.state` + `authAction.kind`. (`isEnableable`/`showsToggle` were removed in R1 — no interactive toggle.) The builder lifts this file into production; the readiness→`Status` half belongs with the design-system `status-mapping` family (it is a reusable mapping, not AM4-specific).

## Readiness → presentation

| `discovery.state` | StatusChip status / label | Auth zone | "Enabled" indication | Capabilities Fold |
|---|---|---|---|---|
| `ready` | healthy / "Ready" | no | yes (non-interactive label) | yes (if `hasCaps`) |
| `unauthenticated` | behind / "Sign in needed" | yes (CTA + command) | no | if `hasCaps` |
| `installed` | behind / "Auth unknown" | yes (CTA + command) | no | if `hasCaps` |
| `missing` | paused / "Not installed" | no (build: install hint from `reason`) | no | no |
| `unavailable` | unknown(grey) / "Unavailable" | unavailable zone (reason, no CTA) | no | no |

Note: with the production shape (runtime caps all-`false`), a `ready` card's fold still renders because the descriptor declares models (`hasCaps` is models OR proven cap); the cap line falls back to "confirmed after first run" (R2).

Auth CTA copy is always `authAction.label`. `native_cli_login` → reveal + copy `command` (HyperIdle surfaces the step; the CLI owns the secret — no token harvesting). `enter_api_key` → build opens a credential input (credential STORAGE is AM4-out-of-scope; surface the action + status only).

## Component mapping (all reuse — no new DS primitive required)

| Element | Component | Props/notes |
|---|---|---|
| Status badge | `StatusChip` | `status` from `readinessToStatus`, `label` verbatim |
| Enabled indication | plain `<span>` | non-interactive, 12px/500 `--accent-primary`, rendered when `showsEnabledIndication(d)` (ready only). NOT a `Toggle` (R1) |
| Auth CTA | `Button` | `variant="primary" size="sm"`, children = `authAction.label` |
| Copy command | mono `code` block (SettingsModels idiom) + build adds ghost "Copy" `Button` | `commandText(d)` |
| Capabilities reveal | `Fold` | `label`, `cta` Show/Hide, local open state; visible when `hasCaps(d)` |
| Model rows | `KeyValue` | inline layout, one per declared model |
| Capability line | `KeyValue` (inline) when `provenCapabilities(d)` non-empty, else quiet `<span>` "Capabilities confirmed after first run" (R2) | never a per-cap Yes/No grid |
| Header counts | plain text subline | from descriptor counts |
| Empty / loading / error | `EmptyState` / `SkeletonList` / `ErrorState` | DEFERRED to build (sibling settings sections pattern) |

## States with copy

- **Populated** (designed): see screenshot.
- **Loading** (build): `SkeletonList rows={3}` — match SettingsAgents.
- **Error** (build): `ErrorState compact title="Couldn't detect backends" onRetry`.
- **Empty / nothing detected** (build): `EmptyState` "No agent backends detected" + the builtin always-present note (builtin is `api-gateway`, always emitted).
- **All ready** (build): header reads "{n} ready · 0 need sign-in"; no auth zones render — naturally handled by the conditional.

## Behavior · motion · keyboard

- Fold expand: `--motion-default`. No other motion. Card hover: none (settings cards are not navigational — do NOT add the AQ-010 lift; these are configuration surfaces, not clickable cards).
- The "Enabled" indication is a non-interactive label (R1) — not focusable, not a `role=switch`. It is purely a readiness echo.
- Tab order: top-down, auth CTA → copy → fold per card (no toggle in the order).
- Focus: control-ring on Button/Fold (DS default).

## Mobile (three-tab layout)

Settings is reached from the mobile Settings surface; cards go full-width, 12px gutter, the "Enabled" label stays on the header row (it is short, non-interactive), auth-zone buttons wrap. Inputs (build's API-key entry) ≥16px font (AQ-005).

## Placement / where it lives

A new `SettingsHarnesses` section + `HarnessCard` sub-component in `packages/web/src/settings/`, registered in `SettingsPage.tsx` as a stacked section ("Agent backends") near Models/Agents. First-run: `SetupFlow` links to or embeds the detection summary (architect decides the read path; the surface is the same component). The story renders the section bare for review.

## Open questions for the architect

1. Read path: `SettingsHarnesses` fetches `GET /api/harnesses` on mount (same as SettingsAgents) → `HarnessCapabilityDescriptor[]`. Confirm no new endpoint needed (it isn't — AM2 ships it).
2. **RESOLVED (R1 + arch-critique ruling):** no persisted `enabled` state. "Enabled" is derived from `discovery.state === "ready"` and rendered as a non-interactive label, not a toggle. No runtime consumes a disable flag, so persisting one would be dead state. B1 (persisted per-harness flag) is a future follow-up gated on a real runtime consumer.
3. First-run entry: does `SetupFlow` embed the section or link to Settings? Architect decides; design is identical either way.
4. `enter_api_key` action: opens the existing credential flow (Electron `safeStorage` bridge / SettingsModels path) — credential storage is out of scope; the architect wires the action to the existing surface, AM4 does not build new storage.
