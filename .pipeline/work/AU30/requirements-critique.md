# AU30 — Refinement critique

**Phase:** refine-critique (read-only). **Target:** `.pipeline/work/AU30/requirements.md`.
**Authority:** `.pipeline/work/AU30/plan.md`; `governance/README.md` for what the rules mean.

**Verdict: BLOCKED** — three findings must be fixed before `/architecture`. None of them overturns the
`sessions` recommendation; all three are places where the evidence, the verification method, or the
scope arithmetic will mislead the next phase.

---

## 0. What I re-ran, and what it produced

Every load-bearing number in the artifact was reproduced independently in this worktree by editing
`governance/table-owners.json`, running `npx tsx scripts/governance-lint.ts`, and reverting with
`git checkout`. `git status` is clean of tracked modifications afterwards.

| measurement | artifact claims | I measured | result |
|---|---|---|---|
| baseline production | 191 across 60 files, 23 groups; 0 development | 191 / 60 / 23; 0 development | match |
| table crossings in the 191 | 100 (89 unowned + 11 other) | 100 (89 + 11) | match |
| per-table split | `sessions` 14/22/13=49, `propagationLog` 4/1/8=13, `taskDispatchAttempts` 3/3/5=11, `userSkills` 3/5/1=9, `agentRunConfig` 1/2/1=4, `teamRunConfigDefaults` 1/1/1=3 | identical | match |
| Shape A (six owners, `sessions`→`run-orchestration`) | 191 → 117 | 117 | match |
| Shape B (`sessions`→ any other service) | 191 → 147, exactly +30 | 147; the 30 are 10 imports + 10 reads + 10 writes, every one inside `run-orchestration` | match |
| hard errors introduced by naming owners | 20 | 20 | match, file-for-file |
| error distribution (§5.1) | `sessions` 14 (`routes/sessions.ts` 9, `routes/agent-orchestration-sessions.ts` 4, `session-stream-hub.ts` 1); `userSkills` 5 (`routes/users.ts` 4, `routine-scheduler-bindings.ts` 1); `propagationLog` 1 | identical, line for line | match |
| development world after the registry edit | 0 | 0, in both shapes | match |
| correcting the two stale registry entries | clears 10 sites | 117 → 107 | match |
| remaining after registry edit | 46 table crossings (26 warn + 20 error) | 26 warn + 20 error = 46 | match |

The artifact's §10 method note is accurate. This is the strongest part of the document: the counts are
not remembered, and they survive re-measurement without a single discrepancy.

---

## BLOCKING

### B1 — AC #4's stated verification cannot fail on the property AC #4 asserts

