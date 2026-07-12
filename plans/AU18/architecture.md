# AU18 — Architecture: Notification owns `notificationQueue`; `factorySettings` retired

**Type:** backend · **Complexity:** L (see §10 — verified surface is XL-leaning; scope decision flagged) · **Depends on:** AU11 (shipped)
**Pre-build gates:** Refinement — not required. Design — not required (no UI).

---

## 1. Context + verified call-site surface

Closes the last confirmed Core-App read/write-ownership gap in Track AU. Two independent halves:

- **(A) `notificationQueue` ownership** — give the table exactly one owning module (like Conversation/Users/Work/Routine/Knowledge already have).
- **(B) `factorySettings` retirement** — finish the abandoned `server_config` migration, move real settings there, turn computed values into owned state, then **drop the table**.

### 1a. Spec-vs-reality delta (READ THIS FIRST)

The spec's narrative names **8 `factorySettings` files** and **5 real-setting callers**. Direct code reading (every match verified, not grep-counted) finds the true surface is roughly **2× the files and ~13 key-namespaces**, and — critically — **several namespaces have NO production writer at all** (only bootstrap-seed or defaults). This is exactly the 3-7× first-pass undercount the spec warned about (AU12/AU13 precedent).

**Verified real table-access files (14 in `packages/server`, +2 in `packages/db`):**

| # | File | factorySettings access | In spec's list? |
|---|------|------------------------|-----------------|
| 1 | `notifications/config.ts` | R+W, 19 keys `notifications.*` (incl. 2 secrets) | ✅ named |
| 2 | `notifications/mute.ts` | R+W, `notifications.mute_<typeKey>` | ✅ named |
| 3 | `services/observability/config.ts` | R+W, 5 keys `observability.*` | ✅ named |
| 4 | `config/git-export-config.ts` | R+W, 12 keys `git_export.*` (incl. 3 computed stamps) | ✅ named |
| 5 | `routes/status.ts` | R+W, generic `/settings` catch-all + reads `factory_start_time` | ✅ named |
| 6 | `services/cost-cap.ts` | W, `cost_actual` (computed) | ✅ named (computed) |
| 7 | `services/cost-sentinel.ts` | R+W `cost_sentinel_last_level`; R `cost_cap`,`cost_actual` | ✅ named (computed) |
| 8 | `notifications/silence-policy.ts` | R, `silence_mode` / `silence_product_<teamId>` / `silence_window_{start,end}` | ❌ **MISSED** |
| 9 | `knowledge/scoring-config.ts` | R, `scoring.weight.*` / `attention.weight.*` / `relevance.weight.*` / `relevance.<shape>` | ❌ **MISSED** |
| 10 | `services/policy-engine.ts` | R, `trust_window_days` / `trust_queue_threshold` / auto-resolve threshold+min-verdicts | ❌ **MISSED** |
| 11 | `routes/agent-profile.ts` | R, `trust_window_days` | ❌ **MISSED** |
| 12 | `services/roster.ts` | R, `system_template:<role>` | ❌ **MISSED** |
| 13 | `routes/agents.ts` | R, `system_template:<role>` (GET /templates/:role) | ❌ **MISSED** |
| 14 | `services/routine-scheduler.ts` | R, `cost_cap`,`cost_actual` | ❌ **MISSED** |
| 15 | `packages/db/src/factory-bootstrap.ts` | **W (seeder)** — seeds `cost_cap`,`cost_cycle`,`system_template:<role>` | ❌ **MISSED (db layer!)** |
| 16 | `packages/db/src/demo-fixture.ts` | R, `n:<role>` template keys (demo only) | ❌ **MISSED** |

**Incidental matches excluded (comment/doc/@lore only, NO table access):** `services/server-config.ts`, `tools/add-agent.ts`, `services/lifecycle-propagation.ts` (line 539 comment; it DOES touch `notificationQueue` though — see §1b), `routes/auth.ts`, `middleware/auth.ts`, `routes/settings.ts`, `routes/model-gateway.ts`. Grep returned 21 files; **7 are pure comment matches**.

