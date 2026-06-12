# AF14 — Architecture plan

**Workpackage:** Conversations correctness and live updates (TRACK-AF, Large).
**Fixed inputs:** `plans/AF14/concept.md` (SATISFIED — no reshape), `plans/AF14/design/approved.md` (chips removed, server-side batched titles).

> **Revision (round 2 — critique response).** Addresses `architecture-critique.md` C1/C2/W1/W2 and `design-critique.md` W1/W2. Every claim below re-grounded in a live `rg -a` / Read pass. **Critical correction on C1:** the critique asserted "AppShell contains ZERO Coc refs." That is a tooling artifact, not reality — `packages/web/src/layouts/AppShell.tsx` is classified as binary (`file` reports `data`; a non-text byte makes plain `grep`/`grep -c` skip the file silently and return nothing). Reading it with the Read tool and `rg -a` (force-text) shows AppShell **does** mount `CocOverlay` at lines 28/554/754/786 with `coc*` state at 210-236 — i.e. the original AC5 (CocOverlay→AssistantOverlay rename in AppShell) was on the right file. **Builders/reviewers: use `rg -a` or the Read tool against AppShell.tsx — `grep` lies on this file.** The other three findings (C2, W1, W2) are real and fixed below.

## Required reading (engineer, before implementing)
- `plans/AF14/concept.md` + `plans/AF14/design/approved.md`.
- `docs/human-interface-layer/thread-primitive.md` — ordering `(last_active_at, id)`; blocking derived; DM = host=agent/user, 2 participants; idempotency.
- `packages/server/src/routes/threads.ts` (list builder, `POST /api/threads`, `resolveHostTitle` N+1 lore).
- `packages/server/src/routes/assistant.ts` — resolve-or-create pattern to mirror for DM dedup.
- `packages/web/src/services/ws-client.ts` + `packages/server/src/services/ws-broadcaster.ts` — `thread:<id>` topic already wired end-to-end.

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "list sorts by UUID" | **Frontend-only.** Server returns `desc(lastActiveAt), desc(id)` (threads.ts:449/457/467). The flat-list comparator in `ThreadSections.tsx:259-264` does `Date.parse(timestamp)` where `timestamp` is a relative-time *display* string ("5m") → `NaN` → `id.localeCompare` fallback. | Fix is FE: carry ISO `lastActiveAt` on `ThreadItem`; sort by it. |
| "open threads never live-update" | **Backend complete.** `thread_message_appended`→`thread:<id>` broadcast (ws-broadcaster.ts:71), participant-authorized (ws-broadcaster.ts:258-268), WS client matches `thread:<id>` by `threadId` (ws-client.ts:199-203). No FE hook subscribes. | Add `thread:<id>` subscription in `useThreadDetail`; bump tick on append event. |
| "overlay sends vanish after sending" | `useAssistantThread` already exposes `refresh()` (useAssistantThread.ts:109). `AssistantOverlayInner` never calls it. | Wire `refresh()` after a successful POST in `handleAppendMessage`. |
| "Unread/Blocking chips never match" | `ThreadItem.unread` set nowhere; `blocking` set only from a test wire field (`useConversationsThreads.ts:122`). No backing state. | Remove both chips (design decision). Keep `blocking` field plumbing. |
| "wrong overlay mounted" | **AppShell mounts `CocOverlay`** — verified `rg -a`: import `AppShell.tsx:28`, mounts `AppShell.tsx:754` + `AppShell.tsx:786` (mobile + desktop), `<CocContext.Provider>` `AppShell.tsx:554`, `coc*` state `AppShell.tsx:210-236`, `onCocClick`/`cocOverlayOpen` passed to Sidebar at `AppShell.tsx:516-517`. `CocOverlay` lacks `renderMessageExtra` (zero `toolCall` refs in `CocOverlay.tsx`) → no tool-call rows. `AssistantOverlay` has `renderMessageExtra={renderToolCallSummaries}` (`AssistantOverlay.tsx:269`, helper `:92`). **Props are identical** between the two overlays (`open`, `onClose`, `anchorRef?`, `contextRefs`, `onRemoveContextRef`) — so the swap is drop-in. | Swap the **two** `<CocOverlay>` mounts → `<AssistantOverlay>`; rename `CocContext`→`AssistantContext` provider + `coc*` state; delete `CocOverlay.tsx`; migrate all `Coc*` importers; delete shims. |
| "DM dedup" | `POST /api/threads` always `crypto.randomUUID()` (threads.ts:608). No resolve-or-create. | Add dedup lookup in `POST /api/threads` before insert. |
| `threadListRowSchema` exists (hook lore) | **Does not exist.** List response built inline (threads.ts:498-504). | Add `title` to the inline builder + the `ThreadListRow` FE guard. |

