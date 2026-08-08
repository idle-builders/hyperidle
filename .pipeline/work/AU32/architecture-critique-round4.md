# AU32 — architecture critique, round 4 (focused verification of the P18 negative claims)

Scope per instruction: this round attacks only the class of claim Ruling D's rework rests on — the
negative claims of `feasibility.md` P18 / `architecture.md` D10 that no deletion mechanism exists for
`users`, `threads`, `knowledgeItems`, `items`, or the `agentRunConfig` cascade. Rounds 2/3 findings
stand as prior authority; Ruling D's overruling of round-3 B1 is the founder's decision and is not
re-litigated. Every command below was run fresh on this tree (base `bbe82e9a`, Node 24).

## Verdict

**APPROVED — every negative claim held under independent attack. No blocking findings.**
Two non-blocking inventory-precision defects (§N1, §N2), neither of which perturbs any conclusion.

---

## 1. The primitive premise ("every hard delete bottoms out in `db.delete(table)` or raw `DELETE FROM`")

Attacked the premise itself, not the enumeration. In this stack a row can only be removed via:

- **Drizzle `.delete(`** — independently re-enumerated over `layers framework applications`
  excluding development-named files: my hit list byte-matches P18 sweep 3. Every DB hit takes a
  **literal table identifier** — zero variable-table generic deletes, zero `= db.delete` /
  `["delete"]` / `.bind(` aliasing, zero `.batch(` anywhere. Prepared/`$dynamic`/`.returning()`
  variants all still originate at `db.delete(table)` and are therefore covered. Every non-DB hit is
  in-memory `Map`/`Set`/`URLSearchParams`.
- **Raw SQL via `db.execute`/`tx.execute`** — exactly 4 production sites, each read in full:
  `layers/core-api/knowledge/src/fts.ts:14/22/115` (DDL `ALTER TABLE ADD COLUMN` + `CREATE INDEX`,
  then a SELECT) and `layers/agent-orchestration/session-requests/src/service.ts:1030` (a SELECT
  feeding `tx.delete(agentWorkIntents)`/`explicitSessionStarts` — sweep-3 tables). Zero `sql.raw`
  in production; zero SQL `TRUNCATE` anywhere (all "truncate" hits are CSS classes, detector
  regexes, prose); zero PGlite `.sql\`` tagged templates.
- **PGlite client `.query`/`.exec`** — direct clients exist only in `framework/db/src/migrate.ts`
  (`:28/:38` — two SELECTs against the migrations meta table), `connection.ts` (no raw calls), and
  the dev-world eval runner. Desktop (`applications/desktop/src`) has no raw DB access (its only
  `execute*` is `webContents.executeJavaScript`); remote-worker deletes only in-memory handles.
- **Migrations** — 56 `.sql` files (count re-verified); `DELETE FROM`: 0; `DROP TABLE`: 4 files /
  5 statements, all retired tables (`responses`, `operation_outcomes`, `staged_operations`,
  `service_connections`, `factory_settings`) — none of the five. The one trigger in the corpus
  (`0007_thread_host_immutability.sql`) fires BEFORE UPDATE and only RAISEs — it deletes nothing.
  No `CREATE RULE`; no runtime `CREATE TRIGGER` in any `.ts` production file.
- **Out-of-sweep roots** — `deploy/` (outside every P18 root set) checked: shell scripts, helm
  chart, homebrew cask; its only "drop" hits are container capability drops. `framework/db`'s knip
  entry scripts (`migrate-pg.ts`, `bootstrap-pg.ts`, `seed-pg-cli.ts`, `strip-public-schema.ts`)
  contain zero delete/drop/truncate. `tools/` + `scripts/`: zero real `.delete(` DB calls (one doc
  comment).

**Premise holds.** No fifth primitive exists; the enumerations over the four that do are complete.

## 2. Route / tool / job / event reach

- **HTTP.** Seven `router.delete(` registrations exist (see §N1 — the plan says six):
  `org.ts:206` (orgEdges), `credentials.ts:242` (serverCredentials), `routines-routes.ts:186`
  (soft delete via `updateRoutine`), `agents.ts:481` (soft-retire via `updateUser` — no row
  delete), `filesystems.ts:325` (filesystems), `filesystems.ts:340` (filesystemInjections via
  `deleteInjection`), `connections.ts:339` (serviceConnections). No `app.delete(` or
  `.on("DELETE")` idiom anywhere. Non-DELETE verbs are closed structurally: any handler of any verb
  that removed a row would have to call a §1 primitive, and every primitive call site is attributed
  to a sweep-3 table — the POST /teams rollback (`teams-routes.ts:303` → `deleteTeam`,
  `team-lookup.ts:304-307`) is exactly the one such case and is the plan's acknowledged reachable
  mechanism.
