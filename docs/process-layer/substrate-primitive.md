# Substrate primitive (Track AO)

The durable working files an agent's output lives in and accrues history on, **attached to an agent within a team**, of a `kind` — a git **code repository** for code work, a **document/knowledge set** for non-code work. Concept locked in `plans/AO/concept.md`; consumed by AO1 (model + attach surface), AO2 (materialization), AO3 (land). Grounded in [System Boundary](../architecture/system-boundary.md) ("code lives in a local git repo, forge-optional").

## Why it exists

Without a substrate an agent can research and plan but cannot produce durable, reviewable output — code least of all (the sandbox has no `src/`). Today `knowledge_items` is the only durable output store and non-code outputs are squeezed into it; code has no home at all. The substrate is the structural keystone of the self-hosting build loop, and generalizing it beyond code is what lets one HyperIdle instance build similar-stack apps and serve non-engineering work with one model.

## Canonical shape

```
Substrate {
  id             # opaque, stable
  team_id        # FK → owning Team (teams.id). The scope it lives under. Required.
  agent_member_id# FK → the agent-within-a-team it is attached to (teamMembers.id).
                 #      Primary attachment. Nullable → a team-level (shared) substrate.
  kind           # OPEN vocabulary. Initial committed set: `code` | `doc_set`.
                 #      `code` → a git repository; `doc_set` → a document/knowledge set.
                 #      New kinds added without editing core (mirrors Artifact kinds).
  location       # how to reach the files. For `code`: clone URL / local path + branch.
  connection_id  # OPTIONAL FK → a Connection (Track AN) supplying forge auth for a
                 #      `code` substrate. By reference; the Connection's auth is
                 #      provisioned INTO the sandbox so the agent's own tools work.
  state          # `attached` | `reachable` | `needs_attention`
  created_at
}
```

> **Agents work *with* their credentials.** For a code substrate with a forge, the repo is checked out **and** the forge auth (from the bound Connection) is provisioned into the sandbox so the agent's own `git`/`gh` tools fetch/push/PR — like a real employee. We do **not** withhold credentials. The review gate (AL7) is a collaboration checkpoint on *irreversible landing*, not a credential boundary.

## Essential properties

- A `kind` (open vocabulary; ≥1 non-code kind so the primitive is not code-only).
- A `location` (for code: repo + branch).
- An **attachment** to an agent-within-a-team (team-scoped); a substrate can also be shared at team level.
- The capacity to **accrue history** (commits / revisions).
- A **reachability state** that surfaces unreachable/unauthenticated as *needs-attention*, never a silent failure.

## What it is not

- **Not a `knowledge_item`** — knowledge items are derived, promoted, attention-scored fabric entries; a substrate is the raw working files the agent edits/builds/tests. (Today non-code output is wrongly squeezed into `knowledge_items`; AO1 fixes this.)
- **Not the knowledge-export config/target** — `git-export` writes knowledge markdown to a single global repo; attaching a substrate must not overwrite the export configuration.
- **Not a Connection (Track AN)** — a Connection is auth + tools; a substrate is files. Orthogonal axes that **compose**: the Connection supplies the forge auth that is provisioned **into the sandbox** alongside the materialized substrate. Distinct records — the substrate references the Connection, never embeds or replaces it.
- **Not the sandbox** — the sandbox is the ephemeral, per-session, isolated directory where a substrate is *materialized* (AO2). The substrate is durable; the sandbox is thrown away.
- **Not HyperIdle's store-of-record for code** — code is git-derived; the Artifact is derived from the repo, never the canonical store ([System Boundary](../architecture/system-boundary.md) hard rule 4).

## Composition

- **Attached to** an agent-within-a-team (`agent-in-team 1 — 0..N Substrate`), under that **Team** as scope. A team may share one substrate at team level.
- **References** a forge Connection (Track AN) for `code` auth — by id; the Connection's auth is provisioned into the sandbox.
- **Materialized by** a session the agent runs, into that session's sandbox (AO2).
- **Source of** the Artifacts (L3) the agent produces — the artifact is *derived from* the substrate.