---

## Acceptance criteria → fix location + verification

### AC1 — List ordered by recency; human-readable titles
**Backend (titles):** In `GET /api/threads` (threads.ts:415-505), after `rows` are loaded (already recency-ordered), compute a `title` per row via a **batched** resolver and add it to the response objects (threads.ts:499).
- New helper `resolveThreadTitles(db, rows, requestingUserId): Promise<Map<threadId,string>>` in threads.ts. Batching contract (design open-q, concept N+1 prohibition):
  - Partition rows by hostKind. One query per host table over the *set* of hostIds: `bets` (→`deriveTitle(description,id)`), `tasks` (→`title`), `knowledgeItems` (→`title`). No per-row `resolveHostTitle` call.
  - Collect all participant ids across DM/group rows; one `users` query `inArray(users.id, allParticipantIds)` → name map. (Verified: agents DO get `users` rows — `assistant.ts` inserts a row for `ast-{userId}`, and `buildIdentities` reads agents from `users`. So an `ast-*`/agent "other participant" normally resolves to a real `users.name`. The fallbacks below cover the residual cases where it does not.)
  - Ladder per design §1 (first match wins): assistant (`"Assistant"`) → DM other-participant name → host title → group host/participant-join → typed human fallback. **Never** the `"<HostKind> thread <uuid8>"` stub and **never a bare `hostId` uuid.**

**W1 — fall-through fallbacks (mandatory; design-critique W1 + arch-critique W1).** Each rung must degrade to a *human* string, never `undefined` and never a raw uuid:
  - **Rung 2 (DM other-participant) — name missing.** If the resolved "other participant" id is absent from the `users` name map (deleted user, or an id with no row), do **not** render `undefined` or the id. Fall through to: if the id matches the assistant-agent shape (`ast-*`) → `"Assistant"`; else if it is otherwise an agent/principal id → the literal `"Agent"`; else (human with deleted row) → `"Unknown participant"`. (These are typed constants, not the id.)
  - **Rung 3 (host-scoped) — host row deleted/dangling.** The batched `bets`/`tasks`/`knowledgeItems` query returns no row for a `hostId` whose host was deleted (thread outlives host). Map the missing host to a **host-kind label**, not the uuid: `bet`→`"Deleted bet"`, `task`→`"Deleted task"`, `knowledge_item`→`"Deleted knowledge item"`.
  - **Rung 4 (group/feed) — participant-join.** Sort participant names **deterministically** (e.g. by `users.name`, then id) before the `"Aria, Maverick +N"` join so the same thread renders a stable title across reloads (design-critique SUGGESTION). Unresolved members in the join are skipped (never `undefined`); if the join would be empty, fall to rung 5.
  - **Rung 5 (last resort) — only when every rung above yields nothing** (e.g. an unknown `hostKind` with zero resolvable participants): `"Untitled conversation"`. **Replaces the design's "fallback → `hostId`" rung entirely** — a bare uuid re-introduces the exact AC1 defect ("readable titles rather than raw identifiers"). No code path may emit `row.hostId` as a title.
- **Frontend:** add `title: string` to `ThreadListRow` guard (`useConversationsThreads.ts:18-38,67-85`); `rowToItem` (line 107-126) uses `row.title` directly instead of the stub on line 116.
**Frontend (sort):** Add `lastActiveAt: string` (ISO) to `ThreadItem` (`ThreadSections.tsx:16-32`); `rowToItem` sets it from `row.lastActiveAt`. Replace the flat-list comparator (`ThreadSections.tsx:259-264`) with `Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt)`, id-tiebreak. (Server order is already correct; this makes the FE re-sort agree instead of corrupting it.)
- **Verify:** unit test on the flat-sort path — 3 `ThreadItem`s with known `lastActiveAt` + identical display `timestamp` → assert most-recent first (not id order). Integration test on `GET /api/threads` → assert each row has a non-stub `title` (DM row title === recipient name; bet row title === derived bet title). **W1 fallback tests (integration):** (a) DM whose other participant has no `users` row → title is a typed fallback (`"Agent"`/`"Unknown participant"`/`"Assistant"`), never the id; (b) host-scoped thread whose host row was deleted → title is `"Deleted <kind>"`, never the `hostId`. **Static guard:** the resolver must never return `row.hostId`; assert no test fixture title equals a uuid (regex `^[0-9a-f-]{36}$`).

### AC2 — Assistant-overlay send stays visible
`AssistantOverlay.tsx:178` — destructure `refresh` from `useAssistantThread()`; in `handleAppendMessage` (line 180-212), after the `res.ok` success path, call `refresh()` so the just-sent message re-fetches into the stream. (No optimistic insert needed — refetch is the same path the WS update will use; simpler, no reconciliation.)
- **Verify:** component test — render `AssistantOverlay` with a mocked `useAssistantThread` whose `refresh` triggers a second fetch returning the new message; send → assert message visible in `ThreadShell` without remount.