- **Tools.** The catalog (`tool-definitions.ts:70-1527`) contains 22 tools (see §N2), all
  create/write/read/report-shaped; the MCP bridge (`mcp-bridge.ts:143`) registers only the
  role-filtered registry definitions — no dynamic side-channel. The one tool outside the catalog,
  `return_status` (`harness-registry/src/return-status-tool.ts`), reports status and touches no DB.
- **Jobs/events.** All reaper targets (`service-bootstrap.ts:513-539`, `credentials-reaper.ts`) are
  sweep-3 retention tables; event-reaction files delete only in-memory bus registrations — both
  re-confirmed via the §1 enumeration, which is the stronger closure.

## 3. `knowledgeItems` soft archive

`remove` (`knowledge-repository.ts:1496-1527`) read in full: `db.update(knowledgeItems).set({
status: "archived", ... })` + `knowledgeEditLog` INSERT + SELECT read-back. Never a row delete. Its
production consumer is `POST /:id/archive`. **No reaper can ever hard-delete archived items**: that
would require a `knowledgeItems` delete primitive, and §1 proves none exists anywhere in the
production world. Claim holds by construction, not just by inspection.

## 4. Cascades, including multi-hop — closed structurally

All 12 cascade FKs in `schema.ts` re-attributed against the `pgTable` ranges (:54, :113, :865,
:1011, :1052, :1255, :1258, :1288, :1291, :1437, :1461, :1742) — every one sits ON a child table
that is not among the five. The decisive stronger fact: **the five tables' own FKs are exclusively
RESTRICT or absent** — `users.teamId → teamMembers.id` restrict (:69), `teamMembers.teamId →
teams.id` restrict (:129), `items` → threads/users restrict (:804/:819), and `teams`, `threads`,
`knowledgeItems` carry **zero FKs at all**. A row is cascade-removed only if its own table has a
cascade FK to a deleted parent; none of the five does, so **no cascade chain of any depth can
remove their rows regardless of which parents production deletes** (including `teams`, which
production does delete). Migration SQL cross-checked for drift: every `ON DELETE cascade` in
`framework/db/drizzle/*.sql` matches the schema attribution; `0038`'s `DROP TABLE ... CASCADE` is a
retired-table drop. `ON DELETE SET NULL` sites null a column, never remove a row.

## 5. Positive controls

- Migration-population control verified live: the glob set reaches all **56** `.sql` files; DROP
  TABLE matches in **4** files; DELETE FROM in **0** — exactly as P18 states.
- `knip.json` read in full: `ignore` = test infra/fixtures/stories; `ignoreIssues` = one
  component's exports; several `entry` scripts exist (`migrate-pg`, `bootstrap-pg`, etc.) and were
  additionally checked for destructive SQL (zero hits). No deletion symbol is hidden, and none
  exists to hide: `agent-run-config-store.ts` exports exactly
  `AgentRunConfig`/`DEFAULT_AGENT_RUN_CONFIG`/`AgentRunConfigPatch`/`readAgentRunConfig`/
  `readAgentRunConfigs`/`writeAgentRunConfig` — no delete function, matching P18 verbatim.

## 6. `teamMembers` — the reachable case, and the one test that still dies

- Reachability re-proven: `deleteTeam` (`team-lookup.ts:304-307`, members at :305 then team at
  :306) ← sole production caller `teams-routes.ts:303`, the POST /teams zero-spec rollback.
- `foreign-keys.integration.test.ts:86-100` read: **zero `expect` calls**; the probe sits in
  `try { await db.delete(teamMembers)... } catch { /* Expected if FK exists */ }` — its own comment
  concedes both outcomes pass. It cannot fail. **Ruling B is the operative criterion**; the plan
  does not smuggle a reachable operation's test out under Ruling D — D1 explicitly reports the
  reachability and the live `users.teamId` RESTRICT (:69), records the now-untested constraint as
  an accepted cost (§6), and declines the rewrite Ruling B forbids. Correct on all three counts.
