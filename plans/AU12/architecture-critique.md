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

---

# Rework critique — full-access (reads+writes) ownership (2026-07-12)

**Verdict: REVISE.** The rework is directionally right, the rebase is clean, and the read audit's `.from` numbers are honest (verified below). But the migration design is **incomplete on the hardest read sites** and undercounts the surface, so the guard (the AC-4 proof) cannot go green from the plan as written. Three findings.

## Verified OK (concrete checks)
- **Rebase is real & clean.** Branch base = `ac691bda` (AU13 #436); AU14 `#434`/`#437` are ancestors. Working tree clean. No reverted AU13/AU14 code; AU13 `work-service`/`routine-service` and AU12 stores coexist.
- **Read counts are exact.** `142` `.from(threads|messages|users)` roots (users 94 / threads 29 / messages 19); `routes/threads.ts` = 25. Audit is honest on the SELECT-root count.
- **AU13 guard is write-only** (`WRITE_METHODS = insert/update/delete`; header: "Reads stay legal (`.select`)"). A conversation-store READ of `items`/`artifacts` does **not** trip AU13's guard. §5b/§8b#4 claim confirmed — task-check #4 clears.
- **Guard extension is implementable.** `collectReferences`/`argIsOwnedTable`/`namespaceBindings`/`EXEMPT_FILES` scaffolding exists; type-only stays legal automatically (type exports are `Thread`/`Message`/`User`, not in `OWNED_TABLES`). The essential end-state reduces to "no non-exempt file value-imports `threads`/`messages`/`users`" — robust. No file currently both imports an owned table and locally shadows the name, so the naive "any Identifier in `tableIdents`" walk has no live FP (add a shadow fixture anyway).
- **In-tx read design sound** (`exec`-first-arg + `tx as HyperIdleDb`, matching `practice-meeting.ts`/`agent-session-requests.ts` lore). §8b#3 mitigation holds.

## FINDING 1 (BLOCKER) — audit omits ~15 raw-`sql` template owned-table references; they have no designed home
The audit counts only `142 .from + 6 joins`. It **misses 15 owned-table references embedded in `sql\`\`` tagged templates** across 7 files (`routes/{search,recipients,teams-routes,users,bets,threads}`, `services/cost-cap`). The extended guard's node-walk **will flag every one** (`${threads.participants}`, `${messages.payload}`, `${messages.deletedAt}`, `${users.id} IN (…)`, the `bets.ts` artifacts query's `${messages}` correlated subquery) — they are Identifier/PropertyAccess refs to import-bound table objects — so **the guard cannot reach zero findings until all 15 migrate**. Yet §3d/§3e/§5b give no function shape for "an owned-table column spliced into a WHERE fragment of a larger, non-owned-rooted query." Concrete cases with no home:
- `routes/search.ts:141-145,205` — `${threads.participants} LIKE …`, `${messages.payload} ILIKE …`, `${messages.deletedAt} IS NULL` inside the search query's WHERE.
- `routes/teams-routes.ts:967` — `${users.id} IN (sql.join(…))` roster predicate.
- `routes/recipients.ts:49` — `LOWER(${users.name}) LIKE …` recipient search.
- `routes/bets.ts:~1238` — artifacts list embeds a `messages`⋈`threads` correlated subquery **and** joins `threads`, on top of `artifacts`+`tasks`. This is not "artifacts⋈threads"; it touches **four** tables (2 Work, 2 Conversation).

The builder will hit these late (search/roster/bets are API-facing) with no pattern, and the likely improvisation — relocating whole search/roster/artifacts queries into the stores — creates far deeper cross-owner coupling than §8b admits. **Required:** re-audit including `sql\`\`` embeddings; state the real count; and design the pattern (e.g. store-exported `SQL`-fragment builders like `unresolvedReviewExists(threadId)` / `participantMatch(pattern)`, or an explicit decision to relocate the containing query + name the resulting coupling). Do not leave it to improvisation.

## FINDING 2 (must tighten) — projection/API-leak mitigation is advisory, not a rule
§8b#1 correctly names the highest risk (full-row getters leaking `email`/`systemPrompt`/`costActual`/harness secrets into responses) but the mitigation is "builder MUST audit each of the 38 … re-project in the caller **OR** add a projected store function." Caller-side re-projection means the full sensitive row is materialized then narrowed by hand at each site — error-prone exactly where it's dangerous. **Make it a hard rule:** any owned-table read whose result reaches an HTTP or tool response MUST go through a **projected store function returning exactly the response column set** — sensitive columns never leave the store. Reserve full-row getters for internal/logic reads. This converts a 38-site diligence gamble into a structural guarantee.

