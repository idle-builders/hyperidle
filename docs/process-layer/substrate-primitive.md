# Substrate primitive (Track AO)

The durable file-like working artifacts an agent **authors** and accrues history on, attached to an **agent within a team**, of a `kind` — a git **code repository** for code work, a **document-authoring set** (markdown/Obsidian folder) for writing work. Concept + decision rule locked in `plans/AO/concept.md` (+ `plans/AO/research-substrate-vs-tool.md`); consumed by AO1 (model + attach surface), AO2 (materialization), AO3 (land). Grounded in [System Boundary](../architecture/system-boundary.md).

## Why it exists

Without a substrate an agent can research and plan but cannot produce durable, reviewable output — code least of all (the sandbox has no `src/`). Today `knowledge_items` is the only durable output store and non-code outputs are squeezed into it; code has no home at all. The substrate is the structural keystone of the self-hosting build loop.

## The line: Substrate vs Tool vs Knowledge (research-grounded)

A substrate is **deliberately narrow** — it is **only** a file-bearing corpus the agent **authors**. Every production agent system surveyed (MCP spec; Devin/Claude Code; Glean/Notion connectors; Decagon/Sierra) draws one sharp line. Three ways an agent reaches state:

1. **Substrate (materialize)** — a local, editable, file-like **working set** in the sandbox; read/edit/build/test/diff, then **write back with history**. Reserved for **code repos and document authoring** — the only places a filesystem + version-control + test/diff loop is native.
2. **Tool (live API action)** — discrete read/act operations against a **live system of record** that owns its own consistency/permissions/workflow. **Email inboxes, ticket queues, CRMs are ALWAYS this** — never materialized. This is **Track AN** (MCP connectors; MCP `tools` = actions, `resources` = read-only data).
3. **Knowledge / retrieval (index)** — a reference corpus read via a RAG **index**; the agent never edits it. Cloud-drive *lookup* is this — the **knowledge fabric**, not substrate.

**Discriminator:** not "does an API exist" (everything has one) — **what the work is**: *author/transform a corpus* → substrate; *operate a live system of record* → tool; *look something up* → knowledge. The same Drive folder is a **substrate** when the job is "revise these 10 docs" and a **tool/knowledge** when the job is "find the Q3 report."

| System | Side | Why |
|---|---|---|
| Code repo (git) | **Substrate** | file-like, version-controlled, branch/merge, test loop — canonical |
| Doc-authoring set (Obsidian / markdown folder) | **Substrate** | a corpus edited as files; write-back = file/git; publish via discrete action |
| Email inbox (Gmail/Outlook) | **Tool** (AN) | live SoR; read=query, act=send/draft; no synced maildir |
| Ticket queue (Zendesk/Linear) | **Tool** (AN) | live SoR; read/update via API |
| CRM (Salesforce/HubSpot) | **Tool** (AN) | live SoR; PATCH via API |
| Cloud drive (lookup) | **Knowledge** (read) / **Tool** (write) | read via index; write via discrete create-file; no edit-and-syncback |

AO does **not** materialize inboxes/CRMs/ticket queues and does **not** build a Drive/Dropbox two-way sync engine.

## How it connects (like any other connector)

Connect the account once in Settings — a **Connection** (Track AN): a held token or inherited auth, **never an OAuth app HyperIdle registers**. Then per-agent configure **which resource** of that connection is the substrate (a GitHub **repo**+branch; an Obsidian/Drive **folder**). The Connection supplies the auth; the Substrate is the file-bearing **resource selection** injected to an agent. Files (substrate) and auth/tools (Connection) are distinct axes that **compose**.

## Canonical shape

```
Substrate {
  id              # opaque, stable
  team_id         # FK → owning Team (teams.id). The scope. Required.
  agent_member_id # FK → agent-within-a-team (teamMembers.id) it attaches to.
                  #      Primary attachment; null → a team-level (shared) substrate.
  kind            # OPEN vocabulary. Initial: `code` (git repo) | `doc_set` (authoring folder).
                  #      Systems of record are categorically EXCLUDED (they are AN tools).
  connection_id   # OPTIONAL FK → Connection (Track AN) — the account + auth this
                  #      substrate's resource lives in. By reference; auth provisioned
                  #      INTO the sandbox. Null → a bare local path (local-first).
  resource_ref    # which resource of the connection: a repo+branch, a folder path.
  writeback       # `git` (commit→push/PR) | `file` (file write) | `none` (read-only ref)
  state           # `attached` | `reachable` | `needs_attention`
  created_at
}
```

> **Agents work *with* their credentials.** For a code substrate with a forge, the repo is checked out **and** the forge auth (from the bound Connection) is provisioned into the sandbox so the agent's own `git`/`gh` tools fetch/push/PR — like a real employee. We do **not** withhold credentials. The review gate (AL7) checkpoints *irreversible landing*, not access.

## What it is not

