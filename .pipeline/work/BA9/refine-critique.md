# BA9 — Refine critique (independent, read-only)

Re-tested against the tree at `dc8d1cbd7` (branch `claude/pipeline-ba9-70ec81`), opening the files
rather than trusting the requirements' citations.

## Verdict on the eight headline claims: all eight hold

1. **No restart needed — TRUE.** `layers/core-api/routine/src/routine-scheduler.ts:766-812` subscribes
   once per member of `EVENT_TYPES` (a compile-time constant) and on delivery calls
   `listRoutines(db, { triggerType: "event", eventType, active: true })` at `:776-780`. Clock tick
   re-reads with `listRoutines(db, { active: true })` at `:889`. The subscription set cannot go stale.
   `plan.md:145-149` is wrong; the requirements is right.
2. **Practice communities are live — TRUE.** `session-knowledge-assembler.ts:305-311` fetches L3 scoped
   by `communityForRole(input.agentRole)`; `run-orchestration/src/context.ts:271,494` substitutes it into
   the persona. Catalog communities `building | product | growth | ops`
   (`framework/domain-model/src/agent-roles.ts:51-194`); the seed's five are
   `build, product, growth, ops, facilitation` (`factory-state.ts:33-47`). `plan.md:17-18` is wrong
   about the communities.
3. **No skill entity — TRUE.** No `skills` table (`framework/db/src/schema.ts:103` records the drop), no
   skill route, and `bet_retro`/`portfolio_retro` appear in exactly one file repo-wide: the requirements
   itself.
4. **The per-team fix came from `scope`, not the owner-agent change — TRUE, and this matters most.**
   `routine-scheduler.ts:116-133` defines `scope: "team" | "once"`; `:194-196` computes
   `spec.scope === "once" ? spec.id : ${spec.id}:${teamId}` and `:215` writes with `onConflictDoNothing`.
   Removing `routines.teamId` alone would not have stopped duplication — `provisionTeamRoutines` is still
   called once per team. **`.pipeline/BA.md:53` asserts the opposite and is wrong.**
5. **Both carve-out tables gone — TRUE.** `knowledge_app_projection` at `schema.ts:915`;
   `DROP TABLE "task_planning_signals"` at `0057_AU43_drop_five_tables.sql:37`.
6. **Config tables provision nothing — TRUE in substance** (one factual error, see B1).
   `listConfiguration`/`writeConfigurationOverride` have one consumer:
   `agent-behavior-config-impl.ts:74,89,104`.
7. **Contradiction detector dead — TRUE, for a stronger reason.** `promotion-pipeline.ts:319-321`
   short-circuits on `forbids.length === 0`. The real proof: `meta` has exactly one writer,
   `knowledge-repository.ts:253` (`meta: input.meta ?? null`), and no route or agent tool supplies
   `input.meta` — so `meta` is null on every production row and both `claims` and `forbids` are always
   absent.
8. **The lock was never enforced, the warning is backwards — TRUE.** `routes/agents.ts:321-357` rejects
   only `role === "system"` and `systemPrompt` on `ast-*`; no category check.
   `factory-run-config.ts:82-84` overwrites harness/model/maxSessions and `:92-97` overwrites
   `systemPrompt` for any role with a template (`facilitator` has one at `:31`), through
   `onConflictDoUpdate` at `agent-run-config-store.ts:152`.

---

## BLOCKING

### B1 — "Nothing writes a `plugins` row" is false, and it is stated as re-verified

`requirements.md:100-102` (§1.6). But `framework/db/drizzle/0044_AU2_plugin_configuration.sql:36-38`
inserts `('builtin', 'HyperIdle Built-ins', '0', 'enabled', ...)` with `ON CONFLICT DO NOTHING`.

Every install has one `plugins` row, `id='builtin'`, `state='enabled'`, and `plugin-configuration.ts`
branches on it (`originFor` stamps `type: "builtin"` when `plugin.id === BUILTIN_PLUGIN_ID`,
`framework/domain-model/src/configuration.ts:16`).

Blocks because: the intake shares an id space with a reserved sentinel, and any "installed plugins"
surface will list `HyperIdle Built-ins` unless it filters. Related: `requirements.md:164-165` attributes
the empty settings pane to "zero plugin rows" — it is empty because there are zero
`plugin_configuration_defaults` rows, a different fact.