## FINDING 3 (must name honestly) — the cross-owner coupling is bigger than "2 joins"
§8b#4 frames the new coupling as two clean `items⋈threads` / `artifacts⋈threads` relocations. The `bets.ts` artifacts query (Finding 1) shows the real shape: relocating it makes **conversation-store own a query that reads `artifacts`, `tasks`, `threads`, and `messages`** — a Conversation module owning a Work-domain artifacts-list read. Either decompose (store returns only the `has-unresolved-review` SQL fragment; the artifacts query stays in `bets.ts` and imports no owned table) or accept conversation-store owning the Work query — but **pick one and name the true coupling**, don't label it a simple join.

## Minor
- Add a `--fixtures` case: a file that both value-imports an owned table **and** locally shadows the name, to pin the intended resolution (documents that end-state has zero such imports).
- `au13` guard is wired in `lint` **without** `--check` (bare invocation) while `au12` uses `--check`; confirm both default to check-and-exit-nonzero so neither silently no-ops. (Pre-existing; not AU12's regression, but the rework touches this line.)

**To approve:** address Findings 1–3 (re-audit + design the raw-`sql` sites, mandate projected store functions for response-bound reads, name the real cross-owner coupling). The rebase, count honesty, in-tx design, and guard-extension mechanics are sound.

---

# Rework critique — Round 2 (full-access reads+writes) — 2026-07-12

**Verdict: REVISE.** One finding. Round-1's three findings are all RESOLVED and verified against real source (not self-report). But the Finding-2 fix over-rotated: the new absolute projection rule contradicts current behavior at named sites and threatens AC-2. Round 2 of max 3.

## Verified RESOLVED (real-source spot-checks)
- **§5c raw-sql relocations preserve semantics.** `cost-cap.ts:239-241` → `incrementUserCost` keeps the atomic `set({ costActual: sql\`coalesce(${users.costActual},0)+${delta}\` })` — an in-place SQL increment, NOT a read-then-write, so the concurrency guarantee (@lore O2) survives. `cost-cap.ts:362-364` `coalesce(sum(...))` → `sumAllUserCost` scalar ✓. `recipients.ts:49` `LOWER(name) LIKE … ESCAPE '\\'` → `searchUsersByName` (caller keeps post-query kind filter) ✓. `search.ts:129-149` join + participant LIKE + payload ILIKE + `deletedAt IS NULL` + `orderBy(desc(lastActiveAt), threads.id).limit()` → `searchConversations` returning the exact projected `{id,hostKind,lastActiveAt,participants}` the route JS-filters ✓. `teams-routes.ts:961-972` `${users.id} IN (…)` → `getUsersByIds` (inArray) ✓.
- **Zero SQL-fragment leakage outside a store.** Read the two trickiest in full: `searchConversations` owns the whole join; `getArtifactThreadSummaries` owns all 4 correlated `${messages}` subqueries. No `SQL` object is returned to a caller. The "no fragment-builder needed" claim holds.
- **§8b#4 decomposition is coherent.** `bets.ts:1210-1239` really does touch 4 tables (artifacts+tasks Work, threads+messages Conversation via `leftJoin(threads, eq(threads.hostId, artifacts.id))`). `getArtifactThreadSummaries(artifactIds)` filtering `threads.hostKind='artifact' AND threads.hostId IN artifactIds` (plain-string ids) reproduces the leftJoin condition with zero artifacts/tasks reference; bets.ts keeps its Work half and merges by artifactId in JS. Absent-thread artifacts drop out (matches the current `threadId !== null` filter). A builder can implement this without conversation-store knowing Work shapes ✓.
- **Shadow fixture (m) correct** — local `const users=[…]` with no `@hyperidle/db` value-import ⇒ NO finding; pins import-binding over string-match ✓.
- **CLI-entry claim accurate** — `au13` guard lines 172-177: bare invocation runs `inspect()`, prints findings, `process.exit(1)` when >0. Check-and-exit by default confirmed ✓.

## FINDING (must fix) — the absolute projection rule breaks AC-2 at real, named sites
§8b#1 / §3d / §3e now mandate that response-bound reads go through a projected function AND that "sensitive fields — `email`, `systemPrompt`, `costActual` — are **never** exposed," with §6 step-3 tests asserting "sensitive fields ABSENT from the projected shapes." This over-rotates the round-1 fix (which correctly asked only for "exactly the response column set") into **security stripping**, and it contradicts current behavior:
- `routes/agents.ts:237-252` — `GET /` (public-data boundary) returns `systemPrompt: agent.systemPrompt` sourced from `select().from(users)`. The plan itself routes this through the projected getter (§5b line 375; §3e `getUserPublicProfile`). A projected getter that excludes `systemPrompt` **drops it from the response** → breaks the agent-config UI consumer → **AC-2 violation**. The step-3 test ("assert systemPrompt absent") would codify the regression.
- `routes/users.ts` PATCH returns `email`; `teams-routes.ts` surfaces `costActual` (toWireMoney) in roster/detail responses. Same tension.

AU12 is a **behavior-preserving** refactor (§2: "changes nothing the product does"); stripping fields a route legitimately returns today is a *different*, out-of-scope change — and per ETHOS security is not preemptive. **Required:** reframe the rule as *"each projected function returns EXACTLY the current response column set for its route — no more (blocks accidental new exposure, the real value), no less (preserves behavior)."* Drop the absolute never-expose list; where a route legitimately returns `systemPrompt`/`email`/`costActual` today, its projected function includes it. Fix step-3 test guidance to assert *projected shape == current response shape*, not "sensitive absent." If founder wants public routes to stop leaking `systemPrompt`, that is a separate scoped WP.

## Minor (non-blocking)
- `recipients.ts:51` `q===0` branch is a plain `select().from(users)` (list-all) — a §5b bulk read, not §5c; ensure the bespoke "list all users" store fn is named so this branch has a home.

**To approve:** reframe §8b#1/§3d/§3e/§6-step-3 to "exact current response column set" (behavior-preserving), not an absolute sensitive-field exclusion. Everything else — raw-sql relocations, zero fragment leakage, decomposition, guard mechanics, shadow fixture — is sound and verified.

---

# Rework critique — Round 3 (FINAL) — 2026-07-12

**Verdict: APPROVED.** 0 blocking. Round-2's single finding (over-rotated absolute projection rule) is RESOLVED, verified against real source below. This is round 3 of max 3 — **the critique loop is CLOSED; the plan is ready for the builder phase.**

## Round-2 finding — RESOLVED (verified against current code)
The corrected rule ("projected function returns EXACTLY the current response column set — no more, no less") is now behavior-preserving, not security-stripping. Confirmed at all three named sites:
- **`routes/agents.ts` GET `/` (lines 221-252):** response map returns `id, name, role, agentCategory, systemPrompt, harnessType, modelTierPreference, modelId, modelProvider, maxConcurrentSessions, status` (+ `activeSessions` merged from a `sessions` groupBy). `listAgentProfiles` (§3e) specifies exactly this set with `systemPrompt` INCLUDED and `activeSessions` correctly left as a JS-merged sessions join, not a users column. Exact match.
- **`teams-routes.ts` roster GET `/:teamId` (lines 770-777):** roster maps only `agentId(=users.id), name, role, agentCategory` (+ JS-derived `isLead` from `teamMembers.leadAgentId`). No `email`/`systemPrompt`/`costActual` from users. `listTeamMembersSummary` (§3e) excludes those correctly — behavior-preserving. Confirmed the route's `costActual` is `teamMembers.costActual`/bet cost (@lore line 1009), never `users.costActual`.
- **`routes/users.ts` GET `/:id` (`c.json({...user, skills})`), POST `/` (`c.json({user: created})`), PATCH `/:id` (`c.json(updated)`):** all return the full `users` row incl. `email`. Full-row `getUserById` (§3e) is the correct, behavior-preserving choice. Confirmed.

## Internal consistency — CLEAN
Full top-to-bottom re-read (3rd revision). No surviving "sensitive fields never exposed" / absolute-strip language; the sole "sensitive absent" occurrence (§8b#1, line 555) is the corrected negation ("assert projected shape == current response shape, **not** 'sensitive absent'"). §3d/§3e/§8b#1/§6-step-3 are mutually consistent on the no-more/no-less rule. The plan is a coherent, buildable spec covering: the two stores' full read+write surfaces (§3b-3e), the landed write migration (§5, unchanged), the ~148-site read migration (§5b), the 10 raw-sql relocations (§5c), the full-access namespace-aware guard with type-import exemption (§4), the four out-of-server named exceptions (§5a), and the cross-owner decomposition via `getArtifactThreadSummaries`/`getThreadIdsByHost` (§8b#4). Everything confirmed sound in rounds 1-2 (rebase, count honesty, in-tx `tx as HyperIdleDb` design, zero fragment leakage, shadow fixture, CLI check-by-default) remains unchanged.

**Critique loop closed (3 rounds). Plan approved — proceed to builder phase.**
