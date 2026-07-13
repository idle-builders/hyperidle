# AU18 — Architecture: Notification owns `notificationQueue`; `factorySettings` retired

**Type:** backend · **Complexity:** L→XL (see §10 — verified surface is XL; +`packages/eval` now in scope) · **Depends on:** AU11 (shipped)
**Pre-build gates:** Refinement — not required. Design — not required (no UI).

---

## 0. Revision banner (rounds 2–3)

Independent architecture critique (score 6/10, round 1) found 4 CRITICALs. All re-verified against code by this planner (not taken on trust) and addressed here. Everything the critique did **not** flag is retained verbatim.

| # | CRITICAL | What changed |
|---|----------|--------------|
| 1 | `packages/eval` blind spot — `seedFactorySettings` (`eval/seeding.ts:267`) is a **real generic `factorySettings` writer** importing the table via the db barrel (`eval/seeding.ts:18`); 8 call sites; `packages/eval` is a tsconfig project ref so the barrel drop breaks its compile. AC-4's server+db-only grep goes **false-green** while eval is red. | §1a: eval brought fully into the surface (new eval table + corrected headline). §7: eval files + `zod-schemas.ts` + db barrel added. §8: AC-4 grep widened to **whole repo**. §9: eval fixture rewrite listed. |
| 2 | The `cost_actual` live-compute swap (§4) **breaks graded eval scenarios** — `builtin-routines.ts`/`routine-sessions.ts` seed `cost_actual` directly (8500/10500/5000/1001) with **zero** user cost; `sumAllUserCost` = ~0 there, collapsing warning/breach/blocked → ok/allowed. Prod is fine (`cost-cap.ts:358` already writes `cost_actual = sumAllUserCost` every event). | §4: premise corrected; **locked decision** to rewrite the named eval scenarios to accumulate real user cost + seed `server_config.cost.capMinor`. §9 names the exact scenario files. |
| 3 | AC-6b (a *new* `factorySettings`-shaped raw table must fail a **lint-time guard**, not merely convention) is **unmet by table-deletion alone** — a brand-new `pgTable("x",{key,value})` compiles clean. Re-verified: AU8's spec is a `TABLE_OWNER`/`ROUTE_OWNER` map over **known** tables — an unmapped new KV table is invisible to it, so AU8 does **not** own AC-6b's shape half → **option (b) descoping is unsupported**. | §6: **option (a)** chosen — ship a minimal shape-guard in AU18 (new §6.5), zero-allowlist (no existing table is generic `{key,value}`-shaped, verified). |
| 4 | Path-traversal sink: `routes/agents.ts GET /templates/:role` moving from a DB key lookup to `docs/system-prompts/${role}.md` with `:role` unsanitized. | §3: template row now routes `:role` through the **canonical role→filename map** (see Round 3 below — the round-2 charset-regex + naive `${role}.md` design was itself a regression and is superseded). §10 Q2: CWD contract **locked**. |

Folded WARNINGs: §5 corrected (merge is **manual per-section**, not automatic); §7 adds `zod-schemas.ts:72` + db-barrel re-exports; §6 migration data-preservation note; §10 Q2 locked; §2.2 kitchen-sink nudge acknowledged.

### Round 3 — fix the template role→filename mapping (final CRITICAL)

Round-2 critique (score 6/10) confirmed CRITICALs 1–3 genuinely closed and found **one new CRITICAL**: the round-2 traversal fix closed the *sink* but **locked a replacement design that regresses a live, web-facing path (AC-5)**. Round 3 fixes exactly that plus three small WARNING/SUGGESTION folds. Everything else (eval scope, cost-eval rewrite, AC-6b guard, notification ownership) is untouched.

**The regression (re-verified against code this round):** `factory-bootstrap.ts:188-197` seeds `system_template:<role>` rows via an **explicit role→filename map** where multi-word roles have hyphenated files, so role≠filename-stem:

```
product_manager → product-manager.md      builder  → builder.md
facilitator     → facilitator.md          growth   → growth.md
designer        → designer.md             ops      → ops.md
qa_engineer     → qa-engineer.md
```

The web client hits this live: `AgentEditor.tsx:161` + `AgentAddDialog.tsx:84` call `GET /api/agents/templates/${role}` (route `agents.ts:209`, reads `system_template:${role}`, returns 200 for all 7 seeded roles today). The round-2 plan locked two details that **both** regress PM/QA to 404: (a) §3's validation regex `^[a-z][a-z-]*$` rejects the underscore in `product_manager`/`qa_engineer`; (b) §10 Q2's naive `docs/system-prompts/${role}.md` stem yields `product_manager.md`, a file that does not exist (real file: `product-manager.md`). Round 2 also **mis-cited** `factory-roster.ts:templateRole` as the canonical role set — verified that field is literally `"facilitator"` for every entry; it does NOT enumerate the real roles. The true canonical role→filename source is the `factory-bootstrap.ts` map above.

**Round-3 fix (supersedes the round-2 §3 regex + §10 Q2 `${role}.md` design):**
1. **The map IS the allowlist.** Extract the bootstrap map into a shared, exported constant and route every role→file resolution through it. A `role` that is not an exact key returns `null` (→ 404/skip) **before any filesystem access** — so traversal stays closed **by construction** (the untrusted `:role` string only ever *indexes into a hardcoded map*; the filename that reaches `fs` is always a compile-time literal). No charset regex (it wrongly excluded underscores); no post-resolve containment check needed (the filename never derives from input — see §3, defense-in-depth note).
2. **Name-collision reconciled (single docs-resolution implementation).** Land the shared helper in `packages/db` next to bootstrap's existing one. The existing low-level `readSystemPromptTemplate(docsRoot, filename)` keeps its name and signature but **moves into one module** (`packages/db/src/system-prompt-templates.ts`); the new role-based reader gets a **distinct name** `readSystemPromptTemplateForRole(role)` that maps role→filename via the exported constant then delegates to the low-level reader. Different names, different signatures, one implementation — no duplication. §3 + §7 state this unambiguously (one row, one location).
3. `assistant` note: catalog `hasTemplate:true` + `assistant.md` exists on disk, but bootstrap never seeded `system_template:assistant` (`@lore AD8a`), so `/templates/assistant` is **404 today**. Keeping `assistant` OUT of the shared map preserves that 404 exactly (AC-5).
4. §9 adds positive tests for real seeded roles incl. the underscore role `product_manager` (→ `product-manager.md` content) and a second hyphenated-file role, not just negative traversal cases.

