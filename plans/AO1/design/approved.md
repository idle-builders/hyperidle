# AO1 — approved design (input contract to /architecture)

> **DESIGN-CLASS = routine (extract).** A routine extraction of an already-
> established Settings-section pattern. **No `/human-design-review`** — there is no
> novel decision to annotate. See `plans/AO1/design/design.md` for the full
> extraction record (what was reused, what bespoke shapes were deleted).

## The single design

A new Settings section **Filesystems**, structurally a sibling of the existing
dense-list Settings sections (Harnesses / Models / Agents). Team-scoped;
filesystems **grouped by agent**. The Settings grammar already solves "list /
attach / inspect a thing"; this section reuses it without invention.

**Story (design source of truth):**
`packages/web/src/settings/SettingsFilesystems.stories.tsx` →
`SettingsFilesystems` / `Populated` ("Filesystems — by agent (Settings section)").
Viewer: `:8098` → Settings → SettingsFilesystems.

## Component mapping (zero new shapes — all extracted)
- Section intro: flat `<p>` (12/tertiary) lede — the SettingsModels intro shape.
- Per-agent group header: uppercase section label (`text-[11px] font-[600]
  tracking-caps-sm tertiary`) + `Tag label={role}` + trailing ghost `+ Attach`
  Button — the SettingsHarnesses "PROVIDERS / Refresh" header.
- Group container: ONE `--surface-elevated` bordered box, `overflow-hidden`,
  `h-px` hairline row dividers — the AM4 Agent-backends container.
- Row: mono resource + mono `@branch` + `Tag label={kind}` title line;
  connection/attention subtitle (12/tertiary); trailing `StatusChip` +
  ghost `Inspect` (aria-expanded/-controls) + ghost `Detach`.
- Inspect (inline expand): `KeyValue` grid (Kind / Resource / Branch /
  Write-back / Connection / State) split into a **Resource & files** cluster and
  an **Auth & connection** cluster divided by a hairline — Filesystem ⟂
  Connection visibly separate. Maps to `GET /api/filesystems/:id`.

## State→StatusChip mapping
- `reachable` → `healthy` (green) "Reachable"
- `needs_attention` → `behind` (amber) "Needs attention"
- `attached` (created, not yet checked) → `unknown` (neutral grey) "Attached"

## States (this WP renders only populated + needs_attention; rest deferred to build)
- **Populated** — shown.
- **needs_attention** — shown (amber chip; subtitle names the reason).
- **Empty / loading / error** — deferred to build; reuse Settings conventions
  (`EmptyState compact`, `SkeletonList`, `ErrorState compact` —
  `docs/ui-design/settings-consistency.md`).

## KeyValue tradeoff (noted, accepted)
`KeyValue` renders its value at 15px **sans** (`KeyValue.tsx:23`); mono
identifiers read sans in the inspect grid. Accepted — reusing the catalogued
primitive over a bespoke mono field. The row title carries the mono resource.

## Rejected (do not re-litigate)
- **Multi-variant exploration** — this is a routine Settings extraction; it does
  not fork. (The earlier A/B/C variants + comparison/synthesis were removed.)
- **Bespoke `KindMark` / `InspectField`** — removed; `Tag` carries the kind,
  `KeyValue` carries the inspect fields.
- **Attach wizard / dialog as a novel grammar** — `+ Attach` follows the existing
  Settings add affordance; attach form detail is a build concern, not a new
  interaction grammar.

## Notes for the architect
- Binds to the AO1 wire `Filesystem` type + routes (`plans/AO1/architecture.md`
  §1, §3). Inline inspect → `GET /api/filesystems/:id`; list →
  `GET /api/filesystems?teamId&agentUserId`; attach → `POST`; detach → `DELETE`.
- Agent display name + role for the group header come from the existing
  agent/users surface (join in the list response, or a second fetch as
  SettingsAgents does). Architecture to confirm join vs. second fetch.
