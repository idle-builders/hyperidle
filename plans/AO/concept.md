# Concept — Track AO (Self-Hosting Build Loop): Filesystem

**Level:** Track concept (gating). Fixed input for **AO1** (filesystem model + bind surface). AO2 consumes it (materialization); AO3 is parked behind AL7; AO4 (multi-instance scope) is **deferred** — for now the build scope is simply the **Team**.

**One load-bearing noun:** **Filesystem** — *new primitive.* The durable working files an **agent authors and accrues history on**, materialized into its session sandbox, of a `kind` (a git **code repository** for code work, a **document-authoring set** for writing work).

> **Scope = Team. "Product" is not modelled (for now).** We speak only of **Team**, and more precisely an **agent within a team** the filesystem attaches to. Multi-instance / per-product isolation (AO4) is deferred.

> **Filesystem is deliberately NARROW (research-grounded, 2026-06-26).** A filesystem is **only** a file-bearing working set the agent **authors** — code (canonical) and document-authoring. **Systems of record** (email inboxes, ticket queues, CRMs) and **drive lookups** are **NOT filesystems** — they reach the agent as **live tools** (Track AN) or **retrieval** (knowledge fabric). See "Filesystem vs Tool vs Knowledge" below and `plans/AO/research-filesystem-vs-tool.md`.

---

## Filesystem vs Tool vs Knowledge — the decision rule (research-grounded)

Every production agent system surveyed (MCP spec; Devin/Claude Code; Glean/Notion connectors; Decagon/Sierra support agents) draws **one sharp line**. There are three ways an agent reaches state:

1. **Filesystem (materialize)** — the agent gets a local, editable, file-like **working set** in its sandbox; it reads/edits/builds/tests/diffs and **writes back as a batch with history**. **Reserved for code repos and document authoring** — the only places a filesystem + version-control + test/diff loop is the native workflow. (Devin/Claude Code clone a repo into a per-session sandbox; nobody materializes a non-code system of record.)
2. **Tool (live API action)** — the agent takes **discrete read/act operations** against a **live stateful system of record** that owns its own consistency, permissions, and workflow. **Email inboxes, ticket queues, CRMs are ALWAYS this** — never materialized. Sending an email, updating a ticket, PATCHing a CRM record, pushing a PR are all tool actions. **This is Track AN** (MCP connectors). MCP encodes it: **tools** = model-controlled actions; **resources** = read-only data (no write method).
3. **Knowledge / retrieval (index)** — a reference corpus read via an **index** (RAG); the agent never edits it. Cloud-drive *lookup* ("find the Q3 doc") is this. **This is the existing knowledge fabric**, not filesystem.

**The discriminator** is **not** "does an API exist" (everything has one) — it is **what the work is**: *author/transform a coherent corpus* → **filesystem**; *operate a live system of record* → **tool**; *look something up* → **knowledge**. The **same** Drive folder is a **filesystem** when the job is "revise these 10 documents" and a **tool/knowledge** when the job is "find the Q3 report."

| System | Side | Why |
|---|---|---|
| **Code repo** (git) | **Filesystem** | file-like, version-controlled, branch/merge, test loop — canonical |
| **Doc-authoring set** (Obsidian / markdown folder) | **Filesystem** | a corpus edited as files; write-back = file/git; **publish via discrete action** |
| Email inbox (Gmail/Outlook) | **Tool** (AN) | live SoR; read=query, act=send/draft; no synced maildir |
| Ticket queue (Zendesk/Linear) | **Tool** (AN) | live SoR; read/update via API |
| CRM (Salesforce/HubSpot) | **Tool** (AN) | live SoR; PATCH via API |
| Cloud drive (lookup) | **Knowledge** (read) / **Tool** (write) | read via index; write via discrete create-file; no edit-and-syncback |

So AO does **not** materialize inboxes/CRMs/ticket queues, and does **not** build a Drive/Dropbox two-way sync engine. Those are AN tools / fabric retrieval. AO materializes only **authored corpora**.

> **How a filesystem is connected (founder framing).** Like other connectors: connect the account once in Settings (a **Connection**, Track AN — token or inherited, **never an OAuth app HyperIdle registers**); then per-agent configure **which resource of that connection** is the filesystem (a GitHub **repo**+branch; an Obsidian/Drive **folder**). The Connection supplies the auth; the Filesystem is the file-bearing **resource selection** injected to an agent. Files (filesystem) and auth/tools (Connection) are distinct axes that **compose**.

