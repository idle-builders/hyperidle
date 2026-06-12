# Architecture Critique: AF14 — Conversations correctness and live updates

ARCHITECTURE-SCORE: 5/10  rounds=1  score-line: SA:6 LI:9 AC:7 DM:5 N:7 MD:8 FMC:4 S:8 V:7

The plan is mostly well-reasoned and the FE-vs-BE reconciliation table is the right instinct — but it ships **one fabricated fix location** (AC5) that would send the builder editing a file with zero matching content, and a **race-unsafe DM dedup** with no uniqueness backstop. Both are CRITICAL and block the plan. Two more WARNINGs on title-ladder fall-through and migration call-site completeness.

---

## CRITICAL

### C1 — AC5 fix location is fabricated; AppShell mounts NO overlay
**[plan §AC5 + §Migrations + reconciliation row "wrong overlay mounted"]**
The plan asserts: *"AppShell imports + mounts `CocOverlay` (AppShell.tsx:28,754,786)"* and the AC5 task says to rename `import { CocOverlay }` at AppShell.tsx:28, swap `<CocOverlay>` mounts at 754/786, and `<CocContext.Provider>` at 554.

**Verified ground truth:** `packages/web/src/layouts/AppShell.tsx` (795 lines) contains **zero** occurrences of `Coc`, `Assistant`, `Overlay`, `overlay`, or `Provider`. An exhaustive search for `<CocOverlay`/`<AssistantOverlay>` JSX across all non-test/non-stories code returns **nothing** — neither overlay is mounted in any production component (App.tsx, router.tsx, AppShell.tsx all clean). The named line numbers (28/554/754/786) do not correspond to the claimed content.

Consequences:
- The builder following AC5 verbatim will find no `import { CocOverlay }` to rewrite and no `<CocOverlay>` JSX to swap. The "fix" is a no-op against a file that never had the defect.
- The real defect is *worse* than the plan describes: the spec says "the wrong assistant overlay is mounted so tool-call summaries never render" — but the actual state is that **no overlay is mounted at all** in the shell. AC5 ("the overlay that renders tool-call summaries is the one mounted in production") cannot be satisfied by a rename; it requires *wiring the mount that does not exist*, then ensuring it's `AssistantOverlay`.

Also note the codebase contradicts itself: `AssistantOverlay.tsx:368` carries `@lore AD8b: CocOverlay.tsx re-exports from this module for backward compat` — but `CocOverlay.tsx` is a **full 301-line independent implementation** with its own `CocOverlayInner` (lines 93/207/298) and **no** `renderMessageExtra`/tool-call rows (grep: zero `toolCall` refs). So the lore is stale and the two files genuinely diverged. The plan's claim that CocOverlay "lacks tool-call rows" is correct; its claim about *where it's mounted* is not.

**Fix:** Re-derive AC5 against reality. (a) Locate the actual assistant-trigger → overlay mount path (the trigger button + `AssistantContext.Provider` are consumed by `WorkBet.tsx`/`KnowledgeDetail.tsx`, but the *overlay popover itself* is mounted nowhere — confirm and name the file that SHOULD mount it, likely AppShell or a shell region). (b) Restate AC5 as "mount `AssistantOverlay` in <verified file> and verify tool-call rows render," not as a CocOverlay→Assistant rename in AppShell. (c) Fix the stale `@lore` at AssistantOverlay.tsx:368.

