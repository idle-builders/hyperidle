# filesystems — destroyer verdict

## Should this service exist?

**KEEP — but as the ONE filesystem service. MERGE `filesystem-mounting` into it and delete that package.**

The feature is core value: a founder hands an agent a real repo or folder, and the agent gets it mounted in its sandbox at spawn. That is literally "agents doing real work" — register → probe → inject → mount → capture is one lifecycle, one domain.

It is currently split across two packages for a reason that no longer exists. `filesystem-mounting`'s own barrel lore says the F1 split happened because "`filesystems` is still a core-owned table" — that premise died with the founder's 2026-08-04 F2 ruling. `tools/governance/table-owners.json:45-47` now places `filesystems`, `filesystemInjections` (owner: `filesystems`) and `filesystemCaptures` (owner: `filesystem-mounting`) all in the same agent-orchestration Layer. Two same-layer packages, one domain, and the split forces a **duplicated 12-verb git-runner port** (`FilesystemsGitRunnerFactory` in `filesystems/src/ports.ts` vs the structurally identical `MountingGitRunnerFactory` in `filesystem-mounting/src/ports.ts`). Merge direction: mounting → filesystems (10 functions absorb 1 class + 1 const). One package, one table-owners entry set, one git-runner port. The `filesystem-mounting/src/index.ts` lore claiming filesystems is core-owned is stale and dies in the merge.

Note: this service was already gutted once (AU20 R-filesystems: NoopAuthResolver, adapter classes, two-step agent list, `startWatcher`, `listCaptures`, all deleted). AU21's bake-at-emit machinery (`resolveInjectedFilesystemsForAgent`) is **confirmed fully gone** — zero hits repo-wide (`rg -a` across layers/framework/applications/tools), AU26 F2 replaced it with the live spawn-read. The remaining fat is not in the functions — it is in the **types** (9 declarations propping up 10 one-query functions) and in the package split.

## If written today, from scratch

Nine functions, one package, three types:

- `saveFilesystem`, `getFilesystem`, `listFilesystems(teamId|agentId)`, `deleteFilesystem` — the record
- `saveInjection`, `deleteInjection` — assign/eject a filesystem for an agent
- `refreshFilesystemState` — probe + persist in one call (today's `resolveFilesystemState` + `updateFilesystemState` + the route's `checkAndPersistState`, which is service logic stranded in a route)
- `listInjectedFilesystemsForProvisioning` — the live spawn-read, returning `Filesystem` from `@hyperidle/filesystem-contract`
- `inspectLocalPath` — onboarding path probe
- plus `RegistryFilesystemMounter` + `SANDBOX_SCAFFOLDING_PATHS` absorbed from the dead sibling package
- Types: `FilesystemFilter` (two fields), `LocalPathInfo`, one shared 12-verb git-runner port

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 6 |
| MERGE | 2 |
| SIMPLIFY | 4 |
| KEEP | 7 |

Surface: 10 methods → 9 methods (10% cut) · 9 type declarations → 3 (67% cut) · 2 packages → 1

## Feature-level kills

1. **Kill the team-consistency gate on `POST /api/filesystems/:id/injections` — and with it, both internal seam endpoints.** The gate (core-api `routes/filesystems.ts:67`) reads `users` + `team_members` to verify the agent belongs to the filesystem's team, and because those are core tables, the write has to travel core → HTTP seam → `GET /api/agent-orchestration/filesystems/:id/team` + `POST .../injections/persist` (`agent-orchestration-intake.ts:403,413`) → `saveInjection`. That is two internal HTTP endpoints, a seam declaration on `core-api-port.ts`, and a two-hop write, all to enforce a same-team check. This is a permission matrix reflex (ETHOS §1/§2: trust humans and agents; small teams usually ARE one team). Delete the gate, move the route into `layers/agent-orchestration/src/routes/filesystems.ts` beside its siblings, call `saveInjection` directly, delete both intake endpoints and the seam entries. Hole: a user can inject a filesystem into an agent on another team — the mount still works, nothing corrupts (FKs still guarantee both rows exist). Acceptable.

2. **Kill the `filesystem-mounting` package** (merge, not delete — the mounter code is live and core). See above.

3. **Already dead, confirmed dead:** AU21's pre-bake machinery. Nothing left to kill; noted so nobody hunts for it again.

## Full method audit