### AC3 — Reply in open thread appears without reload
`useThreadDetail.ts` — add a WS subscription effect (mirror `useConversationsThreads.ts:213-225`):
```ts
useEffect(() => {
  const ws = getWsClient();
  const unsub = ws.subscribe(`thread:${threadId}`, (data) => {
    const msg = data as Record<string, unknown>;
    if (msg.threadId === threadId &&
        (msg.type === "thread_message_appended" || msg.type === "thread_resolved" || msg.type === "thread_reopened")) {
      setTick((n) => n + 1); // re-fetch via existing tick path
    }
  });
  return unsub;
}, [threadId]);
```
- Uses the EXISTING `thread:<id>` channel (spec contract) — no polling. Re-fetch (not append-in-place) reuses the decode/identity path; brief flash acceptable, matches the `useConversationsThreads` precedent lore.
- **Verify:** component test — mock `getWsClient` to capture the handler, fire a `thread_message_appended` for the open threadId → assert `apiFetch` re-called → new message rendered. (WS is unavailable in JSDOM — mock `ws-client` per its lore.)

### AC4 — Filter chips reflect real state (REMOVE)
- `Conversations.tsx`: delete the two `<FilterChip>` instances (lines 534-549), the `toggleFilter` state (501-504), and stop passing `toggleFilter`/`onToggleFilter` to `ThreadSections` (616-617). Keep the header title + New-thread button.
- `ThreadSections.tsx` flat-list path (`groupBySection={false}`, lines 231-327): remove `toggleFilter`/`onToggleFilter` props + the blocking/unread predicate filtering (252-257) + the uncontrolled chip bar (271-294). Render the list directly. Keep the `blocking`/`unread` *fields* on `ThreadItem` (forward-compatible). Keep `FilterChip` the component and the section-grouped path (other callers).
- **Verify:** component test — render Conversations populated → assert no element with `aria-pressed`; assert no "Unread"/"Blocking" chip in the header. Static: `unread`/`blocking` field set still compiles (`npm run check`).

### AC5 — Overlay with tool-call summaries is the one mounted
**Root cause (verified, not a no-op).** `AppShell.tsx` mounts `CocOverlay`, which does **not** pass `renderMessageExtra`, so tool-call summary rows never render in production. `AssistantOverlay` is the divergent twin that *does* render them (`renderMessageExtra={renderToolCallSummaries}`, `AssistantOverlay.tsx:269`; helper at `:92` reads `payload.toolCalls`). The two share an identical prop contract, so AC5 is a **drop-in mount swap + symbol rename in AppShell**, not a wiring-from-scratch. Exact edits (line numbers from `rg -a` / Read — `grep` cannot see this file, see Revision note):

| AppShell.tsx site | Current | Change to |
|---|---|---|
| `:19` import | `import { CocContext, type CocContextRef } from "../contexts/CocContext"` | `import { AssistantContext, type AssistantContextRef } from "../contexts/AssistantContext"` |
| `:28` import | `import { CocOverlay } from "../shell/CocOverlay"` | `import { AssistantOverlay } from "../shell/AssistantOverlay"` |
| `:211-212` state | `cocOverlayOpen`/`setCocOverlayOpen`, `cocContextRefs`/`setCocContextRefs` (`ReadonlyArray<CocContextRef>`) | `assistantOverlayOpen`/`setAssistantOverlayOpen`, `assistantContextRefs`/… (`ReadonlyArray<AssistantContextRef>`) |
| `:214-235` handlers | `handleCocClick`, `handleCocClose`, `handleAttachContext` (param `CocContextRef`), `handleRemoveCocContextRef`, `cocContextValue` | rename `coc`→`assistant` consistently; `attachContext` param type → `AssistantContextRef` |
| `:516-517` sidebarProps | `onCocClick: handleCocClick`, `cocOverlayOpen` | `onAssistantClick: handleAssistantClick`, `assistantOverlayOpen` (the **non-deprecated** Sidebar props — `Sidebar.tsx:71-73`; see R2) |
| `:554` / `:600` | `<CocContext.Provider value={cocContextValue}>` … `</CocContext.Provider>` | `<AssistantContext.Provider value={assistantContextValue}>` … |
| `:754-758` (mobile) and `:786-790` (desktop) | `<CocOverlay open={cocOverlayOpen} onClose={handleCocClose} contextRefs={cocContextRefs} onRemoveContextRef={handleRemoveCocContextRef} />` (both sites) | `<AssistantOverlay …>` with renamed props — **both** mounts swap |
| `:258-261` | `?coc=open` autoopen param handling (sets `setCocOverlayOpen(true)`) | rename to `setAssistantOverlayOpen(true)`. **Decision:** keep the `?coc=open` **query-param key** unchanged (it is a URL contract consumed by the AE2 onboarding autoopen flow — renaming the key would break deep-links/onboarding; only the handler state var renames). If a follow-up renames the param, it is out of AF14 scope. |