**No-production-writer namespaces (writers found only in `factory-bootstrap` seed or nowhere; changes the migration):**
- `scoring.weight.*`, `attention.weight.*`, `relevance.*`, `trust_*`, auto-resolve keys → **no writer exists** (loaders always fall back to hardcoded defaults in prod). Only reachable write path is the generic `/settings` PATCH (itself being retired).
- `cost_cap` → written **only** by `factory-bootstrap` seed (value `20000`); `cost_cycle` → seeded but **zero readers** (dead).
- `system_template:<role>` → written **only** by `factory-bootstrap` seed from `docs/system-prompts/*.md`.
- `factory_start_time` → **no writer found anywhere** in prod; `status.ts` read always falls back to `SERVER_START_TIME`.

### 1b. `notificationQueue` surface (6 files, all real, all single-table)

| File | Ops | Notes |
|------|-----|-------|
| `notifications/dispatcher.ts` | R (by status; pending; pending-digest; sending-lease) + W (insert enqueue; update status/claim/lease w/ `returning{id}`) | Already exports partial owners: `enqueueNotification`, `recoverStuckLeases`, `flushQueue`, `dispatchDigest`, plus raw reads. |
| `notifications/digest.ts` | R (pending asc; by-ids sending) + W (update by-ids) | `runDailyDigest`. |
| `routes/notifications-routes.ts` | R (by status desc; unread desc) + W (update seenAt where null; update readAt) | In-app popover endpoints. |
| `services/retention-reaper.ts` | W (delete where createdAt<cutoff & status∈{sent,failed,dropped} `returning{id}`) | GC. |
| `services/lifecycle-propagation.ts` | W (insert enqueue) | Line 663. |
| `routes/teams-routes.ts` | R (select `{id}` where eventType+subjectId+status='pending') | **Not in spec** — dedup-throttle check. Single-table (no join) → AC-7 trivially satisfied. |

**AC-7 check:** every `notificationQueue` query is single-table (no `notificationQueue ⋈ other-domain` join). `dispatcher.ts` imports `items as itemsTable` but does not join it to `notificationQueue`. Builder must re-confirm no join at each site during extraction; decompose if one is found (none currently).

---

## 2. Half A — Notification owning module

### 2.1 File

Create `packages/server/src/notifications/notification-queue.ts` — the **single repository** that owns every `notificationQueue` read AND write. This is the AU14 pattern (`knowledge-repository.ts`): one file, zero allowlist, everyone else calls it.

> Rationale for a new repository rather than "dispatcher.ts is the owner": `notificationQueue` is touched from 6 files across routes/services/dispatcher. A repository file is the only shape that lets a repo-wide guard name exactly ONE legal reference site. `dispatcher.ts` keeps its orchestration logic (flood cap, lease flush, adapter calls) but delegates all table I/O to the repository.

### 2.2 Exported functions (cover every verified call site's exact need)

Signatures return typed rows/projections; ordering + `where` shapes are preserved from the current raw queries.

```ts
// Reads
queueCountByStatus(db, status): Promise<number>
listByStatus(db, status): Promise<NotificationQueueRow[]>              // routes: orderBy createdAt DESC
listPending(db): Promise<NotificationQueueRow[]>                        // orderBy createdAt ASC (dispatcher, digest)
listPendingDigest(db): Promise<NotificationQueueRow[]>                  // status=pending & severity=digest, ASC
listUnread(db): Promise<NotificationQueueRow[]>                         // readAt IS NULL, DESC
listStuckLeases(db, cutoff): Promise<NotificationQueueRow[]>           // status=sending & claimedAt<cutoff
listByIdsWithStatus(db, ids, status): Promise<NotificationQueueRow[]>  // digest by-ids
findPendingByEventSubject(db, eventType, subjectId): Promise<{id}|undefined> // teams-routes throttle
// Writes
insertNotification(db, row: NewNotificationQueueRow): Promise<void>
claimForSend(db, id): Promise<{id}|undefined>                          // update pending→sending returning{id} (lease)
updateStatus(db, id, patch): Promise<void>                             // status/attempts/sentAt/lastError/claimedAt
requeueLease(db, id): Promise<void>
markSeenAll(db, now): Promise<void>                                    // seenAt where seenAt IS NULL
markRead(db, id, now): Promise<void>
updateManyByIds(db, ids, patch): Promise<void>                        // digest batch transitions
deleteReaped(db, cutoff, statuses): Promise<string[]>                 // delete returning ids
```

