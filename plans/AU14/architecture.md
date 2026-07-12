# AU14 — Knowledge write-path unification — Architecture

**Type:** backend, behavior-preserving convergence. No new concept, no UI, no schema change. `routes/knowledge.ts` stops being a second implementation of "write a knowledge item" and becomes a caller of the existing `knowledge-repository.ts`. The two knowledge-event mechanisms collapse to one.

**Spec:** `.pipeline/work-packages/TRACK-AU.md` → `### AU14` (lines 746–793). Depends on: none.

---

## 1. Context — what problem, why now

`knowledge_items` has two independent write paths against the same table:

- **Repository path** (`packages/server/src/knowledge/knowledge-repository.ts` `create`/`update`) — inserts `knowledgeItems` **+** `knowledgeAppProjection` (full row: `layer`,`scopeId`,`kind`,…) **+** a `knowledgeEditLog` row, then emits on a module-level singleton `getKnowledgeEvents()`. Already used by `services/context-assembly.ts` (`list`), `services/writeback.ts` (`create`/`update`), and tools `write-memory.ts` (`create`), `promote-knowledge.ts` (raw update — not repo), `query-practice.ts` (`search`).
- **Route path** (`routes/knowledge.ts` `POST /`, `PATCH /:id`) — does its own raw `db.insert(knowledgeItems)` / `db.update`, assigns the projection layer inline via `upsertProjectionLayer` (**writes `layer` only — leaves projection `scopeId` and `kind` NULL**), and emits typed `KnowledgeCreatedEvent` / `KnowledgeUpdatedEvent` on the request-scoped `EventBus`. On **create it writes NO edit-log row**; on update it writes per-field edit-log rows outside a transaction and **does not** log `updatedBy`.

The two have already drifted (different insert sequence, different projection completeness, different edit-log behavior, different event bus). AU14 converges the route onto the repository so one change to "create a knowledge item" applies to every caller. **Because the repository writes a *fuller* projection row than the route does, converging is not byte-for-byte neutral for the projection table — §5 and §9/D3 handle that head-on.**

---

## 2. Constraints

- **No behavior change visible to any existing consumer of either event mechanism** (spec constraint, load-bearing — repeated in AC-3 and validation scenario 3).
- **No schema changes.**
- **The repository remains the single owner of `knowledge_items` writes**; the route becomes a caller, not a second implementation.
- Q2 user-scope visibility must hold exactly as before, for reads and writes. (Q2 reads/writes key off **kernel** `knowledgeItems.scopeKind`/`updatedBy`, never `projection.scopeId` — so the projection deltas in §9 do **not** touch AC-2.)
- Repository has **non-HTTP callers with no request-scoped `userId`** (tools, writeback) — so no Q2/user-scope logic may become an unconditional repository-side check.
- `.claude/rules/typescript.md`: strict, no `any`/unsafe casts, explicit return types on exported fns, no new barrels, all DB access through Drizzle, result types for expected errors.
- DoD gate: `npm run check` + `npm run lint` + `npm run test` (+ `test:integration:service` for these integration tests) all green; existing suite passes with assertions unchanged.

---

## 3. Plan reconciliation (spec ⇆ reality) — the load-bearing correction

The spec's own "Plan calls" (line 780) suggests: *"the repository's `getKnowledgeEvents()` is the one every non-route consumer already relies on — moving the route onto it … is very likely the lower-risk direction."* **This premise is false against the actual code, and following it would cause the exact behavior change the spec forbids.** Verified by direct reading + repo-wide grep:

| Spec assumption | Reality (verified) | Handling |
|---|---|---|
| `getKnowledgeEvents()` is the mechanism "every non-route consumer relies on" | `getKnowledgeEvents()` (`knowledge/events.ts`) has **ZERO `.on()` subscribers anywhere in the repo** (grep across all `packages/**`, incl. tests). Its only references are the emitter calls in `knowledge-repository.ts` `create`/`update` and its own definition. It is a **dead emitter**. | **Invert the spec's suggested direction.** The canonical mechanism is the shared `EventBus`. Delete the dead singleton. See §4. |
| The route's `KnowledgeCreatedEvent`/`EventBus` is the "route-only" path | The `EventBus` typed knowledge events are the **live** mechanism with real subscribers: `services/ws-broadcaster.ts:45` (`knowledge_updated` → UI "conversations" topic), `services/git-export.ts:584` (`knowledge_updated`), `services/observability/dispatcher.ts:442` (translates `knowledge_updated`→`knowledge_write`; explicitly drops `knowledge_created`/`archived`/`accessed` at 481-483), `knowledge/relevance-listener.ts:46` (`knowledge_accessed`). | Route keeps emitting `EventBus` events exactly as today. |
| Repository `create`/`update` already write an edit-log row for every write | True for the repository — but the **route's create writes no edit-log row today**, and the route's update does not log `updatedBy`. | Converging **adds** the create edit-log row (AC-4 intent) and an `updatedBy` update row on the API path — flagged in §9 D1/D2 with their consumers. |
| Route and repo are the same insert shape | Route writes `knowledgeItems` + projection-`layer`-only (via `upsertProjectionLayer`, leaving projection `scopeId` and `kind` NULL) + **no** create edit-log. Repo writes `knowledgeItems` + full projection (`layer`,`scopeId`,`kind`,…) + create edit-log. | §5 explains why full byte-preservation of the projection row is structurally impossible through `repo.create`; §9 D1/D2/D3 flag every delta and its consumers. |

**Why the spec's direction is wrong, concretely:** if the route stopped emitting on the `EventBus` and emitted only on `getKnowledgeEvents()`, then `ws-broadcaster` (live UI updates on knowledge edits), `git-export`, and `observability` would **stop receiving route-driven knowledge events** — a large, user-visible regression. And because the singleton has no subscribers, emitting on it accomplishes nothing. The lower-risk direction is the opposite: **`EventBus` is canonical; the singleton is deleted.**

No `/refine` gap (goal is convergence, not new design). No `/design` (no UI).

---

## 4. Canonical event mechanism — decision + placement (task Q1)

**Decision: the shared `EventBus` typed events (`knowledge_created` / `knowledge_updated` / …) are canonical. The module-level singleton `getKnowledgeEvents()` and `knowledge/events.ts` are deleted.**

**Placement of the emit: it stays in `routes/knowledge.ts`, unchanged. The repository emits no domain event.**

This is the only placement that satisfies "no behavior change to existing consumers of either mechanism," because of an asymmetry in who emits today:

- **Route create/update** emit `EventBus` `knowledge_created`/`knowledge_updated` today (live subscribers).
- **Tool/writeback create/update** emit **nothing on the `EventBus`** today — they only hit the dead singleton.

If the emit moved *into* the repository (so it fired for every caller), then tool- and writeback-authored writes would **newly** emit `knowledge_created`/`knowledge_updated` on the `EventBus` → `ws-broadcaster` would broadcast new WS frames, `git-export` would trigger, `observability` would record new `knowledge_write` telemetry. That is a behavior change for existing `EventBus` consumers → forbidden. Therefore:

- The route keeps its existing `eventBus.emit(...)` calls verbatim (POST → one `knowledge_created`; PATCH `/:id` → one `knowledge_updated` action `"updated"`).
- The repository's `create`/`update` **remove** the `getKnowledgeEvents().emit(...)` calls. **The singleton fires `knowledge_item_updated` on the separate `KnowledgeEvents` emitter, NOT on the `EventBus`, and it has zero subscribers — so its firing is unobservable and AC-3's per-consumer count would hold with or without it.** Removing it is therefore behavior-neutral; the reason to remove is that it is dead code (`knip:production` would flag `events.ts` once the emits are gone). It is *not* removed to avoid a bus double-count — there is no such double-count.
- `knowledge/events.ts` is deleted (dead after the two emit calls are removed). Confirmed no other importer.