- **Stale lore fix (C1 sub-finding):** `AssistantOverlay.tsx:368` carries `@lore AD8b: CocOverlay.tsx re-exports from this module for backward compat`. This is FALSE — `CocOverlay.tsx` is a full ~301-line independent implementation (its own `CocOverlayInner`, no `renderMessageExtra`). Since AF14 **deletes** `CocOverlay.tsx`, replace that lore line with: `@lore AF14: CocOverlay was a divergent twin lacking tool-call rows; deleted in AF14, AppShell now mounts AssistantOverlay directly.`
- **Keyframe note (ties to W2):** both `CocOverlay.tsx:268` and `AssistantOverlay.tsx:329` use the Tailwind arbitrary class `animate-[coc-open_…]`, and the `@keyframes coc-open` lives in `index.css:28`. AC5 keeps `AssistantOverlay`'s `coc-open` reference working; the keyframe rename is handled as one atomic unit in §Migrations (rename keyframe + the surviving call-site in AssistantOverlay together).
- **Verify:** component test — render AppShell, open the assistant overlay (toggle `assistantOverlayOpen` / fire the trigger), post a plain message whose payload has `toolCalls` → assert the tool-call summary rows render (`renderToolCallSummaries` output; assert the rendered `toolCall.name`/`toolCall.output` text). Only `AssistantOverlay` passes `renderMessageExtra`, so this fails against the old `CocOverlay` mount (red→green proof the right overlay is mounted). Plus the existing `AD8b-AssistantOverlay.test.tsx` (protected) stays green.

### AC6 — DM dedup (reuse existing direct thread)
`POST /api/threads` (threads.ts:582) — a **direct** thread is `hostKind ∈ {user,agent}` AND `sortedParticipants.length === 2` AND not the assistant thread (R3 guard). For direct threads, compute `directKey = directKeyFor(hostKind, hostId, sortedParticipants)`; non-direct threads keep `directKey = null`. The dedup is then a single-row index lookup + an insert that the DB makes race-safe (no participant-array scan):
```ts
// after computing sortedParticipants + senderId, before crypto.randomUUID()
const isDirect =
  (input.hostKind === "user" || input.hostKind === "agent") &&
  sortedParticipants.length === 2 &&
  !isAssistantThread(input.hostKind, input.hostId, sortedParticipants); // R3 guard
const directKey = isDirect
  ? directKeyFor(input.hostKind, input.hostId, sortedParticipants)
  : null;

if (directKey) {
  const [existing] = await db.select().from(threads)
    .where(eq(threads.directKey, directKey)).limit(1);
  if (existing) {
    // Option B: append the initial message to `existing`, bump lastActiveAt, emit event.
    return c.json({ thread: rowToThread(existing) }, 200); // reused
  }
}
// insert path: include `direct_key: directKey`; guard the race with onConflict.
const inserted = await db.insert(threads)
  .values({ id: crypto.randomUUID(), /* …, */ directKey })
  .onConflictDoNothing({ target: threads.directKey })
  .returning();
if (inserted.length === 0 && directKey) {
  // lost the race → load the winner and append to it (Option B), respond 200.
  const [winner] = await db.select().from(threads)
    .where(eq(threads.directKey, directKey)).limit(1);
  // append initial message to `winner`, bump lastActiveAt, emit; return 200.
}
// else: created → continue normal insert-message path; respond 201.
```
⚠️ UNVERIFIED: `.onConflictDoNothing({ target })` + `.returning()` empty-array-on-conflict behavior in Drizzle 0.30 — confirm against drizzle-orm docs that a conflicting insert returns `[]` (not throw). If `.returning()` semantics differ, fall back to the lookup-then-insert-in-transaction with a caught unique-violation → re-select.
**Decision (design-it-twice):**
- *Option A — return existing thread (200), drop the new initial message.* Simplest; matches RecipientPicker's flow (it only needs `thread.id` to navigate). Trade-off: the typed first message is silently dropped if a thread already exists. Reject: surprising data loss.
- *Option B — return existing thread AND append the initial message to it.* The recipient's typed message lands in the existing thread. Slightly more work (reuse the message-insert + `lastActiveAt` bump + event emit). **Chosen** — preserves user intent (the message they wrote) and correctly bumps recency so the reused thread sorts to top (ties into AC1).
- Respond `200` (reused) vs `201` (created) so callers/tests can distinguish. RecipientPicker reads `body.thread.id` regardless (RecipientPicker.tsx:104-107) — no client change required.