`enqueueNotification` (the existing public write entry with flood-cap logic) **stays in `dispatcher.ts`** but rewires its raw `insert`/`select`/`update` calls to `insertNotification` / `queueCountByStatus` / `updateStatus`. Callers of `enqueueNotification` (dispatcher, notification-listener, teams-routes, lifecycle-propagation) are unchanged at the call boundary.

### 2.3 Guard (AC-6a, AC-7)

`scripts/au18-notification-ownership-guard.ts` — **repo-wide, zero-allowlist**, cloned from `au14-knowledge-ownership-guard.ts` (AST scan of `.from/.insert/.update/.delete` + `.leftJoin/.innerJoin/.rightJoin/.fullJoin` whose first arg is the bare identifier `notificationQueue`). One difference from AU14: instead of a single GUARDED_FILE, the **only** legal reference site is `packages/server/src/notifications/notification-queue.ts` (+ its `*.test.ts`). Any other file referencing `notificationQueue` = fail. Ships with `--fixtures` self-test (positive: repo file legal; negative: a synthetic `.from(notificationQueue)` in a fixture file fails). Wire into `package.json` `lint` chain after the `au14` entry.

---

## 3. Half B — `factorySettings` retirement, per-namespace target

The generic KV bucket is **not one domain**. Each namespace gets the *right* home — do NOT dump everything into one JSON blob, and do NOT invent a "Settings Service" (reserved name — AU2/AU5).

