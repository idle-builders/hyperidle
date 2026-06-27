DESIGN-CLASS: novel  ref=SettingsConnections(AN1-approved, reverted off main)  pattern=SettingsConnections "Connections — Inherited-default (grouped by source)"

# AO1 design brief — attach / inspect / select an agent's Filesystem

## What's being designed
The surface a founder uses to **attach** a Filesystem (a repo / doc-set folder) to **an agent within a team**, **inspect** the attachment (kind, resource, write-back, state), and notice when it **needs attention**. AO1 is the binding surface only — not materialization (AO2), not landing (AO3).

## Fixed inputs (do NOT re-litigate)
- Concept `plans/AO/concept.md`: Filesystem = authored corpus only (`code` | `doc_set`); attached to an agent-within-a-team; references a **Connection** (Track AN, auth) + a **resource selection** (repo+branch / folder); `writeback` = `git`|`file`|`none`; `state` = `attached`|`reachable`|`needs_attention`. Filesystem ⟂ Connection.
- Architecture `plans/AO1/architecture.md`: the wire `Filesystem` type the surface binds to — `{ id, teamId, agentUserId, kind, connectionId, resourceRef, writeback, state }`. Routes: `POST /api/filesystems`, `GET /api/filesystems?teamId&agentUserId`, `GET /:id`, `DELETE /:id`. `needs_attention` resolved structurally (connection unresolvable → needs_attention; bare-local / writeback:none → reachable).

## Phase 0b — Reuse inventory (hard gate)
Everything the surface needs maps to an existing catalogued primitive — **zero NEW shapes**. This is the AN1-approved grouped-list idiom re-applied to filesystems.

| Visual element | Component | Notes |
|---|---|---|
| Page header (title + lede + add button) | `h2` + lede `<p>` + `Button variant="secondary" size="sm"` | exact AN1 header shape |
| Section grouping (by agent OR by kind) | `SectionLabel` + `<p>` help | AN1 `SourceGroup` shape |
| Contained list of attachments | `ItemList variant="contained"` | AN1 idiom |
| One filesystem attachment row | `Row` (lead / title / subtitle / cells / actions) | repo/folder as title, resource as subtitle |
| Kind mark (CODE / DOC) | reuse AN1 `ServiceMark` inline shape (2-letter mark) — single-use, not promoted | identical precedent + lore |
| Kind tag | `Tag` | "code" / "doc_set" — identity label |
| Write-back / branch meta | `Row` `cells` (mono 11px) | branch + writeback as trailing meta cells |
| State chip | `StatusChip` (`healthy`=reachable, `behind`=needs_attention, `unknown`=attached) | AN1 health→status mapping |
| Row actions (detach / re-select) | `Button variant="ghost" size="sm"` + `Menu` | AN1 row-menu idiom |
| Attach flow | `Dialog` + `Select` (kind, connection) + `Input` (repo/branch/folder) | AN1 AddConnectionDialog shape |
| Connection picker inside attach | `Select` of existing Connections | AN1 "point at MCP / token" Select idiom |
| Key/value inspect (variant B) | `KeyValue` | inline label/value pairs |

`NEW` entries: **none**. (`ServiceMark` is reused inline exactly as AN1 declared it — a single-use shape, not a DS promotion.)

## Phase 0 — Interrogation (resolved against fixed inputs)
1. **Who + decision?** A founder configuring an agent's working files. Decision: *which repo/folder does this agent author into, and is its auth healthy?* Read: confirmed by AC1/AC5.
2. **Where does it live — the load-bearing fork.** Three genuine homes: (A) a **Settings "Filesystems"** section listing agent→filesystem rows (sibling to Connections); (B) **inline on the agent's own config** (Work/Team view) where harness/model already live; (C) a **connection-first picker** that starts from "which connected account" then drills to the resource. This is the fork the human review decides — built as 3 real variants.
3. **Primary state?** Populated — an agent with 1–2 filesystems (a `code` repo + a `doc_set` folder), healthy. `needs_attention` shown as a first-class data condition (AC5). No skeleton/empty/error in the variants (deferred to build).
4. **Filesystem ⟂ Connection legibility.** The surface must show that the **Connection supplies auth** and the **Filesystem is the resource** — without merging the two axes. Each variant solves this differently (A: writeback/connection in subtitle; B: KeyValue inspect; C: connection is the entry point).
5. **What truncates when dense?** Long repo names / folder paths → `Row` title ellipsis; branch + writeback ride trailing mono cells that hold at the right edge.

## Variants (novel → 3, distinct on the home + attach interaction)
- **A — Settings "Filesystems" section** (grouped by agent). Sibling to Connections. Add-filesystem dialog. The Connections-twin: lowest new surface, founder already knows the idiom.
- **B — Inline on the agent's config** (the agent panel where harness/model live). Filesystems are a property of the agent, edited where the agent is configured. Inspect via `KeyValue`. Closest to "attach a filesystem to THIS agent".
- **C — Connection-first attach flow** (reference: Vercel/Linear "Connect a repository"). Start from the connected account, pick the resource, assign to an agent. The flow-led variant.