### B2 — §3.9 misreads the audit: merge and split were marked PLUGIN, not dead

`requirements.md:441-442` claims audit rows 58/59 are `DEAD`, and `:449` calls them "convicted as dead on
their own merits by both destroyers."

The audit (tag `au20-audit-evidence`, `.pipeline/work/AU20/destroy/FULL-AUDIT.md`, lines 104-106 and
366-369) has two columns:

    | 58 | POST /api/knowledge/:id/merge | DEAD | PLUGIN | Librarian ceremony -> plugin, per Ruling 3 |
    | 59 | POST /api/knowledge/:id/split | DEAD | PLUGIN | Same |
    | 61 | POST /api/knowledge/:id/flag  | DEAD | PLUGIN | Flag-for-review ritual -> plugin |

`DEAD` is the caller-trace status. The **verdict** is `PLUGIN` on all three. Neither destroyer convicted
them; both routed them here. And `.pipeline/work/AU44/FEATURE-LEDGER.md`, under "A scope breach worth
recording", says: merge/split/flag "were deleted although all three carried PLUGIN verdicts — explicitly
out of scope for both passes... Track BA must rebuild these rather than relocate them."

Blocks because: §8's founder question 1 presents the record backwards. (§3.10's flag quote *is* accurate
— audit rows 3 and 27 do carry DELETE with "dead door end to end". The audit is genuinely split on flag;
it is not split on merge and split.)

### B3 — Marking `POST /:id/recompute-attention` TRAVEL breaks a live agent tool, unstated

`requirements.md:351-353` sends the recompute door out with the plugin. That route is the seam behind
`score_attention(mode: "recompute")`:

- `layers/core-api/src/routes/knowledge.ts:700-704` — the route, commented as the collapsed helper
- `core-api-port-composition.ts:790-796` — `recomputeAttentionScoreForItem` posts to it
- `tool-handlers/src/tool-definitions.ts:722` — the tool's recompute branch calls it

The requirements keeps `score_attention` and never states its recompute mode must go with the route. A
builder following §3.5 removes the route and leaves a tool mode failing at the seam for every agent. The
audit priced this — tool table row 11: "SIMPLIFY. Survivor: knowledge_item override only, one mode...
`recomputeAttentionScoreForItem` port member dies." Say that, or keep the route.

### B4 — The AC "their seed rows are gone" has no answer

`plan.md:222-223` requires `BUILTIN_ROUTINE_IDS`, `fireBuiltinRoutine`, the builtin specs **and their
seed rows** are gone. `requirements.md:754` maps that AC to §3.13, a list of code symbols only. Nothing
says what happens to the `builtin:*` rows already in `routines` on every existing install.

Not a formality: `routine_runs.routineId` references `routines.id` with `onDelete: "restrict"`
(`schema.ts:636-638`) — which the requirements identifies at §2.6 for plugin removal and never applies to
the builtin rows. Any install where a retro ever ran cannot hard-delete them. Migration shape
(soft-delete via `deletedAt`, or `active: false`) is undecided.

### B5 — §1.4, §3.1, §4.4 and §6 recommend a configuration the document says will not work

- §1.4 (`:64-74`): a routine owned by a team-less agent gets `team: null, knowledge: []` — confirmed at
  `routine-service.ts:465-491`.
- §3.1 (`:257-260`): the plugin provides **one** global agent owning the upkeep routines.
- §4.4 (`:632-633`): that agent has `ownerUserId` and `teamId` both null.
- §6 (`:733-734`): a global knowledge query for team-less owners is a **non-goal**.
- §7 (`:748`): the AC "an installing team gets working retros and knowledge upkeep" is "Blocked on §1.4".

Together: the recommended plugin ships routines that provably run with an empty knowledge bundle, and the
only named fix is out of scope. Post-bet retro is sharper — today it is `scope: "team"` owned by a team's
`product_manager` (`routine-scheduler.ts:134-142`) and its body reads the shipping bet's team. Owned by
one global agent it loses both. Either the plugin ships a per-team agent for the retro, or the resolver
learns a global query, or the AC is knowingly deferred — pick one.