Small folds this round: §6.5 heuristic-boundary doc note (name-based, catches the `factory_settings` shape/name specifically); §4.1 step 1 states the exact `users.costActual` row + the sum-all-users caveat; §7 finalizes the helper's single home.

---

## 1. Context + verified call-site surface

Closes the last confirmed Core-App read/write-ownership gap in Track AU. Two independent halves:

- **(A) `notificationQueue` ownership** — give the table exactly one owning module (like Conversation/Users/Work/Routine/Knowledge already have).
- **(B) `factorySettings` retirement** — finish the abandoned `server_config` migration, move real settings there, turn computed values into owned state, then **drop the table**.

### 1a. Spec-vs-reality delta (READ THIS FIRST)

The spec's narrative names **8 `factorySettings` files** and **5 real-setting callers**. Direct code reading (every match verified, not grep-counted) finds the true surface is roughly **2× the files and ~13 key-namespaces**, and — critically — **several namespaces have NO production writer at all** (only bootstrap-seed or defaults). This is exactly the 3-7× first-pass undercount the spec warned about (AU12/AU13 precedent). **Round 2 adds a third package — `packages/eval` — that the round-1 sweep missed entirely.**

**Verified real table-access files (14 in `packages/server`, +2 in `packages/db`, +5 in `packages/eval`):**

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

**Round-2 addition — `packages/eval` (5 files, all real, all compile-linked to the dropped table):**

| # | File | factorySettings access | Notes |
|---|------|------------------------|-------|
| E1 | `packages/eval/src/seeding.ts` | Imports `factorySettings` from db barrel (`:18`); **exports the generic KV writer `seedFactorySettings(db, Record<string,string>)`** (`:267`, `.insert(factorySettings).onConflictDoUpdate`); calls it in `seedMinimalWorld` (`:339`, phantom `factory_cost_cap_minor`/`factory_cost_cap_currency`). | **Barrel-linked** → drop breaks `check`. The `seedFactorySettings` helper must be **deleted** (its table is gone), and its callers rewritten. |
| E2 | `packages/eval/src/scenarios/builtin-routines.ts` | Calls `seedFactorySettings` 3× (`:103/:173/:222`) seeding `cost_cap`+`cost_actual` (8500/10500/5000). | **Graded** cost-sentinel warning/breach/ok — see §4 CRITICAL #2. |
| E3 | `packages/eval/src/scenarios/routine-sessions.ts` | Calls `seedFactorySettings` 1× (`:336`) seeding `cost_cap:1000`/`cost_actual:1001`. | **Graded** cost-cap-blocked — see §4. |
| E4 | `packages/eval/src/scenarios/session.ts` | Calls `seedFactorySettings` 3× (`:75/:178/:271`) seeding `factory_cost_cap_minor`/`factory_cost_cap_currency`. | **Phantom keys** — no prod reader (cost path reads `cost_cap`, not `factory_cost_cap_minor`). These seeds are dead → delete, not migrate (SUGGESTION confirmed). |
| E5 | *(caller set, not a file)* — the 8 `seedFactorySettings` call sites above | — | All rewired away from the helper; helper deleted. |

**Why this was invisible to round 1:** the round-1 AC-4 verification (`git grep factorySettings packages/server/src packages/db/src`) is scoped to two packages. `packages/eval` references the table only through the db barrel re-export and its own helper, so it never appeared — yet it **is** a tsconfig project reference (`{ "path": "packages/eval" }` in the root `tsconfig`), so `npm run check` compiles it and the barrel drop turns it red. AC-4 is now **whole-repo** (§8).

**Incidental matches excluded (comment/doc/@lore only, NO table access):** `services/server-config.ts`, `tools/add-agent.ts`, `services/lifecycle-propagation.ts` (line 539 comment; it DOES touch `notificationQueue` though — see §1b), `routes/auth.ts`, `middleware/auth.ts`, `routes/settings.ts`, `routes/model-gateway.ts`. Grep returned 21 files in server; **7 are pure comment matches**.

**No-production-writer namespaces (writers found only in `factory-bootstrap` seed or nowhere; changes the migration):**
- `scoring.weight.*`, `attention.weight.*`, `relevance.*`, `trust_*`, auto-resolve keys → **no writer exists** (loaders always fall back to hardcoded defaults in prod). Only reachable write path is the generic `/settings` PATCH (itself being retired). *(Re-verified: no eval writer either — critique confirmed.)*
- `cost_cap` → written **only** by `factory-bootstrap` seed (value `20000`) in prod; and by eval scenarios (graded). `cost_cycle` → seeded but **zero readers** (dead).
- `system_template:<role>` → written **only** by `factory-bootstrap` seed from `docs/system-prompts/*.md` via the explicit role→filename map (7 roles; §3 template rows). Read live by `roster.ts` + `agents.ts GET /templates/:role`.
- `factory_start_time` → **no writer found anywhere** in prod; `status.ts` read always falls back to `SERVER_START_TIME`.
- `factory_cost_cap_minor` / `factory_cost_cap_currency` → **eval-seeded only, no prod reader** (confirmed dead — legacy). Builder deletes the seed, does not chase a phantom setting.

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

> **Kitchen-sink nudge (critique MD, non-blocking):** the 7 read variants (`listByStatus`/`listPending`/`listPendingDigest`/`listUnread`/`listStuckLeases`/`listByIdsWithStatus`) partly collapse to one parameterized `listWhere(db, filter, order)`. AU14's precedent is deliberately granular, so this stays granular **unless** the builder finds the collapse trivially clean during extraction — do not over-invest here. Not a blocker.