"Collapse two mechanisms into one" = delete the dead one, keep the live one where its subscribers already are. The one surviving mechanism is the `EventBus`.

---

## 5. Q2 scope-filtering preservation (task Q2) + the projection-row coupling

Q2 has two facets; **neither moves into the repository**:

- **Read-side visibility** (`GET /`, `GET /:id`, `GET /triage-count`, related-items in `GET /:id`): the rule "include item if `scopeKind != 'user'` OR `updatedBy == userId'" lives entirely in the **GET handlers**, keys off **kernel** `knowledgeItems.scopeKind`/`updatedBy`, and is **not touched by this WP** — AU14 changes only `POST /` and `PATCH /:id`. Preserved by not editing those handlers.
- **Write-side user-scope resolution** (`POST /`): the route resolves `scopeKind === "user" ? (scopeId ?? userId) : (scopeId ?? null)` so a user-created private item is owned by its creator. This resolution **stays in the route** (it needs `c.get("userId")`), and the already-resolved `scopeId` is passed to `repo.create` as an ordinary value. Likewise the `requiresScopeId(...)` 400 guard stays route-side.

**The repository stays scope-agnostic** — it receives a resolved `scopeId` and never inspects `userId`. This is mandatory: `write-memory.ts`, `writeback.ts`, `context-assembly.ts` call the repository with no request context. Any user-scope check inside `repo.create`/`update` would be unconditional and would break those non-HTTP callers. Q2 remains a Core-App/route concern; the repository is a pure `knowledge_items` writer.

**Projection-row coupling (the structural fact that drives §9 D3).** `repo.create` writes the *same* `input.scopeId` to both the kernel row (`knowledge-repository.ts:146`) and the projection row (`:163`). The route **must** pass `resolvedScopeId` because the kernel `scopeId` is read by Q2/GET filters and by `resolveScopeName` — nulling it would break AC-2. Consequently, routing through `repo.create` **cannot** reproduce the route's current projection row (kernel `scopeId` set, projection `scopeId` NULL): passing `resolvedScopeId` correctly preserves the kernel column but **necessarily populates `projection.scopeId`**, which the route leaves NULL today. There is no per-call knob in `repo.create` to decouple them, and adding one would re-introduce the exact route/repo divergence AU14 exists to remove. Therefore the projection-row change is **structurally forced by the convergence**, not an incidental choice — it is decided deliberately in §9 D3, not waved through.

(The symmetric `kind` case is preserved rather than changed: the route has no `kind` concept, and `repo.create` writing `kind` unconditionally would populate `projection.kind` where the route leaves it NULL. §6a makes `kind` optional specifically so `projection.kind` stays NULL for route items. `scopeId` cannot be preserved the same way without regressing the kernel column, hence the asymmetry.)

---

## 6. File-by-file change list (task Q3)

### 6a. `packages/server/src/knowledge/knowledge-repository.ts`

1. **Remove the singleton emit** in `create()` (the `getKnowledgeEvents().emit(KnowledgeEventType.UPDATED, …)` block, ~lines 182–187) and in `update()` (the post-commit emit, ~lines 382–387).
2. **Remove the import** `import { getKnowledgeEvents, KnowledgeEventType } from "./events.js";` (line 23).
3. **Make `kind` optional** on `CreateKnowledgeItemInput`: `kind?: KnowledgeKind | null` (currently required, line 34). In `create()` the projection insert becomes `kind: input.kind ?? null` (line 164). Rationale: the route has no `kind` concept and must be able to omit it so route-created items keep projection `kind = null` exactly as today. Behavior-neutral for existing callers — `write-memory.ts` and `writeback.handleCreate` both pass `kind`, so `?? null` never triggers for them.
4. **No `scopeId` decoupling is added** — see §5. `projection.scopeId` for route items becomes populated by design (§9 D3).
5. No other change. `create` still inserts `knowledgeItems` + `knowledgeAppProjection` + the `knowledgeEditLog` create row; `update` still runs its versioned transaction with per-field edit-log rows. The `update()` post-commit event is simply gone (route owns the emit).

