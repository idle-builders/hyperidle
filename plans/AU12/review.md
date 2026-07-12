# AU12 — Code Review (Phase 4) — VERDICT: DONE

Reviewer independently verified (not trusted from self-report).

## Verification run
- `npm run check` → PASS (all 10 packages, 0 errors) — confirms `exec: HyperIdleDb` + `tx as HyperIdleDb` compose-cast sites typecheck.
- `au12-…-guard.ts --check` → PASS (zero findings). `--fixtures` → PASS (all 7 cases incl. (g) namespace-access `schema.threads` bypass).
- Independent grep of `packages/server/src` for `.(insert|update|delete)(` on threads/messages/users outside the two stores → only `tools/__tests__/_helpers.ts` (test, guard-excluded) and `routine-scheduler.ts:245` (inside a `/* */` block spanning L235–276 — genuinely dead, correctly left as-is). "58, zero remaining" confirmed.
- New store integration test → 10/10 pass. Behavior-preservation spot-checks: threads.routes (41), direct-thread.recipientKind, R5-agent-work-loop, cost-cap.session-end-paths, cost-cap-bet → 67 pass unchanged.
- No dangling `direct-thread` imports (only comments/relocation notes remain); file deleted.

## AC audit
- **AC-1 (one owning function per write):** MET. Migration table §5 applied; guard green; grep-confirmed.
- **AC-2 (behavior unchanged):** MET. Threads/agent-work-loop/cost-cap/direct-thread tests pass unchanged; verdict-race (`VerdictRaceConflict`), tx atomicity, participant math preserved verbatim in threads.ts.
- **AC-3 (bypass fails a check):** MET. AST write-guard wired into `npm run lint`; fixtures flag bare-identifier + namespace forms.
- **AC-4 (zero remaining):** MET. Guard PASS within scope; §5a out-of-scope writes named/justified.

## Validation scenarios
1. Assistant reply → `insertMessage` in agent-work-assistant.ts. MET.
2. Assistant user get-or-create → `getOrCreateUser` (test: created once, second call returns first). MET.
3. Pin thread → `updateThread(db, threadId, { pinned: true })` in assistant-dispatcher.ts. MET.
4. Full suite unchanged. Spot-verified green.

## Deviations (accepted, not defects)
- `updateUser` patch typed `UserPatch` (`NewUser[K] | SQL`) instead of plan's `Partial<NewUser>`. NECESSARY: cost-cap's `costActual = coalesce(...) + delta` is a SQL expression that would not fit `Partial<NewUser>`; @lore documents it; cost-cap tests pass at runtime. Correct resolution of an under-specified plan signature.
- `getOrCreateUser` throws on impossible post-insert-missing path instead of the old `persistTurnFailure` swallow. Unreachable path; strictly better (no swallow). Plan-anticipated.
- `findOrCreateDirectThread` keeps its pre-existing `recipientKind` param (default "agent") — faithful relocation.

## Lenses
- Architecture: stores are thin typed passthroughs (no invented semantic wrappers), agent→core direction respected, both stores consistent. Clean.
- Security: pure parameterized Drizzle (eq/and/isNull), no interpolation, no injection surface. No inline authorization was removed — routes retain `authorizeWrite`; stores are row-writers only.
- Simplification/Slop: no dead code introduced, no unnecessary abstraction, no leftover commented code from this WP.

Verdict: **DONE.**

---

## Review — read-ownership rework round (2026-07-12) — Reviewer

**Verdict: DONE.**

Verified concretely (not self-report):
- **Guard**: `--fixtures` PASS (all 13 cases incl. shadow-name (m), raw-sql (n), type-only (l), read-inversion (h), namespace (g), col-ref (i), join (j)); bare `--check` PASS (0 findings) in `packages/server/src`. Independent grep for `from(threads|messages|users)` / `innerJoin`/`leftJoin` on owned tables outside the two stores + tests = zero. AC-3/AC-4 met.
- **verify**: ran fresh from worktree → EXIT 0. Unit 303 passed; integration:service 2395 passed / 6 skipped; guard in lint green; build green. Dirty-tree attestation warning expected (code uncommitted for review). AC-2 behavior-preservation proven by pre-existing route/agent-work/cost-cap/roster suites passing unchanged.
- **New store test** (`conversation-user-store-reads.integration.test.ts`): 15 read + smoke asserts — order-sensitive lists, in-tx read sees uncommitted write, projected-shape equality (listAgentProfiles INCLUDES systemPrompt + EXCLUDES email by key-set assert), getArtifactThreadSummaries 4-aggregate reproduction, atomic incrementUserCost + sumAllUserCost.

Deviation scrutiny:
- **listTeamMembersSummary dropped → listUsersByTeam reused**: NOT a leak. `harnessType` genuinely consumed (teams-routes.ts:819 health signals) — plan under-scoped. Roster response is hand-built `RosterMember` (agentId/name/role/isLead/agentCategory only); no email/systemPrompt/costActual reaches client (route's `costActual` is teamMembers/bet cost, not users). Same pattern verified clean at recipients.ts (RecipientRow) + org.ts (listUserDirectory projected) + agents.ts (listAgentProfiles). No widening anywhere. Trades away one layer of defense-in-depth (a shared full-row getter *could* be widened by a future caller) — acceptable since every current response is explicitly constructed.
- **getArtifactThreadSummaries JS-aggregation**: semantics verified equivalent to the original correlated query — messageCount=all msgs; lastMessageAt=newest non-deleted; lastMessagePayload=newest non-deleted plain; hasUnresolvedReview=any review resolvedAt IS NULL. @lore column-qualification rationale is the chosen justification for JS-over-SQL; correctness holds regardless.
- **7th cross-owner join (approval-rate.ts)**: decomposed — imports `items` locally (legal; AU12 owns only threads/messages/users), resolves itemIds, calls `listVerdictMessagesByItemIds`. conversation-store imports zero Work tables.

AC audit: AC-1 (all readers+writers routed) ✓ guard+grep; AC-2 (behavior unchanged) ✓ full suite green; AC-3 (bypass fails a check) ✓ fixtures; AC-4 (zero direct access) ✓ guard PASS + §5a exceptions. Founder hard requirement (stores are ONLY path, reads included) ✓.

Minor (non-blocking, no rework required):
- Test header comment (line 11) references dropped `listTeamMembersSummary` — stale doc string.
- getArtifactThreadSummaries: if an artifact ever hosts >1 thread, JS Map dedupes to last vs. original multi-row — negligible (artifact threads are 1:1 by host construction).
