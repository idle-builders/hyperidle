# AU26 — scope audit (reviewer, read-only)

> **STATUS (2026-08-04, after the founder's round-5 correction) — read this first.** This audit was written
> against round 4's dividing line (*"ownership work vs. relocations"*). The founder has since restated the
> line as **moving code vs. writing rules**: *"policy, review and work are not cut to AU28. the move is part
> of this package. what is not part of this package is writing package boundary definition or linters and
> such."*
>
> Consequences for the verdicts below, applied in `architecture.md` §2, §D-M and §14:
> - **§2.5 / §6 "Trim C3" — OVERRULED.** A dissolution is a move. Increment C3 stands as written.
> - **§2.2 / §6 "Trim B1a's `getById`" — OVERRULED.** It is the read-back half of a move AU26 does perform
>   (the legacy bare-insert + `session_started` emit relocating to `run-orchestration`). Reasoning in §D-M.5;
>   the interrupted revert is abandoned.
> - **§4 "Cut D0" — APPLIED** (commit `0317818a`). `architecture.md` §14 finding 7 is corrected accordingly.
> - **§3 "Cut AC13" — not applied.** Harmless; `verify` is required regardless.
> - **Not in scope of this audit at all:** four code moves round 4 had already cut to AU28 and round 5
>   restored — `policy/handoff-protocol.ts`, `work/bet-kill-cascade.ts`, `work/work-service.ts`'s
>   `latestSessionOutcome`, `review/session-review-creator.ts`. See `architecture.md` §D-M, increments
>   H1/H2/H3.
>
> Everything else here (the per-increment AC tracing, §2.1/§2.3/§2.4/§2.6/§2.7, §3's audit of the invented
> ACs, §5's riders) stands.

**Question asked:** the founder has ruled twice that AU26 drifted. `architecture.md` §14 already cut the
repo-wide table-ownership programme to AU28. This pass asks the next question of every *remaining* increment
and every *remaining* acceptance criterion: **does AU26 fail one of its seven founder ACs without this?**

**The fixed contract.** `plan.md`'s seven acceptance criteria (`plan.md:84-91`), referred to below by the
numbering `architecture.md` §8 gives them (AC1–AC7). Everything numbered AC8+ is architecture's own invention
and is audited separately in §3.

**Method.** Per increment: name the AC it closes; if none, name the increment it enables and judge whether that
enabling is forced or convenient; then keep / trim / cut. Evidence is `file:line` or a committed diff.

---

## 1. The table

Increments as they stand in `architecture.md` §13 (the heading says "13 PRs" — there are **14 rows**; D0 was
the 13th and was cut in prose but not reverted, see §4).

| # | Built? | AC it closes | Would AU26 fail an AC without it? | Verdict |
|---|---|---|---|---|
| **A1** | committed `f5191b30` (+ `validate.ts` in `791110b2`) | AC5 (enabler — forced) | **Yes.** Orchestration route files cannot type a context or declare an AF11 boundary without importing core-api; that import is the blocker `agent-orchestration-sessions-routes.ts:9-12` names | **keep** |
| **A2 · `createGitRunner`** | committed `cf279e43` | AC3/AC4 (enabler — forced) | **Yes.** F1 moves the mount engine to orchestration while the reachability probe stays core; C1 deletes the package the runner lived in | **keep** |
| **A2 · `harness-capability-read-model`** | committed `cf279e43` | AC1/AC6 (enabler — forced) | **Yes**, and already at HEAD — see §2.1 | **keep** |
| **B1a** | committed in `791110b2`, further edits in flight | **AC5** directly | **Yes.** This *is* AC5 | **keep**, minus the in-flight `AgentOrchestrationPort.getById` — see §2.2 |
| **B1b** | not built | none literally; **founder-directed** in `plan.md:58` ("Composition … moves to the Application tier") | Not by the letter of AC5. **Yes by the founder's own diagnosis** — see §2.3 | **keep** |
| **C1** (`git-export` exporter deletes) | not built | none; **founder order** on the record (`plan.md:13-24`) | No | **keep — by instruction, not by AC.** Confirmed separable: A2 already freed the runner (§2.4) |
| **C2** (`observability` dissolves) | committed `347e7b4a` | AC2 + AC6 | Yes — AC2 produced the verdict, AC6 forbids parking it | **keep** (landed; reverting costs more than it saves) |
| **C3** (`realtime` dissolves) | not built | AC4 requires the *verdict*, already written at §D-E. The package→folder move closes nothing | **No** | **trim** — keep the verdict, cut the move (§2.5) |
| **E1** (AES-GCM → shared) | committed `6881ec96` | AC1 (Decision J1, enabler — forced) | Yes. Decrypt moves to orchestration, the key catalog stays core; both need the cipher | **keep** |
| **E2** (rename → `@hyperidle/credentials`) | not built | AC1 (enabler — forced) | **Yes.** `packages/core-api/connections/package.json:2` is `@hyperidle/connections`; E3 creates `packages/agent-orchestration/connections`. The name has to be freed | **keep** |
| **E3** (SQL-owning orchestration `connections`, K1 bake deleted) | not built | **AC1** directly | **Yes.** This *is* AC1 | **keep** |
| **E4** (connections routes → orchestration-api) | not built | none. AC5's minimum ("at least the session/harness-streaming case") is closed by B1a | **No** | **keep, narrowly** — defensible under §D-A rule 2, but it is the weakest-anchored planned increment (§2.6) |
| **F1** (mount engine + captures → orchestration) | not built | **AC3** directly | **Yes** | **keep** |
| **F2** (`filesystemInjections` → orchestration, filesystems bake deleted) | not built | AC6, via a verdict AU26 itself declared | **Yes** on a fair reading (§2.7) | **keep** |
| **D0** (census script) | committed `af317a25`, **still in the tree** | AC14 — an AC that no longer exists | No | **cut — revert** (§4) |

---

## 2. Reasoning, per contested item

### 2.1 A2's second half — does an AU26 move actually force the read model to relocate? **Yes, twice.**

The brief flagged this as possibly opportunistic, sourced from an open question in `requirements.md` §9.6
rather than a relocation. It traces to a relocation, and the evidence is stronger than the architecture states.

- `packages/core-api/src/routes/connections.ts:199` calls `harnessCapabilityDescriptors(adapterPool)` inside
  `GET /` — the route E4 moves to the orchestration app. Once that route is on the other Layer, the module has
  live readers on both sides, and Mechanism B forbids the orchestration side importing a core-api module.
- Stronger: it is **already** two-sided at HEAD. G1 (committed, `12538598`) put
  `packages/agent-orchestration/agent-run-config/src/validate-agent-config.ts` in the orchestration Layer, and
  it reads the same descriptors. So the move is forced by an increment that has *already landed*, independent
  of E4.

Keep. Judge the two halves of A2 separately as asked — both survive, for different reasons.

### 2.2 B1a — one thing in flight right now is drift, and it is the exact thing §14 handed to AU28

`architecture.md` §D-A's own scope note (`:214-220`) reads: *"AU26 does not move `sessions` … the nine
core-api Layer routes and six core-api Services that read it keep their direct reads, unchanged, and
`AgentOrchestrationPort` gains **no** new methods. Rounds 1–3 planned that conversion … it is cut to AU28 —
§14 finding 1."* §14 finding 1 then names the five methods AU28 would add, first of which is `getById`.
§13's B1a row is explicit: *"`POST /api/sessions` stays core-hosted with its two direct `sessions` touches
unchanged."*

The working tree adds `getById` to the port anyway:

```
packages/api-contract/src/agent-orchestration-port.ts   (+39, uncommitted)
+	getById(sessionId: string): Promise<AgentOrchestrationSessionWireRow | null>;
```

with a doc comment that `POST /api/sessions` "reads its admitted session through `getById`". That converts one
of the two direct reads the architecture said to leave alone, into the first of the five port methods AU26
explicitly cut to AU28. **Trim it: restore the direct read.** Nothing in AC5 needs a port hop — `POST` stays
core-hosted, and a core-api handler reading `sessions` directly is legal today (`sessions` is in
`UNOWNED_SHARED_TABLES`, `table-ownership-guard.ts:360-365`) and stays legal after AU26.

### 2.3 B1b — no AC names it, and it still stays

By the letter, AC5's proof is an import guard on route modules, and B1a satisfies it. But after B1a,
`packages/core-api/src/server-factory.ts` still imports `agent-orchestration` in order to mount its app —
which is verbatim the founder's own root diagnosis quoted in `plan.md:58`: *"its just bad codesmell that core
has to import orchestration to produce an api."* The same paragraph then settles the fix in the founder's own
words: composition *"moves to the Application tier (`remote-server`, `desktop`), never to a third 'neutral'
package."* That is plan-of-record direction, not architecture invention. Cutting B1b would leave Job 2
finished on the letter of the AC and unfinished on the thing the founder actually said was wrong.

Keep. The one arguable piece inside it is §D-C (desktop importing `@hyperidle/remote-server/create-server`),
which architecture already flags as its most arguable call and gives a named fallback for. That is a design
question, not a scope question — it does not change what AU26 is responsible for.

### 2.4 C1 — separable from the runner, and in scope only because the founder said so

Confirmed separable, and already separated: A2 (`cf279e43`) moved `createGitRunner` to `@hyperidle/shared/git`
and stopped the `git-export` barrel re-exporting it. `packages/core-api/git-export/` still exists at HEAD and
blocks nothing. So **only the runner relocation is needed for AU26's ACs; the exporter deletion is not.**

It stays anyway, and the reason is the only one that counts: the founder made the product call on the record
(`plan.md:13-16`). Worth stating plainly so nobody mistakes it for an AC-driven deletion: C1 is the one part
of AU26 that is a product decision rather than a relocation, and if the founder ever wants AU26 narrowed to
pure relocation, C1 is the clean severance point — it costs nothing else in the plan.

### 2.5 C3 — **trim.** The verdict is in scope; the package move is not.

C2 and C3 both trace to founder ACs — that part of the brief's suspicion is unfounded. AC2 (`plan.md:85`)
demands a whole-service verdict for all 15 core-api Services; `service-verdicts/group2.md:12,15` records both;
AC6 (`plan.md:89`) forbids parking a "moves" verdict. So the *verdicts* are squarely AU26's.

The execution is where C3 comes apart. AC2's question is **"does this entire service belong in core?"** For
`realtime`, `architecture.md` §D-E answers that question **yes** — *"It cannot move to orchestration: three of
its four production topics are core-domain"* — and the hub lands at `packages/core-api/src/ws-connection-hub.ts`.
Nothing crosses a Layer boundary. What C3 actually executes is a *different* verdict — "this should not be a
Service package" — which answers a question AC2 did not ask, and which is the taxonomy question AU28 owns
(`.pipeline/work/AU28/plan.md`: one canonical spec for what a Service is and how Layers and Services may
communicate). AC6's own wording is "moved into agent-orchestration (or removed)"; a package demoted to a
folder in the same Layer is neither.

Cost of keeping it is real, not nominal: C3 sits at wave 3 behind **both** B1a and B1b for a change that moves
no boundary. Cost of cutting it is one line in `remote-server`'s import list.

**Trim:** keep §D-E's written verdict (AC4 requires exactly that — *"a documented, evidenced verdict on
`WsConnectionHub`'s own fate"* — and §D-E already is it), keep AC11(b)'s recording of the WS narrowing, and
drop the package-to-folder move. Hand "`realtime` should not be a Service package" to AU28 alongside §14
finding 1, which already has to touch the same file.

*(The same structural objection applies to C2 — it also dissolves into `shared`/`settings` rather than into
orchestration. C2 is not cut, for two reasons: it is committed, and its content was provably dead — four
routes with zero requesters repo-wide, `TraceIdResolver.seed()` with zero non-test callers — so the deletion
carries independent value and no behaviour risk. Reverting it would be pure loss.)*

### 2.6 E4 — keep, but know that no AC requires it

AC1 is satisfied by E3 alone: it is about which Service imports `serviceConnections` and about K1's bake.
AC5's minimum is *"at least the session/harness-streaming case"*, closed by B1a. So no founder AC forces the
connections **routes** onto the orchestration app — and `plan.md:65` explicitly contemplates the cheaper
alternative: *"mutations stay HTTP-hosted in core-api, delegating to the relocated Service."* Cutting E4 would
save an M increment and remove the second `/api/connections` host that AC10's collision assertion has to cover.

It stays, on one argument that is strong enough: §D-A rule 2 is the placement rule AU26 exists to write down,
`routes/connections.ts`'s table set is `service_connections` alone (traced — it imports no `@hyperidle/users`,
no `teamMembers`, no `work`), and declining to apply the rule on its first clean single-sided case makes the
rule advisory on the day it ships. That is exactly the "defaulting into core-api by omission" `plan.md:9` says
the WP exists to stop. Keep — but it is the weakest-anchored planned increment after C3, and if capacity ever
forces a choice between E4 and F2, E4 is the one to give up.

### 2.7 F2 — keep, defended

F2 has no AC naming it (AC3 names the mount engine, the `users` columns and `WsConnectionHub`; injections are
not on that list). It is a candidate the pass surfaced, which `plan.md:58` explicitly permits — *"If, while
applying the test to these, a further genuine candidate surfaces, name it and its evidence explicitly"* — and
once named, AC6 forbids parking it.

More importantly it is the same defect, not an adjacent one. `filesystemInjections` is agent-run configuration
that core administers through the Settings UI and never operationally consumes; AU21 baked the injected-list at
emit for exactly the reason K1 baked connections — the table was in the wrong Layer. `plan.md:39` names that
bake as leftover from AU21's incomplete pass. Killing it removes the identical staleness bug AC1's validation
scenario proves gone for connections. Cutting F2 would leave AU26 having fixed one of a matched pair and
declared the other out of scope — the precise pattern `plan.md:9` says the codebase keeps repeating.

Keep. Note the one thing F2 causes rather than inherits: the `filesystemInjections ⋈ filesystems` join
decomposition (`filesystem-registry.ts:42-44`). That is ACL work AU26 itself creates by moving the table, so it
is in scope under §2's own one-line test, not AU28's.

---

## 3. The acceptance criteria architecture invented

`architecture.md` §8 carries AC8–AC13 on top of the founder's seven. Audited one by one against the standard
the brief sets: does it trace to a founder AC, or is it scope wearing a criterion's clothes?

| AC | What it is | Traces? | Verdict |
|---|---|---|---|
| **AC8** — eval's subpath imports survive | Non-regression guard on B1a/B1b's own change. Requires no new work; it is `npm run check` staying green | Yes — a constraint on AU26's change, not new scope. `requirements.md` §9.7 demanded it | **keep** |
| **AC9** — unknown `/api/*` still returns the canonical JSON 404 | Non-regression guard on a trap B1b creates (two mounted apps, one `notFound`). One integration test | Yes | **keep** |
| **AC10** — the two apps do not shadow each other | Guards a hazard AU26 *manufactures* by putting `/api/sessions/*` on two apps at one prefix (§D-A rule 7). One integration test, no build work | Yes — it exists because of AU26's own design choice | **keep** |
| **AC11** — validation scenario 4's two halves proven separately; the WS narrowing on the record | Records that AU26 **narrows** a founder-written AC rather than silently satisfying it | Yes — this is the opposite of drift. An AC that shrinks scope honestly | **keep** |
| **AC12** — the relocation ACL, scoped to the five tables AU26 moves or creates | The surviving, narrowed remnant of the cut programme | Yes. AC1 requires the connections ACL "enforced by a real guard"; AC6 requires every relocation land "with the same rigor as the connections move: guard-enforced ACL". Five rows for five moved/created tables is exactly co-extensive with the moves | **keep — and enforce its own limit.** Its text says "**and nothing else in that file**". D0 already broke that (§4) |
| **AC13** — "whole-change correctness: `npm run verify`" | The project's standing bar (`CLAUDE.md`), restated as a criterion | It traces to nothing AU26-specific and measures nothing AU26-specific | **cut as an AC.** Harmless, but it is a row that makes the criteria list look longer than the contract is. `verify` is required regardless |
| **AC14** — the 100→0 ownership-violation countdown | The goal metric of the cut programme | **No.** Deleted from §8 with the founder's ruling | **already cut — but its artifact was not.** See §4 |

**Conclusion on the invented ACs:** AC8–AC11 are non-regression guards on hazards AU26 itself creates; none of
them authorises a line of new work, and cutting them would only make AU26 less safe. AC12 traces and is
correctly narrowed. **No invented AC is scope wearing a criterion's clothes** — with the single exception of
AC14, which was scope wearing a criterion's clothes, was correctly deleted, and whose work is still in the tree.

---

## 4. What survived the founder's cut and should not have — **D0**

The founder's ruling removed "a census gate driving 100 ACL violations to zero" from AU26 (`plan.md:26-35`).
AC14 came out of §8. The **code did not come out of the branch.**

Still committed at `af317a25` and present at HEAD:

- `scripts/table-ownership-census.ts` (213 lines) — its own header still reads *"AU26 D0 — the table-ownership
  census (AC14)"*, citing an AC that no longer exists.
- `packages/db/src/__tests__/table-ownership-census.test.ts` (240 lines).
- `package.json:60` — a new `census:tables` npm script.
- **`scripts/table-ownership-guard.ts`, +81/−35 against `origin/main` beyond the `TABLE_OWNER` rows**: `TABLE_OWNER`
  exported, `knownTables`/`collectSourceFiles`/`checkAccess` exported, a new `OwnershipPolicy` interface, a new
  `AccessFinding` interface, `checkAccess` given a policy parameter, and the CLI block reshaped to
  direct-invocation-only.

That last item is a direct breach of AU26's own AC12 — *"`TABLE_OWNER` rows … **and nothing else in that
file**"* — and it restructures the exact script `architecture.md` §2 assigns to AU28, in the exact way §11's
collision warning says to avoid. `architecture.md:1226` already concedes the problem and then declines to act:
*"The script is already committed; recommendation is to leave it for AU28."* Leaving a cut programme's tool,
its npm script, its test and a refactor of its guard inside AU26's shipped diff is not handing it to AU28 — it
is shipping it under AU26's name.

**Verdict: cut — revert D0.** It is five files, none of them production code, no production caller. Revert
`scripts/table-ownership-census.ts`, its test, the `census:tables` script, and the non-`TABLE_OWNER` half of the
guard diff (keeping G1's two legitimate new owner rows and C2's comment update). If the census is worth having,
AU28 writes it under AU28, where the founder put it.

---

## 5. Cleanup riding along rather than a verdict being executed

Small riders found in the increments. None is worth a revert on its own; they are listed so the pattern is
visible and so the remaining increments do not repeat it.

1. **G1 drops two columns that are not run-config.** `users.systemPromptPath` and `users.skills` (§D-J: *"Dropped,
   not moved … zero production readers"*) ride along in the same forward-only, no-down-migration `DROP COLUMN`
   as the six relocated columns. Dead-schema cleanup, not a relocation, and it adds irreversible migration
   surface to a WP whose own constraint (`plan.md:61`) opens with "No data migration for any relocation."
   **Already committed (`12538598`) and shipped in `0055_AU26_agent_run_config.sql` — do not revert; undoing a
   `DROP COLUMN` costs more than the rider did.** Named for the record.
2. **G1 extends the target from `users` to `teams`.** `plan.md`'s named candidate is the `users`
   agent-execution columns; the three `teams` default-run-config columns are a `group2.md` find. Defensible —
   same shape, same domain, and `scaffold-agents.ts:168` is the join point that makes doing them apart wasteful.
   Landed. Keep.
3. **A1 deduplicated `constantTimeStringEqual`** out of `run-orchestration/src/worker-ingress.ts:37`, which
   declared its own copy. Not strictly required — the local copy would have kept working — but it is a
   verbatim-duplicated security primitive and the move was one import. Landed. Keep.
4. **A1's ~45-file re-point is entailed, not opportunistic.** The alternative was a permanent re-export shim in
   core-api, which would leave two module identities for the AF11 boundary declaration across two apps. The
   four primitives themselves are two source files; `failClosedAssertion` has no orchestration caller but lives
   in the same module as `requireBoundary`, so it travels for free. No finding.
5. **F1's `listCaptures` deletion** is test-only-reachable dead surface removed with the code it belongs to.
   Entailed by the move. No finding.

---

## 6. Summary

**Keep (11):** A1, A2 (both halves), B1a, B1b, C1, C2, E1, E2, E3, F1, F2.
**Keep narrowly (1):** E4 — no AC requires it; kept on the placement-rule-coherence argument alone.
**Trim (2):** C3 — keep the §D-E verdict, cut the package→folder move. B1a — drop the in-flight
`AgentOrchestrationPort.getById` and restore `POST /api/sessions`'s direct read.
**Cut (1):** D0 — revert the census script, its test, the `census:tables` script, and the non-`TABLE_OWNER`
half of the ownership-guard diff.
**Cut as an AC (1):** AC13.

Nothing on the keep list is retained out of politeness. A1, A2, E1, E2 are forced enablers with traced
blockers; B1a/E3/F1 *are* three of the seven ACs; C1 and B1b are founder instructions in the plan of record;
C2 is landed and provably dead code; F2 is the matched twin of AC1's own defect.