### B6 — Accepting an agent run on every bet state change is a founder decision

`requirements.md:377-380` concludes the plugin's retro routine "fires on every bet state change" and
recommends the prompt filter it. Correct about the mechanism (`routine-scheduler.ts:776-780` matches on
event type only), but it silently changes behavior: today `registerBuiltinRoutineHandlers` runs the retro
only on `toState === "completed"`; after, every draft->active, active->completed, any->killed transition
starts an agent session that reads the bet and decides to stop. Real spend and real noise on a shared
backend. §8 lists two founder questions; this is not one of them.

### B7 — Dropping the "Draft with AI" button is outside the plan

`requirements.md:399-403` and the summary table at `:513` mark the draft button DROP. `plan.md` scopes the
rituals *leaving core*; the requirements' own verdict is that the human bet-retro pane is **CORE**.
Deleting a shipped user-facing control inside a core surface is covered by no AC, and is not covered by
the plan's delegated open question, because this one is not travelling anywhere.

The evidence is right — `routes/bets.ts:625-631` says it is a stub and `:652-686` composes strings with
no model call. But the call belongs in §8, not in a verdict table.

---

## Non-blocking

- **N1 — §3.13's "all of it goes" list is incomplete.** Two live builtin surfaces missing: the dispatch
  branch at `services/routine-scheduler-bindings.ts:167-190` (`extractBuiltinKind` -> `fireBuiltinRoutine`),
  and `tools/eval/src/scenarios/builtin-routines.ts`, which will not compile once the specs go. The AC
  covers them; the list reads as exhaustive and is not.
- **N2 — DOC-CLASS misses one doc.** `docs/knowledge-architecture/sync-and-conflict-resolution.md:51`
  describes `detectLayerContradiction` as live and "Enforced at promotion time", with file:line
  citations. Dropping the detector makes it false.
- **N3 — audit citations cannot be followed from the tree.** §3.2 cites "audit line 3271" and §§3.5/3.9/
  3.10/3.11/3.12 cite rows by number with no file named. The audit is not on `main` — it lives on branch
  `pipeline/AU44` and at tag `au20-audit-evidence`. Citations are accurate (line 3271 is exactly the
  `COMMUNITY_DISPLAY_NAMES -> PLUGIN` row); name the tag.
- **N4 — the community-mismatch argument is understated.** The seed's `community` field is used only to
  build the display name (`factory-state.ts:96`). All five rows carry `role: "facilitator"`, and
  `communityForRole("facilitator")` returns the `"ops"` fallback — `facilitator` has no catalog
  `community` entry (`framework/domain-model/src/__tests__/agent-roles.test.ts:160`). All five resolve to
  the same community even if they owned anything. Strengthens the DROP.
- **N5 — the wildcard-subscription AC gets one line.** `requirements.md:756` confirms
  `start-runtime.ts:327` is the only `eventBus.on("*")` caller, but nothing examines what "an explicit
  infrastructure-only capability" would look like on the bus. Every other AC gets a section.
- **N6 — §3.8's reason for portfolio retro being unreachable is thin but the verdict holds.**
  `resolveHostRoute("factory")` returning null (`host-route.ts:38-39`) only means no link back to a host
  page. The stronger fact: the thread's participants list is `[routine.ownerAgentId]`
  (`routine-scheduler.ts:337`) — an agent — so no human's principal-scoped `GET /api/threads` includes it,
  and its `items` row is a `kind: "review"` row with no bet, unreachable from `ReviewPage`.

---

## What holds up

The document adds no outcome, and answers both items `plan.md` lists as open rather than dodging them.
Eight of eight headline claims survived independent re-testing. It correctly contradicts `plan.md` in
three places where the plan is stale, and correctly contradicts the track registry on the per-team fix —
that one would have produced a real bug if inherited. It surfaces the genuine founder calls instead of
deciding them, which is the right instinct even though B2 shows the record behind question 1 needs
correcting. The ritual inventory's CORE verdicts — practice communities, the attention column and session
ranking, the human bet-retro save, the manual promote door — were spot-checked and each is load-bearing
exactly as described.