- The `agent-run-config-store` cascade test (:151-161) confirmed: arranges its own
  `db.delete(users)` — the operation P16/P18 prove production cannot perform. Ruling D reaches it.

## 7. Consistency checks (brief confirmations requested)

- **D10 vs the task list.** T0–T8 walked: every touched file is development-named
  (`__tests__`/`__scripts__`/`.test.ts`), in `tools/`, `scripts/`, or `governance/` — zero
  shipping-root production files, and no task touches `schema.ts` or `framework/db/drizzle/`. The
  ship-time diff check + verify obligation is named in the evidence table. Consistent.
- **AC-6 counts.** Committed baselines re-read: unit 6203 passed
  (`probes/test-baseline-full.txt`), service 2835 passed / 4 skipped
  (`probes/test-baseline-integration-service.txt`). `foreign-keys` has exactly 10 `test(` blocks
  (8 deleted + 2 kept); deletions = 8 + 1 (`agent-run-config-store`) service, 1 unit
  (`migrate.test.ts` seed test), additions = 2 unit (D9). 6203 − 1 + 2 = **6204**;
  2835 − 9 = **2826**. Arithmetic and enumeration agree.
- **Governance counts.** Live lint re-run this round: `221 production + 67 development`, 7
  development groups — identical to P1/round-3. The 67 clears sum exactly:
  61 table-write (D1/D2/D3) + 3 `layer → db:schema-ns` (D4) + 1 `tooling → db:schema-ns` (D4) +
  1 `application → db:unknown` (D5′) + 1 `tooling → raw runtime` (D6′) = 67. Production 221
  unchanged: no production file in the diff, and D6′'s production delta was measured `+0` (P15,
  round-3 N3 verified the code-path separation).
- **Rounds 2/3 sound items unperturbed; N1 fix.** Census identical; cascade facts re-read from
  schema; `deleteTeam` sites re-read; knowledge `remove` re-read. Round-3 N1's fix is correctly
  landed: `governance-crossings.test.ts:532` does cast `} as unknown as Architecture` — P15 now
  states the compiler will NOT surface the field deletion and T7 edits the literal by hand.

---

## NON-BLOCKING DEFECTS

### N1 — P18 sweep 5 undercounts the DELETE-route inventory: seven registrations, not six
`layers/agent-orchestration/src/routes/filesystems.ts` registers **two** DELETE handlers: `:325`
(`/:id`, in the census) and `:340` (`/:id/injections/:agentUserId` → `deleteInjection` →
`filesystem-registry.ts:80`, `filesystemInjections`), which sweep 5 does not list. The underlying
mechanism IS in the delete census (P16, sweep 3), the handler deletes only a sweep-3 table, and no
conclusion moves — but an enumeration presented as exhaustive missed a member, which matters on a
plan that rests on enumeration credibility. Fix is a one-line correction to P18 sweep 5
("six" → "seven", add the `:340` handler and its subject).

### N2 — P18 sweep 6's tool count label is off by one, and one out-of-catalog tool goes unnamed
The catalog holds **22** tools; P18's own name list has 22 entries but labels it "21 tool names."
Additionally `return_status` (`harness-registry/src/return-status-tool.ts:110`) is a real tool
registered outside `tool-definitions.ts`; it is status-reporting only with no DB access, so the
"zero deletion-shaped tools" conclusion stands, but the sentence "the complete tool catalog is
tool-definitions.ts" is not quite the complete tool surface. One-line correction each.

---

## What convinced me (for the founder)

The safety of deleting the nine tests does not rest on any single grep. It rests on two
independent structural facts, both now verified twice (P18 + this round, different searches):

1. **No removal primitive touches the five tables anywhere in the production world.** The complete
   set of ways this codebase can remove a row — literal-table Drizzle deletes, four raw-execute
   sites, two PGlite meta-queries, 56 migration files — was enumerated from the primitives up, with
   the wrapper layer (routes, tools, reapers, events, deploy scripts) closed by the fact that any
   wrapper must call a primitive, and every primitive call site is attributed elsewhere.
2. **No cascade of any depth can ever remove their rows**, because the five tables' own FKs are all
   RESTRICT or nonexistent — a property of the schema itself, independent of what code does.

The one reachable deletion (`teamMembers` via `deleteTeam`) is kept with its two live tests; the
one test of it that dies could never have failed. The removal branch being empty is correctly
reported as a finding, not manufactured into work. **APPROVED.**
