# AU14 Round 2 — Knowledge FULL read+write-path unification — Architecture

**Status:** planned (round 2, reopened — **CORRECTED AGAIN 2026-07-12**; critique-2 findings closed 2026-07-12). Round 1 (`POST /` + `PATCH /:id` writes, PR #434 / `f22990a7`) shipped & merged; this round is **additive**, never a redo.
**Branch:** `backend/AU14-knowledge-read-path-unification` · **Worktree:** `.worktrees/AU14`
**Type:** backend refactor, no UI surface. No refine/design gate (convergence onto existing behavior — same rationale round 1 used, now applied to every remaining `knowledgeItems` access).

**Scope of this round (corrected, unconditional).** The founder's directive is literal and has no carve-out: **"all reads and write MUST go through the knowledge service. no exclusion."** After this round, `routes/knowledge.ts` performs **zero** direct `knowledgeItems` table access of any kind (`db.select().from` / `db.insert` / `db.update` / `db.delete`, incl. join-position reads) — grep-verifiable, zero-allowlist. That covers three groups:
1. The **4 GET handlers** (`/search`, `/`, `/triage-count`, `/:id` incl. related-items) — reads.
2. The **`POST /` + `PATCH /:id` post-write re-selects** — reads.
3. The **five specialized write handlers** — `PATCH /:id/scope`, `POST /:id/merge`, `POST /:id/split`, `POST /:id/archive`, `POST /:id/flag` — **their own reads AND writes**. Round 1's explicit carve-out of these five is **superseded**; there is no remaining exception.

Round 1's decisions are the binding precedent; this plan **references** them rather than re-deriving:
- **D-pattern (repo owns the READ/WRITE, route owns the response shape + event emit).** The route keeps HTTP-shaping (`signals` object, `Number.parseFloat`, `?? undefined`), event emission, the Q2 404 *decision*, and the 404/409 pre-checks; the repository owns every `knowledgeItems` read and write.
- **Q2-stays-caller-side pattern.** The repository never inspects a request-scoped `userId`; the route resolves the value and passes it in. Every visibility-filtered read takes a resolved `viewerUserId`; every write handler's user-scope resolution (`resolvedScopeId`) stays route-side and is passed as an ordinary value.
- **Canonical-event mechanism.** Domain events are emitted by the route on the `EventBus` (live subscribers: ws-broadcaster, git-export, observability). The repository emits nothing. Unchanged this round.
- **Behavior-preservation is strict** (WP AC: *"Every currently-observable behavior … merge/split's multi-row semantics, archive/flag's status transitions, scope-change's projection-layer update — is preserved exactly."*). The new write functions **replicate the exact write sequence** each handler performs today — they do **not** delegate to `create()`/`update()` where that would change edit-log, projection, version, or `updatedBy` behavior (see §7).

---

## 1. Context — what problem, why now

A founder ruling on sibling WPs AU12/AU13 (`feedback_service_ownership_includes_reads.md`) established a hard requirement: **the owning module is the only code permitted to touch its table — reads AND writes** — even where a WP's AC text only spelled out a subset. AU14 round 1 unified `POST /` + `PATCH /:id` writes but (a) left all reads raw and (b) explicitly carved out the five specialized write handlers. Both carve-outs are now closed by the corrected directive. Post-merge `origin/main` confirms `routes/knowledge.ts` still performs **19 raw reads** and **7 raw write call sites** against `knowledgeItems`, bypassing `knowledge-repository.ts`. This round closes both, grep-verifiable to zero, zero-allowlist.

## 2. Constraints

- **No behavior change visible to any consumer of any read OR write endpoint.** Response bodies byte-identical; edit-log rows, projection rows, status transitions, version bumps, and `updatedBy` semantics for the five write handlers **exactly** as today.
- **No schema changes.** No new tables/columns.
- **Round 1's write path (`create`/`update` via repo) stays intact.** Not touched (§12).
- **`list()` and `search()` stay byte-behavior-identical for their existing non-HTTP callers** — `services/context-assembly.ts` (`list`, pagination loop) and `tools/query-practice.ts` (`search`, FTS-ranked). Met by adding *new* functions, never extending `list`/`search` (§13).
- **The repository never inspects request context** — visibility + user-scope resolved to values and passed in.
- **The five write handlers' exact write sequences are preserved, not "improved."** Specifically: `archive`/`flag` do **not** bump version and do **not** rewrite `updatedBy`; `split`'s new items get **no** `create` edit-log row and a **layer-only** projection row (no `scopeId`/`kind`); scope-change writes `scope_change`-typed edit-log rows with the exact `"${scopeKind} (reason: ${reason})"` newValue format; merge/split/archive/scope stay **non-transactional** (as today), flag stays **single-transaction** (as today). Delegating to `create()`/`update()` would violate at least one of these per handler — hence bespoke functions (§7).
- Static "no raw `knowledgeItems` access in `routes/knowledge.ts`" property → **guard/lint rule, not a test** (per CLAUDE.md: grepping the filesystem is a lint rule, never a test).

## 3. Access inventory — every raw `knowledgeItems` access in `routes/knowledge.ts`

Identify by handler (line numbers shift as edits land).

### 3a. Reads — all 19 raw `.from(knowledgeItems)` reads

| # | Line | Handler | Read shape | Converts to |
|---|------|---------|-----------|-------------|
| 1 | 356 | `GET /search` | LIKE across title/body/topic + `ESCAPE` | **new** `searchByText` |
| 2 | 389 | `GET /` | item + projection LEFT JOIN, Q2 filter | **new** `listVisibleWithSignals` |
| 3 | 452 | `GET /triage-count` | `count(*)` status-in + Q2 | **new** `countTriageVisible` |
| 4 | 481 | `GET /:id` | item + projection LEFT JOIN, single row | **new** `findDetailById` |
| 5 | 530 | `GET /:id` relatedItems | same-topic, Q2, cap 10 | **new** `findRelatedByTopic` |
| 6 | 637 | `POST /` post-write re-select | kernel row by id | **new** `findById` |
| 7 | 777 | `PATCH /:id` pre-check | kernel row by id | `findById` |
| 8 | 834 | `PATCH /:id` post-write re-select | kernel row by id | `findById` |
| 9 | 666 | `PATCH /:id/scope` pre-check | kernel row by id | `findById` |
| 10 | 744 | `PATCH /:id/scope` re-select | kernel row by id | `findById` (route re-fetches for response) |
| 11 | 863 | `POST /:id/merge` target read | kernel row by id | `findById` |
| 12 | 877 | `POST /:id/merge` source read | kernel row by id | `findById` |
| 13 | 938 | `POST /:id/merge` re-select | kernel row by id | `findById` |
| 14 | 967 | `POST /:id/split` original read | kernel row by id | `findById` |
| 15 | 1005 | `POST /:id/split` per-item re-select | kernel row by id | inside `splitItem` (repo-owned) |
| 16 | 1051 | `POST /:id/archive` read | kernel row by id | `findById` |
| 17 | 1084 | `POST /:id/archive` re-select | kernel row by id | `findById` |
| 18 | 1112 | `POST /:id/flag` read | kernel row by id | `findById` |
| 19 | 1171 | `POST /:id/flag` re-select | kernel row by id | `findById` |

Also relocated (non-`knowledgeItems` access-log reads named by the WP's read-model): `GET /` batch (line 404) → into `listVisibleWithSignals`; `GET /:id` single count (line 514) → **new** `countAccessesSince`.

### 3b. Writes — all 7 raw `knowledgeItems` write call sites (the newly-in-scope surface)

| # | Line | Handler | Write shape | Converts to |
|---|------|---------|-----------|-------------|
| W1 | 729 | `PATCH /:id/scope` | `update` scopeKind/scopeId/version+1/updatedBy/updatedAt + 2 conditional `scope_change` edit-log rows + projection-layer upsert | **new** `changeScope` |
| W2 | 894 | `POST /:id/merge` | `update` target body/version+1/updatedBy/updatedAt | **new** `mergeItems` |
| W3 | 905 | `POST /:id/merge` | `update` source status=archived/updatedBy/updatedAt + 2 `merge` edit-log rows | **new** `mergeItems` |
| W4 | 984 | `POST /:id/split` | `insert` N new kernel rows (status draft, v1, inherits scope) + per-item layer-only projection, **no create edit-log** | **new** `splitItem` |
| W5 | 1013 | `POST /:id/split` | `update` original status=archived + 1 `split` edit-log row | **new** `splitItem` |
| W6 | 1063 | `POST /:id/archive` | `update` status=archived/updatedAt (**no version bump, no updatedBy change**) + 1 `archive` edit-log row | **new** `archiveItem` |
| W7 | 1146 | `POST /:id/flag` | `update` status=draft/updatedAt (**no version bump, no updatedBy change**) + 1 `flag` edit-log row, **inside the route's transaction** with `recordAgentWorkIntent` | **new** `flagItem` |

**Scope decision — corrected; the gap IS closed this round.** Round 1's plan §3 declared the five handlers' writes an *"explicit non-claim"* and stated `routes/knowledge.ts` would *"still import the `knowledgeItems` table object after this round."* **That is superseded.** With W1–W7 routed through the repository AND all 19 reads routed through it, `routes/knowledge.ts` has **zero** `knowledgeItems` access — and therefore **no longer imports the `knowledgeItems` table object at all** (§8). The read-only "documented tension" of the earlier draft no longer exists: the grep AC is now the *full* AC (`.select`/`.insert`/`.update`/`.delete`, incl. join-position reads), and it reaches zero.

**Consequential tightening (bonus, beyond the literal AC).** Because `changeScope`/`splitItem` own the projection-layer upsert, and the GET handlers' projection LEFT JOINs move into `listVisibleWithSignals`/`findDetailById`, the route's `upsertProjectionLayer` helper loses **all** callers and is deleted; the route stops importing `knowledgeAppProjection` and `knowledgeEditLog` entirely. These two tables are *not* gated by the guard (they are touched by other domains — promotion-pipeline, attention, etc. — and are out of AU14's scope), so this is a hygiene win, not an AC. `knowledgeAccessLog` **stays** imported (the best-effort access-log INSERT at line 547 is a `knowledgeAccessLog` write, out of scope — §5).

**Out of scope, stays in the route (correctly):**
- `resolveScopeName` (line 92, called at 570) reads `users`/`teams`/`bets`/`tasks`/`filesystems` — none is `knowledgeItems`. Untouched.
- The `POST /:id/flag` **agent existence check** (line 1125) reads `users` — not `knowledgeItems`. Untouched; route keeps the `users` import.
- `recordAgentWorkIntent` (line 1160) writes agent-layer intent tables — not `knowledgeItems`. Stays route-side, composed atomically with `flagItem` (§7c).
- The best-effort access-log **INSERT** (line 547) — a write to `knowledgeAccessLog`. Its timing (after the count, before the event emit) is preserved (§5).

## 4. Per-GET-handler read decision — extend `list`/`search`, or new function?

Decision for **all five rich reads: new narrowly-scoped functions. `list()` and `search()` are left byte-for-byte unchanged** (the WP "Plan calls" sanctions either; new functions avoid changing behavior for the non-HTTP callers — §13). Per-handler justification:

- **`GET /` → new `listVisibleWithSignals(db, viewerUserId)`.** `list()` applies *projection filters* (layer/scope/kind/topic), does **no Q2**, **no access-log**, and does **not** surface `relevanceScore`. `GET /` needs Q2 + the 30-day access-log aggregation + `relevanceScore` + `attentionScore`. Bolting these onto `list()` changes what `context-assembly.ts` receives. → separate function.
- **`GET /search` → new `searchByText(db, query)`.** `search()` uses **FTS `tsvector`** (whole-word, title+body only). `GET /search` uses **LIKE substring** across title+body+**topic** with `ESCAPE '\\'`. Repointing to `search()` would silently drop `topic` matches and turn substring into word matches — a forbidden behavior change that would also affect `query-practice.ts`. → separate function.
- **`GET /triage-count` → new `countTriageVisible(db, viewerUserId)`.** `count(*)` with `status in (draft, needs_human)` + Q2. `list`/`search` return rows, not counts. → separate function.
- **`GET /:id` → new `findDetailById(db, id)` + `countAccessesSince(db, itemId, sinceIso)` + `findRelatedByTopic(db, {topic, excludeId, viewerUserId, limit})`.** A single-row projection LEFT JOIN, a windowed access count, and a same-topic visibility-filtered lookup. → three separate functions.
- **All single-row kernel reads (#6–#19) → new `findById(db, id)`.** Returns `KnowledgeItem` (kernel `$inferSelect`), **not** `KnowledgeItemWithProjection`, so every write-handler response and the POST/PATCH re-select stay byte-identical. `findById` covers every field the five write handlers read (version, scopeKind, scopeId, status, body, topic, format, updatedBy — all kernel columns).

## 5. How the non-trivial READ logic survives the move

**Q2 read-filtering (non-HTTP-safe).** Unchanged rule: *visible if `scopeKind != "user"` OR `updatedBy == viewerUserId`*. Moves into the repository **as a parameter**:
- `listVisibleWithSignals`, `countTriageVisible`, `findRelatedByTopic` each build `or(ne(scopeKind,"user"), eq(updatedBy, viewerUserId))` from the passed value. Route resolves `c.get("userId")` and passes it.
- **`GET /:id` Q2 is a 404 *decision*, not a query filter, and STAYS in the route.** `findDetailById` returns the row unconditionally; the route keeps `if (item.scopeKind === "user" && item.updatedBy !== userId) → 404`.
- **`GET /search` has NO Q2 today and MUST keep none.** `searchByText` performs no visibility filtering ("preserve Q2" here means "preserve its absence").

**AF13 / L22 computed fields.**
- `accessCount30d` + `lastActivityAt` (`GET /`): the batch `knowledgeAccessLog` query + in-app group-by-itemId move into `listVisibleWithSignals`, returning per row `{ item, relevanceScore, attentionScore, accessCount30d, lastActivityAt }` (raw values; `null` never fake zeros). Route maps to the response `signals` object, keeping `citationCount: null`, `relevanceScore ?? null`, `attentionScore ? Number.parseFloat(...) : null`.
- `accessCount` (`GET /:id`): `countAccessesSince(db, itemId, thirtyDaysAgoIso)` runs **strictly before** the best-effort access-log INSERT (excludes the current page-load). Order preserved: count → insert → emit. The INSERT stays in the route (`knowledgeAccessLog`, out of scope).
- `relatedItems` (`GET /:id`): `findRelatedByTopic` returns `{id,title}[]`, `ne(id, excludeId)`, Q2-filtered, `limit`. Route keeps the `topic === null → []` short-circuit.
- **`knowledgeAppProjection` LEFT JOIN.** `knowledgeAppProjection` aliases `knowledgeStrategyFabric` (schema.ts:1044). Both `listVisibleWithSignals` and `findDetailById` keep the LEFT JOIN (items with no projection row still appear, projection fields `null`).

**`knowledge_accessed` event.** Emission stays in the route, unchanged, after the read/count/insert — repository emits nothing.

## 6. New repository READ surface (all in `knowledge-repository.ts`)

All exported, explicit return types, all take resolved values, none inspect request context. New imports for reads: `knowledgeAccessLog` from `@hyperidle/db`; `inArray`, `ne`, `or`, `sql` from `drizzle-orm`; `escapeLikePattern` from `../services/like-escape.js`.

```ts
export interface KnowledgeListRow {
  item: KnowledgeItem;
  relevanceScore: string | null;
  attentionScore: string | null;
  accessCount30d: number | null;
  lastActivityAt: string | null;
}
export interface KnowledgeDetailRow {
  item: KnowledgeItem;
  kind: string | null;
  layer: string | null;
  confidence: string | null;
  relevanceScore: string | null;
  attentionScore: string | null;
}

export async function findById(db: HyperIdleDb, id: string): Promise<KnowledgeItem | null>;
export async function searchByText(db: HyperIdleDb, query: string): Promise<KnowledgeItem[]>;
export async function listVisibleWithSignals(db: HyperIdleDb, viewerUserId: string): Promise<KnowledgeListRow[]>;
export async function countTriageVisible(db: HyperIdleDb, viewerUserId: string): Promise<number>;
export async function findDetailById(db: HyperIdleDb, id: string): Promise<KnowledgeDetailRow | null>;
export async function countAccessesSince(db: HyperIdleDb, itemId: string, sinceIso: string): Promise<number>;
export async function findRelatedByTopic(
  db: HyperIdleDb,
  opts: { topic: string; excludeId: string; viewerUserId: string; limit: number },
): Promise<Array<{ id: string; title: string }>>;
```

`searchByText` body = the exact current query: `%${escapeLikePattern(query)}%` against `title`/`body`/`topic` `LIKE … ESCAPE '\\'` combined with `or(...)`. Returns raw kernel rows (route wraps `{ results }`).

## 7. New repository WRITE surface — the five specialized handlers (the hard part)

**Governing principle: exact replication, not delegation.** None of the five handlers is a `create()`/`update()`-shaped operation. Each writes a **distinct** `editType`, and several deliberately skip a version bump / an `updatedBy` write / a `create` edit-log row. Routing any of them through `create()`/`update()` would change observable behavior the WP forbids (added edit-log rows, populated `projection.scopeId`, an unwanted version bump). Therefore each becomes its **own** narrowly-scoped repository function that moves the handler's **exact** write sequence — including its edit-log rows and projection-layer upsert — verbatim into `knowledge-repository.ts`. The route keeps: 404/409 pre-checks (via `findById`), `resolvedScopeId` resolution + the `requiresScopeId` 400 guard, the response re-fetch (via `findById`), and event emission.

### 7a. Per-handler decision: new function vs `update()`

The load-bearing, always-true invariant of `update()` is that it **unconditionally bumps `version` on every call**: `update()` (repo:334, applied 342–350) sets `version = existing.version + 1` even when `kernelChanges` is empty. Note `update()` does **not** unconditionally rewrite `updatedBy` — `buildDiff` (258–262) only writes `updatedBy` when the caller passes it as a changed field — so the precise reason `archive`/`flag` can't delegate is the **version bump**, not an `updatedBy` rewrite. (Both must also NOT bump version; delegating to `update()` would.)

| Handler | Could it be `update()`? | Decision + why |
|---|---|---|
| `PATCH /:id/scope` | **No.** `update()`'s `KERNEL_EDITABLE_FIELDS` does **not** include `scopeKind`; it writes `editType:"update"` per-field rows, not the `editType:"scope_change"` rows with the `"${scopeKind} (reason: ${reason})"` newValue format that `knowledge.q2` asserts; and it does not do the projection-layer upsert. | **new `changeScope`** |
| `POST /:id/archive` | **No.** `update()` **unconditionally bumps `version` on every call** (even with no changed kernel field — repo:334). Archive must **not** bump version — it sets only `status`+`updatedAt` (no `updatedBy` write either) — and writes an `editType:"archive"` row (not `"update"`). Delegating to `update()` would bump the version of every archived item. | **new `archiveItem`** |
| `POST /:id/flag` | **No.** Same unconditional-version-bump mismatch as archive (flag must not bump version either; sets only `status`+`updatedAt`), plus `editType:"flag"` with `"flagged (reason: …)"` newValue, plus it must run **inside the route's transaction** with `recordAgentWorkIntent`. | **new `flagItem`** |
| `POST /:id/merge` | **No.** Two-row op (target body-append + source archive) with `editType:"merge"` rows — not a single-item field update. | **new `mergeItems`** |
| `POST /:id/split` | **No.** Fan-out: N new kernel rows with **no `create` edit-log** + layer-only projection, then archive the original with an `editType:"split"` row. Delegating the inserts to `create()` would add N `create` edit-log rows and populate `projection.scopeId`/`kind`. | **new `splitItem`** |

**None of the five is a simple field-update `update()` supports. All five need new repository functions.**

### 7b. New function signatures (all in `knowledge-repository.ts`, exported, explicit return types)

Each takes the already-fetched row(s) the route obtained via `findById` for its pre-check (mirrors round-1 `update(db, id, changes, expectedVersion)` where the route pre-reads for the 404/409 and passes the version), plus the operation input. This avoids duplicate reads and lets the route own the two distinct 404 messages for merge (target vs source).

```ts
export async function changeScope(
  db: HyperIdleDb,
  existing: KnowledgeItem,
  input: { scopeKind: string; scopeId: string | null; reason: string; updatedBy: string },
): Promise<KnowledgeItem>;

export async function mergeItems(
  db: HyperIdleDb,
  input: { target: KnowledgeItem; source: KnowledgeItem; updatedBy: string },
): Promise<KnowledgeItem>; // the merged target

export async function splitItem(
  db: HyperIdleDb,
  input: { original: KnowledgeItem; newItems: Array<{ title: string; body: string; topic?: string }>; updatedBy: string },
): Promise<KnowledgeItem[]>; // created items, in order

export async function archiveItem(
  db: HyperIdleDb,
  item: KnowledgeItem,
): Promise<KnowledgeItem>; // the archived item

export async function flagItem(
  db: HyperIdleDb,
  item: KnowledgeItem,
  input: { reason: string; editId: string },
): Promise<void>; // route re-fetches via findById after the tx commits
```

New repo imports for writes: `scopeToLayer` + `SCOPE_KINDS` from `@hyperidle/shared` (for the projection-layer upsert moved from the route). The repo already imports `knowledgeAppProjection`, `knowledgeEditLog`, `knowledgeItems`, `HyperIdleDb`, `eq`, `and`.

A private `upsertProjectionLayer(db, itemId, scopeKind)` is added to the repo, **moved verbatim** from the route (`scopeToLayer(scopeKind)` → update-or-insert the projection `layer` column only). `changeScope` and `splitItem` call it — identical behavior to today; the route's copy is deleted (§8).

### 7c. Exact write sequence per function (behavior replicated verbatim)

- **`changeScope(db, existing, {scopeKind, scopeId, reason, updatedBy})`** — replicates lines 697–746:
  1. `now`; `resolvedScopeId = scopeId` (route already resolved `?? null` and enforced the `requiresScopeId` 400).
  2. if `existing.scopeKind !== scopeKind`: insert edit-log `{ field:"scope_kind", oldValue: existing.scopeKind, newValue: `${scopeKind} (reason: ${reason})`, editType:"scope_change", editor: updatedBy, createdAt: now }`.
  3. if `existing.scopeId !== resolvedScopeId`: insert edit-log `{ field:"scope_id", oldValue: existing.scopeId, newValue: resolvedScopeId, editType:"scope_change", editor: updatedBy }`.
  4. `update knowledgeItems set scopeKind, scopeId=resolvedScopeId, version=existing.version+1, updatedBy, updatedAt=now where id`.
  5. `upsertProjectionLayer(db, existing.id, scopeKind)`.
  6. re-read + return the updated kernel row.
  Route keeps the 404 (via `findById`) and the 409 version check (compare `existing.version !== body.version`) — **unchanged**, no repo-side version recheck (faithful: today's scope handler has none).

- **`mergeItems(db, {target, source, updatedBy})`** — replicates lines 889–940 (non-transactional, as today):
  1. `now`; `mergedBody = `${target.body}\n\n---\n\n${source.body}``.
  2. `update target` set `body=mergedBody, version=target.version+1, updatedBy, updatedAt=now`.
  3. `update source` set `status="archived", updatedBy, updatedAt=now`.
  4. insert edit-log `{ itemId:target.id, field:"body", oldValue:target.body, newValue:mergedBody, editType:"merge", editor:updatedBy }`.
  5. insert edit-log `{ itemId:source.id, field:"status", oldValue:source.status, newValue:"archived", editType:"merge", editor:updatedBy }`.
  6. re-read target + return.

- **`splitItem(db, {original, newItems, updatedBy})`** — replicates lines 979–1031 (non-transactional, as today):
  1. `now`; `created=[]`.
  2. for each `newItem`: `newId`; `insert knowledgeItems { id:newId, scopeKind:original.scopeKind, scopeId:original.scopeId, topic: newItem.topic ?? original.topic, title, body, format:original.format, status:"draft", version:1, updatedBy, createdAt:now, updatedAt:now }`; `upsertProjectionLayer(db, newId, original.scopeKind)`; re-read the created row; push. **No `create` edit-log row** (preserved).
  3. `update original` set `status:"archived", updatedBy, updatedAt=now`.
  4. insert edit-log `{ itemId:original.id, field:"status", oldValue:original.status, newValue:"archived", editType:"split", editor:updatedBy }`.
  5. return `created`.
  **Deliberate divergence from `create()`:** `splitItem` intentionally does **not** call `create()` — it must reproduce the raw insert (no `create` edit-log, layer-only projection with NULL `scopeId`/`kind`). This is the crux of "preserve exactly" for split. Captured as `@lore AU14` at the function.

- **`archiveItem(db, item)`** — replicates lines 1061–1086:
  1. `now`; `update knowledgeItems set status:"archived", updatedAt:now where id` — **no version bump, no `updatedBy` change** (preserved).
  2. insert edit-log `{ field:"status", oldValue:item.status, newValue:"archived", editType:"archive", editor:item.updatedBy }`.
  3. re-read + return.

- **`flagItem(db, item, {reason, editId})`** — replicates the `knowledgeItems`+edit-log writes inside lines 1144–1167 (see §7d for the transaction):
  1. `now`; `update knowledgeItems set status:"draft", updatedAt:now where id` — **no version bump, no `updatedBy` change** (preserved).
  2. insert edit-log `{ id: editId, field:"status", oldValue:item.status, newValue:`flagged (reason: ${reason})`, editType:"flag", editor:item.updatedBy, createdAt:now }`.
  Returns void — the route re-fetches via `findById` after the transaction commits.

### 7d. `flagItem` transaction composition (the one cross-domain subtlety)

Today the flag handler wraps **three** writes in **one** `db.transaction`: the `knowledgeItems` status update, the `knowledgeEditLog` insert, and (when `agentId` is present) `recordAgentWorkIntent(tx, …)` — an **agent-layer** write, keyed by `idempotencyKey: `knowledge:${id}:review:${editId}``. `recordAgentWorkIntent` cannot live in `knowledge-repository.ts` (wrong domain), so the transaction boundary **must stay at the route** (it spans the Knowledge and agent-intent domains — a pre-existing cross-domain atomic write, not introduced by AU14).

**Design:** `flagItem` accepts the caller's db/transaction handle and does **not** open its own transaction; the route keeps its `db.transaction` wrapper and calls `flagItem` inside it. The route generates `editId` (so it can build the `idempotencyKey`) and passes it to `flagItem` for the edit-log row id:

```ts
const item = await findById(db, id);          // route 404 pre-check (repo-owned read)
if (!item) return 404;
// agent existence check (reads `users` — out of scope, stays)
const editId = crypto.randomUUID();
let intent;
await db.transaction(async (tx) => {
  await flagItem(tx as HyperIdleDb, item, { reason: body.reason, editId });   // knowledgeItems + edit-log
  if (body.agentId) intent = await recordAgentWorkIntent(tx as HyperIdleDb, {
    …, idempotencyKey: `knowledge:${id}:review:${editId}`,
  });
});
const updated = await findById(db, id);       // repo-owned re-fetch
eventBus.emit(knowledge_updated action:"flagged"); …                          // unchanged
```

`tx as HyperIdleDb` is the **pre-existing** pattern this file already uses (line 1160 today) — not a new unsafe cast. Atomicity is **byte-identical**: same three writes, same single transaction, same rollback-on-failure semantics. `flagItem` is the one write function that accepts a caller-provided transaction handle rather than owning its own — justified precisely by this cross-domain composition. **This atomicity guarantee is the plan's single cross-domain invariant and is explicitly test-locked** (§11 tests 5b positive-path + 5c rollback).

**merge/split/archive/scope** are **non-transactional today**; their functions replicate that (no new transaction). Wrapping them in a transaction would be a defensible robustness improvement but a **failure-path behavior change** the WP forbids — deferred, noted in §14.

## 8. File-by-file change list

1. **`packages/server/src/knowledge/knowledge-repository.ts`**
   - Add the **7 read** functions + 2 read interfaces (§6).
   - Add the **5 write** functions (§7b) + the private `upsertProjectionLayer` (moved verbatim from the route).
   - Add imports: reads → `knowledgeAccessLog`, `inArray`/`ne`/`or`/`sql`, `escapeLikePattern`; writes → `scopeToLayer` + `SCOPE_KINDS` from `@hyperidle/shared`.
   - `create`/`update`/`list`/`search` **unchanged**.
2. **`packages/server/src/routes/knowledge.ts`**
   - Replace all **19 reads** (§3a) with repo read calls; move the two access-log reads (404, 514) into repo calls.
   - Replace all **7 write call sites** (§3b) with `changeScope`/`mergeItems`/`splitItem`/`archiveItem`/`flagItem`; keep each handler's 404/409 pre-check (via `findById`), `resolvedScopeId` resolution + `requiresScopeId` 400 guard, response re-fetch (via `findById`), and event emission.
   - **Delete the route-local `upsertProjectionLayer`** (all callers — scope, split, and round-1 POST — are gone; the GET projection reads moved to repo). knip enforces its removal.
   - **Remove imports** now unused: `knowledgeItems`, `knowledgeAppProjection`, `knowledgeEditLog`. **Keep**: `knowledgeAccessLog` (the access-log INSERT at 547 stays), `scopeToLayer` (still used by round-1 `POST /` at line 620), `users`/`teams`/`teamMembers`/`bets`/`tasks`/`filesystems` (`resolveScopeName` + flag agent check), `HyperIdleDb`, `recordAgentWorkIntent`, `ItemDeletedError`/`VersionConflictError` (round-1 PATCH catch).
   - Add imports for the 12 new repo functions.
3. **`scripts/au14-knowledge-ownership-guard.ts`** (new — **renamed & generalized** from the read-plan's `au14-knowledge-read-ownership-guard.ts`; see §9).
4. **`package.json`** — append `&& npx tsx scripts/au14-knowledge-ownership-guard.ts` to the `lint` script (same wiring as au13).
5. **Tests** — net-new locks for `searchByText` LIKE semantics and for the exact-behavior of **all five** write repo functions — merge, split, archive, flag (incl. cross-domain atomicity), scope-change (§11).

## 9. Ownership guard — renamed & generalized to ALL access types (incl. joins)

The earlier read-draft planned `au14-knowledge-read-ownership-guard.ts` (read-scoped). "Read ownership" is the wrong name now that writes are equally in scope. **Rename to `scripts/au14-knowledge-ownership-guard.ts`** and generalize:

- **Clone** `au13-work-routine-ownership-guard.ts`'s AST-scan + `--fixtures` self-test shape.
- **Scope: file-scoped to `packages/server/src/routes/knowledge.ts`** — NOT a repo-wide `TABLE_OWNER` map. Confirmed by grep: **16** server files touch `knowledgeItems` directly (practice-meeting, promotion-pipeline, attention-service/-scoring, relevance-service, git-export, `routes/bets.ts`, `routes/threads.ts`, `routes/search.ts`, tools, `builtin-routine-handlers`, agent-work-intent-worker, …). Those are **other domains' access, explicitly out of AU14's scope** ("Out of scope: any other domain's read/write path"). A repo-wide owner=`knowledge-repository.ts` map would fail on all 14 non-repo files and blow past AU14's boundary. (The repo-wide `TABLE_OWNER` map is AU8's job, after AU12–AU16 close every domain's equivalent gap.)
- **Access set: the four direct-access methods AND the four join methods.** Fail on any `CallExpression` whose callee is `<identifier>.from` / `.insert` / `.update` / `.delete` **OR** a join method (`.leftJoin` / `.innerJoin` / `.rightJoin` / `.fullJoin`) and whose **first argument is the identifier `knowledgeItems`**, in `routes/knowledge.ts`. **Why joins matter (critique W1):** today every read is `.from(knowledgeItems).leftJoin(knowledgeAppProjection, …)` so `knowledgeItems` is always the `.from` target and is caught by the direct-method matcher — but a *future* read written as `.from(knowledgeAppProjection).innerJoin(knowledgeItems, …)` touches `knowledgeItems` directly in **join** position and would **evade** a `.from`/`.insert`/`.update`/`.delete`-only matcher entirely. Matching join callees whose first arg is `knowledgeItems` closes that hole so "zero access of any kind" (§14) is genuinely what the guard enforces, not merely what the plan claims. (The read-draft's method set was `.from` only; this generalizes to the four direct-access + four join methods.)
- **Zero-allowlist** (no per-line carve-outs).
- **`--fixtures` self-test:**
  - **positive** (each in a `routes/knowledge.ts`-named fixture → findings): `.from(knowledgeItems)`, `.insert(knowledgeItems)`, `.update(knowledgeItems)`, **and `.from(knowledgeAppProjection).innerJoin(knowledgeItems, …)`** (the join-position raw read the W1 fix targets — proves the join matcher fires).
  - **negative** (→ allowed): the same shapes (**including the join case**) in a `knowledge-repository.ts`-named fixture; a write to an unrelated table (`knowledgeAccessLog`) — proves the guard is `knowledgeItems`-specific so the surviving access-log INSERT does not trip it; and **`.from(knowledgeAppProjection).leftJoin(knowledgeStrategyFabric, …)`** where `knowledgeItems` appears nowhere — proves the join matcher fires **only** when `knowledgeItems` is the join arg, not on every join.

## 10. Acceptance criteria → concrete changes → verification (corrected WP ACs)

Pulled verbatim from the corrected `TRACK-AU.md` AU14 section (worktree copy, lines 805–812).

| AC (corrected WP) | Concrete change | Verification |
|---|---|---|
| **AC-1** `GET /search`, `GET /`, `GET /triage-count`, `GET /:id` call repo `list`/`search` (or new fns) not raw `db.select()` | §3a rows 1–5 → `searchByText`/`listVisibleWithSignals`/`countTriageVisible`/`findDetailById`+`findRelatedByTopic` | guard + existing GET tests green (`knowledge.integration` AC10 search, `knowledge.q2`, `knowledge.af13`, `knowledge-signals`, `y4-triage`) |
| **AC-2** `POST /`/`PATCH /:id` post-write re-select via a repo read fn | §3a rows 6, 8 → `findById` | guard + `knowledge.integration` create/update tests |
| **AC-3** `PATCH /:id/scope`, `POST /:id/merge`, `POST /:id/split`, `POST /:id/archive`, `POST /:id/flag` — **every read AND write** routes through the repo; round-1 carve-out superseded, no remaining exception | §3a rows 9–19 → `findById`; §3b W1–W7 → `changeScope`/`mergeItems`/`splitItem`/`archiveItem`/`flagItem` (§7) | guard + `knowledge.integration` AC6/AC7/AC8/AC9, `knowledge.q2` scope tests, new merge/split/archive/flag/scope repo tests (§11) |
| **AC-4** Q2 holds exactly on **every** read AND write path incl. new ones | §5 (`viewerUserId` param, `GET /:id` 404 decision route-side, `GET /search` keeps no filter); write handlers keep route-side `resolvedScopeId`/`requiresScopeId` (§7c) | `knowledge.q2` (AC-6 list, `/:id` 404, scope-change), `y4-triage`, `af13` — unchanged |
| **AC-5** Every currently-observable behavior preserved exactly — AF13 signals, triage aggregation, `knowledge_accessed`, **merge/split multi-row semantics, archive/flag status transitions, scope-change projection-layer update** | §5 (reads) + §7 (writes: exact-replication, no version bump on archive/flag, no `create` edit-log on split, `scope_change` edit-log format, single-tx flag) | `knowledge.integration` AC6–AC9, `knowledge.q2` scope (version-bump-by-1, scope_kind log oldValue/newValue), `O2-schema-migration` (event emits) — all unchanged; new merge/split/archive/flag/scope repo tests lock the exact rows + invariants (§11) |
| **AC-6 (the hard grep AC)** `routes/knowledge.ts` has **zero** direct `knowledgeItems` access of any kind (`db.select`/`db.insert`/`db.update`/`db.delete`, incl. join-position reads), grep-verifiable, zero-allowlist | all 19 reads + 7 writes converted; route no longer imports `knowledgeItems` | `scripts/au14-knowledge-ownership-guard.ts` (static property → guard, not a test) wired into `npm run lint` — fails on any raw `knowledgeItems` access via `.from`/`.insert`/`.update`/`.delete` **or** `.leftJoin`/`.innerJoin`/`.rightJoin`/`.fullJoin` |
| **AC-7 (round 1, must not regress)** create/update via repo; Q2 write-side; one event/write; edit-log on every create/update | untouched (§12) | `knowledge.integration` AU14 create-edit-log + D3-projection tests, AC11/AC12/AC13 — unchanged |

## 11. Test impact

**Existing tests for the five write handlers — must all pass byte-identical, unchanged (but see the critical note: several are too weak to pin exact behavior, so §11 adds net-new locks):**

- `knowledge.integration.test.ts`:
  - **AC6 merge** (line 221): merged body contains both; source `status==="archived"`; **404 when source missing** (line 249). `mergeItems` + route's two `findById` 404s preserve both. ✓
  - **AC7 split** (line 268): 2 items returned, titles `Part A`/`Part B`, `version===1`; original `status==="archived"`; **400 when <2 newItems** (zod, route-side, line 298). `splitItem` preserves; the 400 is schema validation, untouched. ✓
  - **AC8 archive** (line 317): asserts **only** `status==="archived"` + a 404 (line 331). **Does NOT** assert version-unchanged / updatedBy-unchanged / the `archive` edit-log row → net-new test 4 adds the exact-behavior lock.
  - **AC9 flag** (line 342): asserts **only** `200` + `body.id===id` + recorded in edit log; a 404 (line 360). **Does NOT** pin status→draft, no-version-bump, no-updatedBy-change, the `flag` newValue format, or the cross-domain single-transaction with `recordAgentWorkIntent` → net-new test 5 adds all of these.
  - **AC12 edit-log** (line 450, `logs.length >= 2`): tolerant; unchanged. **AC11/AC13** (events): route still emits, unchanged.
- `knowledge.q2.integration.test.ts` (real path `packages/server/src/routes/__tests__/`) scope-change suite (lines 408–520+): `PATCH /:id/scope` changes scopeKind/scopeId (line 408); **bumps version by 1** (line 433) → `changeScope` sets `version=existing.version+1`; **logs `scope_kind` change** with `oldValue==="user"`, `newValue` **contains** `"product"` (line 454); **reason captured in edit log** (line 481); **409 wrong version** (line 510) → route keeps the version pre-check. It does **not** assert `editType==="scope_change"` nor the exact `"${scopeKind} (reason: ${reason})"` format (`grep scope_change` across all tests returns zero) → net-new test 6 adds the format/editType lock. Everything else preserved. ✓
- `knowledge.af13.integration.test.ts` (scope-change + related-items + access signals), `AF11-authz.integration.test.ts`, `knowledge-scope-name.integration.test.ts`, `knowledge-access.integration.test.ts`, `knowledge-signals.integration.test.ts`, `git-export.integration.test.ts`, `O2-schema-migration.integration.test.ts` — exercise these handlers' observable behavior; all unchanged (behavior byte-identical by construction). ✓
- Tool/repo suites on `create`/`update`/`search` — untouched (`create`/`update`/`list`/`search` unedited). ✓

**Net-new tests (runtime behavior of the new repo functions — TDD red before green):**

1. **`searchByText` LIKE-vs-FTS lock** — `GET /api/knowledge/search` with a **topic-only substring** match that FTS would not return; asserts it appears. Guards against a future accidental repoint to `search()`. (Carried from the read draft.)
2. **`mergeItems` exact-behavior lock** — call `mergeItems(db, {target, source, updatedBy})` directly (repo import); assert: target body === `${targetBody}\n\n---\n\n${sourceBody}`, target `version===target.version+1`, source `status==="archived"`, **exactly two** `knowledgeEditLog` rows with `editType==="merge"` (one `field:"body"` on target, one `field:"status"` on source). Locks the multi-row semantics AC-5 names as highest-risk.
3. **`splitItem` exact-behavior lock** — call `splitItem(db, {original, newItems:[…2…], updatedBy})` directly; assert: N created rows with `version===1`, `status==="draft"`, inherited `scopeKind`/`scopeId`/`format`; original `status==="archived"`; **exactly one** `editType:"split"` row (`field:"status"` on the original) and **zero** `editType:"create"` rows for the new items (the deliberate no-create-log divergence — the single most likely place a builder would accidentally introduce a behavior change by delegating to `create()`); each new item's projection row has `scopeId===null` (layer-only).
4. **`archiveItem` exact-behavior lock (closes critique C1.1)** — call `archiveItem(db, item)` directly (repo import, `{ db }` fixture); assert the exact invariants §7a names as the reason it can't delegate to `update()`: post-call `version` is **UNCHANGED** (=== the pre-call `item.version`, NOT bumped), `updatedBy` is **UNCHANGED**, `status==="archived"`, and **exactly one** `knowledgeEditLog` row with `editType==="archive"` (`field:"status"`, `oldValue` = prior status, `editor === item.updatedBy`). Same direct-repo-call pattern as tests 2/3. Without this, a builder routing archive through any version-bumping helper passes AC8 (which only checks `status==="archived"` + 404) while silently bumping every archived item's version.
5. **`flagItem` exact-behavior + cross-domain atomicity lock (closes critique C1.2)** — three parts, because §7d names this the plan's one cross-domain atomic guarantee:
   - **(5a) direct exact-behavior lock** — call `flagItem(db, item, {reason, editId})` directly; assert `status==="draft"`, `version` **UNCHANGED**, `updatedBy` **UNCHANGED**, and **exactly one** `editType==="flag"` row whose `newValue === "flagged (reason: ${reason})"` (exact string, not a substring) and whose `id === editId`.
   - **(5b) route-level atomic positive path** — `POST /:id/flag` with `agentId` present; after the call, read back the single `editType:"flag"` `knowledgeEditLog` row and derive `editId` from its `id`, then assert **both** rows exist: that flag edit-log row **and** an `agentWorkIntents` row with `idempotencyKey === "knowledge:${id}:review:${editId}"` and `requestedBy === agentId`. Since both writes share the route's single `db.transaction`, their joint presence proves atomic commit of the cross-domain composition (§7d). (Complement: `POST /:id/flag` **without** `agentId` → the flag edit-log row exists and **no** `agentWorkIntents` row is created — proves the intent write is agent-gated, not unconditional.)
   - **(5c) rollback lock (negative — judged warranted, and achievable stub-free)** — call `flagItem(tx, item, …)` inside a `db.transaction(async (tx) => { await flagItem(tx, …); throw … })` that **throws after `flagItem` returns**; then assert **neither** effect persisted: the item's `status` is unchanged (still not `"draft"`) **and** zero `editType:"flag"` edit-log rows exist. This proves `flagItem` writes **only** through the caller-provided `tx` handle and opens **no** inner transaction of its own (the exact §7d design decision) — so an outer abort undoes it. It is the honest, deterministic form of the atomicity guarantee: it forces the outer transaction to roll back without stubbing anything.
   - **Why 5c rather than "force `recordAgentWorkIntent` to fail"** — verified against real code: `recordAgentWorkIntent` (`services/agent-work-intents.ts:37`) is idempotency-keyed with `onConflictDoNothing` and returns the existing row on collision, so it **never throws** on a duplicate key; `editId`/`idempotencyKey` is generated fresh per request (`crypto.randomUUID()`), so a collision can't be pre-seeded; and the route validates `agentId` against `users` **before** opening the transaction (line 1125), so a bad `agentId` can't FK-fail mid-tx. There is therefore **no honest, deterministic lever to make `recordAgentWorkIntent` throw** mid-transaction without a behavior-driving stub — which CLAUDE.md's mock-validation-trap and "tests must not drive behavior" rules forbid. 5c proves the identical guarantee (flagItem's writes roll back with the caller's transaction) by aborting the outer tx directly — a stronger, stub-free proof of the same atomicity invariant. The positive path (5b) plus the rollback lock (5c) together fully pin §7d.
6. **`changeScope` exact-behavior lock (closes critique C1.3; single scope-change test per critique N3)** — call `changeScope(db, existing, {scopeKind, scopeId, reason, updatedBy})` directly with **both** `scopeKind` and `scopeId` changing; assert the emitted `knowledgeEditLog` rows carry `editType==="scope_change"` (the value `grep scope_change` currently finds in **zero** tests) and that `newValue` matches the exact format: the `field:"scope_kind"` row's `newValue === "${scopeKind} (reason: ${reason})"` **and** the `field:"scope_id"` row's `newValue === resolvedScopeId`. Locks the format `knowledge.q2` only checks by substring (`contains "product"`) and never pins as `editType`.

Net-new tests 2–6 are true runtime tests (import the repo fn or drive the route, assert on DB state via the `{ db }` fixture) — they exist because the new functions are new application logic whose exact-replication guarantee must be **proven**, not merely inherited from the (partially too-weak) route suites.

**Retraction of this draft's earlier false coverage claim.** The prior revision of §11 asserted *"No net-new tests needed for `changeScope`/`archiveItem`/`flagItem` — their observable behavior is already fully pinned by the existing suites."* **That was false and is withdrawn.** The independent critique verified against the real suites that AC8 asserts only `status==="archived"`, AC9 asserts only `200 + id`, and no test anywhere asserts `editType==="scope_change"` or the exact `scope_change` newValue format — so the exact behaviors §7 names as the reason these can't delegate to `update()` were **unpinned**, and the DoD ("keep every existing suite green while the guard flips red→green") was satisfiable by a **wrong** (version-bumping / wrong-editType / non-atomic) implementation. Net-new tests 4–6 close that gap. The corrected builder DoD is: keep every existing suite green, **add tests 1–6 (red before green)**, and flip the guard red→green — a DoD a wrong implementation can no longer satisfy.

## 12. Round-1 write path is untouched — no regression risk

This plan **adds** repository read+write functions and **replaces** route-side reads/writes; it changes nothing in round 1's `POST /`/`PATCH /:id` path:
- `create`/`update` in `knowledge-repository.ts` — not edited.
- `POST /` still calls `createKnowledgeItem`; `PATCH /:id` still calls `updateKnowledgeItem` inside its try/catch (VersionConflict/ItemDeleted → 409/404). Only their post-write re-select (a read) swaps `db.select()` → `findById` — same kernel row, same 201/200 body.
- Q2 write-side, one-event-per-write, edit-log-on-every-create/update — unchanged.
- No new domain event introduced anywhere.

## 13. Flag — risk to `list()`/`search()` existing non-HTTP callers

**None, by construction.** `list()` and `search()` are **not extended or modified** — every route read need is met by *new* functions, so `services/context-assembly.ts` (`list`, pagination loop) and `tools/query-practice.ts` (`search`, FTS) see **zero change**. The five write functions are **new** and are called **only** by `routes/knowledge.ts` — no existing non-HTTP caller invokes them, so nothing outside the route is affected by the write conversion either.

## 14. Full-closure confirmation, trade-offs & the honest flag

**Closure is 100% and achievable with no named exceptions.** After this round, `routes/knowledge.ts` contains zero `db.select().from(knowledgeItems)` / `db.insert(knowledgeItems)` / `db.update(knowledgeItems)` / `db.delete(knowledgeItems)` **and zero join-position `knowledgeItems` reads** — all 19 reads and all 7 write call sites route through `knowledge-repository.ts`, the `knowledgeItems` import is removed, and the `au14-knowledge-ownership-guard.ts` guard (all four direct-access methods + the four join methods `.leftJoin`/`.innerJoin`/`.rightJoin`/`.fullJoin`, zero-allowlist) enforces it in `npm run lint`. No handler is carved out; the round-1 "explicit non-claim" is superseded. **The critique-2 findings do not reduce closure — they are purely additive test coverage (§11 tests 4–6) plus a guard method-set widening (§9) plus a wording correction (§7a); scope is unchanged.**

**No case requires a real behavior change to achieve closure.** All five operations are single-`knowledgeItems`-table CRUD-adjacent writes; relocating them into the repository preserves every observable byte. The **one** structural subtlety — `flag`'s cross-domain single-transaction with `recordAgentWorkIntent` — is fully preserved by having `flagItem` accept the route's transaction handle (§7d, using the file's pre-existing `tx as HyperIdleDb` pattern), so atomicity is identical **and is now test-locked (§11 tests 5b/5c)**. **I flag no gap; closure does not force any behavior change.**

**Trade-offs / deferred (not blocking, no behavior change):**
- **merge/split/archive/scope stay non-transactional** (as today). Wrapping them in a transaction is a defensible robustness improvement but a failure-path behavior change — out of AU14's "preserve exactly" scope; a possible future hardening WP.
- **`knowledgeAppProjection` + `knowledgeEditLog` become fully repo-owned from the route** as a consequence (route stops importing them). This is stronger than the literal `knowledgeItems`-only AC. It is **not** enforced by the guard (those tables are legitimately touched by other domains and are out of AU14's scope); it is a hygiene win that knip keeps honest.
- **`upsertProjectionLayer` moves into the repo** as a private helper; behavior byte-identical (layer-only upsert via `scopeToLayer`).
- **Doc hygiene (non-blocking):** `docs/knowledge-architecture/sync-and-conflict-resolution.md:32` references a removed `packages/fabric/src/events.ts` bridge — correct at `/pipeline:write-docs` if AU14's docs are touched.