## Lifecycle

```
attached ──► reachable ⇄ needs_attention
                 │
                 └─(per session, AO2)─► materialized → mutated by agent → captured back
```

The substrate record is durable. The materialization is ephemeral: the working tree is placed into the sandbox at its branch, the agent edits/builds/tests using its own tools and credentials, and the result is committed/written back at session end. Changes are never lost when the sandbox is destroyed.

## Authority & access

- The **agent (within its team)** owns and works its substrate(s).
- The **founder attaches** a substrate to an agent/team (and sees its kind/location/state).
- The **system materializes** it at provisioning **and provisions the agent's inherited Connections/tools/credentials into the sandbox** (durable-auth→disposable-sandbox, PR #364) — the agent uses its **own** credentials to act on the files, fetch, and push.
- For code, the **git repo itself** is the source of truth (code is git-derived).

## Contracts

- **Cardinality.** `agent-in-team 1 — 0..N Substrate` (primary); a substrate is attached to one agent-within-a-team or shared at the team level — always team-scoped. A session run by that agent materializes its attached substrate(s).
- **Closure.** Substrate `kind` is an **open** vocabulary (new kinds without editing core). Initial committed kinds: `code` + `doc_set`.
- **Mutability.** Attachment (`kind`/`location`/`branch`) settable and updatable; the materialized working tree is mutated and captured back.
- **Identity.** Opaque id; for `code`, `(location + branch)` is the natural address.
- **Hard rules.**
  1. **Agents work with their credentials.** The sandbox is provisioned with the agent's inherited Connections/tools/creds; for a code substrate the bound Connection's forge auth is present so the agent's own tools push/PR. No credential withholding, no broker-only path, no design against a rogue agent. The review gate (AL7) checkpoints *irreversible landing*, fades as trust grows — never a credential boundary.
  2. Substrate ⟂ Connection — distinct axes (files vs auth/tools) that compose, never merge. The substrate references the Connection; the Connection supplies the auth.
  3. **Local-first** — functions with no forge (a plain local git repo).
  4. Not a knowledge item, not the knowledge-export target — attaching must not overwrite either.
  5. Unreachable/unauthenticated → **needs-attention**, never silent.
  6. Materialization is driven by the agent's attachment, never a global path; a substrate-less session degrades to today's behavior.
  7. Forward-only migration.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Substrate** | Durable working files an agent's output lives in, attached to an agent-within-a-team, of a kind. | workspace (= sandbox), repo (one kind), working directory, codebase (code-only), project files |
| **Substrate kind** | The class of a substrate's files (`code`, `doc_set`, …). Open vocabulary. | substrate type, repo type |
| **Materialize** | Place an agent's attached substrate into a session sandbox (e.g. checkout a repo at its branch). | mount, sync, hydrate |
| **Land** | Make an approved substrate change real via the connected target (push/PR/merge/publish) — the agent's own tool call, with its own creds, routed through review (AO3/AL7). | deploy (one kind), commit (capture ≠ land) |

## Scope note

The build scope is the **Team** (and, more precisely, the **agent within a team** the substrate attaches to). A first-class multi-instance "Product" scope is **deferred** (AO4) — for now, isolation is per-team.

## Rationale

The substrate is the structural keystone of Track AO: an agent without a durable home for its output stays doc-only. It attaches to an agent-within-a-team because that is where work happens — a builder operates a repo, a marketing agent operates a doc set. The split from Connection (files vs auth) keeps the two axes clean, but **the agent has its credentials in the sandbox and works with them**, like a real employee ([System Boundary](../architecture/system-boundary.md); [Proposed Call](./staged-operation.md) trust model; the no-credential/broker model was reverted in PR #364). Generalizing `kind` beyond `code` is what lets HyperIdle build similar-stack apps *and* serve non-engineering work with one primitive.