> `update()` already emits the singleton only *after* the tx commits; deleting it leaves the tx untouched. `search`/`list` are unchanged.

### 6b. `packages/server/src/knowledge/events.ts`

- **Delete the file.** Dead after 6a (zero subscribers, zero remaining importers). Removing it, rather than leaving it unimported, satisfies `knip:production`.

### 6c. `packages/server/src/routes/knowledge.ts` — `POST /` handler (~lines 585–645)

Replace the raw `db.insert(knowledgeItems)` + `upsertProjectionLayer(db, id, …)` block with a single `repo.create(...)` call. **Keep everything else verbatim**: the `requiresScopeId` 400 guard, the user-scope `resolvedScopeId` resolution, the re-select of the kernel row for the response, and the `eventBus.emit({ type: "knowledge_created", … })`.

- Import `create as createKnowledgeItem` from `../knowledge/knowledge-repository.js` (`scopeToLayer` is already imported at line 51).
- Call shape:
  ```
  const created = await createKnowledgeItem(db, {
    layer: scopeToLayer(body.scopeKind),   // same value upsertProjectionLayer wrote
    scopeKind: body.scopeKind,
    scopeId: resolvedScopeId,              // kernel scopeId preserved; also populates projection.scopeId — see §9 D3
    // kind omitted → projection.kind stays null (as today)
    topic: body.topic ?? null,
    title: body.title,
    body: body.body,
    format: body.format,
    status: body.status ?? "draft",
    updatedBy: body.updatedBy,
  });
  ```
  (`id`/timestamps/`version` are generated inside the repository — drop the route's local `id`/`now`.)
- **Response shape preserved:** after `createKnowledgeItem`, keep the existing `const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, created.id))` re-select and `return c.json(row, 201)`. This keeps the 201 body byte-identical to today (raw kernel row, **not** the repo's `KnowledgeItemWithProjection` which carries extra projection fields).
- Delete `upsertProjectionLayer` **only if** it has no remaining caller. It is still used by `PATCH /:id/scope` and `POST /:id/split` — **keep it.**

**Type note:** the route's status enum `["draft","active","archived","needs_human"]` equals `KERNEL_KNOWLEDGE_STATUSES`; `CreateKnowledgeItemInput.status` accepts `KnowledgeStatus | KernelKnowledgeStatus`, so `body.status ?? "draft"` is assignable with no cast.

### 6d. `packages/server/src/routes/knowledge.ts` — `PATCH /:id` handler (~lines 757–849)

Replace the manual per-field edit-log loop + `db.update(knowledgeItems)` with a `repo.update(...)` call. **Keep verbatim**: the existence pre-check (404), the version pre-check (409 with `details.currentVersion`), the re-select of the kernel row for the response, and `eventBus.emit({ type: "knowledge_updated", action: "updated", … })`.

- Import `update as updateKnowledgeItem`.
- After the 404 + 409 pre-checks pass, call:
  ```
  await updateKnowledgeItem(db, id, {
    title: body.title, body: body.body, topic: body.topic,
    format: body.format, status: body.status, updatedBy: body.updatedBy,
  }, body.version);
  ```
  Repo skips `undefined` fields (`!(field in changes) || changes[field] === undefined`), matching the route's current "only changed fields" behavior. Note `repo.update`'s `KERNEL_EDITABLE_FIELDS` **includes `updatedBy`**, so an `updatedBy` change now logs an edit-log row the old route did not — §9 D2.
- Wrap in `try/catch` mapping `VersionConflictError` → 409 (same body as the pre-check) and `ItemDeletedError` → 404, as defense against a TOCTOU race between the route pre-check and the repo transaction. (In the common path the pre-check already returned; the catch is belt-and-suspenders. Note: repo throws a plain `Error` — not `ItemDeletedError` — for a not-found item at its own top-level select (`:296`); that path is unreachable here because the 404 pre-check already ran, and would surface as a 500 only under an extreme delete-between-precheck-and-repo race, which is acceptable.)
- Re-select the kernel row and `return c.json(updated)` exactly as today, then emit the bus event.

**Out of scope for this WP** (not `POST /` / `PATCH /:id` create/update, keep as-is): `PATCH /:id/scope`, `POST /:id/merge`, `POST /:id/split`, `POST /:id/archive`, `POST /:id/flag`. The spec scopes AC-1 to "the create and update handlers." These other handlers keep their own writes and events unchanged. (A follow-up could converge them, but converging them here would expand blast radius and risk behavior changes the WP forbids.)

### 6e. No changes

`context-assembly.ts`, `writeback.ts`, `write-memory.ts`, `promote-knowledge.ts`, `query-practice.ts`, `shared/events.ts`, `shared/event-bus.ts`, `services/ws-broadcaster.ts`, `services/git-export.ts`, `services/observability/dispatcher.ts`, `relevance-listener.ts`, schema/migrations — untouched. **However, three of these read `projection.scopeId` and one pair reads the edit log with an `editor="human"` filter — see §9 D2/D3 for the behavior they now observe. "No code change" ≠ "no behavior change" for them.**

---

## 7. Edit-log requirement (task Q4)

**AC-4: "The knowledge edit log continues to record an entry for every create/update, regardless of origin."**

- **Repository already does this unconditionally today.** `create()` inserts a `knowledgeEditLog` row (`field: "*"`, `editType: "create"`) on every create; `update()` inserts a per-changed-field row (`editType: "update"`) inside its transaction. Tool- and writeback-authored writes already produce these rows.
- **The gap is the route.** Today `POST /` writes **no** edit-log row on create; `PATCH /:id` writes update rows but outside a transaction and excluding `updatedBy`. After 6c/6d the route inherits the repository's behavior:
  - **Create:** now emits the `editType:"create"` row on the API path — closing the gap AC-4 targets. Validation scenario 1 ("same edit-log row … that an agent-tool-created item produces today") is satisfied by construction, since both paths now call `repo.create`.
  - **Update:** now writes rows transactionally, including an `updatedBy` field-change row when the editor differs. This is additive to the audit table (see §9 D2) — evaluate its consumers there, not just the AC12 test.

No new edit-log code is written; the requirement is met by routing through the repository that already satisfies it.

---

## 8. Acceptance criteria & validation scenarios → concrete satisfaction (task Q5)

**Acceptance criteria (verbatim from AU14):**

| AC | Satisfied by | Verification |
|---|---|---|
| **AC-1** — `routes/knowledge.ts` create & update handlers call the repository's `create`/`update` rather than their own inserts/updates. | §6c, §6d. | Code review; `knowledge.integration.test.ts` AC3/AC4 pass (create→v1/draft, update→v2). `npm run check`. |
| **AC-2** — Q2 user-scope visibility holds exactly as before, reads and writes. | §5 — read filters in GET handlers untouched and key off kernel columns; write-side user-scope resolution stays route-side; repo stays scope-agnostic. The §9 projection deltas do not touch Q2. | `npm run test:integration:service`: existing Q2 tests (private-item exclusion on `GET /`, 404 on `GET /:id` for other users) unchanged. Validation scenario 2. |
| **AC-3** — Exactly one event per create/update, observable by every current consumer of either mechanism. | §4 — route emits exactly one `EventBus` event; repo singleton emit removed (dead, unobservable); dead singleton deleted. | `knowledge.integration.test.ts` AC11 (`knowledge_created` count === 1; `knowledge_updated` count === 1) and AC13 (event shape) pass. |
| **AC-4** — Edit log records an entry for every create/update, HTTP or tool. | §7 — repo writes the row unconditionally; route now routes through repo (create row now present on API path too). | `knowledge.integration.test.ts` AC12 (edit-log rows on PATCH) passes; new assertion that API `POST` produces an `editType:"create"` row (see §9 test-impact). |

**Validation scenarios (verbatim):**

1. *API-created item produces the same edit-log row and event shape an agent-tool-created item produces today.* → Both call `repo.create`; identical `editType:"create"` row and one bus `knowledge_created`. Proven by AC3/AC11/AC12 tests + a new create-edit-log assertion.
2. *A user-scoped item is excluded from another user's list exactly as today.* → GET handlers untouched (§5). Proven by existing Q2 integration tests.
3. *Existing knowledge route tests and repository/tool tests re-run and pass with no behavior change to any consumer.* → §9 enumerates every consumer touched by the projection/edit-log deltas and the decision for each; run `npm run test:integration:service` + `npm run test`.

---

## 9. Test impact + behavior-delta ledger (task Q6)

**Existing tests — must still pass unchanged (assertions on values unchanged):**

- `packages/server/src/__tests__/knowledge.integration.test.ts` (the route suite). Robust to the additive edit-log rows:
  - **AC12** asserts `logs.length >= 2` (line 466) and finds `titleLog` by `field === "title"`. After the change the create path adds one `editType:"create"` row and the update adds `title`/`body`/`updatedBy` rows (updatedBy changes `human`→`curator`) → total 4 rows. `>= 2` and the field-filtered lookups still hold. **No edit required.**
  - **AC3** (201: version 1, status `draft`, id truthy), **AC4** (200: title updated, version 2), **AC5** (409 stale + `details.currentVersion === 2`), **AC11** (`knowledge_created`/`knowledge_updated` count === 1), **AC13** (event `action`/`itemId`) — all preserved by keeping the route's re-select response + bus emit and mapping repo `VersionConflictError`→409.
- Tool/repo suites (already on `repo.create`/`repo.update`/`repo.search`, so behavior identical): `tools/__tests__/write-memory.integration.test.ts`, `tools/__tests__/promote-knowledge.integration.test.ts`, `tools/__tests__/query-practice.integration.test.ts`, `__tests__/R7-knowledge-e2e.integration.test.ts`, `__tests__/knowledge-scope-name.integration.test.ts`, `__tests__/af9-fts-tool.integration.test.ts`. Untouched — the repository's create/update DB writes don't change (only the dead singleton emit is removed, which no test asserts).
- `packages/shared/src/__tests__/o1-event-split.test.ts` (asserts `KnowledgeCreatedEvent`/`KnowledgeUpdatedEvent` type shapes) — shapes unchanged.
- `packages/server/src/__tests__/O2-schema-migration.integration.test.ts` (references `KnowledgeCreatedEvent`) — route still emits `knowledge_created`; verify green.

**Net-new tests for this WP (add to `knowledge.integration.test.ts`):**

1. *Create writes a `create` edit-log row via the API path* — `POST /api/knowledge`, then assert `knowledgeEditLog` has a row for the new item with `editType === "create"`. Proves AC-4 / validation scenario 1 and is the assertion that goes red if the route is not routed through `repo.create`.
2. *Route-created scoped item now carries `projection.scopeId`* — `POST /api/knowledge` with `scopeKind:"team", scopeId:"<t>"`, then assert the `knowledgeAppProjection` row for the new item has `scopeId === "<t>"` (was NULL pre-AU14). **This test locks the D3 behavior change deliberately** so a future regression is caught, and documents that route items now match scope-filtered `list()`/promotion/practice queries like tool items.
3. *(optional, low-cost) Singleton retired* — a `.test.ts` asserting `knowledge/events.ts` is gone is a build/knip concern, **not** a runtime test — do not write it. The deletion is proven by `npm run check` (no dangling import) + `knip` (in `verify`).

**Behavior-delta ledger — every delta, its full consumer set, and the decision.** The binding constraint is *consumer-invariance*, not *test-survival*; each delta below is judged against the production code that reads the affected table, not just against a test's tolerance.

- **D1 — create edit-log row on API path.** Today `POST /` writes none; after, it writes one (`field:"*"`, `editType:"create"`, `editor = body.updatedBy`).
  - *Consumers of `knowledgeEditLog`:* `relevance-service.ts:98-99` and `attention-scoring.ts:315` read it filtered by `editor === "human"`; `promotion-pipeline.ts`, `practice-meeting.ts`, `promote-knowledge.ts` read it by `itemId`/`editType`.
  - *Effect:* a human-authored API create (`updatedBy === "human"`) now contributes one `create` row to the `relevance-service`/`attention-scoring` human-activity counts, where before it contributed none. Agent-authored creates already produced this row, so this only aligns the API path with the tool path.
  - **Decision: ACCEPT.** This is exactly validation-scenario-1's intent ("same edit-log row an agent-tool-created item produces today"). The relevance/attention shift is the direct, desired consequence of AC-4; a human create becoming visible to human-activity scoring is correct, not a regression. Locked by net-new test 1.

- **D2 — `updatedBy` edit-log row on update.** `repo.update`'s `KERNEL_EDITABLE_FIELDS` includes `updatedBy`, so an editor change logs an extra `editType:"update"` row the old route did not.
  - *Consumers:* same as D1 — critically `relevance-service.ts`/`attention-scoring.ts` (`editor="human"` counts).
  - *Effect:* when a human editor value changes on an update, one additional `human`-editor row is counted by relevance/attention scoring. When the editor is unchanged, no extra row (diff guard). AC12's `>= 2` also tolerates it.
  - **Decision: ACCEPT** as canonical repo behavior. The extra row reflects a real edit-provenance change and is consistent with how tool/writeback updates already log. The relevance/attention effect is bounded (one row per genuine editor change) and directionally correct (more complete provenance). No consumer counts an *exact* update-row total that this would break.

- **D3 — projection `scopeId` populated for route-created items.** Today `upsertProjectionLayer` leaves `projection.scopeId` NULL; `repo.create` writes `scopeId = resolvedScopeId` (structurally forced — §5).
  - *Full consumer set of `knowledgeAppProjection.scopeId` (grep-verified — this replaces the earlier incorrect "only `list()` reads it"):*
    1. `knowledge-repository.ts:438` — `list({ scopeId })` (context-assembly L2 fetch, `context-assembly.ts:180-182`). Route-created scoped items now appear in scope-filtered assembled context.
    2. `services/practice-meeting.ts:581-584` — branches `anchorScopeId === null ? isNull(projection.scopeId) : eq(projection.scopeId, anchorScopeId)`. Route items **move** from the null-anchor candidate set into the specific-scope candidate set.
    3. `knowledge/promotion-pipeline.ts:204,224` — `COUNT(DISTINCT projection.scopeId)` gated by `isNotNull(projection.scopeId)` ("Items with NULL scope_id are excluded — they cannot demonstrate cross-product repetition"). Route items are now **counted** toward cross-product repetition, which can change promotion decisions.
    4. `knowledge/attention-service.ts:321` — `eq(projection.scopeId, filter.scopeId)`. Route items now match scoped attention queries.
    5. `knowledge/attention-scoring.ts:268` — selects `projection.scopeId` (read-through, no filter branch).
  - *Effect:* route-created scoped items (team/bet/product/task/practice) begin participating in scope-filtered context assembly, practice-meeting anchoring, promotion cross-product counting, and scoped attention — exactly as **tool-created items already do**.
  - **Decision: ACCEPT — deliberately, as intended convergence, and this SUPERSEDES the literal "no behavior change" for `projection.scopeId`.** Rationale: (a) the WP's explicit goal is that "a knowledge item created through the API and one created by an agent tool go through the same code … and behave the same"; a route item having a NULL `projection.scopeId` while a tool item has it populated is precisely the latent divergence AU14 exists to erase. (b) The "no behavior change" constraint was written by an author who (per the spec's own inverted event premise) did not know route items carry a NULL `projection.scopeId`; taken literally it is **unsatisfiable** through `repo.create` (§5) without re-introducing a divergence knob, so it cannot be the governing rule for this one column. (c) The change is *toward* correctness — route items becoming first-class scoped items in promotion/practice/context is the WP's aim, not a surprise. (d) It is **locked by net-new test 2** and cross-referenced with a `@lore AU14` note at the route call site and at the five reader sites' domain (documented, not code-changed). The strict-preservation alternative (a `projectionScopeId` decoupling parameter on `repo.create`) is **rejected**: it recreates the two-shape divergence AU14 removes and would leave the route as a second, differently-shaped writer.
  - *If the reviewer rejects (d) and demands strict preservation:* the only mechanism is the rejected decoupling parameter above; there is no null-preserving path that also keeps the kernel `scopeId` (required by Q2). Escalate as a founder decision rather than silently divergence-preserving.

- **D4 — response shape.** Neutralized in §6c/§6d by keeping the route's kernel-row re-select for the 201/200 body (not returning the repo's `KnowledgeItemWithProjection`). No delta.