`enqueueNotification` (the existing public write entry with flood-cap logic) **stays in `dispatcher.ts`** but rewires its raw `insert`/`select`/`update` calls to `insertNotification` / `queueCountByStatus` / `updateStatus`. Callers of `enqueueNotification` (dispatcher, notification-listener, teams-routes, lifecycle-propagation) are unchanged at the call boundary.

### 2.3 Guard (AC-6a, AC-7)

`scripts/au18-notification-ownership-guard.ts` — **repo-wide, zero-allowlist**, cloned from `au14-knowledge-ownership-guard.ts` (AST scan of `.from/.insert/.update/.delete` + `.leftJoin/.innerJoin/.rightJoin/.fullJoin` whose first arg is the bare identifier `notificationQueue`). One difference from AU14: instead of a single GUARDED_FILE, the **only** legal reference site is `packages/server/src/notifications/notification-queue.ts` (+ its `*.test.ts`). Any other file referencing `notificationQueue` = fail. Ships with `--fixtures` self-test (positive: repo file legal; negative: a synthetic `.from(notificationQueue)` in a fixture file fails). Wire into `package.json` `lint` chain after the `au14` entry.

---

## 3. Half B — `factorySettings` retirement, per-namespace target

The generic KV bucket is **not one domain**. Each namespace gets the *right* home — do NOT dump everything into one JSON blob, and do NOT invent a "Settings Service" (reserved name — AU2/AU5).

