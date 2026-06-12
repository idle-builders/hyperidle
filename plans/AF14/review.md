# AF14 — Code Review (Phase 4)

**Reviewer:** single evaluator persona (warm from Phase 2 critique).
**Diff:** `feat/AF14-conversations-live` vs `origin/main` (commit `a1b9163f` + attestation `6d6e9c50`).
**Verify:** typecheck PASS (12 pkgs), lint PASS (Biome 0 errors / 337 warnings preexisting, ESLint clean), knip clean. Targeted tests: web AF14+AD8b 44/44 green; server AF14-threads.integration 10/10 green.

## Verdict: **DONE** (with WARNING + NITPICKs to address; no CRITICAL)

All six ACs land and are proven by passing tests. One WARNING (incomplete identifier rename, contradicts the plan's atomicity gate) and several NITPICKs (test tautology, stale comments referencing a non-existent `FilterChip`, fragile error-string match). None block merge, but the WARNING should be cleaned to honor the plan's own zero-hit gate.

---

## AC table

| AC | Requirement | Proving code / test | Status |
|---|---|---|---|
| AC1 | List by recency + human titles (no uuids; typed fallback ladder → `"Untitled conversation"`) | Server `resolveThreadTitles` batched ladder `threads.ts:376-536`; FE sort `ThreadSections.tsx:220-225` uses ISO `lastActiveAt`. Tests: `AF14-threads.integration.test.ts` (DM→name, bet→derived, task→title, deleted-host→`"Deleted bet"`, no-uuid guard); `AF14-thread-sort.test.ts`. | **PASS** |
| AC2 | Overlay send stays visible | `AssistantOverlay.tsx:179,214` — `refresh()` after `res.ok`; throws before refresh on failure (no ghost, no optimistic insert → no rollback needed). | **PASS** (behavior correct; see NITPICK-2 on missing direct test) |
| AC3 | Reply appears without reload (per-thread WS, cleanup on unmount, no leak) | `useThreadDetail.ts:172-187` subscribe `thread:<id>`, returns `unsubscribe`. Tests `AF14-useThreadDetail-ws.test.tsx`: subscribe, unsubscribe-on-unmount, re-fetch on appended/resolved, ignores other thread. | **PASS** |
| AC4 | Both Unread + Blocking chips REMOVED (not hidden); fields retained | `Conversations.tsx:499-501` chips gone, `toggleFilter` removed; `ThreadSections.tsx:216-264` flat path renders directly, `blocking`/`unread` fields kept (`ThreadSections.tsx:25,31`). Test `AF14-conversations-chips.test.tsx` (no `aria-pressed`, no Unread/Blocking text, fields compile). | **PASS** |
| AC5 | Tool-call overlay mounted in prod; stale CocOverlay swapped out | `AppShell.tsx:28,558,758,790` mounts `AssistantOverlay` (both sites) + `AssistantContext.Provider`. `CocOverlay.tsx`/`.stories`/`CocContext.tsx`/`useCocThread.ts`/`CocAttachButton.tsx` deleted; knip clean. `renderMessageExtra={renderToolCallSummaries}` `AssistantOverlay.tsx:274`. | **PASS** (mount swap proven; see NITPICK-2 — no test renders a `toolCalls` payload) |
| AC6 | DM dedup via `direct_key` + partial unique index + onConflict/re-select; TOCTOU-safe | Schema `schema.ts:399,406-408` partial `uniqueIndex(...).where(directKey IS NOT NULL)`; migration `0031_icy_violations.sql` contains `WHERE "threads"."direct_key" IS NOT NULL`. Route `threads.ts:825-1065` resolve-or-append + catch on `threads_direct_key_uq` → re-select winner. Tests: 201-then-200 reuse, Option-B append, group-not-deduped, **C2 race (Promise.all) → exactly 1 thread row**. | **PASS** |

### AC6 TOCTOU verification (specifically requested)
- Migration `0031` **retains** the partial `WHERE` predicate (drizzle-kit did not drop it). Confirmed.
- `directKey` populated consistently: same `directKeyFor(hostKind, hostId, sortedParticipants.sort())` at both insert (`threads.ts:833,979`) and lookup (`:842,1010`). Sorted-participants key is stable.
- The catch-block string-match `cause.message.toLowerCase().includes("threads_direct_key_uq")` is **real, not dead code** — verified PGlite emits `duplicate key value violates unique constraint "threads_direct_key_uq"`. The `pg` driver emits the same constraint-name text, so it matches in Postgres too.
- Failed insert transaction rolls back atomically (no orphan thread row); re-select loads the winner → Option-B append → 200. The race test proves exactly one row results.

---

## Findings

### WARNING

**W1 — Incomplete Coc→Assistant identifier rename violates the plan's own zero-hit atomicity gate.**
`AppShell.tsx` still carries two **live functional identifiers** with the dead `Coc` noun:
- `handleCocClick` (`AppShell.tsx:218`, used `:520` as `onAssistantClick`)
- `handleCocClose` (`AppShell.tsx:222`, used `:760`, `:792` as `onClose`)

The plan's AC5 table (architecture.md:84) explicitly specified renaming `handleCocClick`→`handleAssistantClick` and `handleCocClose`→`handleAssistantClose`, and the atomicity gate (architecture.md:164) required `rg -a "onCocClick|cocOverlayOpen|..."` to return **zero** hits. State vars were renamed; these two handlers were missed. Functionally harmless (the props they feed are correctly named), but it's a live identifier carrying a purged noun and contradicts the plan's stated completion criterion. Rename both for consistency. (All other `Coc`/`coc` hits in `packages/web/src` are comments/`@lore` prose — acceptable per the builder's note.)