---

## 10. Ordered task list (each step keeps the tree compiling)

1. **Repository (6a):** remove both `getKnowledgeEvents().emit` blocks + the import; make `CreateKnowledgeItemInput.kind` optional and insert `kind: input.kind ?? null`. `npm run check` (server).
2. **Delete `knowledge/events.ts` (6b).** `npm run check` confirms no dangling import.
3. **Route `POST /` (6c):** swap raw insert+`upsertProjectionLayer` for `repo.create`; keep guard, user-scope resolution, kernel re-select, bus emit. `npm run check`.
4. **Route `PATCH /:id` (6d):** swap manual edit-log+update for `repo.update`; keep 404/409 pre-checks, add `VersionConflictError`/`ItemDeletedError` catch mapping, keep re-select + bus emit. `npm run check`.
5. **Add net-new tests 1 & 2** (§9) — API create writes a `create` edit-log row; route-created scoped item carries `projection.scopeId` (locks D3). Write before step 3 (red), or after and sanity-break by reverting step 3 to confirm red.
6. **Run** `npm run test -- knowledge`, `npm run test:integration:service` (knowledge + tools + o1-event-split + O2 migration + practice-meeting + promotion-pipeline + relevance/attention suites to confirm D1/D2/D3 land as intended). All green.
7. **Full gate:** `npm run check` + `npm run lint` + `npm run test` + `npm run test:integration:service`. Confirm `knip` clean (events.ts gone).

