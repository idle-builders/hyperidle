# Filesystem primitive (Track AO)

A **registered, team-scoped file source** — durable file-like working artifacts agents **author** and accrue history on, of a `source` (local / GitHub / GDrive …) and a `kind` (a git **code repository** for code work, a **document-authoring set** (markdown/Obsidian folder) for writing work). A filesystem is **registered once** under a Team and **injected per-bot** via the `FilesystemInjection` mapping — it is **not owned by a single agent**. Built by AO1 (model + registry/injection surface) and AO2 (mount + capture); provider-native PR/MR sync for code is AN4. Grounded in [System Boundary](../architecture/system-boundary.md).

## Why it exists

Without a filesystem an agent could research and plan but not produce durable, reviewable output — code least of all. Before AO1, `knowledge_items` was the only durable output store and non-code outputs were squeezed into it; code had no home. The filesystem gives authored output a durable, history-bearing home and is the structural keystone of the self-hosting build loop. Shipped: `filesystems` + `filesystem_injections` + `filesystem_captures` (`packages/db/src/schema.ts:880-973`) and the AO2 mount adapters (`packages/server/src/filesystem/`).

## The line: Filesystem vs Tool vs Knowledge

A filesystem is **deliberately narrow** — **only** a file-bearing corpus the agent **authors**. Three ways an agent reaches state:

1. **Filesystem (mount)** — a local, editable, file-like **working set** in the sandbox; read/edit/build/test/diff, then **write back with history**. Reserved for **code repos and document authoring** — the only places a filesystem + version-control + test/diff loop is native.
2. **Tool (live API action)** — discrete read/act operations against a **live system of record** that owns its own consistency/permissions/workflow. **Email inboxes, ticket queues, CRMs are ALWAYS this** — never mounted. This is **Track AN** (MCP connectors; MCP `tools` = actions, `resources` = read-only data).
3. **Knowledge / retrieval (index)** — a reference corpus read via a RAG **index**; the agent never edits it. Cloud-drive *lookup* is this — the [knowledge fabric](../knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md), not filesystem.

**Discriminator:** not "does an API exist" (everything has one) — **what the work is**: *author/transform a corpus* → filesystem; *operate a live system of record* → tool; *look something up* → knowledge. The same Drive folder is a **filesystem** when the job is "revise these 10 docs" and a **tool/knowledge** when the job is "find the Q3 report."

| System | Side | Why |
|---|---|---|
| Code repo (git) | **Filesystem** | file-like, version-controlled, branch/merge, test loop — canonical |
| Doc-authoring set (Obsidian / markdown folder) | **Filesystem** | a corpus edited as files; write-back = file/git; publish via discrete action |
| Email inbox (Gmail/Outlook) | **Tool** (AN) | live SoR; read=query, act=send/draft; no synced maildir |
| Ticket queue (Zendesk/Linear) | **Tool** (AN) | live SoR; read/update via API |
| CRM (Salesforce/HubSpot) | **Tool** (AN) | live SoR; PATCH via API |
| Cloud drive (lookup) | **Knowledge** (read) / **Tool** (write) | read via index; write via discrete create-file; no edit-and-syncback |

The rule is enforced, not just documented: SoR kinds (inbox, crm, ticket_queue) are rejected at the Zod boundary on POST (`packages/shared/src/filesystem.ts:4-9`; create-route enum in `packages/server/src/routes/filesystems.ts`). No Drive/Dropbox two-way sync engine exists.

## How it connects — registry + per-bot injection (two surfaces)

A filesystem is **registered** and then **injected per-bot**, exactly like a connector ("connect once, inject per agent"):