| Namespace | Current keys | Target home | Behavior-preservation note |
|-----------|--------------|-------------|----------------------------|
| Notification delivery (non-secret) | `notifications.*` minus 2 secrets | **`server_config.notifications.delivery`** (new sub-section; extend `NotificationsSchema`) | Same values; `config.ts` `read/updateNotificationConfig` re-backed by `readServerConfig`/`updateServerConfig`. Route response shapes (`SafeNotificationConfig`, redaction) unchanged. **Merge caveat: nested — needs deep-merge wiring, see §5.** |
| Notification secrets | `notifications.smtp_password`, `notifications.ntfy_auth_token` | **`server_credentials`** (AH1 precedent — secrets never in the config blob) | Redaction (`REDACTED`, `*Set` flags) preserved; `config.ts` reads secrets from `server_credentials` by name. |
| Notification mute | `notifications.mute_<typeKey>` | **`server_config.notifications.mutedTypes: string[]`** (new field alongside existing `mutedTeams`) | `defaultMutePreference{Reader,Writer}` + `getMutedTypeKeys` re-backed. |
| Silence policy | `silence_mode`, `silence_product_<teamId>`, `silence_window_{start,end}` | **`server_config.notifications.silence`** `{ mode:boolean, silencedTeamIds:string[], window:{start,end}|null }` | No prod writer → defaults (off/empty/null) preserve behavior. `silence-policy.ts` reads via `readServerConfig`; `teamMembers` lookup stays a separate call (already decomposed → AC-7 ok). Refresh the stale `@lore` in `dispatcher.ts` (lines ~694-702, comment-only) that describes the old `factory_settings silence_window` read (SUGGESTION). |
| Observability | `observability.*` (5) | **`server_config.observability`** (new section) | `read/updateObservabilityConfig` re-backed; default-on `enabled` preserved. |
| Git export | `git_export.*` config (enabled/repoPath/remoteUrl/branch/author*/debounce/allowFileRemote/repoRoot) | **`server_config.gitExport`** (new section) | All sanitizers unchanged (they operate on values, not storage). |
| Git export computed stamps | `git_export.last_commit_at/sha`, `last_push_at` | **`server_config.gitExport.lastExport`** (owned by `git-export-config.ts`) | `writeLastCommit`/`writeLastPush`/`getLastExportMeta` re-backed. |
| Cost cap (real setting) | `cost_cap` (seed `20000`) | **`server_config.cost.capMinor`** (schema default `20000`) | `cost-sentinel.ts` + `routine-scheduler.ts` read via `readServerConfig`. Bootstrap seeds `server_config` (or relies on schema default). **Eval scenarios seed this via `server_config.cost.capMinor`, not the old key — see §4.** |
| Cost cycle | `cost_cycle` | **DROP entirely** — zero readers | Dead seed; delete the bootstrap write. |
| Knowledge scoring | `scoring.weight.*` / `attention.weight.*` / `relevance.weight.*` / `relevance.<shape>` | **Delete the DB read; return existing hardcoded `DEFAULT_*`** | No prod/eval writer → prod always returns defaults today. Behavior identical. (Alt: a `server_config.knowledgeScoring` section if settability must survive — see §10 open question.) |
| Trust config | `trust_window_days`, `trust_queue_threshold`, auto-resolve threshold/min-verdicts | **Delete the DB read; return existing defaults** | Same rationale — no writer. (Alt: `server_config.trust` section.) |
| Agent prompt templates | `system_template:<role>` (7 markdown blobs) | **Read from `docs/system-prompts/*.md` directly** via the shared `readSystemPromptTemplateForRole(role)` helper (§7), which routes through the **canonical role→filename map** `SYSTEM_PROMPT_TEMPLATE_FILES` (extracted from `factory-bootstrap.ts:188-197` — the same source bootstrap seeds from) | `roster.ts` + `agents.ts GET /templates/:role` read via the shared helper; bootstrap stops seeding template rows and consumes the same exported map. NOT server_config (large markdown ≠ config). **Traversal fix (CRITICAL #4): see the dedicated row below.** CWD contract locked in §10 Q2. |
| ↳ `agents.ts` GET /templates/:role **input validation** | route param `:role` (untrusted) → filesystem path | **Reject before the fs read — by map lookup, not regex** | Today's DB-key lookup is traversal-safe; a raw `docs/system-prompts/${role}.md` read would be a new sink. **Mitigation (map-as-allowlist, mandatory):** `readSystemPromptTemplateForRole(role)` resolves `filename = SYSTEM_PROMPT_TEMPLATE_FILES[role]`; if `role` is **not an exact key** it returns `null` → 404 (or skip at bootstrap) **before touching the fs**. The untrusted `:role` string therefore only ever *indexes a hardcoded map* — the filename that reaches `fs` is always a compile-time literal from the map (`product-manager.md`, `qa-engineer.md`, …), so **path traversal is closed by construction**. This deliberately **replaces** the round-2 `^[a-z][a-z-]*$` regex (which wrongly rejected the underscore in `product_manager`/`qa_engineer`) and the naive `${role}.md` stem (which produced `product_manager.md`, a nonexistent file). No charset regex; no post-`resolve` containment check is needed either (the filename never derives from input — it is a literal) — if the builder still wants belt-and-suspenders, an assertion that the resolved path stays inside `docs/system-prompts` is a harmless no-op, not the primary defense. **Canonical role set = the 7 keys of `SYSTEM_PROMPT_TEMPLATE_FILES`** (`product_manager`, `facilitator`, `builder`, `growth`, `designer`, `qa_engineer`, `ops`); **NOT `factory-roster.ts:templateRole`** (that field is literally `"facilitator"` for every roster entry — it does not enumerate roles; the round-2 plan mis-cited it). `assistant` is intentionally excluded (bootstrap never seeded `system_template:assistant`, `@lore AD8a`, so `/templates/assistant` is 404 today — preserved). Per ETHOS this is an **earned** boundary (untrusted route input → fs sink), not preemptive paranoia. |
| Factory start time | `factory_start_time` | **DROP the read; use `SERVER_START_TIME` always** | No writer → already always falls back today. |
| Generic `/settings` | arbitrary key/value | **Retire the write path** (see §3.1) | Every legitimate key now has a domain home; `/settings` GET becomes a read-only surface or is removed. |
| Computed cost total | `cost_actual` | **Owned by `cost-cap.ts` as a live-computed function** (§4) | Live `sumAllUserCost` == stored value in **prod** (recomputed every event today). **Eval was seeding it directly — §4 rewrites those scenarios.** |
| Cost sentinel dedup state | `cost_sentinel_last_level` | **`server_config.internal.costSentinelLastLevel`**, sole reader/writer `cost-sentinel.ts` | Persistence across restarts preserved without a new table. |

### 3.1 Generic `/settings` endpoint (`routes/status.ts`)

The catch-all `PATCH /settings` is **fundamentally incompatible** with a Zod-structured single-blob config (it persists arbitrary keys). It already blocks the reserved domain prefixes and tells callers to use domain routes. Resolution: **retire the generic write** — after Half B every legitimate key has a domain route (`/notifications`, `/observability`, `/git-export`) writing to `server_config`. `GET /settings` (currently dumps raw `factorySettings` rows, redacting secrets) is **removed or repointed** to a read-only projection of `server_config` — builder confirms no web client depends on the raw-rows shape (grep `web/` for `/status/settings`). `factory_start_time` read + `redactSettingRow`/`SECRET_SETTING_KEYS`/`BLOCKED_SETTING_PREFIXES` machinery is deleted with the endpoint.

---

## 4. Computed-state fix — cost-cap / cost-sentinel (AC-3)  ·  **eval-break resolution locked (CRITICAL #2)**

**Prod path (behavior preserved — verified):** `cost-cap.ts:358 recordFactoryCost` already writes `cost_actual = sumAllUserCost(db)` at the tail of `recordCostAndCheck` after every cost event. So a live `getFactoryCostActual = sumAllUserCost` returns **exactly** the value the table held in prod — equal-or-fresher, never staler. AC-5 preserved for prod.

- `cost-cap.ts`: replace `recordFactoryCost` (which wrote `factory_settings.cost_actual`) with an exported reader:
  ```ts
  export async function getFactoryCostActual(db: HyperIdleDb): Promise<number> // = sumAllUserCost(db)
  ```
  Remove the trailing `recordFactoryCost(db)` write in `recordCostAndCheck` (the `cost_actual` row no longer exists; the value is derived live). `cost-cap.ts` is the **sole** owner of factory-cost accumulation.
- `cost-sentinel.ts`: obtain the total via `getFactoryCostActual(db)` (function call, never a table). Read `cost_cap` via `readServerConfig(db).cost.capMinor`. Persist its own dedup level via `server_config.internal.costSentinelLastLevel` (read/write through `server-config.ts`), so it touches **no** `factorySettings`.
- `routine-scheduler.ts`: `isFactoryCostCapReached` reads `cost.capMinor` via `readServerConfig` and the total via `getFactoryCostActual(db)`.

### 4.1 Eval-break — the round-1 premise was false, resolution LOCKED

**The break (verified):** `cost-sentinel.ts:108` reads `cost_actual` **directly from `factorySettings`**. The graded eval scenarios seed that key **directly, with zero accumulated user cost**:

| Scenario file | Scenario | Seeds (old) | Graded outcome |
|---|---|---|---|
| `scenarios/builtin-routines.ts` | `br-cost-sentinel-warning` (`:103`) | `cost_cap:10000`, `cost_actual:8500` (85%) | warning emitted |
| `scenarios/builtin-routines.ts` | `br-cost-sentinel-breach` (`:173`) | `cost_cap:10000`, `cost_actual:10500` (105%) | breach emitted |
| `scenarios/builtin-routines.ts` | `br-cost-sentinel-ok` (`:222`) | `cost_cap:10000`, `cost_actual:5000` (50%) | no event |
| `scenarios/routine-sessions.ts` | `rs-cost-cap-blocked` (`:336`) | `cost_cap:1000`, `cost_actual:1001` (over) | routine not fired |

Once cost-sentinel reads `getFactoryCostActual = sumAllUserCost` (which sums `users.costActual`, `user-store.ts:207`) instead of the seeded row, **`sumAllUserCost` is ~0** in these scenarios (they seed no user cost), so warning/breach/blocked all collapse to ok/allowed — an **AC-5 violation for the eval suite** and a red compile if `seedFactorySettings` is left dangling on the dropped table.

**LOCKED architectural decision (not deferred to build):** rewrite the four graded scenarios to **accumulate real user cost** so live compute reproduces the same graded values, and seed the cap via the new typed home:

1. **Set `users.costActual` to the target minor value** — `8500` / `10500` / `5000` / `1001` — on **the scenario's single seeded costed user** (the world's agent row is the natural home; the founder row works equally). Verified against `seedMinimalWorld`: `seedFounder` and `seedAgent` both leave `costActual` **unset (null → 0)**, so no other user contributes to the sum. **`sumAllUserCost` sums `users.costActual` across ALL users** (`coalesce(sum(costActual),0)` over `users`, `user-store.ts:207-211`) — so with exactly one costed row the graded total == that row's value. **If a scenario seeds more than one costed user, the target must equal the SUM, not a single row** — the builder confirms per scenario that only one user carries `costActual`. (Mechanically: extend `seedAgent`'s opts with an optional `costActualMinor`, or issue a direct `db.update(users).set({ costActual: <target> }).where(eq(users.id, agentId))` in the scenario seed.)
2. Seed the cap via `server_config.cost.capMinor` (`updateServerConfig(db, { cost: { capMinor: 10000 } })`) instead of the old `cost_cap` KV key.
3. Delete the `seedFactorySettings` helper (its table is gone) and all 8 call sites: the 4 graded seeds above → rewritten per (1)+(2); the phantom `session.ts` (`:75/:178/:271`) + `seedMinimalWorld` (`:339`) `factory_cost_cap_minor`/`factory_cost_cap_currency` seeds → **deleted** (no prod reader, confirmed dead). `seedMinimalWorld` seeds no user cost and needs none (no cost scenario there).

