DESIGN-CLASS: novel  ref=none  pattern=none

# AM4 — Harness detection & onboarding — design brief

## What the user is doing

A founder, at or near first run, wants to know **which agent backends this machine can actually use right now**, and to get any present-but-unauthenticated one over the line with one obvious action — without a config hunt. Secondarily (and on demand later) they manage this from Settings: enable/disable a backend and inspect its declared models/capabilities.

The decision the user makes per backend: *"Is this usable? If not, what's the one thing I do next?"* Everything else (models, runtime caps) is reference, surfaced on demand.

## Fixed inputs (not re-litigated)

- **Concept:** inherits AM2's capability descriptor — readiness states `missing | installed | unauthenticated | ready | unavailable` (`unknown` tolerated), access mode `api-gateway | provider-subscription-cli | external-byo`, auth action kinds `enter_api_key | native_cli_login | none`. The surface RENDERS this; it does not redefine it.
- **Hard contract — descriptor-driven, zero per-backend branching.** Status, version, auth-step, models, capabilities all come from `HarnessCapabilityDescriptor`. No `if (type === "codex")` in the surface. The renderer maps `discovery.state` → presentation and `authAction.kind` → CTA copy generically.
- **No color/token changes.** Hearth tokens as-is. Status colors come from the existing `StatusChip` status mapping.
- **Scope:** native + external BYO (AM2 locked). In-scope kinds surfaced: `builtin`, `codex`, `claude-code`, `opencode`; `cursor-agent` appears as `unavailable` (no install CTA — there is nothing to install).
- **Out of scope:** credential storage mechanics (surface auth STATUS + the actionable next step only); the dial-in (AM3); the descriptor itself (AM2).

## Data shape rendered (per backend)

```
HarnessCapabilityDescriptor {
  type, name, kind,
  accessMode,                 // → "API key" vs "CLI login" framing
  authAction { kind, label, command?, credentialNames?, description? },
  discovery { state, version?, reason? },   // THE status signal
  models: HarnessModelDescriptor[],         // reference, on demand
  runtime: HarnessRuntimeCapabilities,      // reference, on demand
}
```

## Readiness → presentation mapping (generic, descriptor-driven)

| `discovery.state` | StatusChip | Primary affordance | Enable toggle |
|---|---|---|---|
| `ready` | healthy (green) "Ready" | none (or "Configure") | on, editable |
| `unauthenticated` | behind (amber) "Sign in needed" | render `authAction.label` as the CTA | disabled until auth |
| `installed` | behind (amber) "Auth unknown" | `authAction.label` CTA | disabled |
| `missing` | paused/blue "Not installed" | install hint from `discovery.reason` (no enable) | absent |
| `unavailable` | paused/grey "Unavailable" | none — show `discovery.reason`, NO install CTA | absent |

The CTA is always `authAction.label` (e.g. "Enter API key", "Log in to Codex"). For `native_cli_login` it reveals the `command` (e.g. `codex login`) as copyable mono text — HyperIdle surfaces the step; the CLI owns the secret. This is the "actionable next step, not a silent failure" requirement, rendered generically.

## Reuse inventory (Phase 0b — hard gate)

| Needed element | Renders via | Status |
|---|---|---|
| Backend status badge (ready/needs-auth/missing) | `StatusChip` (status mapping: healthy/behind/paused) | reuse — needs a `HarnessReadinessState → Status` mapper (small pure fn, lives with status-mapping family) |
| Version / access-mode / provider metadata | `KeyValue` (inline + stacked) | reuse |
| Models / capabilities reference list | `KeyValue` rows inside a `Fold` (collapsed by default — progressive disclosure) | reuse |
| Auth CTA button | `Button` (variant primary for the auth action, ghost for secondary) | reuse |
| CLI command to copy | mono text block (same idiom as SettingsModels baseUrl) + `Button` ghost "Copy" | reuse (compose) |
| Enable/disable | `Toggle` | reuse |
| Section title | `SectionLabel` / existing `SectionTitle` pattern in SettingsPage | reuse |
| Empty / nothing-detected | `EmptyState` | reuse (deferred to build per memory) |
| Backend identity (icon/initial) | text name only — descriptor has `name`; no per-backend icon (would be a per-backend branch) | none/NEW avoided |

**No `NEW` design-system component is strictly required.** The open question is the *web-surface composition* (`SettingsHarnesses` section + a per-backend row/card sub-component in `packages/web/src/settings/`), which is a web composition, not a DS primitive. Variants explore that composition's shape. If a per-backend block earns promotion to DS it is `HarnessCard`-like, but the budget-respecting default composes existing primitives.

## Open axis (decided by rendered variants)

How the detection results + status + auth + capabilities + enable/configure read and where the verbs live:
- A: dense **status table/list** (SettingsModels-tier-row lineage) — scan-all-at-once.
- B: **readiness-grouped checklist** optimized for the first-run "get to working" task — the unfinished ones float up with their one action.
- C: **per-backend card stack** (t3code Providers lineage) — each backend is a self-contained card with status header, auth zone, and a capabilities fold.

## Constraints carried into critique

- Descriptor-driven: a reviewer must not find a `type ===` branch in the rendered output logic.
- One interaction grammar: the auth CTA is the same affordance shape across all backends; only copy differs (from `authAction`).
- Density over whitespace: power-user settings surface; 12px padding default; no hero, no centered layout, no card grid bloat.
- Same-machine real states in the story: `builtin` ready, `claude-code` ready (version 2.1.170), `codex` unauthenticated (`codex login`), `opencode` installed/unknown-normalization, `cursor-agent` unavailable. (Initial design renders the populated REAL state only — no skeleton/error/empty; those defer to build.)
