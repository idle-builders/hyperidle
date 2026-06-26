# AO1 — Filesystems Settings section (the single design)

**DESIGN-CLASS = routine (extract).** This is not a novel surface. "List / attach /
inspect a thing in Settings" is an already-established pattern (Connections-class
sections: Harnesses, Models, Agents). Filesystems is the next section in that
family — extracted from the existing grammar, not invented. There is ONE design.
No multi-variant exploration: a routine extraction does not fork.

## Extracted from

The Settings-section pattern, sibling to the dense-list section
**SettingsHarnesses** (the closest sibling — "Agent backends"). Grammar lifted
verbatim:

- outer wrapper `flex flex-col gap-[12px]`;
- a per-group uppercase section-label header (`text-[11px] font-[600] uppercase
  tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]`) with a trailing
  ghost `+ Attach` Button — the "PROVIDERS / Refresh" header shape;
- ONE `--surface-elevated` bordered container per group with `h-px` hairline row
  dividers and `overflow-hidden` — the AM4 "Agent backends" container rule
  (`docs/ui-design/settings-consistency.md` § Agent backends);
- inline Inspect-expand below a row, mirroring SettingsAgents / SettingsModels
  inline edit-expand.

## Reused components / primitives (zero new shapes)

| Need | Reused | Source |
|---|---|---|
| State indicator | `StatusChip` | DS — as Models/Agents/Worker use it |
| Kind / role label | `Tag` | DS — as SettingsAgents tags `role` |
| Inspect field grid | `KeyValue` | DS — the catalogued labeled-pair primitive |
| Row / group actions | `Button variant="ghost" size="sm"` | DS — as every Settings section |
| Group container + dividers | raw `--surface-elevated` + `h-px` hairline | extracted from SettingsHarnesses.tsx |

**Deleted bespoke shapes:** `KindMark` (no per-row mark exists in the sibling
sections — `Tag` carries the kind) and `InspectField` (replaced by `KeyValue`).

## State → StatusChip

- `reachable` → `healthy` (green) "Reachable"
- `needs_attention` → `behind` (amber) "Needs attention"
- `attached` (created, unchecked) → `unknown` (neutral grey) "Attached"

Matches the settings-consistency StatusChip color=meaning table (amber = the one
attention/degraded color; never blue for an unreachable filesystem).

## Inspect grid (Filesystem ⟂ Connection)

Inline expand renders a `KeyValue` grid split into two clusters by a hairline:

- **Resource & files** — Kind / Resource / Branch / Write-back.
- **Auth & connection** — Connection / State.

The hairline + cluster labels keep the auth axis visibly apart from the files
axis (the concept's Filesystem ⟂ Connection hard rule), without inventing a
component. Maps to `GET /api/filesystems/:id`.

**Known KeyValue tradeoff (one line):** `KeyValue` renders its value at 15px
**sans** (`KeyValue.tsx:23`), so mono identifiers (resource/branch) read sans in
the inspect grid. Accepted — reusing the catalogued primitive beats a bespoke
mono field; the row title still carries the mono resource for identity.

## States rendered

Populated + a needs_attention row only (per AC). Skeleton / empty / error are
deferred to build and reuse Settings conventions (`SkeletonList`,
`EmptyState compact`, `ErrorState compact`).

## Human design review

**No `/human-design-review`.** Routine extraction of an established Settings
pattern — no novel design decision for a founder to annotate. The founder's
correction (stop showing variants for a solved Settings pattern) is exactly this
classification.

## Story (design source of truth)

`packages/web/src/settings/SettingsFilesystems.stories.tsx` →
`SettingsFilesystems` / `Populated` ("Filesystems — by agent (Settings section)").
Viewer: `:8098` → Settings → SettingsFilesystems.