---

## 11. Trade-offs & open questions

- **Scope of "update":** merge/split/archive/flag/scope-change keep their own writes. Converging them is deferred (not in AC-1's "create and update handlers"); doing them here would multiply behavior-change surface. Flag as a possible AU-followup, not this WP.
- **Event emit stays in the route, not the repository.** The alternative (repo-owned emit) is cleaner in principle and would give tool/writeback writes real events — but that is a behavior change to live `EventBus` consumers, which the WP forbids. If a future WP *wants* agent writes to surface on the bus/UI, that is a deliberate, separately-gated change, not AU14. Captured as `@lore AU14` at the route emit sites and the repo (why the repo deliberately emits nothing).
- **The spec's suggested canonical mechanism was inverted (§3).** This plan documents the evidence (`getKnowledgeEvents()` has zero subscribers) so the reviewer can confirm the reversal rather than treating it as a deviation.
- **The projection-row convergence (D3) is a deliberate, tested behavior change, not a preservation.** §5 shows it is structurally forced; §9 D3 enumerates all five `projection.scopeId` consumers and accepts the change as the WP's own convergence goal, superseding the literal "no behavior change" for that single column. Net-new test 2 locks it. This is the single decision the reviewer should confirm.
- **Doc hygiene (non-blocking):** `docs/knowledge-architecture/sync-and-conflict-resolution.md:32` references a `packages/fabric/src/events.ts` + `setKnowledgeEventBus` bridge that no longer exists (file absent). Correct it at `/pipeline:write-docs` time if AU14's docs are touched.
