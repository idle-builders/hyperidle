# AU32 — architecture critique, round 3 (post-gate rework)

Artifacts: `architecture.md` / `schema-test-decision.md` / `feasibility.md` (P15–P17) as reworked
after the three founder rulings (`founder-rulings.md`, 2026-08-08). Prior authority:
`architecture-critique-round2.md` (APPROVED). Every load-bearing claim below was re-verified
against the live tree at base `bbe82e9a`, including an independent production-deletion sweep, an
independent dead-test sweep with patterns P17 did not use, and a live governance-lint run.

## Verdict

**BLOCKED — one blocking finding.** The rework is excellent where the rulings actually reach:
Ruling A's rule relaxation is sound and completely pinned (§N3), Ruling B's three dead items are
genuinely dead (§N5), the P16 census is factually correct (§N4), and the :114 rework is honest
(§N2). What blocks is the deletion chain: nine live, functioning constraint tests are deleted
under a criterion — "production has no code path that performs the probed operation" — that none
of the three rulings establishes, that the amended AC-3's own justification clause cannot carry,
and that removes the only executable guard on seven shipped schema properties. Six of the nine
deletions clear zero lint sites and are therefore also outside the work package's scope.

---

## BLOCKING

### B1 — Nine live tests deleted under a criterion the rulings do not establish

The plan deletes ten tests plus one assertion line. Three are sound (§N5). The other nine —
`foreign-keys.integration.test.ts` :117-128, :130-161, :163-184, :186-199, :207-241, :245-277,
:284-341, and `agent-run-config-store.integration.test.ts` "deleting the agent cascades the config
row away" (:151-161) — ride a chain the planner built: Ruling C → production never deletes
users/threads/knowledge items/items (P16, true) → therefore a test probing such a delete arranges
a development-only scenario → delete under Ruling B. That chain fails at five points:

**(a) It conflates two different claims.** Ruling B's criterion is a test that **cannot fail**
("dead tests just delete"). Every one of the nine can fail today, against production artifacts:
drop or flip `knowledgeEditLog.itemId` RESTRICT (`schema.ts:920`), `knowledgeConflicts.itemId`
RESTRICT (`schema.ts:950`), `messages.threadId` RESTRICT (`schema.ts:778`), `items.threadId`
RESTRICT (`schema.ts:819`), `sessions.agentId` RESTRICT (`schema.ts:256`), `routines.ownerAgentId`
RESTRICT (`schema.ts:214`), or `agentRunConfig.agentId` CASCADE (`schema.ts:113`) — and the
corresponding test goes red. "Production never performs this operation" and "this test cannot
fail" are different claims; only the second is a deletion criterion in the rulings. The plan's own
label — "Ruling C→B" — concedes B alone does not reach them.