1. **Registry — Settings → Filesystems** (`packages/web/src/settings/SettingsFilesystems.tsx`). Connect the account once — a [Connection](../architecture/connection-model.md) (Track AN): a held token or inherited auth, **never an OAuth app HyperIdle registers**. Register **which resource** of that connection is the filesystem (a GitHub **repo**+branch; an Obsidian/Drive **folder**) as a **team-scoped** row. Each row shows its **`source`** (the source type, derived from the Connection — `local` / `github` / `gdrive` / …) as a badge, plus its resource + state.
2. **Per-bot injection — Settings → Agents** (the bot's config, `SettingsAgents.tsx`). Select **which registered filesystems to inject** into that bot. A filesystem registered once is injected to **0..N bots** (the `FilesystemInjection` mapping) — many bots may share it; a bot may have many. It is **not owned by a single agent**.

The Connection supplies the auth (and the `source`); the Filesystem is the file-bearing **registered resource**; the **injection** is the per-bot wiring. Files (filesystem), auth/tools (Connection), and per-bot wiring (injection) are distinct axes that **compose**.

## Shape

The `Filesystem`, `FilesystemInjection`, and `FilesystemCapture` shapes are owned by code: `packages/db/src/schema.ts:880-973` (tables + @lore) and `packages/shared/src/filesystem.ts` (wire types, `FILESYSTEM_KINDS`, `WRITEBACK_MODES`, states, `ResourceRef`). Not restated here. Two facts worth locking:

- `connection_id` is a **reference by id, deliberately not a DB FK** (AO1 ⟂ AN; AN may add the FK in its own migration).
- There is **no `agent_user_id` column on the filesystem** — single-owner was replaced by the injection mapping. Mount resolves `sessions.agentId → filesystem_injections → filesystems`, never a global path.

> **Agents work *with* their credentials.** For a code filesystem with a forge, the repo is checked out **and** the forge auth (from the bound Connection) is provisioned into the sandbox so the agent's own `git`/`gh` tools fetch/push/PR — like a real employee. We do **not** withhold credentials. The review gate (AL7) checkpoints chosen consequential provider actions, not access — see [Proposed Call](./staged-operation.md).

## What it is not

- **Not a system of record / live tool** — inboxes, ticket queues, CRMs are operated via discrete API actions (Track AN); they own their own consistency/permissions/concurrency and are never mounted as an editable-and-synced copy.
- **Not a retrieval/knowledge index** — a RAG corpus (drive lookup) is the knowledge fabric; read, never edited-and-synced.
- **Not a `knowledge_item`** — knowledge items are derived/promoted/attention-scored fabric entries; a filesystem is the raw authored working files.
- **Not the knowledge-export config/target** — attaching a filesystem must not overwrite the global export config.
- **Not a Connection** — Connection is auth + tools; filesystem is files. Compose, never merge (the filesystem derives its `source` from the Connection).
- **Not owned by a single agent** — registered team-scoped, injected per-bot via `FilesystemInjection`. Many bots may share one; a bot may have many.
- **Not the injection mapping** — `FilesystemInjection` (`{ agent_user_id, filesystem_id }`, UNIQUE) is the per-bot *wiring*; the filesystem is the registered file source it points at.
- **Not the sandbox** — the sandbox is the ephemeral per-session mount target (AO2). The filesystem is durable.
- **Not HyperIdle's store-of-record for code** — code is git-derived ([System Boundary](../architecture/system-boundary.md) hard rule 4).

## Composition

- **References** a Connection (AN) + a **resource selection** (repo/folder), and **derives its `source`** from the Connection (or `local`); for `code`, the Connection supplies forge auth provisioned into the sandbox.
- **Registered under** a Team (`Team 1 — 0..N Filesystem`) — the registry scope.
- **Injected into** 0..N bots via `FilesystemInjection` (`Filesystem N — N Bot`); a bot may have many injected filesystems.
- **Mounted by** a session a bot runs — its **injected** filesystems (AO2).
- **Source of** the [Artifacts](./artifact-primitive.md) (L3) the agent produces.

## Lifecycle

```
registered ──► reachable ⇄ needs_attention      (injected into / ejected from bots independently)
                   │
                   └─(per session, AO2)─► mounted → authored by agent → captured back
```

Durable record; ephemeral mount. Registration and per-bot injection are independent axes (inject/eject a registered filesystem on any bot without re-registering). The working set is placed in the sandbox, authored using the agent's own tools/creds, and **captured back before sandbox teardown** into `filesystem_captures` — a git bundle for `git` writeback, a snapshot dir for `file`, `"none"` for read-only (`schema.ts:951-973`). An authored artifact destined for an external system is drafted in the sandbox and **published via a discrete tool action** at the end. Nothing is lost when the sandbox is destroyed.

## Authority & access

- A **bot** authors the filesystems **injected to it**.
- The **founder registers** the filesystem (Connection + resource selection → team registry) and sees its `source`/kind/location/state; the founder **injects/ejects** it per-bot (the bot's config).
- The **system mounts** the bot's **injected** filesystems and provisions the bot's Connections/tools/credentials into the sandbox (durable auth → disposable sandbox) — the agent uses its **own** credentials to act.
- For code, the **git repo itself** is the source of truth. Provider-native PR/MR review and merge stay with the forge; HyperIdle syncs the PR state (AN4) rather than replacing it with a landing engine. AO3 direct-land: won't-do.

## Contracts

- **Cardinality.** `Team 1 — 0..N Filesystem` (registration scope — always team-scoped). `Filesystem N — N Bot` via `FilesystemInjection` (`{ agent_user_id, filesystem_id }`, **UNIQUE** composite PK).
- **Source.** Every filesystem carries a **`source`** (the source type — `local` / `github` / `gdrive` / …), an **open** vocabulary derived from the Connection (or `local`), **displayed prominently** in the registry. Distinct from `kind`.
- **Closure.** `kind` is an **open** vocabulary; initial `code` + `doc_set`. `source` is likewise **open**. **Systems of record are categorically excluded** — tools, not a filesystem kind (enforced at the Zod create boundary).
- **Write-back is a capability axis** — `git` | `file` | `none`. **Conflict rides the host's native mechanism** (git merge for `code`; last-write-wins + snapshot for a `file` folder). **No custom conflict/sync engine.**
- **Mutability.** Registration settable/updatable; **per-bot injections added/removed independently** (inject/eject). The working tree is authored and captured back.
- **Identity.** Opaque filesystem id; for `code`, `(connection + repo + branch)`. An injection is `(agent_user_id, filesystem_id)` — UNIQUE.
- **Hard rules.**
  1. **Agents work with their credentials** in the sandbox; no withholding, no broker-only path, no design against a rogue agent. The review gate (AL7) checkpoints chosen consequential provider actions, never access.
  2. **No OAuth app** — auth arrives via the Connection (held token or inherited).
  3. Filesystem ⟂ Connection — files vs auth/tools; compose, never merge.
  4. **Filesystem = authored corpus only** — SoRs and retrieval indexes are excluded.
  5. **Local-first** — works with no forge (a plain local git repo / folder).
  6. Not a knowledge item, not the knowledge-export target.
  7. Unreachable/unauthenticated → **needs_attention**, never silent. Mount driven by the bot's **injected** filesystems (`sessions.agentId → filesystem_injections → filesystems`), never a global path.
  8. Forward-only migration.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Filesystem** | A **registered, team-scoped file source** — durable file-like artifacts agents **author**, of a `source` and a `kind`, **injected per-bot** (not owned by one agent). A repo, Drive folder, Obsidian vault, or plain folder — all filesystems. | workspace (= the whole sandbox environment), substrate (rejected — jargon), repo (one kind), connector (= Connection), knowledge base (= retrieval), agent's filesystem (= registered + injected, not owned) |
| **Source** | The **source type** — `local` / `github` / `gdrive` / … — derived from the Connection (or `local`), **displayed prominently** (a badge per registry row). Open vocabulary. Distinct from `kind`. | provider, kind (≠ kind), origin |
| **FilesystemInjection** | The per-bot **wiring** `{ agent_user_id → users.id, filesystem_id → filesystems.id }`, UNIQUE — which registered filesystems are injected into a given bot. Parallel to connector/tool injection. | attachment (= injection), ownership |
| **Filesystem kind** | The class of authored files (`code`, `doc_set`, …). Open vocabulary. Distinct from `source`. | filesystem type, repo type |
| **Resource selection** | Which sub-resource of a Connection the filesystem is (repo+branch; folder). | path, target |
| **Write-back capability** | How authored changes leave the sandbox: `git` / `file` / `none`. | sync, save |
| **Provider sync** | Keep the filesystem's native external workflow linked to HyperIdle work — for code, a provider PR/MR with checks/reviews/merge state; for other sources, that source's native publish/revision flow. AN4, not AO. | custom sync engine, HyperIdle merge |

## Scope note

The build scope is the **Team** — a filesystem is **registered** at the team level and **injected per-bot** (the `FilesystemInjection` mapping). A first-class multi-instance "Product" scope is **deferred** (AO4) — for now, isolation is per-team.
