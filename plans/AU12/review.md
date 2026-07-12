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