> Builder must run the eval scenarios (or their fixture-level component tests) and confirm the graded dimensions still score identically after the rewrite — this is the AC-5 proof for the eval suite. (`cost-cap.ts` reading `users.costActual` is pre-existing and out of AU18's scope — flag only, do not re-audit Users here.)

---

## 5. `server_config` schema extension (`services/server-config.ts` + `ServerConfigSchema`)

**Correction (critique WARNING §5):** `server_config`'s merge is **manual per-section**, not automatic. Verified: `updateServerConfig` (server-config.ts:222) hand-writes each branch — a shallow spread for `notifications`, a per-tier `mergeTier(...)` for `modelGateway`, a full-replace for `harnessDisabled`; `applyDefaults` (`:168`) and `DEFAULTS` (`:157`) likewise enumerate each section explicitly. **There is no generic deep-merge.** Every one of the ~7 new sections needs its own explicit wiring in **three** places: `DEFAULTS`, `applyDefaults` (parse-with-sub-schema, per the Zod-v4 nested-default @lore), and `updateServerConfig` (merge branch). Budget this handwork.

Extend `ServerConfigSchema` with new **optional** top-level sections, each with a `.parse({})`-constructed default (follow the existing `notifications` sub-schema pattern exactly):

- extend `NotificationsSchema` → add `delivery` (the 17 non-secret notification fields), `mutedTypes: string[]`, `silence: {...}`. **⚠ Merge hazard:** today's notifications branch is a **shallow** spread `{ ...current.notifications, ...patch.notifications }` (server-config.ts:229-232). Adding nested sub-objects (`delivery`, `silence`) means a partial patch would clobber the untouched nested object — the builder must deepen the notifications merge branch (spread each nested sub-section) so a `delivery`-only patch preserves `silence`, and vice-versa.
- add `observability`, `gitExport` (incl. `lastExport`), `cost: { capMinor }`, `internal: { costSentinelLastLevel }` — each with its own `DEFAULTS` entry, `applyDefaults` parse, and `updateServerConfig` merge branch.
- (conditional) `knowledgeScoring`, `trust` — only if §10 open question resolves to "keep settable".

Every re-backed domain module keeps its **existing public function names and return types** (e.g. `readNotificationConfig`, `updateObservabilityConfig`, `readGitExportConfig`) so routes and tests are untouched at the call boundary — only the storage backend changes underneath.

---

## 6. Table drop (AC-4) — sequenced LAST

**Migration data-preservation note (critique WARNING §6):** the `DROP TABLE` is **destructive and irreversible**. Ordering invariant: **all real keys must be copied into `server_config`/`server_credentials` BEFORE the drop** — i.e. every domain module is re-backed and its data path validated first; only then does migration 0049 run. Any KV rows **not** migrated (the dead/phantom keys: `cost_cycle`, `factory_start_time`, `factory_cost_cap_*`, no-writer scoring/trust keys, `system_template:*` now sourced from docs) are **intentionally lost** — this is expected and correct (they are debris or re-sourced), not a data-loss regression. State this in the migration file header.

Only after `git grep factorySettings` returns nothing **across the whole repo** (§8 AC-4) outside migration history/test fixtures:

1. `packages/db/src/schema.ts` — delete the `factorySettings` `pgTable` export (line ~869) + `FactorySetting`/`NewFactorySetting` types (lines ~1635-1636). Deleting the export makes any *old-symbol* reference a `check` failure (import error) — stronger than a lint rule **for the old table**. (See §6.5 for the *new-shape* half of AC-6b, which table-deletion does NOT cover.)
2. `packages/db/src/zod-schemas.ts` — delete `selectFactorySettingSchema = createSelectSchema(factorySettings)` (line 72) and the `factorySettings` import (line 21). **(critique WARNING — round-1 miss.)**
3. `packages/db/src/index.ts` (barrel) — remove the re-exports `FactorySetting` (line 42), `factorySettings` (line 46), `NewFactorySetting` (line 77). **(critique WARNING — round-1 miss; this is the exact re-export `packages/eval` imports.)** Add re-exports for the new `system-prompt-templates.ts` symbols (`SYSTEM_PROMPT_TEMPLATE_FILES`, `readSystemPromptTemplateForRole`, `readSystemPromptTemplate`) so `packages/server` (`roster.ts`, `agents.ts`) can import them via `@hyperidle/db`.
4. New migration `packages/db/drizzle/0049_AU18_drop_factory_settings.sql` — `DROP TABLE factory_settings;` (raw SQL in a migration file is the sanctioned exception to the no-raw-SQL rule). Regenerate via `npm run db:generate` then rename per the `00NN_AU18_*` convention; add the `_journal.json` entry (idx 49). Current max = 0048. Header note per the data-preservation paragraph above.
5. `factory-bootstrap.ts` — remove the `cost_cap`/`cost_cycle`/`system_template` `factorySettings` inserts; seed `server_config.cost` if a non-default seed is still wanted (schema default `20000` makes the seed optional). The template backfill onto `users.systemPrompt` now reads from docs via the shared module: bootstrap imports `SYSTEM_PROMPT_TEMPLATE_FILES` + the readers from `system-prompt-templates.ts` (its local `readSystemPromptTemplate`/`stripFrontmatter` MOVE there — §7). Bootstrap iterates the same exported map, so there is exactly one role→filename source.
6. `demo-fixture.ts` — drop `n:<role>` template reads (demo-only).
7. `packages/eval/src/seeding.ts` — delete the `seedFactorySettings` helper + the `factorySettings` barrel import; rewrite its callers per §4.1.

### 6.5 AC-6b shape-guard — **option (a), shipped in AU18 (CRITICAL #3)**

**Why not option (b) (descope to AU8):** re-verified AU8's spec text in `TRACK-AU.md` (§AU8 + plan-calls line 621). AU8 consolidates the guard scripts around a **`TABLE_OWNER` map — "one entry per table naming which service owns it"** — plus a parallel `ROUTE_OWNER` map. That mechanism checks cross-domain **access to known, mapped tables**; a brand-new `pgTable("x", { key, value })` added tomorrow has **no `TABLE_OWNER` entry**, so it is **invisible** to AU8's guard and compiles + passes clean. AU8's ACs are all about Strategy/Fabric edges, core→agent internals, and agent→core CRUD — **none** covers "a new generic KV bucket was introduced." **AU8 does not own AC-6b's shape half.** Descoping is therefore unsupported by the spec; per the founder's zero-exceptions / "not merely convention" standard (and the AU12/13/14 memory), **AU18 ships the guard.**

**The guard:** `scripts/au18-kv-shape-guard.ts` — an AST/schema scan of `packages/db/src/schema.ts` (and any other `pgTable(...)` definitions repo-wide) that **fails** if any `pgTable` is shaped like a **generic string key-value bucket** — i.e. its column set is essentially `{ key: text (PK), value: text/json, updatedAt? }` with **no domain columns**. This is precisely the `factory_settings` shape (`key text PK, value text, updated_at text` — verified schema.ts:869-873).

- **Allowlist: empty (zero exceptions).** Verified no existing table needs one: `server_config` is a **singleton typed** row (`id`/`config`/`updatedAt`, `config` a Zod-validated blob — not a raw `{key,value}` pair, and the PK is a fixed `"default"` not a free key); `server_credentials` is a typed credential table (`name`/`encryptedValue`/`validationState`/`lastValidatedAt`/`updatedAt`); `operation_outcomes`, `hint_progress`, etc. all carry domain columns. **None matches the generic-KV shape**, so the guard's allowlist is empty — matching the zero-exceptions rule exactly.
- **Detection heuristic (to avoid false positives on typed singletons):** flag a table only when it has exactly a free-text primary key named `key`/`k`/`name`-generic AND a single opaque `value` column AND no other domain column (an `updatedAt`/timestamp is ignored). `server_config`'s `config` column is a *validated blob under a fixed-`"default"` PK*, which is explicitly **not** the free-`key` generic shape → not flagged.
- **Heuristic-boundary doc note (critique WARNING §6.5 — fold):** the script header MUST state that this guard is **name-based** — it keys off a PK literally named `key`/`k`/`name` plus a single `value` column, i.e. it catches the **canonical `factory_settings` shape/name pattern specifically**. It does **not** catch an arbitrarily-renamed future bucket (`{ id, data }`, `{ slug, payload }`). This is deliberate: AC-6b as written targets **reintroducing a `factory_settings`-*shaped* table**, which this closes. Document the boundary so a later reader does not over-trust the guard's generality (the reviewer should not read it as a universal KV detector).
- Ships with `--fixtures` self-test: **positive** (real schema passes — no generic KV table remains after the drop); **negative** (a synthetic `pgTable("x", { key: text().primaryKey(), value: text() })` fixture fails). Wire into `package.json` `lint` chain alongside the notification guard.

This closes **both** halves of AC-6b: old-symbol reintroduction → `check` failure (table gone); new-shape reintroduction → `au18-kv-shape-guard` failure. Neither is "merely convention."

---

## 7. File-by-file change table

| File | Change |
|------|--------|
| `notifications/notification-queue.ts` | **NEW** — repository owning all `notificationQueue` I/O. |
| `notifications/dispatcher.ts` | Rewire raw table ops → repository calls; keep orchestration. Refresh stale `@lore` (silence_window). |
| `notifications/digest.ts` | `runDailyDigest` → repository calls. |
| `notifications/notification-listener.ts` | unchanged (calls `enqueueNotification`) — verify. |
| `routes/notifications-routes.ts` | read/seen/read-mark → repository calls. |
| `routes/teams-routes.ts` | dedup check → `findPendingByEventSubject`. |
| `services/retention-reaper.ts` | delete → `deleteReaped`. |
| `services/lifecycle-propagation.ts` | insert → `insertNotification` (or `enqueueNotification`). |
| `services/server-config.ts` | Extend `ServerConfigSchema` + `DEFAULTS` + `applyDefaults` + `updateServerConfig` **per-section** for all new sections (manual, incl. deepened notifications merge). |
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
| **`packages/db/src/system-prompt-templates.ts`** | **NEW — the single home for docs-template resolution (round 3, finalized — no "or").** Exports: (1) `SYSTEM_PROMPT_TEMPLATE_FILES: Readonly<Record<string,string>>` — the canonical 7-entry role→filename map extracted verbatim from `factory-bootstrap.ts:188-197` (`product_manager`→`product-manager.md`, `facilitator`→`facilitator.md`, `builder`→`builder.md`, `growth`→`growth.md`, `designer`→`designer.md`, `qa_engineer`→`qa-engineer.md`, `ops`→`ops.md`); (2) the low-level `readSystemPromptTemplate(docsRoot, filename): string \| null` **moved here from bootstrap** (name + signature unchanged) plus its `stripFrontmatter`; (3) **NEW** `readSystemPromptTemplateForRole(role: string): string \| null` — maps `role`→filename via the constant (returns `null` if `role` is not a key, **before any fs access** — the map-as-allowlist traversal fix), resolves `path.resolve(process.cwd(),"docs")`, delegates to the low-level reader. Re-exported from the db barrel (§6 step 3). |
| `services/roster.ts` | `readTemplate` → call `readSystemPromptTemplateForRole(role)` (drops the `db`/`factorySettings` read). `hasTemplate` catalog gating unchanged; `assistant` (hasTemplate=true, not in the map) → `null`, same as today. |
| `routes/agents.ts` | GET /templates/:role → `readSystemPromptTemplateForRole(role)` (map-validated, §3 traversal fix), not the table read. `null` → 404 (same as today); `product_manager`→`product-manager.md` content → 200 (preserved). |
| `routes/status.ts` | Retire generic `/settings` write; drop `factory_start_time` read → `SERVER_START_TIME`. |
| `packages/db/src/schema.ts` | Delete `factorySettings` table + `FactorySetting`/`NewFactorySetting` types. |
| `packages/db/src/zod-schemas.ts` | **Delete `selectFactorySettingSchema` (line 72) + import (line 21).** *(round-1 miss)* |
| `packages/db/src/index.ts` | **Remove `FactorySetting`/`factorySettings`/`NewFactorySetting` barrel re-exports (lines 42/46/77); add re-exports for `system-prompt-templates.ts`.** *(round-1 miss + round-3)* |
| `packages/db/src/factory-bootstrap.ts` | Remove `factorySettings` seeds; move `readSystemPromptTemplate`/`stripFrontmatter` into `system-prompt-templates.ts` and import them + `SYSTEM_PROMPT_TEMPLATE_FILES`; template backfill iterates the shared map. |
| `packages/db/src/demo-fixture.ts` | Drop `n:<role>` reads. |
| `packages/db/drizzle/0049_AU18_drop_factory_settings.sql` | **NEW** — `DROP TABLE factory_settings` + data-preservation header note. |
| **`packages/eval/src/seeding.ts`** | **Delete `seedFactorySettings` helper + `factorySettings` barrel import; rewrite `seedMinimalWorld`'s phantom cost seed away.** *(round-2 — CRITICAL #1)* |
| **`packages/eval/src/scenarios/builtin-routines.ts`** | **Rewrite 3 graded cost-sentinel seeds to accumulate real user cost + `server_config.cost.capMinor` (§4.1).** *(round-2 — CRITICAL #2)* |
| **`packages/eval/src/scenarios/routine-sessions.ts`** | **Rewrite `rs-cost-cap-blocked` seed (§4.1).** *(round-2)* |
| **`packages/eval/src/scenarios/session.ts`** | **Delete the 3 phantom `factory_cost_cap_*` seeds (dead, no reader).** *(round-2)* |
| `scripts/au18-notification-ownership-guard.ts` | **NEW** — repo-wide zero-allowlist notification-queue guard + `--fixtures`. |
| **`scripts/au18-kv-shape-guard.ts`** | **NEW** — AC-6b shape-guard (generic-KV `pgTable` detector), empty allowlist + name-based-boundary header note (§6.5) + `--fixtures`. *(round-2 — CRITICAL #3)* |
| `package.json` | Add both guards to `lint` chain. |

---

## 8. Acceptance criteria → verification

| AC | Verification method |
|----|--------------------|
| 1 — one owning module for `notificationQueue` | `au18-notification-ownership-guard.ts --check` green (fails on any non-repository reference); existing notification tests green. |
| 2 — real settings round-trip through `server_config`, identical values + route responses | Existing route/integration tests for notifications/observability/git-export config pass **unchanged** (same request → same response). New unit tests on the re-backed `read/update*Config` asserting `server_config` round-trip. |
| 3 — `cost-cap` sole owner of cost-actual; `cost-sentinel` calls a function | `au18` guard + `check` (no `factorySettings` symbol); cost-cap/cost-sentinel integration tests green; new unit test on `getFactoryCostActual`; **rewritten eval cost scenarios score identically (§4.1)**. |
| 4 — `factorySettings` zero callers + dropped | **`git grep factorySettings` across the WHOLE repo** → empty (excl. migration history / renamed `seedFactorySettings` is deleted); `npm run check` green (symbol gone — **incl. `packages/eval` compile**); migration 0049 present; `npm run db:migrate` clean. **(round-2: grep widened from server+db-only, which was the false-green.)** |
| 5 — all observable behavior unchanged | Full existing suites for cost-cap, cost-sentinel, notifications (delivery/digest/mute/routes/silence), git-export, observability, status, policy-engine, scoring, roster/agents templates pass unchanged; **eval graded dimensions unchanged after §4.1 rewrite**; **`GET /api/agents/templates/:role` returns identical 200 content for every seeded role incl. the underscore roles `product_manager`/`qa_engineer` (map-based resolution — round 3), and 404 for `assistant`/unknown, matching today.** |
| 6 — new direct `notificationQueue` access fails lint; **reintroducing a `factorySettings`-shaped raw table fails lint** | **6a:** notification guard `--fixtures` negative case fails. **6b:** old-symbol reintroduction → `check` failure (table gone) **AND** new generic-KV `pgTable` → `au18-kv-shape-guard --fixtures` negative case fails (§6.5). **Both halves closed in AU18 — not deferred.** |
| 7 — cross-owned-table queries decomposed, no allowlisted exception | §1b confirms all `notificationQueue` queries single-table; guard's join-method matcher fails any future `notificationQueue`-in-join. |

**Validation scenarios** (from spec) map to the integration suites in AC-5 + the enqueue→deliver path (notification-listener/dispatcher integration) + the config round-trip route tests.

---

## 9. Test plan

**Keep green unchanged (behavior-preservation is the whole WP):** all `__tests__` for notifications (dispatcher/digest/mute/silence-policy/delivery/routes), observability config, git-export config, cost-cap, cost-sentinel, policy-engine, scoring-config, roster, agents templates, status route.

**Fixture rewrites (seed the OLD storage → break on the drop; rewrite to new storage, assert identical observable outcomes — memory: "tests must not drive behavior"):**
- **`packages/server`**: tests seeding `factorySettings` rows directly — e.g. `silence-policy.integration.test.ts`, `policy-engine.integration.test.ts`, `AF8-notification-delivery.integration.test.ts` — rewrite to seed via `server_config`/domain-update functions.
- **`packages/eval`** *(round-2 — CRITICAL #1/#2)*: rewrite the graded cost scenarios per §4.1 — `scenarios/builtin-routines.ts` (`br-cost-sentinel-warning`/`breach`/`ok`), `scenarios/routine-sessions.ts` (`rs-cost-cap-blocked`); delete the phantom seeds in `scenarios/session.ts` + `seeding.ts seedMinimalWorld`; delete the `seedFactorySettings` helper. This is required for `check` (barrel drop) **and** AC-5 (graded outcomes must survive).

**New tests:**
- `notification-queue.test.ts` — each repository function's read projection/ordering + write effect (component-level with real PGlite fixture where the table is involved).
- Notification guard `--fixtures` self-test (positive repo file / negative synthetic access).
- **KV shape-guard `--fixtures` self-test** (positive: post-drop schema clean; negative: synthetic generic-KV `pgTable` flagged) *(round-2)*.
- Re-backed config round-trip units (notifications/observability/git-export/mute/silence read→update→read against `server_config`).
- `getFactoryCostActual` unit.
- **`readSystemPromptTemplateForRole` unit *(round 3 — CRITICAL #4 + WARNING §9)*:**
  - **Positive, real seeded roles (the AC-5 regression guard):** `product_manager` → returns the `product-manager.md` content (underscore role → hyphenated file; this case would have caught the round-2 regex + `${role}.md` bug); `qa_engineer` → `qa-engineer.md` content (second hyphenated-file role); `builder` → `builder.md` content (a same-stem role, sanity). At least these three MUST be in the red phase.
  - **Preserved-404 cases:** `assistant` → `null` (not in the map, matches today's 404); unknown role e.g. `sales` → `null`.
  - **Negative traversal cases:** `../etc/passwd`, `..%2f...`, `..`, uppercase `PRODUCT_MANAGER`, empty string → all `null` (not keys of the map → rejected before any fs read).
  - Route-level: `GET /api/agents/templates/product_manager` → 200 with content; `GET /api/agents/templates/assistant` → 404 (parity with today).

---

## 10. Risks / sequencing / open questions

**Scope risk (flag for reviewer/founder — do NOT silently absorb):** verified surface is ~2× the spec's estimate across **three** packages (server + db + **eval**) and touches knowledge-scoring, trust/policy, and agent-prompt-template subsystems the spec never mentioned. This is L-labelled but is **XL in practice**. It is still one coherent unit (retire one table), and AC-4 mandates the drop *in this WP*, so the plan covers the full retirement. Recommended internal structure: **two sequential sub-phases in one PR** —
  - **Phase B-first is safer than A-first:** do `factorySettings` retirement (Half B) as sub-phase 1, `notificationQueue` ownership (Half A) as sub-phase 2 — they're independent, but Half B is where the surprise scope lives (now incl. the eval rewrite + shape-guard), so land it before adding the Half-A guard. Alternatively parallelize; they share no files except `package.json` (lint chain).
  - The table `DROP` is the **hard last step** of Half B; nothing merges until `git grep factorySettings` (whole repo) is empty and `npm run check` (incl. eval) is green.

**Locked decisions (round 2, corrected round 3):**

- **Q2 — Agent prompt template CWD contract + role resolution (LOCKED):** read templates from `docs/system-prompts/*.md` via the shared `readSystemPromptTemplateForRole(role)` helper, which resolves the filename **through the canonical `SYSTEM_PROMPT_TEMPLATE_FILES` map** (role→filename, extracted from `factory-bootstrap.ts:188-197`), then reads `path.resolve(process.cwd(),"docs","system-prompts", <mapped-filename>)`. **Round-3 correction:** the round-2 naive `path.resolve(..., \`${role}.md\`)` stem is WRONG — it produces `product_manager.md`/`qa_engineer.md`, files that don't exist (the real files are hyphenated), regressing those roles to 404 on a live web path. The map lookup fixes this AND is the traversal allowlist (a non-key `role` never reaches `fs`). **Verified the CWD contract holds:** `factory-bootstrap.ts:187` already resolves `path.resolve(process.cwd(),"docs")` and reads the same files **in-process at server startup** to seed personas — the route runs in the same process with the same cwd, so it introduces **no new deployment dependency** beyond what bootstrap already requires (if `docs/` were absent, bootstrap would already fail first). Missing-file → 404 at the route / skip at bootstrap. If a future packaged build strips `docs/`, that is a pre-existing bootstrap break to fix there, not an AU18 regression.

**Open questions (builder resolves against code; none block planning):**
1. **Knowledge-scoring + trust weights:** no prod/eval writer exists → simplest is defaults-only (delete the read). If the founder wants these runtime-settable, add `server_config.knowledgeScoring` / `server_config.trust` sections instead. **Recommendation: defaults-only** (boring tech; no dead config surface). Behavioral edge: a value set via the retired generic `/settings` would no longer apply — acceptable since that path is debris.
2. **`GET /settings` consumers:** grep `packages/web` for `/status/settings` before removing the raw-rows response; repoint to a `server_config` projection if a client depends on it.
3. **Notification secrets → `server_credentials`:** adds a credential-store round-trip to `config.ts`. Confirm `server_credentials` naming convention (`notifications_smtp_password`, `notifications_ntfy_auth_token`) and that encryption (`credential-encryption.ts`) is available at that call site.

**Sequencing summary:** extend `server_config` schema (per-section defaults+merge) → re-back each domain module + delete no-writer reads → computed-state fix + eval-scenario rewrite (§4.1) → retire generic `/settings` → confirm whole-repo `git grep` empty + `check` green (incl. eval) → drop table + migration + barrel/zod-schema removals → build Notification repository + rewire 6 files → add both guards + wire lint. `npm run check && npm run lint && npm run test` green throughout; full `verify` before ship.