| Namespace | Current keys | Target home | Behavior-preservation note |
|-----------|--------------|-------------|----------------------------|
| Notification delivery (non-secret) | `notifications.*` minus 2 secrets | **`server_config.notifications.delivery`** (new sub-section; extend `NotificationsSchema`) | Same values; `config.ts` `read/updateNotificationConfig` re-backed by `readServerConfig`/`updateServerConfig`. Route response shapes (`SafeNotificationConfig`, redaction) unchanged. |
| Notification secrets | `notifications.smtp_password`, `notifications.ntfy_auth_token` | **`server_credentials`** (AH1 precedent — secrets never in the config blob) | Redaction (`REDACTED`, `*Set` flags) preserved; `config.ts` reads secrets from `server_credentials` by name. |
| Notification mute | `notifications.mute_<typeKey>` | **`server_config.notifications.mutedTypes: string[]`** (new field alongside existing `mutedTeams`) | `defaultMutePreference{Reader,Writer}` + `getMutedTypeKeys` re-backed. |
| Silence policy | `silence_mode`, `silence_product_<teamId>`, `silence_window_{start,end}` | **`server_config.notifications.silence`** `{ mode:boolean, silencedTeamIds:string[], window:{start,end}|null }` | No prod writer → defaults (off/empty/null) preserve behavior. `silence-policy.ts` reads via `readServerConfig`; `teamMembers` lookup stays a separate call (already decomposed → AC-7 ok). |
| Observability | `observability.*` (5) | **`server_config.observability`** (new section) | `read/updateObservabilityConfig` re-backed; default-on `enabled` preserved. |
| Git export | `git_export.*` config (enabled/repoPath/remoteUrl/branch/author*/debounce/allowFileRemote/repoRoot) | **`server_config.gitExport`** (new section) | All sanitizers unchanged (they operate on values, not storage). |
| Git export computed stamps | `git_export.last_commit_at/sha`, `last_push_at` | **`server_config.gitExport.lastExport`** (owned by `git-export-config.ts`) | `writeLastCommit`/`writeLastPush`/`getLastExportMeta` re-backed. |
| Cost cap (real setting) | `cost_cap` (seed `20000`) | **`server_config.cost.capMinor`** (schema default `20000`) | `cost-sentinel.ts` + `routine-scheduler.ts` read via `readServerConfig`. Bootstrap seeds `server_config` (or relies on schema default). |
| Cost cycle | `cost_cycle` | **DROP entirely** — zero readers | Dead seed; delete the bootstrap write. |
| Knowledge scoring | `scoring.weight.*` / `attention.weight.*` / `relevance.weight.*` / `relevance.<shape>` | **Delete the DB read; return existing hardcoded `DEFAULT_*`** | No prod writer → prod always returns defaults today. Behavior identical. (Alt: a `server_config.knowledgeScoring` section if settability must survive — see §10 open question.) |
| Trust config | `trust_window_days`, `trust_queue_threshold`, auto-resolve threshold/min-verdicts | **Delete the DB read; return existing defaults** | Same rationale — no prod writer. (Alt: `server_config.trust` section.) |
| Agent prompt templates | `system_template:<role>` (7 markdown blobs) | **Read from `docs/system-prompts/*.md` directly** (the same source `factory-bootstrap` seeds from) | `roster.ts` + `agents.ts` GET /templates/:role read the file via a shared helper; bootstrap stops seeding template rows. NOT server_config (large markdown ≠ config). See §10. |
| Factory start time | `factory_start_time` | **DROP the read; use `SERVER_START_TIME` always** | No writer → already always falls back today. |
| Generic `/settings` | arbitrary key/value | **Retire the write path** (see §3.1) | Every legitimate key now has a domain home; `/settings` GET becomes a read-only surface or is removed. |
| Computed cost total | `cost_actual` | **Owned by `cost-cap.ts` as a live-computed function** (§4) | Live `sumAllUserCost` == stored value (recomputed every event today). |
| Cost sentinel dedup state | `cost_sentinel_last_level` | **`server_config.internal.costSentinelLastLevel`**, sole reader/writer `cost-sentinel.ts` | Persistence across restarts preserved without a new table. |

### 3.1 Generic `/settings` endpoint (`routes/status.ts`)

The catch-all `PATCH /settings` is **fundamentally incompatible** with a Zod-structured single-blob config (it persists arbitrary keys). It already blocks the reserved domain prefixes and tells callers to use domain routes. Resolution: **retire the generic write** — after Half B every legitimate key has a domain route (`/notifications`, `/observability`, `/git-export`) writing to `server_config`. `GET /settings` (currently dumps raw `factorySettings` rows, redacting secrets) is **removed or repointed** to a read-only projection of `server_config` — builder confirms no web client depends on the raw-rows shape (grep `web/` for `/status/settings`). `factory_start_time` read + `redactSettingRow`/`SECRET_SETTING_KEYS`/`BLOCKED_SETTING_PREFIXES` machinery is deleted with the endpoint.

---

## 4. Computed-state fix — cost-cap / cost-sentinel (AC-3)

- `cost-cap.ts`: replace `recordFactoryCost` (which wrote `factory_settings.cost_actual`) with an exported reader:
  ```ts
  export async function getFactoryCostActual(db: HyperIdleDb): Promise<number> // = sumAllUserCost(db)
  ```
  Remove the trailing `recordFactoryCost(db)` write in `recordCostAndCheck` (the `cost_actual` row no longer exists; the value is derived live). `cost-cap.ts` is the **sole** owner of factory-cost accumulation.
