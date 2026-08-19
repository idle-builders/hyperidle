# credentials — destroyer verdict

## Should this service exist?

**KEEP AS the `server_credentials` table-ACL unit — shrunk from 2 files to 1.**

Tried to kill it three ways; all three fail on architecture, not sentiment:

1. **Dissolve into `@hyperidle/credential-access` (framework)?** No. That package is a framework
   primitive — no db handle, off the bus (AU29 substrate rule). Moving a SQL-owning store there
   hands framework a table, which is exactly what the substrate split exists to forbid. The cipher
   already lives there *because* it touches no table; the store stays here *because* it does.
2. **Dissolve into `agent-orchestration/connections`?** No. AU26 E2/J2 already litigated this:
   `server_credentials` keys are resolved on core's OWN call path (model resolution, credentials
   routes, harness readiness, notifications email). Moving the table to the agent layer inverts a
   clean consumer-locus edge to fix nothing.
3. **Dissolve into another core-api service (`settings`)?** No. The consumer set spans four
   services (credentials routes, harnesses, notifications, model resolution) — a neutral per-table
   owner is the correct ACL shape; folding into `settings` blurs table ownership for zero deletion.

This is the LLM-key catalog. An agent OS whose agents cannot authenticate to a model provider is a
brick — this is as core as core value gets (ETHOS §2: "a tool that can't authenticate is useless").
The service already absorbed AU20 Am4's collapse (34 → 5 exports, 9 accessors → 3). What's left is
the bone, minus one remaining piece of ceremony: the resolver class.

## If written today, from scratch

One file, four functions, one type, zero classes:

- `readCredentials(db, filter?)` — list / point-lookup
- `writeCredential(db, name, patch)` — upsert or validation write-back
- `deleteCredential(db, name)` — remove
- `resolveCredential(db, name)` — read + decrypt, the production secret path (today a class)
- `CredentialWrite` — the patch, without `updatedAt` (store stamps it)

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 0 |
| MERGE | 1 |
| SIMPLIFY | 1 |
| KEEP | 3 |

Surface: 4 methods → 4 methods; 5 exports → 4 (class dissolved into a store function; file
`credential-resolver.ts` deleted; AH1 `instanceof` invariant test + the `credentialResolver`
exposure on `CoreApiBoot`/`ServerHandle` die with it).

## Feature-level kills

No user-facing feature dies — every method sits on a live UI door or the boot-wired model-resolution
path. Two structural kills ride along:

1. **The resolver class + its test-serving exposure.** `DbCredentialResolver` exists as a *class*
   for one reason: so `server-factory.resolver.test.ts` can assert `instanceof` and so
   `CoreApiBoot.credentialResolver` / `ServerHandle.credentialResolver` can carry it out for that
   assertion (boot.ts:150 and create-server.ts:123 say so in their own comments). The invariant it
   guards — "production resolves from DB, not env" — has no remaining reversion path:
   `EnvCredentialResolver` was exiled to `tools/eval` and the production barrel exports only the DB
   implementation. Structure that exists to make a test pass is DELETE by the brief's own list.
   The class also re-implements `readCredentials`' point-lookup SQL instead of calling it —
   internal duplication inside a 2-file package. Fold `resolve` into the store as
   `resolveCredential(db, name)` built on `readCredentials` + `decryptCredentialValue`; the
   composition root passes `{ resolve: (name) => resolveCredential(db, name) }` to the
   `CredentialResolver` port. Delete the class, the two handle exposures, and the instanceof test.
2. **Adjacent, not this service's rows:** three composition roots (`boot.ts:247`,
   `service-bootstrap.ts:162`, `app.ts:238`) re-wrap this store back into the OLD per-intent shape
   (`findByName`/`upsert`/`deleteByName`) because `NotificationsDeps.credentialStore` still speaks
   it. Am4's collapse stopped at the store boundary; the per-intent methods it killed live on as
   three copies of adapter glue. `NotificationsDeps` should take `read`/`write`/`delete` directly.
   Belongs to the notifications/composition-root verdict — flagged here so it isn't lost.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `readCredentials` | UI:GET /api/credentials/ (+ PUT, POST /:name/validate, GET/POST /api/harnesses, GET/POST notifications, SCHED:notification-drain, EVENT:routine_fired) | KEEP | Core value: humans see/manage LLM keys, harness readiness and email drain read them. Already the Am4 merge of findByName+listAll — one verb, 8 real doors. |
| 2 | `writeCredential` | UI:PUT /api/credentials/:name (+ POST /:name/validate, PATCH /api/notifications/config) | KEEP | The only way a key enters the system; upsert/write-back dual path is the Am4 merge of 4 old writers. Re-splitting is churn, not shrinkage. |
| 3 | `deleteCredential` | UI:DELETE /api/credentials/:name (+ PATCH /api/notifications/config) | KEEP | A key you can't remove after rotation is a broken catalog. Two lines, live door. |
| 4 | `DbCredentialResolver.resolve` | BOOTSTRAP boot.ts:242 → `CredentialResolver` port → `resolveModel` on every agent run (graph shows 0 doors — interface dispatch hid it; rg confirms the wiring) | MERGE | The production secret path, but the *class* is test-serving ceremony: fold into the store as `resolveCredential(db, name)` on top of `readCredentials` (kills its duplicated SQL), delete the class, the `instanceof` test, and both handle exposures. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `CredentialWrite` | SIMPLIFY | Every caller (routes, migration, notifications adapter) passes `updatedAt: now` — no caller ever passes anything else. Stamp it inside `writeCredential`, drop the field; every call site sheds a line. |

## Holes this leaves

- **AH1 single-resolver invariant is no longer test-assertable via `instanceof`.** Acceptable: the
  env resolver no longer exists in production code, so the reversion the test guards against has no
  path. If a learning ever re-earns the invariant, assert on behavior (resolver returns the DB row's
  decrypted value), not on class identity.
- **`resolveModel`'s `CredentialResolver` port is satisfied by an object literal at boot instead of
  a named class.** Nothing breaks — the port lives in `credential-access` and never required a
  class.
- No user-visible hole. Every door listed above keeps working.