**C2 — TOCTOU race fix (DB uniqueness backstop, mandatory).** The application-level lookup above is read-then-insert: two concurrent `POST /api/threads` to the same recipient both miss the `SELECT` (neither sees the other's uncommitted row) and both `INSERT` → the exact duplicate AC6 forbids. **Verified the assistant route is NOT a safe precedent:** `assistant.ts:187-211` does the same read-then-insert with **no** unique constraint and **no** `onConflict` — it has the identical race, so there is no mitigation to inherit. We add a real DB backstop.

- **New partial unique index on the direct-thread identity.** `threads.participants` is a sorted-JSON `text` column (verified `schema.ts:381`, `rowToThread` parses it sorted), and `(host_kind, host_id)` already has a non-unique `threads_host_idx` (`schema.ts:388`). Add a **partial unique index** keyed on the normalized direct identity. Two viable shapes (pick the first — least migration surface):
  - **Chosen — add a derived `direct_key` text column + partial unique index.** New nullable column `direct_key text` on `threads`, written **only** for direct threads as `\`${hostKind}:${hostId}:${sortedParticipants.join(",")}\`` (null for group/feed/host-scoped threads, so they never collide). Migration adds:
    ```sql
    ALTER TABLE "threads" ADD COLUMN "direct_key" text;
    CREATE UNIQUE INDEX "threads_direct_key_uq" ON "threads" ("direct_key") WHERE "direct_key" IS NOT NULL;
    ```
    Drizzle schema:
    ```ts
    directKey: text("direct_key"), // non-null only for DMs: `${hostKind}:${hostId}:${sortedParticipants}`
    // in the index list:
    uniqueIndex("threads_direct_key_uq").on(table.directKey).where(sql`${table.directKey} IS NOT NULL`),
    ```
    Postgres supports partial unique indexes; Drizzle 0.30 supports `.where()` on `uniqueIndex`. Mirrors the existing `messages_idempotency_uq` precedent (`schema.ts:416`). ⚠️ UNVERIFIED: confirm `.where()` on `uniqueIndex` emits the partial-index DDL in drizzle-kit 0.30 when running `npm run db:generate`; if it does not, hand-author the `CREATE UNIQUE INDEX … WHERE` in the generated migration (raw SQL in migration files is allowed per TS rules).
  - *Rejected — generated/expression index over `(host_kind, host_id, participants)` directly.* Avoids the extra column but bakes the sorted-JSON string format into an index expression; brittle if the participant serialization ever changes, and harder to keep null-partial. The explicit `direct_key` column makes the dedup contract legible and is the boring choice.
- **ON CONFLICT handling on insert.** Wrap the DM insert with `onConflictDoNothing({ target: threads.directKey })` (Drizzle precedent: `seed.ts:74`, `observability/config.ts:121`). If the insert affects 0 rows (a concurrent writer won the race), **re-SELECT** by `direct_key` to load the winner, then follow Option-B semantics (append the initial message to the winner, bump `lastActiveAt`) and respond `200`. This makes the resolve-or-append idempotent under concurrency: exactly one thread row can ever exist per direct identity.
- **Migration ordering:** `npm run db:generate` (PostgreSQL dialect, `drizzle.config.ts` → `out: ./drizzle`, next file `0031_*`). The column is nullable + backfill-free (existing direct threads get `NULL` and remain dedup-exempt until next write — acceptable: AF14 is the first writer of `direct_key`, and historical duplicates, if any, are not in AF14's repair scope; note in §Risks).
- **Verify:** (a) integration test — POST a DM to recipient R (201, thread T1, `direct_key` populated); POST again to R (200, `thread.id === T1`, message count on T1 +1, exactly one thread row for that `direct_key`). (b) **race test** — fire two `POST /api/threads` to R concurrently (`Promise.all`); assert exactly one `threads` row with that `direct_key` exists afterward and both responses resolve to the same `thread.id` (one 201, one 200, or both 200 — never two distinct ids). This is the test that proves the DB backstop, not just the happy-path lookup.

---

## route-checklist
- `GET /api/threads` (threads.ts) — add batched `title`; **unchanged ordering**.
- `POST /api/threads` (threads.ts) — add DM dedup (resolve-or-append) with `direct_key` write + `onConflictDoNothing` + re-select; 200 reused / 201 created.
- `GET /api/threads/:id` — unchanged (detail already correct).
- `POST /api/threads/:id/messages` — unchanged (already emits `thread_message_appended`).
- WS: `thread:<id>` topic — unchanged (already broadcast + authorized). FE subscribes new.
- **DB migration (C2):** `db/schema.ts` adds `directKey` + `threads_direct_key_uq` partial unique index → `npm run db:generate` produces `drizzle/0031_*.sql` (PostgreSQL). Verify the generated SQL contains `CREATE UNIQUE INDEX … WHERE "direct_key" IS NOT NULL`; hand-edit the migration if drizzle-kit omits the partial predicate.

## Migrations — Coc→Assistant complete footprint (W2)
**Scope re-derived via `rg -ai "coc"` across `packages/web/src` + `packages/server/src` (force-text — plain `grep` misses binary-classified files like AppShell.tsx). Raw hit count: 36 files. Classified below.** The rename must land **atomically** — knip + `npm run check` fail if any importer of a deleted shim survives. Builder gate: after the change, `rg -ai "CocOverlay|CocContext|useCocThread|CocAttachButton|onCocClick|cocOverlayOpen|coc-open" packages/web/src` returns **zero** hits (the only surviving `coc` substrings allowed are the two out-of-scope comment-prose lines and the deferred server `Coach`/`COC_AGENT_*` symbols listed under "Out of scope" — do NOT touch those).

### A. Production files to RENAME / REROUTE (symbols change, file kept)
| File | Verified hits | Action |
|---|---|---|
| `packages/web/src/layouts/AppShell.tsx` | `:19,:28,:210-236,:258-261,:516-517,:554,:600,:754-758,:786-790` | **rename** all Coc→Assistant per AC5 table (imports, state, handlers, Provider, both mounts, sidebarProps to non-deprecated `onAssistantClick`/`assistantOverlayOpen`). |
| `packages/web/src/pages/WorkBet.tsx` | `:40` `import { CocAttachButton }`, `:41` `import { CocContext }`, `:281`+`:1067` `<CocAttachButton …>`, `:668` `useContext(CocContext)` | **reroute** both: `CocAttachButton`→`AssistantAttachButton`, `CocContext`→`AssistantContext`. |
| `packages/web/src/pages/KnowledgeDetail.tsx` | `:57` `import { CocContext }`, `:464` `useContext(CocContext)` | **reroute** `CocContext`→`AssistantContext`. |
| `packages/web/src/pages/knowledge/KnowledgeBody.tsx` | `:30` `import { CocAttachButton }`, `:148` `<CocAttachButton …>` | **reroute** to `AssistantAttachButton` (the surviving component). |
| `packages/web/src/shell/Sidebar.tsx` | `:71-77` props (`onAssistantClick`/`assistantOverlayOpen` + `@deprecated onCocClick`/`cocOverlayOpen`), `:179-183`, `:465-476` (`?? onCocClick`, `?? cocOverlayOpen`) | **drop the two `@deprecated` props** (`onCocClick`, `cocOverlayOpen`) and their `??` fallbacks — safe once AppShell passes the non-deprecated props (AC5). Removes the last production caller; tests that still pass them (Group D) must be updated in the same change. |
| `packages/web/src/shell/AssistantOverlay.tsx` | `:329` `animate-[coc-open_…]`, `:368` stale lore | **rename** the `coc-open` class → the renamed keyframe (Group C); **fix the stale lore** at `:368` (AC5). This is the KEEPER overlay — edited, not deleted. |
| `packages/web/src/index.css` | `:18,:20,:25,:28` `@keyframes coc-open` + `animate-[coc-open]` prose | **rename** keyframe `coc-open`→`assistant-open` (Group C) + update the two doc-comment references. |

### B. Production files to DELETE (after their importers are rerouted)
| File | Why safe to delete | Pre-req |
|---|---|---|
| `packages/web/src/shell/CocOverlay.tsx` | divergent twin, no `renderMessageExtra`; AppShell now mounts `AssistantOverlay` | AC5 mount swap done first |
| `packages/web/src/shell/CocOverlay.stories.tsx` | `AssistantOverlay.stories.tsx` already exists | — |
| `packages/web/src/contexts/CocContext.tsx` | pure re-export shim of `AssistantContext` (verified `:3-12`) | all `CocContext` importers (Group A + Group D tests) rerouted |
| `packages/web/src/hooks/useCocThread.ts` | shim; only `CocOverlay.tsx` consumed it in prod | CocOverlay.tsx deleted |
| `packages/web/src/components/CocAttachButton.tsx` | shim around `AssistantAttachButton`; prod consumers are `WorkBet.tsx` + `knowledge/KnowledgeBody.tsx` | those two rerouted to `AssistantAttachButton` first |

### C. CSS keyframe rename (called out — the design-critique W2 omission)
`@keyframes coc-open` (`index.css:28`) is referenced by `animate-[coc-open_…]` at **both** `CocOverlay.tsx:268` (deleted) and `AssistantOverlay.tsx:329` (kept). Rename keyframe → `assistant-open` **and** update the surviving call-site `AssistantOverlay.tsx:329` in the same change, or the animation silently breaks. (Deleting CocOverlay.tsx removes its call-site automatically.)

### D. Test / story files referencing Coc symbols (update in the SAME atomic change)
These break `npm run check`/`npm run test` if left pointing at deleted symbols. Two sub-classes:
- **Reroute Sidebar-prop tests** (pass `onCocClick`/`cocOverlayOpen` — must switch to `onAssistantClick`/`assistantOverlayOpen` once the deprecated props are dropped in Group A): `__tests__/AD3-sidebar-single-team.test.tsx`, `__tests__/AD5-sidebar-conversations-badge.test.tsx`, `__tests__/AF8-NotificationPopover.test.tsx` (`:272-273,:303`), `__tests__/Sidebar.settings.test.tsx`, `__tests__/Sidebar.test.tsx` (incl. the `"clicking CoC trigger calls onCocClick"` case at `:304` — rename), `__tests__/Sidebar.y4-triage-badge.test.tsx`, `pages/__tests__/W3-sidebar.test.tsx`, `shell/Sidebar.stories.tsx`.
- **Delete the Coc-twin tests whose AD8b-Assistant equivalent already exists** (else duplicate-coverage of a deleted symbol): `__tests__/CocOverlay.test.tsx` (twin: `AD8b-AssistantOverlay.test.tsx`), `__tests__/CocOverlay.block-ref.test.tsx`, `__tests__/CocAttachButton.test.tsx` (twin: `AD8b-AssistantAttachButton.test.tsx`), `pages/__tests__/WorkBet.share-block.test.tsx` + `pages/__tests__/KnowledgeDetail.share-block.test.tsx` (reroute their Coc imports — these test real pages, do NOT delete). `__tests__/AE2-onboarding-autoopen.test.tsx`: keep, but update the `data-testid="coc-overlay"`/`coc-context-chips` selectors and `cocOverlayOpen` references to the Assistant names; **the `?coc=open` URL param stays** (AC5 decision).

### Out of scope — `coc` substrings AF14 must NOT touch
- `packages/web/src/hooks/useBlockResolution.ts:10` and `packages/web/src/utils/block-excerpt.ts:4` — comment prose ("CoC conversation"/"CoC chips"), no symbol. Stale wording; not an AF14 symbol rename (cosmetic doc churn out of scope).
- `packages/server/src/routes/coach.ts` + `packages/server/src/routes/__tests__/coach.routes.integration.test.ts` — server `COC_AGENT_*` / `seed-agent-cos` / "Chief of Staff" identity. **Explicitly deferred** by `@lore AD8a` (`coach.ts:42`: "COC_AGENT_ID and COC_AGENT_ROLE stay as-is — AD8b renames them when restructuring this file"). A separate backend rename; AF14 (FE overlay correctness) does not touch the server CoC agent.

**Atomicity gate:** delete + reroute land in one commit; then `npm run check` (zero unresolved imports) + `npm run lint` (knip: zero dead-export / dangling-importer) + `npm run test` green. The `rg` zero-hit check above is the proof the rename is complete.

## Type signatures
```ts
// ThreadSections.ts — ThreadItem gains:
lastActiveAt: string; // ISO; the sort key. Distinct from display `timestamp`.

// useConversationsThreads.ts — ThreadListRow already has lastActiveAt; add:
title: string; // server-resolved human title

// threads.ts (server)
async function resolveThreadTitles(
  db: HyperIdleDb, rows: DbThread[], requestingUserId: string,
): Promise<Map<string, string>>; // threadId -> title, batched (no N+1).
                                 // Always returns a human string per row — never undefined, never a raw hostId (W1).

// db/schema.ts — threads table gains (C2):
directKey: text("direct_key"); // non-null ONLY for DMs; `${hostKind}:${hostId}:${sortedParticipants.join(",")}`
// + partial unique index: uniqueIndex("threads_direct_key_uq").on(table.directKey).where(sql`${table.directKey} IS NOT NULL`)

// helper for the DM direct identity (server, shared by POST insert + dedup re-select):
function directKeyFor(hostKind: string, hostId: string, sortedParticipants: readonly string[]): string;
```

## Security & abuse cases
- **DM dedup (POST /api/threads):** no new auth surface — existing `principal-self` boundary + `readInitialSenderId` unchanged. The dedup lookup is scoped by hostKind+hostId; a caller can only reuse a thread they're a participant of (sender is forced into `sortedParticipants`). N/A for IDOR escalation. Rate-limit: same as existing POST — inherited.
- **Concurrency / TOCTOU (Dimension 7 — was the C2 gap):** the resolve-or-append is a read-then-insert. Two concurrent POSTs to the same recipient would each miss the `SELECT` and both insert without a DB backstop. **Mitigated** by the `threads_direct_key_uq` partial unique index + `onConflictDoNothing` re-select (see AC6) — the DB guarantees at most one row per direct identity; the loser of the race re-selects the winner and appends to it. No duplicate thread is reachable under concurrency.
- **Title resolver:** reads host tables by id; returns names only to a participant-scoped list (the list endpoint is already `principal-self` + AD1 participant-match, threads.ts:438). No new data exposure — titles are names the requester already has access to. Batched queries bound by `limit ≤ 50` rows. No injection (Drizzle params).
- **WS subscription (FE):** subscribes to `thread:<id>` for the open thread; server authorizer (ws-broadcaster.ts:258) already denies non-participants. No new server surface.
- **Input-trust (agent-authored title fields):** titles derive from `users.name`/host titles which may be agent-authored. They render as text in `ThreadRow.title` (no `dangerouslySetInnerHTML`); React escapes. N/A for XSS.

## protectedTests
- `packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx` (asserts `var(--danger)` inline styles + section grouping — section path untouched by chip removal; must stay green).
- `packages/web/src/__tests__/AD8b-AssistantOverlay.test.tsx` (tool-call rows — the canonical overlay behavior AC5 makes live).
- `packages/web/src/hooks/__tests__/useConversationsThreads.test.tsx` (extend, don't break — `title` is additive).
- Any thread-route integration test asserting list ordering (`title` is additive; ordering unchanged).

## sharedFiles
- `packages/server/src/routes/threads.ts` (list builder + POST — also touched by other AF threads WPs).
- `packages/web/src/layouts/AppShell.tsx` (overlay mount + context provider).
- `packages/web/src/components/ThreadSections.tsx` (`ThreadItem` shape).
- `packages/web/src/hooks/useConversationsThreads.ts` (`ThreadListRow` shape).

## Risks / ambiguities
- **R1 — RESOLVED (line refs re-verified):** `CocAttachButton` is still imported in production by `WorkBet.tsx` (`:40` import, used `:281`/`:1067`) and `knowledge/KnowledgeBody.tsx` (`:30` import, used `:148`). Reroute both to `AssistantAttachButton` (identical API — `ref: AssistantContextRef`), then delete `CocAttachButton.tsx`. `AssistantAttachButton` uses `data-testid="assistant-attach-button"` (was `coc-attach-button`); update any e2e/spec selectors.
- **R2 — Sidebar deprecated props:** `onCocClick`/`cocOverlayOpen` are `??`-fallbacks for `onAssistantClick`/`assistantOverlayOpen`. AppShell currently passes `onCocClick`/`cocOverlayOpen` (AppShell.tsx:516-517). Rename to the non-deprecated props; only then are the deprecated props removable.
- **R3 — DM dedup + assistant thread overlap:** the assistant thread is host=`user`, hostId=userId, 2 participants — it would match the dedup predicate. Guard: exclude when `hostId === senderId` AND a participant is `ast-<hostId>` (assistant thread is created via `/api/threads/assistant`, not `POST /api/threads`, but the guard prevents a future collision). The assistant thread therefore gets **null `direct_key`** and is exempt from `threads_direct_key_uq`. Low risk; add the guard.
- **R4 — title for group/feed threads** (>2 participants, team/factory host) is best-effort: host-entity name → deterministic participant-join → `"Untitled conversation"` (W1). **Never `hostId`** — corrected from the round-1 plan, which fell to a raw uuid and re-introduced the AC1 defect.
- **R5 — `direct_key` backfill (owned residual):** the new column is nullable and **not backfilled** for pre-AF14 direct threads — they keep `NULL` and stay dedup-exempt until their next write (which sets `direct_key` and from then on enforces uniqueness). Consequence: a historical duplicate pair created before AF14 is not retroactively merged, and a *new* POST to such a recipient could still create a second row if the legacy row's `direct_key` is null. **Accepted for AF14** (single-user-local default; historical-duplicate repair is a separate data-migration WP). Owner: deferred. If zero-duplicate-guarantee-from-day-0 is required, add a one-time backfill `UPDATE threads SET direct_key = … WHERE <is-direct> AND direct_key IS NULL` to the migration — flagged as the heavier option; not chosen because it requires re-deriving `direct_key` from the JSON `participants` blob in SQL.
- **R6 — `grep` blindness on AppShell.tsx:** the file is byte-classified as binary (`file` → `data`); plain `grep` returns nothing and silently hides every Coc reference (this caused the round-1 C1 false-positive). Builder/reviewer MUST use `rg -a` or the Read tool for any search touching AppShell.tsx. Captured as `@lore AF14` at the AppShell head during implementation.
