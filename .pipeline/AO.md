# Track AO: Self-Hosting Build Loop

The genuinely-missing work to let a flat team of humans and AI agents build real software — HyperIdle itself and other similar-stack apps — **on** HyperIdle. Source: the deep review of 2026-06-25 (`.pipeline/audits/product/DEEP-REVIEW-2026-06-25.md`).

**Shipped foundation.** AO1 (a product's output filesystem) and AO2 (mount the bound filesystem into the session working directory) are merged. AO3 is **WONT DO** — see below.

**Locked concept (`/pipeline:refine AO0`, 2026-06-26).** The outcomes that bind this track:

- **Filesystem↔Tool↔Knowledge decision rule.** A filesystem is **only** an authored, file-like, version-controlled corpus (code + document authoring). **Systems of record** (email inbox, ticket queue, CRM) are **live tools** — Track AN — and are never materialized. **Reference corpora** are **retrieval** — the knowledge fabric. Discriminator: *author a corpus* → filesystem; *operate a system of record* → tool; *look something up* → knowledge. Not "does an API exist." So AO does **not** materialize inboxes, CRMs or ticket queues and does **not** build a Drive/Dropbox sync engine.
- **Agents work with their credentials in the sandbox.** The bound Connection's auth is provisioned into the sandbox so the agent's own tools push and open PRs. **No credential withholding, no broker-only path** — the reverted-broker model is dead (PR #364).
- **Write-back rides the host** — `git` for code, last-write plus snapshot for a folder. **No custom sync or conflict engine.**
- **Product is not modelled (for now).** Scope is the **Team**; multi-product is deferred to AO4.

**AO3 is WONT DO (founder, 2026-07-03).** Its direct `land_change` concept is rejected: it made HyperIdle "land" captured code by pushing a git ref after a HyperIdle review, duplicating and bypassing the provider-native flow that already owns review, CI, branch protection, conflict handling and merge. The replacement scope is **AN4** (`.pipeline/AN.md`), under track AN because it is provider synchronization, not filesystem landing. Do not re-derive a HyperIdle-owned merge or landing path.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| AO4 | Product as a first-class scope (multi-product): a durable scope that isolates each product's filesystem, work, knowledge, connections and cost | backend | L | AO1 (shipped) | **DEFERRED (founder, 2026-06-26)** and unbuilt. "Product" is not modelled for now — the build scope is the Team, and multi-product means multi-team. **Re-scope before re-opening: the residual is much smaller than the original framing assumes.** `productId` was already removed by U1 (→ `teamId`) and `scopeId` already equals `teamId`, so the only live residual is per-team isolation of promotion — the factory-wide `DISTINCT scopeId` leak in the promotion pipeline. **Rejected alternative:** "project" — projects are time-bound and end; the scope is the durable thing being built. How a product couples to a team (1:1, one team many products, or a product spanning teams) is deliberately left open for a concept pass, not pre-resolved. |
| AO5 | Fork a new session from a prior session's captured checkpoint: reconstitute a capture into a fresh working directory, start a forked session on top of it, and record parent→child lineage | backend | L | AO2 (shipped) | unbuilt — carried from the legacy track file. AO2 shipped a capture **write** path with **no read** path: every `filesystem_captures` row is currently dead weight, and that asymmetry is itself a defect. A long agentic run that fails or diverges late has no recovery point — `crashSession` keeps the sandbox for debugging but nothing can resume from it, and `endSession` bundles then deletes. **Constraint:** the checkpoint granularity is the git commit / bundle, never an in-process model-call trace — HyperIdle harnesses are black-box CLIs, so we fork the session's filesystem state and never instrument the agent's loop. **Deliberately scoped to the foundational primitive only** — the speculative meta-agent auto-rewind supervisor is deferred (ETHOS: earned from a real learning, never preemptive). |

## Dependency graph

- `AO4` → `AO1` (shipped): a product owns its filesystem, so the filesystem model must exist before it can be isolated per product. Re-scope after AO1/AO2, which have both landed.
- `AO5` → `AO2` (shipped): restores from the `filesystem_captures` rows AO2 writes and adds a symmetric restore to AO2's GitRunner verbs and mount-adapter registry. Without AO2's write path there is nothing to restore.
- `AO4` and `AO5` are independent of each other.
- Cross-track: the provider-native review/merge sync AO3 attempted is `AN4` (`.pipeline/AN.md`), not this track.