Reachability verified with the code graph at head ba0fb454; both graph-negative rows (`saveInjection`, `listInjectedFilesystemsForProvisioning`) confirmed LIVE by `rg -a` — the graph missed an alias import (`saveInjection as saveFilesystemInjection`, `agent-orchestration-intake.ts:41`) and boot-time DI wiring (`boot.ts:319-322`).

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `resolveFilesystemState` | UI:POST /api/filesystems/ · UI:GET /api/filesystems/:id | MERGE | Always called with `updateFilesystemState` via the route's `checkAndPersistState` helper — that trio is one act. Fold all three into one service method `refreshFilesystemState(exec, row, deps)`; also drop the `FilesystemReachabilityInput` mirror and take `FilesystemRow` (it reads 4 of the 9 fields). |
| 2 | `saveFilesystem` | UI:POST /api/filesystems/ | KEEP | Core value: registering a repo/folder is how a founder gives an agent real material to work on. Door: register route, live from SettingsFilesystems + SetupFlow. |
| 3 | `getFilesystem` | UI:POST /api/filesystems/ · UI:GET /api/filesystems/:id · UI:DELETE /api/filesystems/:id · UI:GET /api/agent-orchestration/filesystems/:id/team (seam) · UI:POST .../injections/persist (seam) | KEEP | Core CRUD read behind three real doors. The two seam doors die with feature-kill #1; the method survives on the other three. |
| 4 | `listFilesystems` | UI:GET /api/filesystems/ · INTERNAL (`listInjectedFilesystemsForProvisioning`) | SIMPLIFY | The `ids` branch and the bare list-everything fallback have zero production callers (only `teamId` and `agentId` are ever passed). Delete both branches; filter becomes `teamId` XOR `agentId`. |
| 5 | `updateFilesystemState` | UI:POST /api/filesystems/ · UI:GET /api/filesystems/:id | MERGE | One-line UPDATE only ever executed as the persist half of a probe. Dies into `refreshFilesystemState` (row 1). |
| 6 | `deleteFilesystem` | UI:DELETE /api/filesystems/:id | KEEP | Detach door; injections cascade at DB level. Minimal already. |
| 7 | `saveInjection` | UI:POST /api/agent-orchestration/filesystems/:id/injections/persist (seam from core POST /api/filesystems/:id/injections) — graph missed the alias import, `rg` confirms | KEEP | The injection write IS the product act "give this agent this filesystem". After feature-kill #1 it is called directly from the moved route, one hop. |
| 8 | `deleteInjection` | UI:DELETE /api/filesystems/:id/injections/:agentUserId | KEEP | Eject door, single query, returns existence honestly. Minimal. |
| 9 | `listInjectedFilesystemsForProvisioning` | BOOTSTRAP (`boot.ts:321` → `run-orchestration` `mountFilesystemsForAgent`, admitSession Phase 4.5) — graph missed DI wiring, `rg` confirms | SIMPLIFY | The spawn-read is core value (closes the AU26 F2 staleness window), but the hand-rolled 9-field mapping duplicates the route's `rowToFilesystem`. Return `readonly Filesystem[]` from `@hyperidle/filesystem-contract` via one shared mapper; delete the `InjectedFilesystemForProvisioning` mirror. |
| 10 | `inspectLocalPath` | UI:POST /api/filesystems/inspect-path | KEEP | SetupFlow onboarding calls it twice (`SetupFlow.tsx:368,508`) to classify folder vs git repo and get the branch `codeRefSchema` requires before register. Real user-facing door, never throws, already minimal. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `FilesystemReachabilityInput` | DELETE | Nine-field mirror of `FilesystemRow`; the function reads four of them. Take `FilesystemRow` — the only production caller already passes exactly that. |
| `FilesystemRow` (re-export alias) | DELETE | Pure passthrough of `@hyperidle/db`'s type. Governance classifies `db:row-type` as an ungated import surface — the route imports it from `@hyperidle/db` directly (it already imports `HyperIdleDb` from there). |
| `NewFilesystem` (re-export alias) | DELETE | Passthrough with zero external consumers — `rg -a` finds only `framework/db` itself and this package. |
| `NewFilesystemInjection` (re-export alias) | DELETE | Same: zero external consumers. |
| `FilesystemFilter` | SIMPLIFY | Dies to two fields (`teamId` XOR `agentId`) with row 4's branch kills. |
| `InjectedFilesystemForProvisioning` | DELETE | Third copy of the same nine fields (`Filesystem` in filesystem-contract, `FilesystemForProvisioning` in run-orchestration are the other two). The consumer re-declares its own port shape by design (Mechanism C), so this one serves nobody — return `Filesystem`. |
| `LocalPathInfo` | KEEP | The wire contract of a live door (inspect-path JSON body). Three fields, all read by SetupFlow. |
| `FilesystemsGitRunnerFactory` | SIMPLIFY | Declares 12 verbs; this package calls 3 (`lsRemote`, `revParseIsInsideWorkTree`, `currentBranch`) — the other 9 are a copy-paste of the mounting engine's needs from before the F1 split. After the package merge: one shared port with `MountingGitRunnerFactory`. If the merge is rejected: shrink to the 3 used verbs. |
| `FilesystemsServiceConnectionResolver` | DELETE | Never used inside this package — it types the ROUTE's injected dependency and is parked here only because the route once lived in core-api. Post-F2 the route sits in the same layer; declare the one-member shape inline at the route (or import from `@hyperidle/connections`). |

## Holes this leaves

- **Cross-team injection becomes possible** (feature-kill #1): a filesystem can be injected into an agent on a different team. FKs still guarantee both rows exist; the mount works; nothing corrupts. For a small-team product this is a trust posture, not a bug — and if it ever burns someone, that learning earns the gate back per ETHOS §2.
- Everything else is behavior-preserving: the merges and simplifies change signatures and package layout, not observable behavior. Tests exercising the `ids` filter branch and the deleted type mirrors die with them.
- Unrelated but observed while auditing: mount failures at spawn are `console.warn`-only (`filesystem-provisioning.ts:107-116`) — the register-time probe is currently the ONLY user-visible signal a filesystem is broken. That is the argument for keeping the probe; it is not a hole this pass creates.