- **Not a system of record / live tool** — inboxes, ticket queues, CRMs are operated via discrete API actions (Track AN); they own their own consistency/permissions/concurrency and are never materialized as an editable-and-synced copy.
- **Not a retrieval/knowledge index** — a RAG corpus (drive lookup) is the knowledge fabric; read, never edited-and-synced.
- **Not a `knowledge_item`** — knowledge items are derived/promoted/attention-scored fabric entries; a substrate is the raw authored working files. (AO1 ends the squeeze-into-`knowledge_items` workaround.)
- **Not the knowledge-export config/target** — attaching a substrate must not overwrite the global export config.
- **Not a Connection** — Connection is auth + tools; substrate is files. Compose, never merge.
- **Not the sandbox** — the sandbox is the ephemeral per-session materialization target (AO2). The substrate is durable.
- **Not HyperIdle's store-of-record for code** — code is git-derived ([System Boundary](../architecture/system-boundary.md) hard rule 4).

## Composition

- **References** a Connection (AN) + a **resource selection** (repo/folder); for `code`, the Connection supplies forge auth provisioned into the sandbox.
- **Attached to** an agent-within-a-team (`agent-in-team 1 — 0..N Substrate`), under that **Team** as scope (or shared at team level).
- **Materialized by** a session the agent runs (AO2).
- **Source of** the Artifacts (L3) the agent produces.

## Lifecycle

```
attached ──► reachable ⇄ needs_attention
                 │
                 └─(per session, AO2)─► materialized → authored by agent → captured back
```

Durable record; ephemeral materialization. The working set is placed in the sandbox, authored using the agent's own tools/creds, captured back (git commit / file write). An authored artifact destined for an external system is drafted in the sandbox and **published via a discrete tool action** at the end. Nothing is lost when the sandbox is destroyed.

## Authority & access

- The **agent (within its team)** authors its substrate(s).
- The **founder attaches** it (Connection + resource selection) and sees its kind/location/state.
- The **system materializes** it **and provisions the agent's inherited Connections/tools/credentials into the sandbox** (durable-auth→disposable-sandbox, PR #364) — the agent uses its **own** credentials to act.
- For code, the **git repo itself** is the source of truth.

## Contracts

- **Cardinality.** `agent-in-team 1 — 0..N Substrate` (primary), or shared at the team level — always team-scoped.
- **Closure.** `kind` is an **open** vocabulary; initial `code` + `doc_set`. **Systems of record are categorically excluded** — tools, not a substrate kind.
- **Write-back is a capability axis** — `git` | `file` | `none`. **Conflict rides the host's native mechanism** (git merge for `code`; last-write-wins + snapshot for a `file` folder). **No custom conflict/sync engine.**
- **Mutability.** Attachment settable/updatable; the working tree is authored and captured back.
- **Identity.** Opaque id; for `code`, `(connection + repo + branch)`.
- **Hard rules.**
  1. **Agents work with their credentials** in the sandbox; no withholding, no broker-only path, no design against a rogue agent. The review gate (AL7) checkpoints irreversible *landing*, never access.
  2. **No OAuth app** — auth arrives via the Connection (held token or inherited).
  3. Substrate ⟂ Connection — files vs auth/tools; compose, never merge.
  4. **Substrate = authored corpus only** — SoRs and retrieval indexes are excluded.
  5. **Local-first** — works with no forge (a plain local git repo / folder).
  6. Not a knowledge item, not the knowledge-export target.
  7. Unreachable/unauthenticated → **needs-attention**, never silent. Materialization driven by the agent's attachment, never a global path.
  8. Forward-only migration.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Substrate** | Durable file-like artifacts an agent **authors**, attached to an agent-within-a-team, of a kind. | workspace (= sandbox), repo (one kind), connector (= Connection), knowledge base (= retrieval) |
| **Substrate kind** | The class of authored files (`code`, `doc_set`, …). Open vocabulary. | substrate type, repo type |
| **Resource selection** | Which sub-resource of a Connection the substrate is (repo+branch; folder). | path, target |
| **Write-back capability** | How authored changes leave the sandbox: `git` / `file` / `none`. | sync, save |
| **Land** | Make an approved change real via the connected target (push/PR/merge/publish) — the agent's own tool call, routed through review (AO3/AL7). | deploy, commit (capture ≠ land) |

## Scope note

The build scope is the **Team** (and the **agent within a team** the substrate attaches to). A first-class multi-instance "Product" scope is **deferred** (AO4) — for now, isolation is per-team.

## Rationale

The substrate is Track AO's keystone — an agent without a durable home for its authored output stays doc-only. Research (`plans/AO/research-substrate-vs-tool.md`) settles the boundary: **materialize a filesystem only for authored, version-controlled corpora (code, documents); reach live systems of record (inbox/CRM/ticket) through discrete API tools (AN); read reference corpora through retrieval (fabric).** So a substrate is narrow and connected like any connector (account in Settings → per-agent resource selection), with write-back riding the host's native mechanism (git for code; file-write for a folder; nothing custom). The agent works **with its credentials**, like a real employee ([System Boundary](../architecture/system-boundary.md); [Proposed Call](./staged-operation.md); the no-credential/broker model was reverted in PR #364).
