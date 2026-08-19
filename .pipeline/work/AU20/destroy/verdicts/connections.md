# connections — destroyer verdict

## Should this service exist?

**KEEP AS the sole owner of `service_connections`.** Agent auth is the product: "a tool
that can't authenticate is useless" (ETHOS §2). This service is what lets a human hand a
token/MCP pointer to their agents (UI CRUD), lets a spawn inject it live (provisioning read
+ decrypt), and shows what the machine already grants (inherited reach). Every method traces
to a real door. It is also the table-ACL holder — kill it and four live UI routes plus
spawn-time auth injection die with no replacement.

Context checks the founder asked for, both clean:
- **Bake leftovers (AU21 K1):** genuinely deleted. No `GET /connections/provisioning`
  route, no held-connection snapshot on any emitted intent
  (`rg heldConnections|connectionsSnapshot|bakedConnections` over domain-model events,
  session-requests, core-api services → zero production hits). Only comments and the
  edge-closed integration tests remain. The spawn reads live via
  `listHeldConnectionsForProvisioning`.
- **Credential duplication vs `credentials` service:** none. Cipher is shared
  (`decryptCredentialValue`/`encryptCredentialValue` from `@hyperidle/credential-access`),
  no forked crypto, and this package never touches `server_credentials`. The four probes
  moved OUT of `harness-discovery.ts` cleanly — only comments reference them there now.

Caveat on the small body count: AU20 Am4 already destroyed this service once (7 per-intent
store methods → 4). This pass is the second sweep of a surface that was recently burned.

## If written today, from scratch

Six methods:
- `listConnections(db, filter)` — the ONE read of the table (filter must be non-empty; also
  serves the spawn-time held read)
- `insertConnection` / `updateConnection` / `deleteConnection` — the UI CRUD, ACL-mandated
- `resolveHeldToken(db, userId, connectionId)` — the only plaintext path (function, not class)
- `createInheritedReach()` → `{ refresh, list }` where `list()` returns views directly

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 0 |
| MERGE | 2 |
| SIMPLIFY | 3 |
| KEEP | 3 |

Surface: 8 methods → 6 methods (25% cut); 3 type declarations → 2 (one dies with a merge).
Plus: the stub-runner test seam (`InheritedProbeDeps.run`) dies, and the two stub-based
unit-test files die with it.

## Feature-level kills

- **The all-rows read (`listConnections` with empty filter, documented "admin/debug use
  case").** No production caller ever passes an empty filter (callers pass `{userId}`,
  `{id}`, `{id,userId}`, `{authSource}`). An every-user's-rows read kept "for debugging" is
  exactly the defensive capability the brief names. Kill the branch; empty filter throws.
  Nothing breaks.
- **The stub command-runner seam (`InheritedProbeDeps.run`).** Production never passes it —
  `refresh()` is called bare at boot (`boot.ts:337`) and redetect
  (`create-server.ts:291/:404`). It exists solely so `inherited-reach.test.ts` /
  `inherited-reach-probes.test.ts` can fake CLI output — a mislabeled harness test under the
  repo's own real-binary doctrine. Kill the seam and those tests; the real-binary
  integration test (`AN1-real-harness-inherited.integration.test.ts`) stays and isolates via
  the surviving `env`/`cwd` fields. What breaks: fast unit coverage of CLI-output parsing —
  acceptable; extract the pure parse functions if that coverage is ever wanted back.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `listHeldConnectionsForProvisioning` | BOOTSTRAP (boot.ts:314 → `ProvisionSessionDeps.heldConnections` → spawn) | MERGE | Second read of the same table; = `listConnections({userId, authSource∈held})` + a 6-line ciphertext-stripping map. Widen `listConnections.filter.authSource` to accept a set, do the map in the boot closure that already wraps it. File and its type die. |
| 2 | `createInheritedReach` | BOOTSTRAP (boot.ts:335; refresh at boot + app redetect callbacks) | KEEP | Core value: shows which services agents already reach via machine auth — the inherited group UI:GET /api/connections leads with; zero-config agent reach is ETHOS §2. Probes verified moved (not duplicated) from harness-discovery. |
| 3 | `projectInheritedConnections` | UI:GET /api/connections/ | MERGE | One caller ever, and its only input is `inheritedReach.list()`. Fold into `InheritedReach.list()` returning `ServiceConnectionView[]`; delete the export and the raw-facts hop. |
| 4 | `listConnections` | UI:GET /, POST /, DELETE /:id, POST /:id/validate (/api/connections) + BOOTSTRAP (boot.ts:419 backfill port) | SIMPLIFY | Live on four doors — but delete the empty-filter all-rows branch (unused "admin/debug" capability); require ≥1 condition, throw otherwise. Gains the held-auth-source-set filter from #1. |
| 5 | `insertConnection` | UI:POST /api/connections/ | KEEP | One-line wrapper, but load-bearing: table ACL makes this package the only legal importer of `serviceConnections`, and the route lives outside it. Door + core value (user hands agents a token/MCP pointer) both named. |
| 6 | `updateConnection` | UI:POST /api/connections/:id/validate | SIMPLIFY | Single caller always passes all three patch fields. Make `health`/`lastValidatedAt` required, delete the conditional patch assembly. |
| 7 | `deleteConnection` | UI:DELETE /api/connections/:id | KEEP | Removing a connection is baseline product behavior; owner-scoped delete is the ACL surface for it. |
| 8 | `ServiceConnectionResolver.resolve` | BOOTSTRAP (boot.ts:323 → `buildProvisioningPlan` → spawn) | SIMPLIFY | Core value is real — sole plaintext path feeding spawn-time auth injection — but a class holding one method and one field is ceremony. Demote to `resolveHeldToken(db, userId, connectionId)`; run-orchestration's structural port is satisfied by `{ resolve: (u,c) => resolveHeldToken(db,u,c) }` in boot. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `HeldConnectionForProvisioning` | DELETE | Dies with row 1's merge. It is already a duplicate: `run-orchestration/src/connection-provisioning.ts:94` declares its own structurally identical interface, and that is the one the consumer actually types against. The boot closure maps rows → that shape. |
| `InheritedProbeDeps` | SIMPLIFY | Drop `run` — production never passes it; it exists only so stub-based unit tests can fake CLI output (test-only seam on a production signature; harness probes are real-binary-tested per repo doctrine). Keep `env`/`cwd`, which the real-binary integration test needs for `CODEX_HOME`/`XDG_CONFIG_HOME`/`.mcp.json` isolation. |
| `InheritedReach` | SIMPLIFY | Two members stay two, but `list()` returns `ServiceConnectionView[]` (absorbing row 3) and `refresh(deps)` shrinks with `InheritedProbeDeps`. Raw `InheritedConnectionFact[]` never leaves the package. |

## Holes this leaves

- **No all-rows table read.** If someone later wants a cross-user connections dump for
  debugging, they write SQL by hand. That is the correct price.
- **No stubbed probe unit tests.** CLI-output parsing regressions surface only in the local
  real-binary integration lane (which has no CI job by design). If that bites, the fix is
  extracting pure `parseX(stdout)` functions and unit-testing those — not resurrecting the
  stub runner.
- **Not a hole, but a boundary note for the founder:** core-api's settings backfill
  (`plugin-configuration.ts:744`) reads this service's table through the boot-exported
  `serviceConnectionsReader.listByAuthSource` port. The owner serves the read, so the ACL
  holds — but if the settings destroyer kills the mcp-seed backfill, `listConnections`'
  authSource-only filter loses its last cross-layer consumer.
