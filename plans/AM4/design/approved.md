# AM4 — Approved design

DESIGN-CLASS: novel (see brief.md) → after `/design-critique`, this triggers `/human-design-review`.

## Chosen: Variant C — Provider cards + synthesis pulls

A vertical single-column stack of uniform backend cards. Rendered story: `packages/web/src/settings/AM4HarnessVariantC.stories.tsx` (`Settings/AM4 Harnesses · C Cards`). Screenshot: `plans/AM4/design/c-cards/screenshot.png`.

**Pulled in:** header readiness counts (from B), actionable-first card ordering (from B), copyable mono command inside the auth zone (from A/C).

## The card anatomy (uniform chrome, descriptor-conditional zones)

Each backend = one `--surface-elevated` card, `--shadow-default`, 18px padding, 12px gap between cards, `--r-default` radius, 680px max-width column, left-aligned.

1. **Header row** — `name` (17px/500) + `StatusChip` (readiness) · subline = access-mode label + `· v{version}` (mono) when present · right-aligned `Toggle` ("Enable {name}") when `showsToggle`.
2. **Auth zone** — rendered ONLY when `hasActionableNextStep(d)`. Tinted `--surface-page` inset, `--r-subtle`, 12px padding: one sentence (`authAction.description` or default) + primary `Button` (`authAction.label`) + copyable mono `code` command (from `authAction.command`). This is the "actionable next step, not a silent failure" AC, made unmissable.
3. **Unavailable zone** — rendered ONLY when `state === "unavailable"`. Same tinted inset, `discovery.reason`, NO CTA (nothing to install/sign-in).
4. **Capabilities Fold** — rendered ONLY when the descriptor declares models/caps. `Fold` ("Models & capabilities · Show"), collapsed by default; expands to `KeyValue` rows (models by provider, file-editing/MCP/sub-agents). Progressive disclosure.

Card order: `unauthenticated` → `installed` → `ready` → `missing` → `unavailable` (actionable first).

## Descriptor-driven contract (HARD — reviewer must verify)

All presentation routes through `packages/web/src/settings/AM4HarnessPresentation.ts` mappers — `readinessToStatus`, `accessModeLabel`, `hasActionableNextStep`, `isEnableable`, `showsToggle`, `commandText`, `capabilitySummary`. **There is no `type === "codex"` (or any family) branch in the rendered surface.** Every zone's presence is computed from `discovery.state` + `authAction.kind`. The builder lifts this file into production; the readiness→`Status` half belongs with the design-system `status-mapping` family (it is a reusable mapping, not AM4-specific).

## Readiness → presentation

| `discovery.state` | StatusChip status / label | Auth zone | Toggle | Capabilities Fold |
|---|---|---|---|---|
| `ready` | healthy / "Ready" | no | on, editable | yes (if caps) |
| `unauthenticated` | behind / "Sign in needed" | yes (CTA + command) | shown, disabled | if caps declared |
| `installed` | behind / "Auth unknown" | yes (CTA + command) | no | if caps declared |
| `missing` | paused / "Not installed" | no (build: install hint from `reason`) | no | no |
| `unavailable` | unknown(grey) / "Unavailable" | unavailable zone (reason, no CTA) | no | no |

Auth CTA copy is always `authAction.label`. `native_cli_login` → reveal + copy `command` (HyperIdle surfaces the step; the CLI owns the secret — no token harvesting). `enter_api_key` → build opens a credential input (credential STORAGE is AM4-out-of-scope; surface the action + status only).

## Component mapping (all reuse — no new DS primitive required)

| Element | Component | Props/notes |
|---|---|---|
| Status badge | `StatusChip` | `status` from `readinessToStatus`, `label` verbatim |
| Enable | `Toggle` | `on`, `disabled`, `label="Enable {name}"` |
| Auth CTA | `Button` | `variant="primary" size="sm"`, children = `authAction.label` |
| Copy command | mono `code` block (SettingsModels idiom) + build adds ghost "Copy" `Button` | `commandText(d)` |
| Capabilities reveal | `Fold` | `label`, `cta` Show/Hide, local open state |
| Capability rows | `KeyValue` | inline layout |
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
- Toggle is `role=switch`; disabled until `ready`.
- Tab order: top-down, header toggle → auth CTA → copy → fold per card.
- Focus: control-ring on Button/Toggle/Fold (DS default).

## Mobile (three-tab layout)

Settings is reached from the mobile Settings surface; cards go full-width, 12px gutter, toggle drops below the identity line, auth-zone buttons wrap. Inputs (build's API-key entry) ≥16px font (AQ-005).

## Placement / where it lives

A new `SettingsHarnesses` section + `HarnessCard` sub-component in `packages/web/src/settings/`, registered in `SettingsPage.tsx` as a stacked section ("Agent backends") near Models/Agents. First-run: `SetupFlow` links to or embeds the detection summary (architect decides the read path; the surface is the same component). The story renders the section bare for review.

## Open questions for the architect

1. Read path: `SettingsHarnesses` fetches `GET /api/harnesses` on mount (same as SettingsAgents) → `HarnessCapabilityDescriptor[]`. Confirm no new endpoint needed (it isn't — AM2 ships it).
2. Enable/disable persistence: where does "enabled" live? AM2's descriptor has no `enabled` field. Options: (a) derive enabled === any agent uses this harnessType (read-only, no new state); (b) a new per-harness enabled flag persisted server-side. The DESIGN treats the toggle as the affordance; the architect picks the persistence model and may down-scope the toggle to "default/available" display if (b) is too heavy for AM4. Surface this as an explicit architecture decision.
3. First-run entry: does `SetupFlow` embed the section or link to Settings? Architect decides; design is identical either way.
4. `enter_api_key` action: opens the existing credential flow (Electron `safeStorage` bridge / SettingsModels path) — credential storage is out of scope; the architect wires the action to the existing surface, AM4 does not build new storage.