**Where:** `requirements.md:275` (§6, row 4) and `requirements.md:288-289`.
**Governing authority:** `plan.md:50` (AC #4 — "fail the build in both directions on any new
violation"); `CLAUDE.md` First Principle (each criterion needs a verification method that can go red).

The artifact names two proofs for AC #4 and leans on the second: *"key absence is the enforcement;
`governance-lint --attacks` proves each rule still bites (a registered rule with no attack case fails
the build)"*, and §6's closing note calls the attack harness *"the honest proof"*.

The attack harness cannot see severity at all. `scripts/governance-lint.ts:155-160`:

```
// An overlaid tree has no debt, so the crossing rules judge it against nothing — every crossing
// on an attack overlay is an error, whatever a live severity declaration would say.
...crossingRules({ ..., severityOf: () => "error", ... }),
```

`--attacks` passes on `origin/main` **today**, with all ten table keys still at `warn`. It proves the
detector fires; it says nothing about whether the build fails. A check that was already green before
the change it exists to prove is not evidence for that change.

The first proof named is the correct one and the artifact should stand on it alone: the live run
resolves severity as `severity.severity[ruleKey] ?? "error"`
(`scripts/governance-lint.ts:229-230`), so the key's **absence** from `rule-severity.json` is the whole
of "fails the build". I verified this end to end — with owners named and the keys still present, the
run reported 20 `ERROR` lines and exited FAIL, entirely because
`layer → db:table (other) [table:read|table:write] production` are absent from the file.

**What has to change:** §6 row 4 and the closing note must stop presenting `--attacks` as proof of the
severity property. State absence-from-`rule-severity.json` as the enforcement, and keep `--attacks`
where it belongs — proof that the detector still recognises the crossing.

### B2 — "sole terminal-state writer" is quoted without the qualifier the code carries, and one of the three reasons for the owner rests on it

**Where:** `requirements.md:105` (§3.2 evidence column) and `requirements.md:154-156` (§3.3 reason 2).
**Governing authority:** `plan.md:28` — the `sessions` owner needs design-it-twice applying AU26's own
test; the founder rule "verify against code, not docs".

§3.2 records `run-orchestration` as *"the declared **sole terminal-state writer**
(`layers/agent-orchestration/src/routes/sessions.ts:107-117`)"*, and §3.3 reason 2 builds on it: *"'The
runtime is the sole terminal-state writer' … is enforced today by CAS inside `run-orchestration`.
Shape B moves the write behind a port and leaves the invariant behind."*

The source says something narrower. `layers/agent-orchestration/src/routes/sessions.ts:77-87`:

> *"AF7 §4: apply a state-changing PATCH. The runtime is the sole terminal-state writer **for a running
> session**, so this: … if a live runtime entry exists, ABORTS it and lets the runtime teardown do the
> terminal write + single `session_ended` emit; **otherwise does a CAS-guarded direct write
> (active→terminal only) and emits `session_ended` IFF the CAS affected a row**."*

That "otherwise" branch is real code in the layer, not in the owner: `routes/sessions.ts:192-196` is
`db.update(sessions).set(stateUpdates).where(and(eq(sessions.id, …), eq(sessions.state, "active")))
.returning(…)`, followed by the `session_ended` emit at `:199-210`. Two of the 20 hard errors I
measured are exactly these writes (`routes/sessions.ts:193` and `:359`).

The invariant is therefore **already** split between the layer and `run-orchestration` today. That does
not weaken the recommendation — it strengthens it, because Shape A is the shape that can close the
split, while Shape B would freeze it behind a port. But the artifact's version of the fact will mislead
`/architecture` in a concrete way: an architect who believes the owner already holds every terminal
write will size the owner's accessor surface as read helpers plus a note setter, and will miss that the
terminal-transition CAS **and its event emit** have to move into the owner too. That is the single
largest piece of behaviour this work package relocates.

**What has to change:** restate the fact with its qualifier, and record the consequence — the layer's
no-live-runtime terminal CAS at `routes/sessions.ts:150-212` is part of what moves, so the relocated
surface is a state transition, not a read accessor.

### B3 — §7's delta pre-applies an amendment §8 says is not adopted, and §9 omits the one item with no legal alternative

**Where:** `requirements.md:295-297` (§7 opening), `requirements.md:324-325` (§8 preamble),
`requirements.md:340-350` (§8.2), `requirements.md:404-418` (§9).
**Governing authority:** `plan.md:11`, `plan.md:47-51` (AC #2, AC #5).

Three problems interlock:

1. **The artifact contradicts itself on the size of the work.** §8's preamble states *"None is adopted
   as scope until the maintainer changes `plan.md`."* §7 then computes the work list as *"Of those 46,
   **ten dissolve by correcting two stale registry entries (§8.2)**, leaving **36 real relocations**"* —
   i.e. §7's table, which is the artifact's answer to "what actually has to move", is only correct if
   §8.2 **is** adopted. If it is not adopted, the delta is 46, not 36. `/architecture` reads §7 as the
   work list.

2. **`plan.md:11` already puts all eleven `(other)` sites in scope, and the artifact never cites it.**
   §8.2 and §8.3 treat the eleven as a scope question needing a plan amendment, and §8.4 flags
   `plan.md:5`'s "exactly one is a genuine foreign access" as drift. But `plan.md:11` says: *"The
   remaining production foreign accesses are small: four service writes, three service reads, three
   service imports and one layer import, all against tables whose owner already exists."* That is
   4+3+3+1 = **eleven** — precisely the eleven `(other)` sites I measured. The plan is internally
   inconsistent (`:5` says one, `:11` enumerates eleven), and `:11` is the one that describes work. So
   the *scope* is settled by the plan; only the *means* (correcting an owner versus relocating an
   accessor) is genuinely open. Framing settled scope as an unadopted amendment invites `/architecture`
   to hedge on eleven sites AC #2 requires.

3. **§9 omits `serverCredentials` — the only item on the list that has no legal alternative.** §9
   lists `filesystemCaptures` (open #2) but not `serverCredentials`, even though §8.2 itself establishes
   the harder fact: `core-api/credentials` → `agent-orchestration/connections` is cross-layer, and
   dependency injection is forbidden across layers. I verified that at
   `scripts/lib/governance-model.ts:265-289` — *"dependency injection is legal only within a layer;
   cross-layer conversation goes through the API, MCP or the bus"*. I also verified the underlying
   claim: the `connections` package contains **zero** references to `serverCredentials` (`rg -a` across
   the package), and the only production touchers are
   `layers/core-api/credentials/src/credential-resolver.ts` and `credential-store.ts`. So under the
   registry as it stands, AC #2 ("no package other than the owner names the table") and AC #3 ("obtains
   it by asking the owner") are **unsatisfiable** for those 8 sites without either correcting the
   registry or routing 8 credential reads/writes over HTTP. That is a decision, and it belongs in the
   open list, not only in an amendments appendix.

**What has to change:** reconcile §7 with §8 — state one delta and say which assumption it rests on;
cite `plan.md:11` where the eleven `(other)` sites are discussed; and add `serverCredentials` to §9
with its two candidate resolutions.

---

## NON-BLOCKING DEFECTS

### N1 — the "no production export only tests consume" contract has no verification row

`requirements.md:238` restates the contract from `plan.md:33`; `requirements.md:270-278` (§6) has no
row for it. This is the constraint most at risk under the recommendation the artifact makes: §3.3's own
cost line is *"`@hyperidle/run-orchestration`'s public barrel grows by roughly six to eight session
accessors"*. If any one of them ends up reachable only from a test, the contract is broken.
`knip:production` inside `npm run verify` is the mechanism and should be named as such.

### N2 — §5.2 decides the DI mechanism without checking the wiring site

`requirements.md:220-224` prescribes a DI port for `tool-handlers` → `sessions`, `settings` →
`userSkills`, `work` → `propagationLog` and `policy` → `taskDispatchAttempts`. Both ends of each pair do
sit in one layer, so the port itself is legal (`governance-model.ts:265-289`). But the composition root
that wires `tool-handlers`' ports today is `layers/core-api/src/services/tool-handlers-bindings.ts` — a
core-api layer file the baseline already records twice as `layer → service (other layer) [import]`. A
new injected edge can therefore add a `service → service (other layer) [di]` finding, which sits at
`warn` (`governance/rule-severity.json:27`) and so would land silently as **net-new production debt** in
a work package whose whole direction is removing it. `/architecture` should measure each new port edge,
not only the table crossings it clears.

### N3 — §4 presents `userSkills` as settled while §9 lists it as open

`requirements.md:173-184` is headed *"Owner for the other five — recorded, not reopened"* and names
`users`; `requirements.md:406-409` lists the same assignment as open question #1. Both can't be true.
The measurement makes the stakes concrete and supports §9: I confirmed the `users` package holds **zero**
current `userSkills` sites, so naming it clears nothing and converts all 9 sites to `(other)`, five of
them straight to hard errors. That is the opposite of the "cheap assignment" framing `plan.md:11` used.
§4 should defer to §9 rather than contradict it.

### N4 — §8.5's file count is understated and its filter is unstated

`requirements.md:388-400` claims `UNOWNED_SHARED_TABLES` and `scripts/table-ownership-guard.ts` are
*"referenced as live sanction in eleven production and test files"*. Using `rg -a` (per the control-
character caveat), the two symbols appear in **17** files outside `plans/`: 12 production, 4 test, and
`scripts/mock-inventory.ts:503`. Several of the 17 are historical prose rather than live sanction
(`framework/db/src/schema.ts:997-999`, `layers/core-api/work/src/ports.ts:34-36`,
`layers/core-api/work/src/bet-state-machine.ts:94-96` all describe a *removed* exemption in the past
tense), so a filtered count of eleven may be defensible — but the filter is not stated, and in a
document whose §2 heading is "measured, not remembered" that gap is worth closing.

The claim's substance is confirmed: `scripts/table-ownership-guard.ts` does not exist, and at least one
citation asserts present-tense sanction — `layers/agent-orchestration/connections/src/index.ts:7-9`
says *"This package is the sole importer of that table; `scripts/table-ownership-guard.ts`'s
`TABLE_OWNER` names it."* That comment corroborates §8.2's stale-registry finding and the artifact
missed the connection.

### N5 — the 117 figure is reported as an improvement in two sections that don't mention the build fails

`requirements.md:126` (§3.3) and `requirements.md:295` (§7) both report *"191 → 117 on the registry edit
alone"*. The run that produces 117 exits `FAIL — 20 error(s)`. Only §5.1 says so. A reader who reaches
§7 first will take 117 as a green intermediate state.

### N6 — line-cite drift (trivial, listed for the record)

- `requirements.md:183` cites `lifecycle-propagation.ts:583-665` for `retryFailedPropagations`; the
  declaration is at `:581`, the `pending_retry` select at `:589`. The characterisation — a durable retry
  queue the propagation engine drains, not a log — is correct.
- `requirements.md:107` cites `session-stream-hub.ts:64-79`; the existence check is at `:70-75` inside
  the authorizer at `:60-77`. The characterisation as "administers" is correct.

---

## FOLLOW-UP / NOTE (outside this work package)

- `.pipeline/AU.md:28` still records AU29 as *"planned"*, though AU29 shipped as `0791c4fd` on this
  branch's base. Not this artifact's to fix; noted so it isn't read as a live dependency.
- `requirements.md:7-9` classifies `DOC-CLASS: none` on the grounds that `governance/README.md:5-6`
  forbids restating a governance rule in `docs/`. I read that instruction; the classification is
  correct and well-argued.

---

## What works

- **The measurements are real and they hold.** Fourteen independent re-measurements, zero
  discrepancies, including the file-and-line distribution of all 20 hard errors. The worktree was left
  clean. This is the standard the rest of the pipeline should be held to.
- **Claim 1 — `sessions` is the product primitive Session, and the rejected readings are genuinely
  ruled out.** `docs/process-layer/the-five-primitives.md` §3.3 ("A single agent's bounded run") and
  `tasks-and-sessions.md:29` match `framework/db/src/schema.ts:241-296` (`agentId` notNull, nullable
  `taskId`, `state`, `startedAt`/`endedAt`, `outcome`, `notes`, `effectivenessScore`,
  `uniqueIndex` on `request_id`). `loginSessions` is separately owned by `users`
  (`table-owners.json:23`); `agentSessionRequests` by `session-requests` (`:42`);
  `sessionRunRegistry` is the in-memory process handle. Distinct, all three.
- **The layer question really is settled.** All 14 files touching `sessions` in production are inside
  `agent-orchestration` — 10 in `run-orchestration`, 3 layer-world, 1 in `tool-handlers`. No core-api
  file appears. §3.1's claim survives.
- **AU26's test is applied honestly, not as a volume count.** `run-orchestration` reads the table to
  make its own decisions — the capacity gate at `concurrency.ts:67` counts active sessions to admit or
  refuse a run, and boot recovery at `start-runtime.ts:22-40` reads sessions to reconcile crashed runs
  and then writes `crashed`. `session-requests` has **zero** production sites against the table. The
  test does point where the artifact says it points, and it is not "whoever touches it most" wearing a
  disguise.
- **Claim 3 is exactly right and is the most valuable thing in the document.**
  `layer → db:table (other) [table:read|table:write] production` are absent from
  `rule-severity.json`, resolution is `?? "error"` (`governance-lint.ts:230`), and the consequence —
  three of the five "cheap" assignments are not cheap, and each registry edit must land in the same
  commit as its layer relocation — is a mechanical fact `plan.md` does not carry. Catching it before
  `/architecture` is worth the whole phase.
- **Claim 6 verified for the registry edit, with the right caveat attached.** Zero development
  violations under both shapes, and the mechanism in `scripts/lib/crossing-detectors.ts:366-451` is
  described accurately: an exported top-level *function declaration* in the owning package that inserts
  two or more tables **unconditionally**, counting only tables that package owns and elsewhere
  *revises*. The artifact flags on its own initiative that this must be re-measured after relocation.
- **Claim 8 verified.** Every `insert(userSkills)` in the repo is a test file or
  `tools/eval/src/seeding.ts:609`. No production insert exists.
- **No silent scope expansion.** Every place the artifact goes beyond `plan.md` is quarantined in §8 and
  labelled as an amendment, and §7's non-goals restate `plan.md:38-41` faithfully — including the
  uncomfortable one, that Shape A *grows* `run-orchestration`'s barrel and that shrinking it is AU20's
  axis. B3 is a failure to keep §7 consistent with that quarantine, not a failure to declare.
- **The hard contracts are carried.** §5.4 states zero-exceptions/no-allowlist, reads-as-well-as-writes,
  no production→development import, no test-only production export, work-package ids confined to
  `.pipeline/**`, and the closed six-file set under `governance/` — which I confirmed at
  `scripts/rules/no-per-file-allowances.ts:32-39`.

---

## Reviewer's own answer on the `sessions` owner

**`run-orchestration`, agreeing with the artifact — but reason 2 needs replacing.**

Two of the artifact's three reasons survive verification intact: AU26's test points at
`run-orchestration` and at no other candidate, and Shape B's cost is a measured 30 extra relocations,
every one of them pure indirection, bought in exchange for a benefit `plan.md:41` puts out of scope.

Reason 2 as written is wrong in a way that argues the same conclusion more strongly. The claim is that
Shape B would split the invariant from the state. The invariant is **already** split — the layer holds
the no-live-runtime terminal CAS and the `session_ended` emit at `routes/sessions.ts:150-212`. So the
honest reason is: Shape A is the only shape under which that split can close, because a layer may
import its own service's accessors directly (`reach-your-own-contents`,
`governance-model.ts:315-317` — and already the established shape at `routes/sessions.ts:28`, which
imports `findSessionRequest` straight out of `session-requests`). Shape B would put a port between the
layer's terminal write and the row, institutionalising the split rather than closing it.

The artifact's own overturning condition is the right one and I found nothing to trigger it: if
`run-orchestration` is due to be split or dissolved, Shape B becomes the better landing ground. Nothing
in `.pipeline/AU.md` registers such a work package.

On `plan.md:13` ("a sessions service does not exist and has to be created — that is the one piece of
new construction here"): `plan.md:23` required refinement specifically on this noun and `plan.md:28`
directed that the owner be decided by applying AU26's test *"rather than defaulting to 'whoever touches
it most'"*. The owner decision was delegated to this phase, and no acceptance criterion requires a new
package. Recommending an existing owner is inside the delegated authority, and recording it as an
amendment rather than adopting it silently is the correct handling.