### C2 — DM dedup is TOCTOU-racy with no uniqueness backstop
**[plan §AC6 + §Security & abuse cases]**
The dedup is a read-then-insert: `SELECT ... WHERE hostKind=? AND hostId=?` → `.find(participants match)` → if none, `crypto.randomUUID()` + insert (threads.ts:608). There is **no unique constraint** on `(hostKind, hostId, participants)` in the schema (verified: insert at threads.ts:617 supplies a random id; nothing enforces DM uniqueness at the DB layer). Two concurrent `POST /api/threads` to the same recipient both pass the lookup (neither sees the other's not-yet-committed row) and both insert → the exact duplicate the AC exists to prevent. The task prompt flagged this and the plan does not address it. The §Security block only discusses auth/IDOR, not the concurrency failure mode (Dimension 7 gap).

**Fix:** Either (a) add a partial/unique index on direct threads keyed by `(hostKind, hostId, sorted-participants-hash)` and handle the insert-conflict by re-selecting the winner (the race-safe pattern), or (b) explicitly document why the race is acceptable for AF14's single-user-local default (one human, serial requests) AND add it to §Risks with the residual-risk owner. Note the assistant route (`assistant.ts`) is cited as the resolve-or-create pattern to mirror — confirm whether *it* has a uniqueness backstop; if it relies on the same race window, inherit its mitigation, don't invent a weaker one.

---

## WARNING

### W1 — Title ladder fall-through unspecified (inherited from design, not patched by arch)
**[plan §AC1 resolveThreadTitles]**
The batched resolver mirrors the design ladder but doesn't specify what happens when (a) a DM "other participant" id has no `users` row (agent/`ast-*` participants — the name map lookup returns undefined), or (b) a host entity was deleted (the batched `bets`/`tasks`/`knowledgeItems` query returns no row for that hostId). Both currently fall to rung 5 = bare `hostId` = a raw uuid, which re-introduces the AC1 defect the WP exists to fix ("readable titles rather than raw identifiers"). The plan must define typed human fallbacks (e.g. unresolved participant → skip to host/group rung; deleted host → `"Deleted <kind>"`), not a raw id.

### W2 — Coc→Assistant migration call-site table is incomplete; knip/check will break
**[plan §Migrations]**
The plan's migration table lists ~9 files but the verified Coc footprint is **31 files**. Missing from the plan's enumeration (all contain `Coc` references): `AD3-sidebar-single-team.test.tsx`, `AD5-sidebar-conversations-badge.test.tsx`, `AD8b-AssistantAttachButton.test.tsx`, `AD8b-AssistantContext.test.tsx`, `AD8b-AssistantOverlay.test.tsx` (imports CocOverlay), `AF8-NotificationPopover.test.tsx`, `Sidebar.settings.test.tsx`, `Sidebar.test.tsx`, `Sidebar.y4-triage-badge.test.tsx`, `W3-sidebar.test.tsx`, `index.css` (a `coc-*` CSS class/selector), and `KnowledgeDetail.tsx` (plan mentions it in prose but not in the table action list). The plan's own warning — "Knip will flag the deleted shims' importers; the migration must land atomically or lint fails" — is correct, which makes the incomplete enumeration self-defeating: if the builder deletes `CocOverlay.tsx`/`CocContext.tsx`/`useCocThread.ts` per the table but misses the importers above, `npm run check` and knip both fail. Plan must either enumerate ALL 31 (with delete vs reroute per file) or instruct the builder to grep `Coc` across `packages/web/src` and resolve every hit as a gate, with `index.css` called out explicitly (a CSS rename the table omits entirely).

---

## SUGGESTION

### S1 — Overlay-send refresh: confirm no flash, and that `refresh()` is the same fetch the WS path uses
**[plan §AC2]** The plan chooses refetch-after-POST over optimistic insert "no reconciliation; simpler." Reasonable and matches the `useConversationsThreads` precedent (verified: that hook deliberately re-fetches on WS event with a documented "brief flash acceptable" lore at lines 210-225). But the assistant overlay is a *small popover*, not a full list — a full refetch that briefly empties the `ThreadShell` stream would flash more visibly than a list re-sort. SUGGESTION: verify `refresh()` does a *merge/replace* not an empty-then-fill, or accept the optimistic-insert path for the overlay specifically. At minimum the AC2 component test should assert the previously-rendered messages stay mounted during the refetch (no flash-to-empty), not just that the new message appears.

### S2 — AC3 WS effect: the precedent is sound; codify the dep-array gotcha
**[plan §AC3]** Verified: `ws-client.subscribe()` returns an unsubscribe fn (ws-client.ts:41/52) and the singleton auto-reconnects (ws-client.ts:9-10,35-37). So `return unsub` in the effect is correct cleanup and reconnect is handled by the singleton — no leak. Good. One gotcha: the plan's effect depends on `[threadId]` and reads `threadId` inside the handler closure — correct, but the existing `useThreadDetail` already drives refetch off a `tick` state (verified: tick at :118, effect dep `[threadId, tick]` at :158). Confirm the new WS effect's `setTick` is the **same** `tick` the fetch effect depends on (the plan implies it but doesn't name the wiring) — if AC3 introduces a second tick, the refetch won't fire.

### S3 — `threadListRowSchema` reconciliation row is good; carry the honesty forward
**[plan §reconciliation]** The plan correctly caught that `threadListRowSchema` "does not exist — list response built inline." Verified: the list builder returns `rowToThread(r)` spread + `hasUnresolvedReview` (threads.ts:499-502), not a named schema. So `title` must be added to the `rowToThread` output (or the inline map) AND to the FE `ThreadListRow` guard — the plan says "inline builder + FE guard," consistent. Good catch; no change needed, noting it as a model of the reconciliation the rest of the plan should match.

---

## What's Working Well
- **The spec⇆reality reconciliation table is the right discipline** — most rows are accurate (FE-only sort bug at ThreadSections.tsx:255-264 verified: `Date.parse(a.timestamp)` on a relative-time string; the WS broadcast/authorizer backend is genuinely complete; the `refresh()` exposure on `useAssistantThread` exists). This is exactly how a bugfix WP should open, and it caught two real spec-overstatements (sort and live-update are FE-only, not backend gaps).
- **Scope restraint:** keeping the `blocking`/`unread` fields and `FilterChip` component while removing only the two live chip instances is the correct minimum-blast-radius move, and the plan resists building the unread primitive the concept explicitly rejected.

---

# Round 2 — Re-critique (revised plan `d96d85fc`)

ARCHITECTURE-SCORE: 8/10  rounds=2  score-line: SA:8 LI:9 AC:9 DM:8 N:8 MD:8 FMC:9 S:9 V:9

**APPROVED.** ≥7, zero unresolved CRITICALs. The revision lands all four findings. C1 was a **reviewer false-positive** caused by a tooling trap (AppShell.tsx is byte-classified `data` → plain `grep` silently skips it); the designer's correction is verified correct. C2 is now race-safe via a real DB backstop. W1/W2 are fully specified. Two minor NEW notes below (non-blocking).

## Per-finding status

### C1 — AC5 fix location → **RESOLVED** (round-1 finding was a FALSE POSITIVE)
Re-verified ground truth with `rg -a` (force-text) and the Read tool, NOT `grep`:
- `file packages/web/src/layouts/AppShell.tsx` → `data` (binary-classified). Plain `grep -c "Coc"` returns **empty**; `rg -a -n "Coc"` returns 20 hits. The round-1 "zero Coc refs" claim was the grep lie, not reality.
- AppShell **does** mount `CocOverlay`: import `:19` (`CocContext`) + `:28` (`CocOverlay`), `coc*` state `:211-212`, handlers `:214-227`, `?coc=open` autoopen `:258-261`, sidebarProps `:516`, `<CocContext.Provider>` `:554`/`:600`, two `<CocOverlay>` mounts `:754` (mobile) + `:786` (desktop).
- **Prop contract verified identical.** `CocOverlayProps` (CocOverlay.tsx:51-59) and `AssistantOverlayProps` (AssistantOverlay.tsx:130-138) are field-for-field the same — `open`, `onClose`, `anchorRef?`, `contextRefs`, `onRemoveContextRef` — differing only in the `CocContextRef`→`AssistantContextRef` element type. `AssistantOverlay` adds `renderMessageExtra={renderToolCallSummaries}` (`:269`, helper `:92` reads `payload.toolCalls`); `CocOverlay` has no such prop. AC5 is therefore a genuine **drop-in mount swap + symbol rename**, exactly as the revised plan states — not wiring-from-scratch and not a no-op.
- The stale `@lore AD8b` at AssistantOverlay.tsx:368 ("CocOverlay re-exports from this module") is confirmed false (CocOverlay is a ~301-line independent impl); the plan corrects it. The AC5 verification test (render AppShell, post a message with `toolCalls`, assert summary rows render) correctly fails against the old `CocOverlay` mount — a real red→green proof.

### C2 — DM dedup TOCTOU race → **RESOLVED** (race-safe; migration creatable without backfill)
- **DB backstop verified sound.** New nullable `direct_key text` + partial unique index `threads_direct_key_uq ON (direct_key) WHERE direct_key IS NOT NULL`. `db.insert(...).onConflictDoNothing({ target: threads.directKey }).returning()` → on empty result, re-SELECT the winner and append (Option B). The DB guarantees ≤1 row per direct identity; the race loser converges on the winner. Correct pattern.
- **NEW-critical question answered — migration IS creatable on the populated table.** Column added nullable; every existing row gets `direct_key = NULL`; the partial index `WHERE direct_key IS NOT NULL` indexes **zero rows at creation time**. No uniqueness conflict is possible at migration time regardless of historical duplicates. No backfill blocks it. The R5 residual (legacy duplicates not retroactively merged) is correctly owned and out-of-scope.
- **API availability confirmed in the *installed* versions** (plan said 0.30; actual is higher): `drizzle-orm@0.39.3` exposes `where(condition: SQL): this` on the pg index builder (`node_modules/drizzle-orm/pg-core/indexes.d.ts:67`) — the schema-level partial-index API exists. `drizzle-kit@0.30.6`. The plan's sole residual UNVERIFIED (does drizzle-kit *emit* the `WHERE` predicate into generated SQL) is fully de-risked by the documented hand-edit fallback (raw `CREATE UNIQUE INDEX … WHERE` in the migration file). Acceptable.
- **Precedent claim partly imprecise (non-blocking):** the plan says the index "mirrors the existing `messages_idempotency_uq` precedent." `messages_idempotency_uq` is a *plain* (non-partial) unique index — there is **zero** `.where()`-partial-index precedent anywhere in `schema.ts` or in any generated migration. The `onConflictDoNothing` precedent (seed.ts) is real; the *partial-index* precedent is not. This makes the hand-edit fallback more likely to be needed, not less — but the plan already carries it, so no correctness gap. The plan also correctly establishes that `assistant.ts:187-211` is NOT a safe precedent (verified: read-then-insert, no unique constraint, no onConflict — same race, no mitigation to inherit).

### W1 — Title-ladder fall-through → **RESOLVED**
Every rung now degrades to a typed human string; no path can emit `row.hostId`:
- Rung 2 (DM name missing): `ast-*`→`"Assistant"`, agent/principal→`"Agent"`, deleted human→`"Unknown participant"`.
- Rung 3 (host deleted): `"Deleted bet"`/`"Deleted task"`/`"Deleted knowledge item"`.
- Rung 4 (group): deterministically sorted participant-join, unresolved members skipped.
- Rung 5 (last resort): `"Untitled conversation"` — **explicitly replaces** the round-1 `hostId` rung. Plan states "No code path may emit `row.hostId` as a title."
- Verified the plan contains no surviving "fallback → hostId" instruction (`rg hostId` over the title/fallback prose returns only the *prohibitions*). The W1 verification adds a static guard test (no fixture title matches `^[0-9a-f-]{36}$`) plus two integration fallback tests. Both design-critique W1 warnings (rung 2 + rung 3) are now covered.

### W2 — Coc→Assistant rename footprint → **RESOLVED**
Re-derived independently with `rg -ai "coc" -l`: **34 files in `packages/web/src` + 2 in `packages/server/src` = 36** — exactly the plan's count. Cross-checked every web/src file against the plan's Group A/B/C/D + Out-of-scope tables: all production renames/deletes/reroutes are enumerated, including the two W2 round-1 omissions now fixed — `index.css` `@keyframes coc-open` (verified `:28`, referenced by `AssistantOverlay.tsx:329` arbitrary class — keyframe + surviving call-site renamed atomically) and `KnowledgeDetail.tsx` (`:57` import + `:464` `useContext(CocContext)`).
- WorkBet.tsx correctly listed with **both** imports (`:40` CocAttachButton, `:41` CocContext).
- Shims confirmed pure re-exports: `CocContext.tsx` (`:9-13` re-export from AssistantContext), `useCocThread.ts` (re-export from useAssistantThread) — safe to delete once importers reroute.
- Server `coach.ts` + `coach.routes.integration.test.ts` correctly deferred (`@lore AD8a`) — the only out-of-scope server `coc`. `useBlockResolution.ts` + `block-excerpt.ts` comment-prose correctly out-of-scope.
- Atomicity gate (single commit; `check`+`lint`/knip+`test` green; `rg` zero-hit proof) is the right enforcement.

## NEW notes (non-blocking — do not require another round)

- **N1 (cosmetic, fold into the atomic rename).** `AssistantContext.tsx:55-64` carries a comment block describing "Backward-compat aliases: CocContext is still imported by pre-AD8b tests… these are the ONLY allowed uses of the old names." The actual aliases live in the separate `CocContext.tsx` shim (which AF14 deletes), not in this file (verified: no `export.*Coc` in AssistantContext.tsx body). After the shim is deleted this comment block is stale and should be removed in the same commit. Same class as the prose lines the plan already defers; flagging so the builder catches it (and the `@lore AD8b` at `:9`/`:24` referencing the rename history may stay or be trimmed — author's call).
- **N2 (factual nit, no action).** The plan repeatedly cites "Drizzle 0.30" for `drizzle-orm`; the installed `drizzle-orm` is `0.39.3` (drizzle-**kit** is `0.30.6`). The API the plan depends on exists in 0.39.3, so the conclusion holds; the version label is just imprecise.

## What improved since round 1
- The reviewer's own tooling trap is now documented as `@lore AF14` (R6) so the next agent doesn't repeat the grep false-positive — turning a review miss into durable lore.
- DM dedup moved from a hand-wave to a verifiable DB invariant with an explicit concurrent-POST race test (`Promise.all`, assert exactly one row, distinct status codes) — the test that actually proves the backstop.
- Title ladder went from "implicit fall-through → uuid" to a fully-typed degradation with a uuid-prohibition static guard.

**Verdict: APPROVED for Phase 4 build.** No further design/architecture round required. Builder must respect the AppShell `grep`-blindness lore (use `rg -a`/Read), land the rename atomically, and hand-edit the partial-index migration if drizzle-kit drops the `WHERE` predicate.