**(b) Ruling C's verbatim words govern arranged states, and every arranged state here is
production-producible.** The founder's words: "if a team cannot exist without a memeber in
produdction also a test should not create and test that scenario" — the offence is **creating** an
impossible state. An item plus its edit-log rows plus (after the companion lands) its projection
is a state production reaches routinely; the team pair via `seedProductTeamBetTaskAgent` (which
writes the full pair, `foreign-keys:40-43`) is complete; users/threads/items have no companion
group at all. The only thing production does not do is the probed *operation* — and extending
"scenario" from the state a test creates to the operation it probes is the planner's inference,
not the ruling's text. Decisive detail: the ruling's own recorded operationalization places the
delete-the-test option **inside the over-determination resolution** ("Where completing an entity
makes an assertion over-determined … or, if production has no path that performs the operation the
test probes, the test is … deleted", `founder-rulings.md:90-93`). Not one of the nine is
over-determined: the knowledge companion is `onDelete: "cascade"` (`schema.ts:1011`, P2 — it
cannot cause a rejection), and six of the nine receive **no new companion at all**. Zero of the
nine reach the deletion branch through the ruling's own recorded pathway. The one test that IS
over-determined (:102-115) is resolved the other way — sole-cause rework — correctly.

**(c) Six of the nine clear zero lint sites — deletion beyond approved scope.**
`probes/lint-development-sites.txt:8-11` shows `foreign-keys`'s only flagged sites are
:210/:233/:248/:270 (the knowledge pair). The user/thread/item deletion tests (:117, :130, :163,
:186, :284) and the `agent-run-config-store` cascade test are not violations of anything — the
seeder's `teamMembers` write credits the file, and users/threads/items are ungrouped. No AC
requires touching them. Their deletion is material work no ruling verbatim mandates and no AC
covers, and it forces the plan's self-granted "derived amendment" of AC-6 (2835 → 2826) — an AC
change no ruling authorizes (the rulings amend AC-2 and AC-3 only).

**(d) The amended AC-3 cannot justify them.** The founder's amendment: "A changed or deleted
assertion must be justified in the diff by **the impossible state it depended on**"
(`founder-rulings.md:98-99`). None of the nine depends on an impossible state. Contract C1 quietly
adds a second justification currency — "or the missing production path (the P16 evidence)" — which
is the plan widening the founder's amendment to fit the deletions it wants to make.

**(e) The coverage loss is total, and nothing else would notice.** Independently verified: no
other test in the repository deletes `threads`, `knowledgeItems`, or `items` (repo-wide `rg` over
all worlds — zero hits outside `foreign-keys`); only two untouched files delete `users`
(`hint-progress:99`, `P2-org-edges:248`, covering *their* cascades only); drizzle-kit snapshots
follow `schema.ts` and provide no independent oracle (regenerate a migration after flipping an
`onDelete` and everything is consistent-and-green); no governance rule reads FK actions. After the
deletions, a migration that flips RESTRICT→CASCADE on the audit FKs — the tests' own header calls
this the "audit must outlive its subject" contract (I3 review HIGH-2, `foreign-keys:25-28`) — or
CASCADE→RESTRICT on `agentRunConfig.agentId`, ships green through every lane. These constraints
are shipped production artifacts whose entire purpose is to hold against operations production
does not *currently* perform. The work package's stated purpose is "a green suite means the code
works on states that can occur" (plan.md); deleting the only guards on seven schema properties
hollows that purpose out rather than serving it.

**And the plan presents this as closed.** D1: "ZERO founder rulings left open." A contested
extrapolation with this blast radius is precisely what must go back to the founder as a choice,
with the accepted-costs list of architecture §6 in front of him — not ride through as arithmetic.

**The alternative that satisfies all three rulings without the nine deletions:** clear the four
knowledge lint sites (:210/:233/:248/:270) by adding the cascade projection companion — the shape
round 2 already APPROVED, with P2 proving the companion cannot mask the probed rejection and
assertions byte-identical; leave the user/thread/item tests and the cascade test untouched (they
have no lint sites, and every entity they arrange is either seeded complete or has no companion
group, so Ruling C's no-partial-entity demand is already met); keep the three genuine Ruling-B
deletions (`migrate` seed test, `foreign-keys:86-100`, `knowledge-access:172` line); keep the :114
sole-cause rework as planned. Result: AC-1/AC-2/AC-4 evidence identical, AC-3 needs no widened
justification clause, AC-6 nets only the one dead-test deletion (service 2834, unit 6204), and
every constraint guard survives. If the founder affirmatively wants operation-level reachability
applied to test probes, that is a new explicit ruling to record — with the §6 cost list attached —
not a consequence to derive.

---

## NON-BLOCKING DEFECTS

### N1 — P15 misstates the crossings-literal pin as a type break
`governance-crossings.test.ts:525-531` casts its synthetic architecture `as unknown as
Architecture`; deleting `oneDoorSurfaces.rawRuntime` from the interface will **not** type-break it
(the double cast suppresses excess-property checking). Harmless — the edit is scheduled anyway
(D6′/T7) — but the claim "type-breaks when the field is deleted" is false and a builder relying on
the compiler to find this pin would miss it.

### N2 — the :114 rework under-argues its own honesty
The plan defends the owner-order membership removal as "the intermediate state the production
operation itself produces." Stronger and verifiably true: `deleteTeam` is **non-transactional**
(`team-lookup.ts:304-307`, two sequential awaits on `db`) — if the team delete at :306 rejects on
the bets FK, the membership deletion at :305 has already committed, and production **durably**
produces a member-less team in exactly the scenario this test probes. The act-time state is not
merely transient; it is a persistent production-reachable state. The rework is honest and is not
Ruling 16 in disguise — the arranged entities are complete and the transition is production's own
operation order. Two consequences worth recording: (i) put the non-transactionality fact in the
planned comment/`@lore`, it is the actual proof; (ii) note the tension — this same
state-reachability logic (arranged states reachable, only the operation absent) applies equally to
the nine tests B1 defends, which is further evidence the deletion criterion is operation-level,
not state-level, and therefore not Ruling C's.

---

## VERIFIED SOUND (report what works)

### N3 — Ruling A / D6′: correct, complete, production provably untouched
- The `guarded` arm exists as claimed (`governance-model.ts:370-375`); removing it drops
  development raw-runtime crossings to `development-may-arrange-the-world` (:392-397). Production
  cannot move: `relaxForDevelopment` runs only for the development world and the production branch
  `hold-one-runtime-door` (`governance-model.ts:259-261`) reads `arch.rawRuntime.host`
  (`architecture.json:123-127`), not `oneDoorSurfaces`.
- **Pin enumeration is complete.** Independent grep for `oneDoorSurfaces` finds exactly: the model
  arm (:370-375), the interface field (:124+), `architecture.json:128-135` (`"rawRuntime": true` +
  `rawRuntimeNote`), the crossings literal (:526-531), `governance-model.test.ts:567` (a spread —
  survives the field deletion unchanged), and `governance-registry.ts:93` (reads `.surfaces` only
  — unaffected). `decided-rules.json` holds exactly four `"raw runtime"` rows (grep: 1056, 1068,
  1368, 1380); the two development-`forbidden` rows are the two the plan flips; the owner rows are
  already allowed/allowed. `governance-model.test.ts:400-421` ("BOTH worlds") is the standing test
  the plan rewrites; the `raw-runtime-in-a-test` attack (:349-363) is the one that flips;
  `governance-fixtures.ts` contains no raw-runtime case. No missed pin found.
- **No leak to the database door:** the surface arm (`db:schema-ns`, `db:util`, `db:unknown`,
  `framework/design-system`) and the companion table arm remain in `guarded`; D4 correctly still
  fixes the four hand-rolled clients. The three production raw-runtime attacks (:295-340) and
  their clean controls stand untouched.
- The relaxation is genuinely world-derived — the founder's words are a world-level statement
  ("Only production cases all have to go through the same seam for AI requests"), so a future
  development file constructing an SDK directly is sanctioned, and the flipped attack pins that
  as deliberate. Live lint at base re-confirmed: `221 production + 67 development`, 7 development
  groups, matching P15's "before" leg exactly.

### N4 — P16 is factually right (adversarially spot-checked)
Independent sweeps over the shipping roots: every production Drizzle `.delete(` matches the census
list exactly (no `users`/`threads`/`knowledgeItems`/`items`/`bets`/`tasks` among them); raw SQL —
zero DML deletes (`fts.ts` is DDL, `session-requests/service.ts:1030` is a SELECT); migrations
contain only `DROP TABLE` of retired tables (`responses`, `operation_outcomes`,
`staged_operations`, `service_connections`, `factory_settings`) — no row deletes of live tables;
the agents DELETE route soft-retires (`agents.ts:480-497`); all 12 cascade FKs re-attributed from
`schema.ts` — none can remove a row of the four tables. The census is correct. What blocks in B1
is the *criterion built on it*, not the facts.

### N5 — the three Ruling-B deletions are genuinely dead (re-swept with wider patterns)
`seed` is not exported by `framework/db/src/index.ts` (only `seedDemoWorld`/`applyFactoryBootstrap`
— verified), so `migrate.test.ts:62-69`'s mock can never be invoked; `foreign-keys:86-100` has
zero `expect` calls and an outcome-tolerant catch (:97-99); `new Date(…)` never throws
(`knowledge-access:172`), and that test keeps four live assertions. My own sweep over the 40
lint-listed test files with patterns P17 did not use — `.skip`/`.only`/`.todo`/`skipIf`,
literal-subject expects, empty catches — found **nothing beyond P17's three** (the only empty
catches are the two known ones; `migrate.test.ts:96-101` is a legitimate expected-throw guard
followed by a live assertion at :101).

### N6 — AC-6 arithmetic checks
Under the plan's deletions: unit 6203 − 1 + 2 = 6204; service 2835 − 9 (8 `foreign-keys` + 1
`agent-run-config-store`) = 2826 — internally consistent (`foreign-keys` has exactly 10 tests, 8
deleted). Under B1's alternative: unit 6204, service 2835 − 1 = 2834.

### N7 — nothing round 2 verified was perturbed
Live census identical (221+67, 45 files, 7 groups); cascade fact (`schema.ts:1011`) and
`teamMembers.teamId` RESTRICT (`schema.ts:129`) re-read; `seed-then-migrate` untouched;
D2/D3/D4/D7/D8/D9, `seedBase` mechanics, `session-requests:59`, and the N1–N4 closures carried
unchanged in the rework text. `governance/README.md` contains no raw-runtime both-worlds sentence
(the architecture's "None found" holds; its builder-time re-check is fine).

---

## Summary of required change

Reduce the deletion set to the three Ruling-B items; clear the four knowledge lint sites by
companion (round-2 shape, P2-proven safe); drop C1's "missing production path" justification
currency and the AC-6 "derived amendment" down to the one dead-test deletion — **or** obtain an
explicit founder ruling that test probes of production-absent operations are themselves
development-only scenarios, recorded with the seven-constraint coverage cost of architecture §6 in
front of him. Either path unblocks; the plan may not choose the second silently.
