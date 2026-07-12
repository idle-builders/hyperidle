# AU12 Architecture Critique

**Verdict (Round 2): APPROVED** — 0 CRITICAL, 0 WARNING. All three round-1 findings resolved with evidence; no regressions to previously-approved content; no new findings.

Round 1 (below, retained for history) raised 1 CRITICAL + 2 WARNING. The revised plan (§3a/§3b/§3c, §4, §5a) addresses each. Re-verified by fresh reads + independent greps, not planner self-report.

## Round-2 verification

### CRITICAL 1 (DbExecutor union) — RESOLVED
- §3a drops the `DbExecutor` union; every store fn takes `exec: HyperIdleDb`. No new `@hyperidle/db` export.
- Precedent confirmed real: `practice-meeting.ts:448-454` (@lore, structural-compat) and `agent-session-requests.ts:278/334` (`terminalizeAgentSessionRequestInTx(tx: HyperIdleDb)`, called `db.transaction((tx) => …(tx as HyperIdleDb, …))`).
- Spot-checked the `tx` migration-table rows against real code: `builtin-routine-handlers.ts:381` and `threads.ts:889` are exactly `db.transaction(async (tx) => tx.insert(...))` handles — same shape as the precedent. `tx as HyperIdleDb` is the established, already-shipping cast (compiles on main), so type-soundness is proven by existing code, not asserted. §3a/§5/§7 consistently apply `tx as HyperIdleDb` to every `tx` row and bare `db`/`ctx.db` to the rest. Sound.

### WARNING 1 (AC-4 out-of-server writes) — RESOLVED
- New §5a names all four locations with per-site line numbers and dispositions; AC-4 restated as scoped to `packages/server/src` with the remainder as named, justified exceptions feeding AU8's allowlist (TRACK-AU 630).
- Independent grep (multiline-tolerant, all packages + web, excluding tests): the ONLY out-of-server writes to threads/messages/users are the four named files — factory-bootstrap.ts (6), demo-fixture.ts (4), eval/seeding.ts (7), ah6-test-server.ts (2). Counts match §5a exactly; zero un-triaged writes remain. factory-bootstrap/demo-fixture as lower-layer (`packages/db` cannot import upward) and eval/dev-script as harness-fixture seeding are correct, defensible dispositions.

### WARNING 2 (namespace bypass + AU17 framing) — RESOLVED
- §4 now resolves both bare-identifier and namespace-member-access (`schema.threads`) forms by binding the namespace import to `@hyperidle/db` then checking the accessed member name — a coherent, implementable TS-AST pattern (symbol/import resolution, not string-match), with fixture case (g) added. No namespace imports exist in server/src today, so this is future-proofing, correctly framed as closing the bypass rather than fixing a live hole.
- Framing corrected with evidence: au9–au11 are import/reachability guards; AU12 is a write-expression guard; AU8's `TABLE_OWNER` map (TRACK-AU 621) IS AU12's write-ownership shape, so AU8/AU17 converge toward AU12. Grounded, not a bare restatement.

### Regression check on previously-approved content — INTACT
- §5 migration table still 59 sites / 22 files; tx/db/ctx.db executor column consistent; verdict-race `resolveMessageIfUnresolved` + caller `.length` throw, participant math, `agentWorkIntents`/`items` inserts, `db.transaction` wrappers all still left in callers.
- Two service designs (§3b conversation-store, §3c user-store) unchanged in surface (insert/update/getOrCreate/resolveMessageIfUnresolved/resetAllUserCost); direct-thread.ts fold-in preserved.
- §8a Settings/Notification carve-out intact and correctly out (own WPs).
- §7a AU13 `threads` overlap boundary-lock intact (AU12 owns both builtin-routine-handlers threads inserts; AU13 takes only `items`/routines).

## Confirmed strengths (carried from round 1)
- Migration audit exact; transaction preservation sound; Settings/Notification correctly declined; guard pre-merge enforceable (wired into `npm run lint`, `--fixtures` self-test incl. read/local-var/namespace cases, receiver-agnostic, resolves reference→import).

---

# Round 1 (superseded — retained for history)

**Verdict: REVISE** — 1 CRITICAL, 2 WARNING.

## CRITICAL 1 — DbExecutor union unverified, does not compile, contradicts documented repo convention
§3a's `type DbExecutor = HyperIdleDb | Parameters<Parameters<HyperIdleDb["transaction"]>[0]>[0]` fails TS2344 and reinvents the exact "depend on drizzle internal transaction type" the practice-meeting.ts @lore warns against. Fix: type executor as plain `HyperIdleDb`; pass `tx as HyperIdleDb` per precedent.

## WARNING 1 — AC-4 "zero remaining" only holds inside packages/server/src
factory-bootstrap.ts (6 users writes), demo-fixture.ts (4), eval/seeding.ts (8), ah6-test-server.ts (2) un-triaged. AU8's repo-wide guard will trip on them. Triage them here as named exceptions.

## WARNING 2 — namespace-access guard bypass + backwards AU17 framing
`db.insert(schema.threads)` slips the identifier-only rule (add fixture + handle or document). "Follow au9–au11's shape exactly" is backwards — au12 establishes the write-ownership shape AU8/AU17 converge toward.