- `cost-sentinel.ts`: obtain the total via `getFactoryCostActual(db)` (function call, never a table). Read `cost_cap` via `readServerConfig(db).cost.capMinor`. Persist its own dedup level via `server_config.internal.costSentinelLastLevel` (read/write through `server-config.ts`), so it touches **no** `factorySettings`.
- `routine-scheduler.ts`: `isFactoryCostCapReached` reads `cost.capMinor` via `readServerConfig` and the total via `getFactoryCostActual(db)`.

> Behavior note: live `sumAllUserCost` equals the previously-stored `cost_actual` (recomputed after every cost event today) — equal-or-fresher, never staler. AC-5 preserved. (`cost-cap.ts` reading `users.costActual` is pre-existing and out of AU18's scope — flag only, do not re-audit Users here.)

---

## 5. `server_config` schema extension (`services/server-config.ts` + `ServerConfigSchema`)

Extend `ServerConfigSchema` (deep-merge already supports partial updates — AC-2 mechanism) with new **optional** top-level sections, each with a `.parse({})`-constructed default appended to `DEFAULTS` and merged in `applyDefaults`/`updateServerConfig` (follow the existing `notifications` sub-schema pattern exactly — Zod v4 nested-default caveat documented in the file's @lore):

- extend `NotificationsSchema` → add `delivery` (the 17 non-secret notification fields), `mutedTypes: string[]`, `silence: {...}`.
- add `observability`, `gitExport` (incl. `lastExport`), `cost: { capMinor, }`, `internal: { costSentinelLastLevel }`.
- (conditional) `knowledgeScoring`, `trust` — only if §10 open question resolves to "keep settable".

Every re-backed domain module keeps its **existing public function names and return types** (e.g. `readNotificationConfig`, `updateObservabilityConfig`, `readGitExportConfig`) so routes and tests are untouched at the call boundary — only the storage backend changes underneath.

---

## 6. Table drop (AC-4) — sequenced LAST

Only after `git grep factorySettings packages/server/src packages/db/src` returns nothing outside migration history/test fixtures:

1. `packages/db/src/schema.ts` — delete the `factorySettings` `pgTable` export + `FactorySetting`/`NewFactorySetting` types (lines ~869-872, ~1635-1636). **Deleting the export is itself the AC-6b enforcement**: any new code referencing `factorySettings` fails `npm run check` (import error). No separate lint guard is needed for the factorySettings half — table non-existence is stronger than a lint rule. (Policing a *new* `factorySettings-shaped` table is AU8's generic-guard job, explicitly out of AU18 scope.)
2. New migration `packages/db/drizzle/0049_AU18_drop_factory_settings.sql` — `DROP TABLE factory_settings;` (raw SQL in a migration file is the sanctioned exception to the no-raw-SQL rule). Regenerate via `npm run db:generate` then rename per the `00NN_AU18_*` convention; add the `_journal.json` entry (idx 49). Current max = 0048.
3. `factory-bootstrap.ts` — remove the `cost_cap`/`cost_cycle`/`system_template` `factorySettings` inserts; seed `server_config.cost` if a non-default seed is still wanted (schema default `20000` makes the seed optional). Template backfill onto `users.systemPrompt` reads from docs files, not the removed rows.
4. `demo-fixture.ts` — drop `n:<role>` template reads (demo-only).

---

## 7. File-by-file change table

| File | Change |
|------|--------|
| `notifications/notification-queue.ts` | **NEW** — repository owning all `notificationQueue` I/O. |
| `notifications/dispatcher.ts` | Rewire raw table ops → repository calls; keep orchestration. |
| `notifications/digest.ts` | `runDailyDigest` → repository calls. |
| `notifications/notification-listener.ts` | unchanged (calls `enqueueNotification`) — verify. |
| `routes/notifications-routes.ts` | read/seen/read-mark → repository calls. |
| `routes/teams-routes.ts` | dedup check → `findPendingByEventSubject`. |
| `services/retention-reaper.ts` | delete → `deleteReaped`. |
| `services/lifecycle-propagation.ts` | insert → `insertNotification` (or `enqueueNotification`). |
| `services/server-config.ts` | Extend `ServerConfigSchema` + defaults + merge for all new sections. |
| `notifications/config.ts` | Re-back read/update onto `server_config` + secrets→`server_credentials`. |
| `notifications/mute.ts` | Re-back onto `server_config.notifications.mutedTypes`. |
| `notifications/silence-policy.ts` | Re-back onto `server_config.notifications.silence`. |
| `services/observability/config.ts` | Re-back onto `server_config.observability`. |
| `config/git-export-config.ts` | Re-back onto `server_config.gitExport` (+ stamps). |
| `services/cost-cap.ts` | Replace `recordFactoryCost` with `getFactoryCostActual`; drop write. |
| `services/cost-sentinel.ts` | Read cap+total via functions; dedup level via `server_config.internal`. |
| `services/routine-scheduler.ts` | cap via `readServerConfig`, total via `getFactoryCostActual`. |
| `knowledge/scoring-config.ts` | Drop `factorySettings` reads; return defaults (or `server_config.knowledgeScoring`). |
| `services/policy-engine.ts` | Drop trust `factorySettings` reads; return defaults (or `server_config.trust`). |
| `routes/agent-profile.ts` | Drop `trust_window_days` read; default (or `server_config`). |
| `services/roster.ts` | Read template from `docs/system-prompts/*.md` via shared helper. |
| `routes/agents.ts` | GET /templates/:role reads docs file, not table. |
| `routes/status.ts` | Retire generic `/settings` write; drop `factory_start_time` read → `SERVER_START_TIME`. |
| `packages/db/src/schema.ts` | Delete `factorySettings` table + types. |
| `packages/db/src/factory-bootstrap.ts` | Remove `factorySettings` seeds; template backfill from docs. |
| `packages/db/src/demo-fixture.ts` | Drop `n:<role>` reads. |
| `packages/db/drizzle/0049_AU18_drop_factory_settings.sql` | **NEW** — `DROP TABLE factory_settings`. |
| `scripts/au18-notification-ownership-guard.ts` | **NEW** — repo-wide zero-allowlist guard + `--fixtures`. |
| `package.json` | Add guard to `lint` chain. |

---

## 8. Acceptance criteria → verification

| AC | Verification method |
|----|--------------------|
| 1 — one owning module for `notificationQueue` | `au18-notification-ownership-guard.ts --check` green (fails on any non-repository reference); existing notification tests green. |
| 2 — real settings round-trip through `server_config`, identical values + route responses | Existing route/integration tests for notifications/observability/git-export config pass **unchanged** (same request → same response). New unit tests on the re-backed `read/update*Config` asserting `server_config` round-trip. |
| 3 — `cost-cap` sole owner of cost-actual; `cost-sentinel` calls a function | `au18` guard + `check` (no `factorySettings` symbol); cost-cap/cost-sentinel integration tests green; new unit test on `getFactoryCostActual`. |
| 4 — `factorySettings` zero callers + dropped | `git grep factorySettings packages/server/src packages/db/src` → empty (excl. migration history); `npm run check` (symbol gone); migration 0049 present; `npm run db:migrate` clean. |
| 5 — all observable behavior unchanged | Full existing suites for cost-cap, cost-sentinel, notifications (delivery/digest/mute/routes/silence), git-export, observability, status, policy-engine, scoring, roster/agents templates pass unchanged. |
| 6 — new direct `notificationQueue` access fails lint (zero allowlist); reintroducing a `factorySettings`-shaped raw table blocked | Guard `--fixtures` negative case fails as expected; factorySettings half enforced by **table deletion** (`check` fails on any reference) — justified in §6. |
| 7 — cross-owned-table queries decomposed, no allowlisted exception | §1b confirms all `notificationQueue` queries single-table; guard's join-method matcher fails any future `notificationQueue`-in-join. |

**Validation scenarios** (from spec) map to the integration suites in AC-5 + the enqueue→deliver path (notification-listener/dispatcher integration) + the config round-trip route tests.

---

## 9. Test plan

**Keep green unchanged (behavior-preservation is the whole WP):** all `__tests__` for notifications (dispatcher/digest/mute/silence-policy/delivery/routes), observability config, git-export config, cost-cap, cost-sentinel, policy-engine, scoring-config, roster, agents templates, status route. Tests currently seeding `factorySettings` rows directly (e.g. `silence-policy.integration.test.ts`, `policy-engine.integration.test.ts`, `AF8-notification-delivery.integration.test.ts`) **must be rewritten to seed via `server_config`/domain-update functions** — they seed the *old* storage; without rewrite they break on the drop. This is expected test-fixture churn, not a behavior change (memory: "tests must not drive behavior" — rewrite fixtures to the new storage, assert identical observable outcomes).

**New tests:**
- `notification-queue.test.ts` — each repository function's read projection/ordering + write effect (component-level with real PGlite fixture where the table is involved).
- Guard `--fixtures` self-test (positive repo file / negative synthetic access).
- Re-backed config round-trip units (notifications/observability/git-export/mute/silence read→update→read against `server_config`).
- `getFactoryCostActual` unit.

---

## 10. Risks / sequencing / open questions

**Scope risk (flag for reviewer/founder — do NOT silently absorb):** verified surface is ~2× the spec's estimate and touches **knowledge-scoring, trust/policy, and agent-prompt-template** subsystems the spec never mentioned. This is L-labelled but is **XL in practice**. It is still one coherent unit (retire one table), and AC-4 mandates the drop *in this WP*, so the plan covers the full retirement. Recommended internal structure: **two sequential sub-phases in one PR** —
  - **Phase B-first is safer than A-first:** do `factorySettings` retirement (Half B) as sub-phase 1, `notificationQueue` ownership (Half A) as sub-phase 2 — they're independent, but Half B is where the surprise scope lives, so land it (and its guard-free table-drop verification) before adding the Half-A guard. Alternatively parallelize; they share no files except `package.json` (lint chain) and the two are non-conflicting.
  - The table `DROP` is the **hard last step** of Half B; nothing merges until `git grep factorySettings` is empty.

**Open questions (builder resolves against code; none block planning):**
1. **Knowledge-scoring + trust weights:** no prod writer exists → simplest is defaults-only (delete the read). If the founder wants these to remain runtime-settable, add `server_config.knowledgeScoring` / `server_config.trust` sections instead. **Recommendation: defaults-only** (boring tech; no dead config surface). Behavioral edge: a value set via the retired generic `/settings` would no longer apply — acceptable since that path is debris.
2. **Agent prompt templates:** read from `docs/system-prompts/*.md` (recommended, matches bootstrap's own source) vs. a dedicated `system_prompt_templates` table. Recommendation: docs-file read — avoids inventing a table and avoids ~7 markdown blobs in a config blob. Confirm the process CWD contract (`factory-bootstrap` already resolves `process.cwd()/docs`) holds for the server route path; if not, keep templates on the already-backfilled `users.systemPrompt` column instead.
3. **`GET /settings` consumers:** grep `packages/web` for `/status/settings` before removing the raw-rows response; repoint to a `server_config` projection if a client depends on it.
4. **Notification secrets → `server_credentials`:** adds a credential-store round-trip to `config.ts`. Confirm `server_credentials` naming convention (`notifications_smtp_password`, `notifications_ntfy_auth_token`) and that encryption (`credential-encryption.ts`) is available at that call site.

**Sequencing summary:** extend `server_config` schema → re-back each domain module + delete no-writer reads → computed-state fix → retire generic `/settings` → confirm `git grep` empty → drop table + migration → build Notification repository + rewire 6 files → add guard + wire lint. `npm run check && npm run lint && npm run test` green throughout; full `verify` before ship.