---

## Required reading (downstream: `/architecture`, `/design`, `/pipeline`)

- `plans/AO/research-filesystem-vs-tool.md` — **the filesystem↔tool↔knowledge decision rule + citations.** Read first.
- `docs/architecture/system-boundary.md` — RIDE git / INTEGRATE infra / REPLACE collaboration; "code lives in a local git repo, forge-optional."
- `docs/process-layer/filesystem-primitive.md` — the Filesystem ground-truth this pass writes.
- `docs/process-layer/canonical-shapes.md` — the Filesystem canonical-shape entry.
- `docs/process-layer/staged-operation.md` — the trust model: **agents hold their own credentials in the sandbox**; the review gate checkpoints irreversible *landing*, never withholds access.
- `.pipeline/work-packages/TRACK-AN.md` — Connection (connect-once; held token / inherited / service OAuth; no HyperIdle OAuth app). A code filesystem references a Connection for forge auth.
- `docs/process-layer/artifact-primitive.md` — Artifact (L3) is the *reviewable record*; filesystem is the *files it derives from*. Open `kind` vocabulary mirrors the filesystem `kind`.
- Code seams (verified 2026-06-26): `packages/db/src/schema.ts` (teams 17-34, teamMembers ~102, artifacts 848-865), `packages/fabric/src/services/git-export-runner.ts` (export-only — **no clone/fetch/checkout**), `packages/server/src/services/session-provisioning.ts` (sandbox spawn).

---

## Phase 0 — The noun, classified against code reality

| Noun | Class | Code reality (2026-06-26, grep-verified) |
|---|---|---|
| **Filesystem** | **New primitive** | Zero implementation. `artifacts` has no repoPath/filePath/commitSha (schema.ts:848-865). `GitRunner` is export-only — `init/add/commit/push`, **no clone/fetch/checkout** (git-export-runner.ts:18-41). Sandbox holds `context/ knowledge/ work/` only — no `src/`. |
| Connection (Track AN) | Stable (input, not yet merged) | Per-(user×service) account record; auth = held token / inherited / service OAuth; **no HyperIdle OAuth app**. Supplies forge auth to a code filesystem; provisioned into the sandbox each spawn. Filesystem references it. |
| Team / agent-within-a-team | Stable (input) | `teams` / `teamMembers`. The scope, and the thing a filesystem attaches to. |
| Knowledge fabric | Stable (input) | The retrieval/index read path for reference corpora — the "knowledge" side of the decision rule. Not a filesystem. |

**Human-design-review forecast (advisory).** **AO1 = Yes** (new attach/inspect filesystem surface). `/design`'s `DESIGN-CLASS` remains authoritative.

---

## Phase 1 — Essence (Filesystem)

1. **Identity.** A Filesystem is the **durable working files an agent authors and accrues history on**, attached to an **agent within a team**, of a `kind` — a git **code repository** for code, a **document-authoring set** (markdown/Obsidian folder) for writing. A *container of authored, file-like working artifacts with history* — not a system of record, not a retrieval index.
2. **Essential properties.** Every filesystem has: a `kind`; a **resource selection** within a Connection (the repo / folder) — or a bare local path; an **attachment** to an agent-within-a-team (team-scoped); a **write-back capability** (`git` | `file` | `none`); the capacity to **accrue history**; a **reachability state**.
3. **Rejection list.** See Phase 2.
4. **Composition.** A Filesystem **references a Connection** (Track AN) + a **resource selector** (which repo/folder); for a `code` kind the Connection supplies forge auth provisioned **into** the sandbox. It is **attached to an agent within a team** (primary), under that **Team** as scope. A **session** the agent runs **materializes** it into the sandbox (AO2). The **Artifact** (L3) the agent produces is **derived from** the filesystem.
5. **Lifecycle.** `attached` → `reachable` ⇄ `needs-attention` (unreachable/unauthenticated — surfaced, never silent). Per session: **materialized → authored by the agent → captured back** (git commit / file write). For an authored artifact destined for an external system, the draft lives in the sandbox and is **published via a discrete tool action** at the end (the publish is a Connection/tool op, not a filesystem sync).
6. **Authority & access.** The **agent (within its team)** authors its filesystem(s). The **founder attaches** it (Connection + resource). The **system materializes** it **and provisions the agent's inherited Connections/tools/credentials into the sandbox** — the agent uses its **own** credentials and tools, like a real employee. For code, the **git repo itself** is the source of truth (code is git-derived).
7. **Vocabulary collision.** "Filesystem" is formalized here; distinguish from **sandbox** (ephemeral materialization target), **Connection/tool** (live SoR access — AN), and the **knowledge fabric** (retrieval index).

