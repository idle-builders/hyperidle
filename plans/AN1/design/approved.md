# AN1 — Connections settings surface · APPROVED design

`DESIGN-CLASS: routine` · human-design-review = **No** · single variant (adapted from founder-approved #353 `VariantAInheritedDefault`).

This is the input contract to `/architecture`. The architect does NOT re-decide hierarchy, component vocabulary, or copy.

## The surface
A new **Connections** section in the stacked Settings page (`packages/web/src/pages/SettingsPage.tsx`), rendered by `packages/web/src/settings/SettingsConnections.tsx`. Rendered story: `packages/web/src/settings/SettingsConnections.stories.tsx` → `Populated` ("Connections — Inherited-default (grouped by source)"). Confirmed painting in the viewer at `:8098`/`:8099` (`plans/AN1/design/screenshot.png`).

## Information hierarchy
1. **Header** — `<h2>Connections</h2>` + subtitle: *"External services your agents can use. A secret you paste is stored encrypted and never shown back — your agents' tools use it to authenticate."* Right-aligned `Button variant="secondary" size="sm"` → "+ Add connection".
2. **Group 1 — "Inherited from your environment"** (FIRST — the first-class signal). `SectionLabel` with `trailing` = "Auto-detected". Help: *"Tools your harness and CLIs are already logged into. HyperIdle stores nothing — auth lives where you set it up."* Rows are **not removable** (no overflow menu); health chip suppressed when `working` (shown only if `needs-attention`).
3. **Group 2 — "Connected with a token"**. Help: *"An API key or PAT you generated. Stored encrypted, resolved server-side so your agents' tools can authenticate."* Rows removable; health chip always shown.
4. **Group 3 — "Connected via an MCP server"**. Help: *"A remote MCP server that owns its own sign-in. HyperIdle registers no app and never appears on the consent screen."* Rows removable; health chip always shown.

Within each group, rows sort by severity: `needs-attention` floats above `working`, then alphabetical.

## Row anatomy (`Row`)
- `lead` — `ServiceMark` (inline 28×28 rounded `--r-subtle` span, 2-letter service initials, `--surface-container`). Neutral, NOT a branded logo.
- `title` — service display name (plain text; **no trust tag**).
- `subtitle` — `{via}` + optional `· {authNote}`:
  - `token` → "Stored encrypted · resolved server-side"
  - `mcp` → "Auth held by the MCP server"
  - `inherited` → no note (HyperIdle stores nothing)
- `actions` — `StatusChip` (when shown) + overflow `Button`(ghost)→`Menu` with a single destructive **Remove** (held rows only). Remove is a two-click confirm ("Remove" → "Confirm?"/"Cancel") — the established `SettingsAgents` destructive pattern.

## Component mapping
| Slot | Component | Props of note |
|---|---|---|
| Group heading | `SectionLabel` | `label`, `trailing` (inherited only) |
| List | `ItemList` | `variant="contained"`, `isEmpty` |
| Row | `Row` | `lead`, `title`, `subtitle`, `actions` |
| Health | `StatusChip` | `status`: `working→"healthy"`, `needs-attention→"behind"`; `label`: "Working" / "Needs attention" |
| Overflow | `Button`(ghost,sm) + `Menu` | single `Remove` item, `destructive: true` |
| Add | `Dialog` + `Select` + `Input` + `Button` | source `Select` `{token, mcp}` |
| Loading (build) | `SkeletonList` | `rows={3}` |

**New design-system shapes: zero.**

## Add-connection dialog (`Dialog size="md"`)
- Intro: *"Tools your harness is already logged into appear automatically — nothing to add here. Use this to add a token or point at an MCP server."*
- `Select` "Source": `Paste a token (API key / PAT)` | `Point at an MCP server`. (No `inherited` option — inherited is reflected, never created.)
- **token branch:** `Input` Service (e.g. Stripe), `Input` Token (`type="password"`), note: *"Stored encrypted and resolved server-side. Your agents' tools use it to authenticate; it is never shown back here."*
- **mcp branch:** `Input` Service (optional), `Input` MCP server URL (`https://…`), note: *"The server owns its own sign-in. HyperIdle registers no app and never appears on a consent screen."*
- Footer: `Cancel` (ghost) / `Add` (primary). POST `/api/connections`; on success close + reload; on error show inline message (`409` → "Connection already exists").

## States
- **Populated** — the rendered story (three groups). Primary state.
- **Loading** — `SkeletonList rows={3}` (production scaffold; not in the design story per scope).
- **Error** — inline "Couldn't load connections — please try again." + Retry ghost button (production scaffold).
- **Empty group** — `ItemList isEmpty` renders nothing extra; a group with zero rows still shows its heading + help (so the user sees the category exists). In practice the inherited group is rarely empty.
- **Remove failure** — `role="alert"` line "Couldn't remove connection — please try again."; the row stays listed.

## Behavior / motion / keyboard
- Overflow menu: `Menu` owns focus-trap + Esc-close (existing primitive). Two-click destructive confirm inline.
- Dialog: `Dialog` owns focus-trap, Esc, backdrop. No custom motion beyond primitive defaults (`--motion-*`).
- No keyboard-verb shortcuts (TRACK rejection list).

## Mobile adaptation
Settings is one scrollable column; the Connections section stacks like every other panel. `Row` already reflows (title/subtitle wrap, actions stay right). Touch targets ≥44px via the standard `Button`/`Menu` sizing. No separate mobile layout.

## Rejected (do not re-litigate — see brief.md for full reasoning)
- Flat list with per-row source tag (hides the held-vs-inherited split).
- Per-service branded "Connect with X" OAuth-app catalog (HyperIdle is never an OAuth provider).
- Group-level rollup attention chip (per-row chip is the single signal).
- Trust-tier badge (killed by ETHOS §2).
- `toolCount` column (no AN1 signal; AN2 may revisit).

## Open questions for the architect
- **Response type `ServiceConnectionView`** — fields the UI binds: `id, service, via, authSource, health, removable`. `via` is server-constructed (never a raw URL/secret echo). Define in `@hyperidle/shared` (`connection.ts`).
- **Inherited rows** are projected live (not DB rows); their `id` is a derived non-DB sentinel (`inherited:<harness>:<server-or-cli>`), `removable: false`. DELETE on such an id must 404.
- **Health on a freshly-created token** = `needs-attention` (unvalidated) until `POST /api/connections/:id/validate` upgrades it to `working`.
- Section placement in `SettingsPage.tsx` (suggest after "Agent backends", before "Assistant" — adjacent to harness config).
