# AO1 — Filesystems: two Settings surfaces (registry + per-bot injection)

**DESIGN-CLASS = routine (extract).** Not a novel surface. "List / register /
inspect a thing in Settings" and "configure a per-bot attribute from a registry"
are already-established patterns (SettingsHarnesses, SettingsModels,
SettingsAgents). Filesystems is the next section in that family — EXTRACTED from
the existing grammar, not invented. No multi-variant exploration: a routine
extraction does not fork.

## The corrected IA (founder correction)

A filesystem is **registered once** (team-scoped, first-class `source`) and
**injected per-bot** — parallel to connect-once-then-inject-per-agent. So TWO
surfaces, each extracted from an existing Settings pattern:

1. **Settings → Filesystems** — the team's **registry** (flat list, NOT grouped
   by bot).
2. **Per-bot injection** — on the bot's config in **Settings → Agents** — which
   registered filesystems are injected into THIS bot.

The earlier "by agent" grouping was the wrong model and is removed.

## Surface 1 — Settings → Filesystems (registry)

`SettingsFilesystems.stories.tsx` → `Populated` (storyName
**"Filesystems registry (Settings section)"**). Viewer: `:8099/#SettingsFilesystems`.

A **flat list of the team's registered filesystems** in ONE bordered container.
Grammar lifted verbatim from `SettingsHarnesses` (closest dense-list sibling):

- outer `flex flex-col gap-[12px]`;
- ONE uppercase section-label header ("REGISTERED FILESYSTEMS",
  `tracking-caps-sm`, `text-tertiary`) with a trailing ghost **`+ Add filesystem`**
  Button — the "PROVIDERS / Refresh" header shape;
- ONE `--surface-elevated` bordered container with `h-px` hairline row dividers,
  `overflow-hidden` — the AM4 "Agent backends" container rule;
- inline **Inspect**-expand below a row, mirroring SettingsAgents/SettingsModels
  inline edit-expand.

Each row prominently leads with its **`source`** mark, then resource (mono) + kind
tag + injection count + `StatusChip` state (incl. `needs_attention`, floated to
top, expanded by default).

### Reused components (zero new shapes)

| Need | Reused | Source |
|---|---|---|
| **`source` mark** (the easy-to-detect badge) | **`Tag`** | DS — the catalogued type/source chip the agent surfaces use to mark type (role). **No logo/provider component exists in the DS; `Tag` IS the mark** — reused, not hand-rolled. |
| Kind label | `Tag` (neutral) | DS — as SettingsAgents tags `role` |
| State indicator | `StatusChip` | DS — as Models/Agents/Worker use it |
| Inspect field grid | `KeyValue` | DS — the catalogued labeled-pair primitive |
| Row / header actions | `Button variant="ghost" size="sm"` | DS — as every Settings section |
| Container + dividers | raw `--surface-elevated` + `h-px` hairline | extracted from SettingsHarnesses.tsx |

**Why `Tag` for `source`:** the prompt asked to reuse the existing source/provider
mark. The DS has **no** provider-logo component — `HarnessCard` marks state with a
status dot and type with plain text; `SettingsAgents` marks `role` with `Tag`. The
established "easy-to-detect type mark" in Settings is therefore `Tag`. Reusing it
(one `Tag` leading each row, carrying the humanized `source`) is faithful to
"reuse, don't hand-roll." No bespoke `KindMark`/`InspectField`.

### State → StatusChip

- `reachable` → `healthy` (green) "Reachable"
- `needs_attention` → `behind` (amber) "Needs attention"
- `attached` (created, unchecked) → `unknown` (neutral grey) "Attached"

Amber is the one attention/degraded color; never blue for an unreachable
filesystem (settings-consistency color=meaning table).

### Inspect grid (Filesystem ⟂ Connection)

Inline expand renders a `KeyValue` grid split into two clusters by a hairline:

- **Resource & files** — Source / Resource / Branch / Kind / Write-back.
- **Auth & connection** — Connection / State.

The hairline + cluster labels keep the auth axis visibly apart from the files
axis (the concept's Filesystem ⟂ Connection hard rule), without inventing a
component. Maps to `GET /api/filesystems/:id`.

**Known KeyValue tradeoff (one line):** `KeyValue` renders its value at 15px
**sans** (`KeyValue.tsx:23`), so mono identifiers (resource/branch) read sans in
the inspect grid. Accepted — reusing the catalogued primitive beats a bespoke mono
field; the row title still carries the mono resource for identity.

## Surface 2 — Per-bot injection (Settings → Agents)

`SettingsAgents.tsx` (the per-agent edit/add form) + `SettingsAgents.stories.tsx`
→ `FilesystemInjection` (storyName **"Per-bot Filesystems injection"**). Viewer:
`:8099/#SettingsAgents`.

A **"Filesystems"** injection control added to the bot's config form, mirroring how
Harness/Model are configured — a labeled control drawn from a registry. Because
injection is many-valued it is an **add-remove list**, not a single Select:

- a uppercase **"FILESYSTEMS"** sub-label + one-line helper pointing to
  Settings → Filesystems;
- currently-injected filesystems render as removable rows in a bordered list,
  each **led by its `source` `Tag`** (same mark as the registry) + mono resource +
  kind tag + ghost **Remove**;
- a `Select` ("Inject a filesystem" / "Add from registry…") appends the next
  un-injected registered filesystem.

Reuses `Select` + `Tag` + `Button` — no bespoke multiselect. The control lives in
both the edit form and the add form. `AgentConfig` gains `filesystemIds?: string[]`
(the per-bot injection mapping); the PATCH/POST bodies carry it.

### Component-budget note (story-only, non-bespoke)

The injection control is composed inline in `SettingsAgents.tsx` from existing DS
primitives (`Select`/`Tag`/`Button`) — it is NOT a new catalogued component. The
story-file `Frame` wrapper exists only so the section paints in the viewer
(`SettingsAgents` calls `useToast()`, which throws outside `<ToastRegion>` — a
pre-existing condition; the story now wraps every variant in `ToastRegion`).

## States rendered

Populated only — registry with a few filesystems incl. one `needs_attention`; a
bot with 2 injected filesystems. No skeleton / empty / error here — those reuse
Settings conventions at build (`SkeletonList`, `EmptyState compact`,
`ErrorState compact`).

## Human design review

**No `/human-design-review`.** Routine extraction of two established Settings
patterns (dense-list section + per-bot registry-config) — no novel design
decision for a founder to annotate.

## Stories (design source of truth)

- `packages/web/src/settings/SettingsFilesystems.stories.tsx` → `Populated`
  ("Filesystems registry (Settings section)") — `:8099/#SettingsFilesystems`.
- `packages/web/src/settings/SettingsAgents.stories.tsx` → `FilesystemInjection`
  ("Per-bot Filesystems injection") — `:8099/#SettingsAgents`.