---

## Phase 2 — Rejection list (what a Filesystem is NOT, with reasons)

- **Not a system of record / live tool** — email inboxes, ticket queues, CRMs are **live stateful systems** the agent operates via **discrete API actions** (Track AN), which own their own consistency/permissions/concurrency. No production agent materializes one as an editable-and-synced local copy. (Research, 2026-06-26.) A filesystem is an **authored corpus**, not an operated system.
- **Not a retrieval/knowledge index** — a reference corpus read via RAG (cloud-drive lookup) is the **knowledge fabric**; the agent reads it, never edits-and-syncs it. A filesystem is **edited and written back**.
- **Not a `knowledge_item`** — knowledge items are derived, promoted, attention-scored fabric entries; a filesystem is the raw working files the agent authors. (Today non-code output is wrongly squeezed into `knowledge_items` — AO1 fixes this.)
- **Not the knowledge-export config/target** — `git-export` writes knowledge markdown to a single global repo; attaching a filesystem must not overwrite that config.
- **Not a Connection (Track AN)** — a Connection is *auth + tools*; a filesystem is *files*. Orthogonal axes that **compose**: the filesystem references the Connection; the Connection supplies the auth provisioned into the sandbox.
- **Not the sandbox** — the sandbox is the ephemeral per-session dir where a filesystem is *materialized* (AO2). The filesystem is durable; the sandbox is thrown away.
- **Not HyperIdle's store-of-record for code** — code is git-derived; the Artifact is derived from the repo (system-boundary hard rule 4).

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **Filesystem** | Durable file-like working artifacts an agent **authors** and accrues history on, attached to an agent-within-a-team, of a `kind`. A git repo, a Drive folder, an Obsidian vault, a plain folder are all filesystems. | workspace (= the whole sandbox environment), substrate (rejected — jargon), repo (one *kind*), connector (= Connection/tool), knowledge base (= retrieval) |
| **Filesystem kind** | The class of authored files. Initial committed set: `code` (git repo), `doc_set` (markdown/Obsidian folder). **Open** vocabulary. | filesystem type, repo type |
| **Resource selection** | Which sub-resource of a Connection the filesystem is (a GitHub repo+branch; a Drive/Obsidian folder). | path, target |
| **Write-back capability** | How authored changes leave the sandbox: `git` (commit→push/PR), `file` (file write), `none` (read-only reference). | sync, save |
| **Sandbox** | The ephemeral per-session dir where a filesystem is materialized and the agent's Connections/tools/creds are provisioned (AO2). | workspace, container |
| **Land** | Make an approved filesystem change real via the connected target (push/PR/merge/publish) — the agent's own tool call, routed through review (AO3/AL7). | deploy, commit (capture ≠ land) |

---

## Phase 4 — Contracts

