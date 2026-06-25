# Substrate primitive (Track AO)

The durable working files an agent's output lives in and accrues history on, owned by a **Product**, of a `kind` — a git **code repository** for code work, a **document/knowledge set** for non-code work. Concept locked in `plans/AO/concept.md`; consumed by AO1 (model + bind surface), AO2 (materialization), AO3 (land). Grounded in [System Boundary](../architecture/system-boundary.md) ("code lives in a local git repo, forge-optional").

## Why it exists

Without a substrate an agent can research and plan but cannot produce durable, reviewable output — code least of all (the sandbox has no `src/`). Today `knowledge_items` is the only durable output store and non-code outputs are squeezed into it; code has no home at all. The substrate is the structural keystone of the self-hosting build loop, and generalizing it beyond code is what lets one HyperIdle instance build similar-stack apps and serve non-engineering work with one model.

## Canonical shape

```
Substrate {
  id            # opaque, stable
  product_id    # FK → the owning Product (= teams.id). Required. A substrate
                #      belongs to exactly one Product.
  kind          # OPEN vocabulary. Initial committed set: `code` | `doc_set`.
                #      `code` → a git repository; `doc_set` → a document/knowledge set.
                #      New kinds added without editing core (mirrors Artifact kinds).
  location      # how to reach the files. For `code`: clone URL / local path + branch.
  connection_id # OPTIONAL FK → a Connection (Track AN) supplying forge auth for a
                #      `code` substrate. By reference only — NO credential stored here.
  state         # `bound` | `reachable` | `needs_attention`
  created_at
}
```

> **No credential ever lives on this record or in the sandbox.** Forge auth is a Connection (Track AN) concern, applied by the *system* at checkout/push, never handed to the agent.

## Essential properties

- A `kind` (open vocabulary; ≥1 non-code kind so the primitive is not code-only).
- A `location` (for code: repo + branch).
- Ownership by exactly one **Product**.
- The capacity to **accrue history** (commits / revisions).
- A **reachability state** that surfaces unreachable/unauthenticated as *needs-attention*, never a silent failure.

## What it is not

- **Not a `knowledge_item`** — knowledge items are derived, promoted, attention-scored fabric entries; a substrate is the raw working files the agent edits/builds/tests. (Today non-code output is wrongly squeezed into `knowledge_items`; AO1 fixes this.)
- **Not the knowledge-export config/target** — `git-export` writes knowledge markdown to a single global repo; binding a substrate must not overwrite the export configuration.
- **Not a Connection (Track AN)** — a Connection is auth + tools; a substrate is files. Orthogonal axes that **compose** (forge auth for a code substrate comes from a Connection). No credential on the substrate.
- **Not the sandbox** — the sandbox is the ephemeral, per-session, isolated directory where a substrate is *materialized* (AO2). The substrate is durable; the sandbox is thrown away.
- **Not HyperIdle's store-of-record for code** — code is git-derived; the Artifact is derived from the repo, never the canonical store ([System Boundary](../architecture/system-boundary.md) hard rule 4).

## Composition

- **Owned by** a Product (`Product 1 — 0..N Substrate`). A product may own a code repo *and* a doc set.
- **References** a forge Connection (Track AN) for `code` auth — by id, never embedding the credential.
- **Materialized by** a unit of work (bet/task/session) into its session sandbox (AO2). A unit of work materializes one or more of *its product's* substrates.
- **Source of** the Artifacts (L3) an agent produces — the artifact is *derived from* the substrate.

## Lifecycle

```
bound ──► reachable ⇄ needs_attention
              │
              └─(per session, AO2)─► materialized → mutated by agent → captured back
```

The substrate record is durable. The materialization is ephemeral: the working tree is placed into the sandbox at its branch, the agent edits/builds/tests, and the result is committed/written back at session end. Changes are never lost when the sandbox is destroyed.

## Authority

- The **Product owns** its substrate(s).
- The **founder binds** a substrate to a product (and sees its kind/location/state).
- The **system materializes** it at provisioning and **applies auth** at checkout/push — the **agent never holds the forge credential**.
- For code, the **git repo itself** is the source of truth (code is git-derived).

## Contracts

- **Cardinality.** `Product 1 — 0..N Substrate`; a substrate belongs to exactly one product. Binding level is the **Product** (durable), not the unit of work; a unit of work selects from its product's substrates.
- **Closure.** Substrate `kind` is an **open** vocabulary (new kinds without editing core). Initial committed kinds: `code` + `doc_set`.
- **Mutability.** Binding (`kind`/`location`/`branch`) settable and updatable; the materialized working tree is mutated and captured back; forge auth never stored on the record.
- **Identity.** Opaque id; for `code`, `(location + branch)` is the natural address.
- **Hard rules.**
  1. Substrate ⟂ Connection — compose, never merge. No forge credential on the record or in the sandbox; the system applies auth.
  2. **Local-first** — functions with no forge (a plain local git repo).
  3. Not a knowledge item, not the knowledge-export target — binding must not overwrite either.
  4. Unreachable/unauthenticated → **needs-attention**, never silent.
  5. Materialization is driven by the unit-of-work → product binding, never a global path; a substrate-less unit of work degrades to today's behavior.
  6. Forward-only migration.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Substrate** | Durable working files an agent's output lives in, owned by a Product, of a kind. | workspace (= sandbox), repo (one kind), working directory, codebase (code-only), project files |
| **Substrate kind** | The class of a substrate's files (`code`, `doc_set`, …). Open vocabulary. | substrate type, repo type |
| **Materialize** | Place a product's substrate into a session sandbox (e.g. checkout a repo at its branch). | mount, sync, hydrate |
| **Land** | Make an approved substrate change real via the connected target (push/PR/merge/publish) — the agent's own tool call routed through review (AO3/AL7). | deploy (one kind), commit (capture ≠ land) |

## Rationale

The substrate is the structural keystone of Track AO: an agent without a durable home for its output stays doc-only. The split from Connection (files vs auth) and the no-credential-in-sandbox rule come straight from [System Boundary](../architecture/system-boundary.md) and the [Proposed Call](./staged-operation.md) trust model — we trust the agent, but auth lives on the connection axis, not smeared onto the files. Generalizing `kind` beyond `code` is what lets HyperIdle build similar-stack apps *and* serve non-engineering work (a marketing agent's document set) with one primitive.
