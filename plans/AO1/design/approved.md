# AO1 — approved design (input contract to /architecture)

> Pre-human-review recommendation. DESIGN-CLASS = **novel** → this is the designer's recommendation; the founder confirms/annotates in `/human-design-review` (viewer `:8098`) before lock. In an autonomous run a novel design parks here.

## Chosen: Variant A — Settings "Filesystems" section, with Variant B's `KeyValue` inspect pulled in.

**Surface.** A new Settings section **Filesystems**, adjacent to **Connections** (AN1). Team-scoped page; filesystems **grouped by agent**. The cleanest expression of the concept's Filesystem ⟂ Connection hard rule: auth (Connections) and files (Filesystems) are matching sibling Settings sections.

**Story (design source of truth):** `packages/web/src/settings/SettingsFilesystems.stories.tsx` → `SettingsFilesystems` / `Populated` ("Filesystems — by agent (Settings section)"). **The inspect is now folded into THIS story** (design-critique CRITICAL-1): each row expands inline into the labeled inspect grid, so `#SettingsFilesystems` renders the full recommended surface + inspect. `AgentFilesystemsInline.stories.tsx` (Variant B) remains as an alternate for `/human-design-review`, not the source of the fold-in.

## Component mapping (zero new shapes)
- Page header: `h2` (20/600) + lede `<p>` (13/secondary) + `Button variant="secondary" size="sm"` ("+ Attach filesystem").
- Per-agent group: `SectionLabel label={agentName} trailing={role + <Button ghost sm>+ Attach</Button>}` + `<p>` (12/tertiary) help/attention caption.
- Attachment list: `ItemList variant="contained"`, rows severity-sorted (needs_attention first).
- Attachment row: `Row` — `lead=<KindMark>` (inline single-use mark, AN1 ServiceMark precedent; `{ }` for code, `¶` for doc_set), `title=` mono resource + mono `@branch` + `Tag label={kind}`, `subtitle=` `Auth via <Connection>` (or `Local · no connection`) · write-back note, `actions=` `StatusChip` + `Menu` (Re-select resource… / Detach).
- **Inspect (folded into A's story):** a row "Inspect" action (`aria-expanded`/`aria-controls`-wired ghost button) reveals an inline labeled grid — Kind / State / Resource / Branch / Write-back / Connection as six fields, split into a **Resource & files** cluster and an **Auth & write-back** cluster divided by a rule (Filesystem ⟂ Connection visibly separate). Identifier values render **mono** via an inline `InspectField` (NOT bare `KeyValue`, whose 15px sans value would break the row-title mono — design-critique MAJOR-1). Maps to `GET /api/filesystems/:id`.
- Attach dialog: `Dialog size="md"` + `Select` (agent, kind, connection) + `Input` (repo, branch / folder), footer `Button ghost` Cancel + `Button primary` Attach. Per-group `+ Attach` pre-fills that agent; page-level button starts unfilled.

## State→StatusChip mapping
- `reachable` → `status="healthy"` (green) "Reachable"
- `needs_attention` → `status="behind"` (amber) "Needs attention"
- `attached` (created, not yet checked) → `status="unknown"` (neutral grey) "Attached"

## All states (this WP renders only populated + needs_attention; rest deferred to build)
- **Populated** — shown. Agent groups with attachments; healthy + needs_attention.
- **needs_attention** — shown. Amber chip; group caption explains; row subtitle/inspect names the reason (connection unresolvable).
- **Empty / loading / error** — deferred to build. Reuse Settings conventions: `EmptyState compact` per group, `SkeletonList`, `ErrorState compact` (per `docs/ui-design/settings-consistency.md`).

## Behavior / motion / keyboard
- Row hover/focus/keyboard from `Row`/`clickableProps` (inherited). Menu = AN1 idiom. Dialog focus-trap from `Dialog`. Motion: dialog open + row-expand use default DS transitions (`--motion-*`). No custom keyboard verbs (founder filter).

## Mobile adaptation
- Three-tab mobile: Filesystems lives under the Settings tab. Groups stack full-width; `Row` trailing cells (branch/writeback) collapse under the title; `StatusChip` + `⋯` stay right-aligned. Attach dialog is full-screen sheet (Dialog mobile behavior).

## Rejected (do not re-litigate)
- **Variant C connection-first wizard as primary** — attach-only; novel Settings wizard grammar; its "browse a connection's repos" step assumes a live remote-repo-listing capability AO1's contract lacks (structural reachability only). Reachability-at-the-connection is already covered by per-row needs_attention.
- **Per-product grouping / portfolio grid** — Product deferred; group by agent.
- **Live remote-branch dropdown** — needs a forge call AO1 doesn't make; branch is a typed Input in v1.

## Open questions for the architect
- The surface binds to the AO1 wire `Filesystem` type + routes already specified in `plans/AO1/architecture.md` (§1, §3) — no new data shape requested. The inline inspect maps to `GET /api/filesystems/:id`; the list to `GET /api/filesystems?teamId&agentUserId`; attach to `POST`; detach to `DELETE`.
- Agent display name + role for the group header come from the existing agent/users surface (the list response should join agent name; or the page fetches agents separately as SettingsAgents does). Architecture to confirm the join vs. second fetch.