- **Cardinality.** `agent-in-team 1 — 0..N Filesystem` (primary); a filesystem attaches to one agent-within-a-team or is shared at the **Team** level — always team-scoped. A session the agent runs materializes its attached filesystem(s).
- **Closure.** Filesystem `kind` vocabulary is **OPEN** (mirrors Artifact-kind). Initial committed kinds: `code` (git) + `doc_set` (authoring). **Systems of record are categorically excluded** — they are tools (AN), not a filesystem kind.
- **Write-back is a capability axis.** `git` | `file` | `none` — not every filesystem writes back (a read-only reference folder = `none`). **Conflict rides the host's native mechanism** — git merge for `code`; for a plain `file` folder, **last-write-wins + a captured snapshot**. **No custom conflict/sync engine** (no production system materializes a non-code SoR for syncback; we don't either).
- **Mutability.** The attachment (`kind`, resource selection, branch, write-back capability) is settable/updatable; the materialized working tree is authored and captured back.
- **Identity.** Opaque filesystem id; for `code`, `(connection + repo + branch)` is the natural address.
- **Hard rules.**
  1. **Agents work *with* their credentials.** The sandbox is provisioned with the agent's inherited Connections/tools/creds (durable-auth→disposable-sandbox, PR #364); for a code filesystem the bound Connection's forge auth is present so the agent's own git/gh tools fetch/push/PR. **No credential withholding, no broker-only path, no design against a rogue agent.** The review gate (AL7) checkpoints *irreversible landing*, fades as trust grows — never a credential boundary.
  2. **No OAuth app.** Auth always arrives via the Connection (held token or inherited) — HyperIdle never registers a per-service OAuth app.
  3. Filesystem ⟂ Connection — distinct axes (files vs auth/tools) that compose, never merge.
  4. **Filesystem = authored corpus only.** Systems of record (inbox/ticket/CRM) and retrieval indexes are NOT filesystems.
  5. **Local-first** — a filesystem functions with no forge (a plain local git repo / local folder).
  6. Not a knowledge item, not the knowledge-export target — attaching must not overwrite either.
  7. Unreachable/unauthenticated → **needs-attention**, never silent. Materialization is driven by the agent's attachment, never a global path; a filesystem-less session degrades to today's behavior.
  8. **Forward-only** migration.

---

## Phase 6 — Self-critique (1 round)

- **Rejection list distinct?** Yes — now seven distinct things (SoR/tool, retrieval index, knowledge_item, export target, Connection, sandbox, store-of-record). The SoR + retrieval rejections are the research-grounded additions that make the boundary load-bearing.
- **Vocabulary collisions?** "filesystem" formalizes informal usage; "connector/connection" reserved for AN tools; "knowledge base" reserved for fabric. No clash.
- **Contracts complete?** Cardinality / closure / write-back-capability / conflict (ride-host) / mutability / identity / hard rules covered. Binding = agent-within-a-team; auth = Connection (no OAuth).
- **Credential model correct?** Yes — **creds present in the sandbox**; the agent uses its own tools/auth. The earlier "no cred in sandbox" line was reverted-broker garbage, removed.
- **Decision rule grounded?** Yes — `plans/AO/research-filesystem-vs-tool.md`, 23/25 claims verified against primary sources (MCP spec, Google, Glean, Notion, Cognition).

**Concept LOCKED.**

---

## Rationale (why this shape)

**Why "Filesystem" (the name).** A git repo, a Drive folder, an Obsidian vault, and a plain folder are all the same underlying thing — **a filesystem: a tree of files**. The name is the common denominator, not jargon (the earlier "Substrate" was rejected as opaque). It also sharpens the decision rule into a one-word test: **"is it a filesystem?"** — a repo/drive/folder is; an inbox, ticket queue, or CRM is **not** (those are live systems of record → tools). Note "workspace" is **not** this primitive — a workspace is the whole sandbox *environment* (files + tools + harness); the Filesystem is just the durable file tree that materializes *into* that sandbox.

The filesystem is the *structural keystone* of Track AO: without a durable home an agent authors output in (code least of all — the sandbox has no `src/`), agents stay doc-only. The research settles the question the founder raised — **where does filesystem stop and tool begin?** Every production system draws the same line: **materialize a working filesystem only for authored, version-controlled corpora (code, documents); reach live systems of record (inboxes, CRMs, ticket queues) through discrete API tools; read reference corpora through a retrieval index.** So a filesystem is **deliberately narrow** — an *authored* corpus, connected like any other connector (account in Settings → per-agent resource selection), with write-back riding the host's native mechanism (git for code; file-write for a folder; nothing custom). Inboxes and CRMs are **Track AN tools**, not filesystems; drive *lookup* is the **knowledge fabric**. The agent works **with its credentials** in the sandbox, like a real employee (ETHOS §4; the no-credential/broker model was reverted, PR #364); the review gate governs *irreversible landing*, not access. **Product** is not modelled yet — scope is the **Team**; multi-instance isolation (AO4) is deferred until this keystone exists.