### NITPICK

**N1 — `AF14-thread-sort.test.ts` is a tautology.** It re-implements the comparator inline (`:60-65`, `:99-104`) instead of importing the production `ThreadSections` flat-list sort. It proves the *logic shape* but not that `ThreadSections.tsx:220-225` actually uses it. The real sort is only exercised indirectly via `flat-thread-list` rendering in `AF14-conversations-chips.test.tsx`, which never asserts DOM order. Net AC1-sort is still proven by the integration recency ordering + the type field, but a render-order assertion on the actual component would be stronger.

**N2 — AC2 and AC5 lack a direct behavioral test of their load-bearing mechanism.**
- AC2: no test sends a message through `handleAppendMessage` and asserts `refresh()` was called (the AD8b mock supplies `refresh: vi.fn()` but never invokes the send path).
- AC5: `AD8b-AssistantOverlay.test.tsx` "tool-call rendering" block only asserts `thread-shell` is present; it never renders a message with a `toolCalls` payload and asserts `tool-call-summaries` rows. The plan §92 asked for asserting `toolCall.name`/`toolCall.output`. The divergent-twin behavior (the whole point of AC5) is therefore proven by code inspection + the mount swap, not by an executing assertion. Both behaviors are correct in the code; the proof is just thinner than the plan specified.

**N3 — Stale comments reference a `FilterChip` component that does not exist.** `ThreadSections.tsx:231` and `Conversations.tsx:50-51` claim "the FilterChip component is retained for future re-introduction," but `FilterChip` exists nowhere in the repo (not on `origin/main`, not added here — it was a prior local helper already inlined away). AC4's substantive requirement (chips removed, `blocking`/`unread` fields kept) is fully met; only the comments mislead. Drop the dead references.

**N4 — C2 conflict detection relies on driver error-message text, not SQLSTATE.** `cause.message.includes("threads_direct_key_uq")` works for both PGlite and `pg` today (verified), but matching on message text rather than SQLSTATE `23505` is fragile against driver/locale changes. Low risk; both supported drivers embed the constraint name. Consider keying on the PG error `code`/`constraint` field if available.

### OBSERVATIONS (no action)
- `R5` backfill gap (pre-AF14 direct threads keep `NULL direct_key`, dedup-exempt) is documented in schema `@lore` and accepted in the plan for local-default. Fine.
- AC2/AC3 both refetch (no append-in-place) → a sent message round-trips before appearing. The plan accepted the "brief flash." When AC3's WS event also fires, `useThreadDetail` dedupes via full re-fetch (identity path), so no double-render. Correct.
- Journal timestamp monotonicity fix (`a1b9163f`) verified: `0031` (1784200000000) > `0030`.
