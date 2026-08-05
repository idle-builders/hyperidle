# AU30 — Every table has an owner, and only its owner touches it

## Work package

**Work package.** As a maintainer, I want every table in the schema to name exactly one service that may read and write it, and every production access to go through that service — so that "who is allowed to change this data" is answerable from the schema instead of from a grep. Six of the forty-five tables have no owner at all today: `sessions`, `propagationLog`, `taskDispatchAttempts`, `userSkills`, `agentRunConfig` and `teamRunConfigDefaults`. Ninety of the ninety-one production table violations are those six, and exactly one is a genuine foreign access by a service that should know better. When this ships, `governance/table-owners.json` has an empty `unowned` block, every production read and write reaches its table through the owning service, and the four table rules stop being advisory.

**Why this matters.** An unowned table is not a style problem — it is a table where any package may invent its own invariants and no package is responsible for keeping them. `sessions` is touched by three packages today with no service between them; `propagationLog` by three; `taskDispatchAttempts` by two. The maintainer's cost of not fixing this is that the ownership model is 87% true, and a partly-true rule is worse than none because reviewers stop checking the part they assume holds. This is also the last structural block in the governance model: the table rules aggregate across all six tables, so **not one of them can be promoted until every one is owned.** That all-or-nothing shape is the reason this is a single work package rather than six small ones.

**Type.** backend.

**What exists today.** `governance/table-owners.json` names all 45 live tables — 39 owned, 6 unowned, each unowned entry carrying the packages that touch it and a one-line note on what assigning it would cost. A table missing from the file is a build error, so the inventory is complete by construction. The owning services already exist for 39 tables and the pattern is established: an owning service is a package under `layers/<layer>/<service>/` that holds the reads and writes for its tables and is named in the registry. `agentRunConfig` and `teamRunConfigDefaults` are touched only by `layers/agent-orchestration/agent-run-config`, which makes them one-line assignments. `userSkills` (core-api 7 sites, settings 2), `propagationLog` (policy 9, core-api 3, work 2) and `taskDispatchAttempts` (work 8, policy 3) need an owner named *and* accessors moved behind it. `sessions` has no candidate service at all — nothing in the tree owns it. The remaining production foreign accesses are small: four service writes, three service reads, three service imports and one layer import, all against tables whose owner already exists. `framework/db`'s own 15 owned-table writes are AU29's, not this work package's.

**What's genuinely missing.** A service that owns `sessions` does not exist and has to be created — that is the one piece of new construction here. The other five need an owner *decision* (which existing service, or a new one) plus accessor relocation. Nothing else in this work package is new capability; it is placement.

**Depends on.**
- **AU29** — `framework/db/src/factory-bootstrap.ts` writes `users`, `knowledgeItems` and `knowledgeAppProjection` directly, and cannot be routed through those owning services while it lives in a framework package, because a framework package may not import a layer. AU29 moves it to a composition root; only then does "go through the owner" have a legal form for those sites.

**Complexity.** L

**Engineering tier.** production — live data-access paths in a shipped system.

**Pre-build gates.**
- **Refinement:** Required — run `/refine` first, and specifically on the noun **`sessions`**. What a sessions service owns, where it lives, and how it relates to `session-requests` and `run-orchestration` is a real domain question, not a placement detail. Getting it wrong creates a seventh problem. The five other assignments do not need refinement.
- **Design:** Not required — backend, no UI surface.

**Human review gates.** Yes — mandatory for every work package. Load-bearing here: naming an owner for a table is a durable domain decision, and creating a sessions service adds a package to the tree.

**Plan calls.** Standard architecture pass, with one exception: the `sessions` owner needs design-it-twice on what the service is *for* before any code moves — apply AU26's own test (does anyone operationally consume this for their own purpose, or only administer it?) rather than defaulting to "whoever touches it most". Sequence the five cheap assignments first so the ratchet records progress while the sessions question is still open; the plan should say explicitly that no rule promotes until the last one lands, so nobody reads the intermediate state as stalled.

**Contracts / constraints.**
- Zero exceptions in the ownership rule. No allowlist, no "foreign-import ceiling", no named carve-out, however small — a cross-owned-table join decomposes into one call per owning service.
- An owning service's exclusivity covers **reads as well as writes**.
- No production export may be added that only tests consume.
- If assigning an owner creates new development-world companion violations (the companion groups are derived from the owners' own writers), this work package clears them rather than leaving them for AU32.
- The baseline is shrink-only, so this work package promotes its own rules as it goes: clearing a group's last site deletes the entry and that rule is at error from the same commit. There is no separate promotion step to remember, and none to defer.
- Every baseline entry cleared is deleted from `governance/baseline.json`, never re-tagged.

**Out of scope.**
- `framework/db`'s own production table writes — AU29.
- The 63 development-world companion violations that exist today — AU32.
- Reducing any service's exposed method surface — that is AU20's axis.

**Effort.** L (~4d)

## Acceptance criteria

- Every table in the schema names exactly one owning service; `governance/table-owners.json` has an empty `unowned` block.
- Every production read and write of a table reaches it through the owning service — no package other than the owner names the table.
- A service that needs data from a table it does not own obtains it by asking the owner, with no cross-owned-table query anywhere in production.
- The four table rules and the two table-symbol import rules fail the build in both directions on any new violation, with no baseline entry backing them.
- Every `db:table (unowned)` and production `db:table (other)` entry is gone from `governance/baseline.json`.
- If clearing this work package's violations leaves `governance/baseline.json` empty, the file and the `--adopt` escape hatch are deleted in the same commit, and reintroducing either — under any name — fails the build. Exactly one of the four clearing work packages will trigger this; whichever gets there last owns it.
- `npm run verify` is green, and the behaviour of every relocated accessor is proven unchanged by tests that exercise it through the owner.

## Validation scenarios

**Given** the governance lint runs over the live tree, **when** it reports, **then** no production violation remains in any `db:table (unowned)` or `db:table (other)` group, and `table-owners.json` lists zero unowned tables.

**Given** a developer adds a new table to the schema without naming an owner, **when** `npm run lint` runs, **then** the build fails naming that table.

**Given** a developer adds a `select` against `sessions` from a package that does not own it, **when** `npm run lint` runs, **then** the build fails — proving reads are covered, not only writes.

**Given** the application runs its existing integration suite, **when** every previously-direct accessor now calls through its owner, **then** the observable results are identical to `origin/main`.
