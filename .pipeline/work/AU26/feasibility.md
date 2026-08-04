# AU26 — Feasibility

Probes run for the load-bearing / new / unknown parts only. Everything else in this WP reuses a
shipped pattern (Table-ACL relocation, DI port, bake deletion) and needed no proof.

Scratch: `.pipeline/work/AU26/probes/two-app-mount/`.

---

## P1 — Can two Hono apps be mounted on ONE instance behind ONE listener, sharing middleware? **GO**

**Why load-bearing.** Job 2's whole shape (`createCoreApiApp()` + `createAgentOrchestrationApp()`,
mounted by the Application onto one Hono instance, never a second server or port) rests on it. If
Hono could not merge two sub-apps at the same prefix, or if the shared auth/rate-limit/error stack
did not apply to a mounted sub-app, the split would need a second listener — which requirements §5
forbids outright.

**Probe.** `probes/two-app-mount/poc.ts`, `poc2.ts`, `poc3.ts`, run on the repo's own **installed**
`hono@4.12.30` via `npx tsx`. *(Round 1 cited `4.12.27` — that is the `^` range in `package.json`, not the
resolved version. `node -e "require('hono/package.json').version"` → `4.12.30`. Findings unchanged; the
critique independently re-ran the probe on `4.12.30` and reproduced both results exactly.)*

**Results.**

| Question | Result |
|---|---|
| Two sub-apps `api.route("/", a); api.route("/", b)` at the same prefix | **Both route.** `/api/bets` → core, `/api/agent-orchestration/sessions` → orch, `/api/sessions/:id` → orch |
| Parent middleware (`api.use("*", …)`) runs for handlers in BOTH sub-apps | **Yes** — 4 requests, 4 middleware hits |
| Context vars set by parent middleware visible inside sub-app handlers | **Yes** — `c.set("userId")` in the parent read as `"u-1"` in both sub-apps' handlers |
| Parent `onError` catches throws from BOTH sub-apps | **Yes** — `{"handled":"api"}` for a core throw and an orch throw |
| Parent `notFound` on the mounted sub-router | **NO — does not fire.** Only the ROOT app's `notFound` runs |

**GO, with one carry-forward.** The `notFound` result is a real trap, not a blocker: `api.notFound(...)`
becomes dead once `api` is itself a mounted router. It is **already dead today** —
`packages/core-api/src/app.ts:653-659` sets `api.notFound`, and `app.ts:664-674`'s root handler with
its `c.req.path.startsWith("/api")` branch is what actually serves the canonical
`ApiErrorResponse` JSON 404. Both produce the same body, so nothing regresses today and nothing
regresses after the split **provided the Application keeps the path-prefix branch on the root
`notFound`**. A naive port that drops the root branch and trusts `api.notFound` would silently turn
every unknown `/api/*` 404 into `text/plain "404 Not Found"` — a wire-contract regression no route
test would catch. Recorded as an explicit task obligation (Increment B1b) and an AC.

---

## P2 — `createGitRunner` in `@hyperidle/shared` without breaking the browser bundle. **GO**

**Why load-bearing.** The mount engine (moving to `agent-orchestration`) and the reachability probe
(staying in `core-api`) both need `createGitRunner`, and Mechanism B forbids the orchestration side
from importing a `core-api` Service. `@hyperidle/shared` is the only legal shared home — but
`packages/web` (browser) imports `@hyperidle/shared`, and `git-export-runner.ts` uses
`node:child_process`.

**Probe — read the existing precedent, not a POC.** `packages/shared/package.json` already declares a
second entry point, `"./net": "./src/net/ssrf.ts"`, and `packages/shared/src/index.ts:425` carries the
explicit comment *"SSRF utilities use node:dns/net/util and cannot be imported in the browser"* —
the main barrel re-exports only its **types**, never the runtime module. So a node-only module in
`shared` behind a subpath export is a shipped, working idiom in this repo.

**Verdict GO.** `createGitRunner` lands at `@hyperidle/shared/git`, never in the main barrel. Same
reasoning, one tier down, for `harness-capability-read-model` — but that one is type-only at runtime
(it imports `AdapterInfo`/`AdapterMeta`/`HarnessCapabilities`/`HarnessCapabilityDescriptor`, all
already in `shared`, and forwards to an injected handle), so it is browser-safe and goes in the main
barrel.

---

## P3 — Does dropping `Pick<AdapterPool, …>` for a structural interface lose the AU16 guarantee? **GO-WITH-CHANGE**

**Why load-bearing.** `HarnessCapabilityReader` is today `Pick<AdapterPool, "size"|"list"|"describe"|"refresh">`
(`packages/core-api/src/services/harness-capability-read-model.ts:55`). Moving the module to
`@hyperidle/shared` cannot keep the `Pick` — `shared` declares **zero** `@hyperidle/*` dependencies
and `@hyperidle/harness-registry` already depends on `shared`, so importing `AdapterPool` back would
create a package cycle (requirements §9.6 flagged exactly this).

**Probe — read the ownership of every type in the signature.** `AdapterInfo`, `AdapterMeta`,
`HarnessCapabilities` and `HarnessCapabilityDescriptor` **already live in `@hyperidle/shared`**
(`packages/shared/src/harness/harness-adapter.ts:290`, `:300`, and the descriptor above them);
`packages/agent-execution/harness-registry/src/adapter-pool.ts:29` merely re-exports them, with a
`@lore AU19 Increment 4` note saying they were reclassified to `shared` *for this exact read model*.
Only `AdapterFilter` (`adapter-pool.ts:61`) is still local — 4 optional fields, trivially declarable.

**Verdict GO-WITH-CHANGE.** Declare `HarnessCapabilityReader` structurally in `shared`. The AU16
anti-drift guarantee is **not** lost, it changes enforcer: the existing assertion
`const reader: HarnessCapabilityReader = pool` (`harness-capability-read-model.test.ts:145`) becomes
the fidelity gate — if `AdapterPool` ever changes one of the four signatures, that line fails to
compile. Keep that test and re-point it; do not delete it. Widening the reader to an execution method
still requires a visible edit to the interface, same as widening the `Pick` key list did.

---

## P4 — Is `sessions.taskId`'s existence check in the WS subscribe authorizer redundant? **GO (free deletion)**

**Why probed.** `ws-connection-hub.ts:211` reaches `deps.work.getTaskById(db, sessionRow.taskId)`
purely to confirm the task exists — one of the four DI edges the zero-exceptions ruling has to
eliminate.

**Probe.** `packages/db/src/schema.ts:229` —
`taskId: text("task_id").references(() => tasks.id, { onDelete: "restrict" })`. A non-null
`sessions.taskId` **cannot** point at a missing task: the FK is enforced and `onDelete: restrict`
forbids deleting a task that still has sessions.

**Verdict GO.** The read is provably redundant; delete it rather than route it through a port. Same
class of finding as `review/session-review-creator.ts:50-54` (group2.md) — a "core read" that is
actually free to remove.

---

## P5 — Live-state check: does the `git-export` feature have a reachable client anywhere? **Confirmed dead**

**Why probed.** The re-challenge doc's deletion verdict rests on "off by default, zero web references
in all history, no restore path." Deleting ~4,500 lines on a reachability claim needs the claim
re-verified at HEAD, not trusted from prose.

**Probe (re-run on this branch).**
- `rg -a -in "gitexport|git.export" packages/web/src packages/desktop/src` → **0 hits**.
- `rg -a -n "api/git-export" packages/` → only `packages/core-api/src/routes/__tests__/git-export.routes.integration.test.ts`
  and `src/__tests__/git-export-routes.integration.test.ts`. **No production requester.**
- `packages/core-api/git-export/src/`: `git-export.ts` 570 + `git-export-config.ts` 442 +
  `ports.ts` 99 + `testing.ts` 37 + `index.ts` 57 = 1,205 lines of package source, plus
  `src/routes/git-export-routes.ts` and ~2,144 lines of tests.
- The one live half is `git-export-runner.ts` (509 lines), whose consumers are the mount engine
  (`server-factory.ts:1007`) and the reachability/branch probes (`routes/filesystems.ts:153`, `:260`)
  — none of them the exporter. `packages/core-api/filesystems/src/ports.ts:6-32` already re-declares
  the runner interface structurally as `FilesystemsGitRunner`, and
  `packages/core-api/filesystems/package.json` has **no** `@hyperidle/git-export` dependency — the
  runner is already an injected, structurally-typed port, so extracting it is a re-point of one
  factory argument, not an interface change.

**Verdict GO.** The split (runner survives → `@hyperidle/shared/git`; exporter deletes) is safe and
the extraction is cheap because `filesystems` already modelled the dependency structurally.

---

## P6 — Census: what does the table-ownership guard actually scan, and what does fixing it cost? **GO, with one open question**

**Round-1 correction, up front.** Round 1 stated the guard's scan root "only visits
`packages/<layer>/<service>/` — every **Layer**-level file (`packages/core-api/src/**`) is invisible to it."
**That is false.** `inspect()` (`scripts/table-ownership-guard.ts:604-630`) runs `nestedServiceRoots()`
**and then** an explicit second pass over `packages/core-api/src` — the AU19 Increment 5 scan-widening, with
its own `@lore` at `:612-624`. The nine Layer `sessions` readers are visited on every run today; they pass
only because `sessions ∈ UNOWNED_SHARED_TABLES` (`:349-354`, filtered at `:543`).

**Consequence: deleting the Set alone is not theatre — it fires immediately** on all 12 already-scanned Layer
pairs. That is D1/D2's work, not a no-op.

**Why probed anyway.** The requirement is **zero** exceptions. Two separate questions had to be measured:
(1) what does the guard *not* see, and does this WP make that worse? (2) what would closing it cost?

**Probe.** Census script (`probes/`): parse every `export const X = pgTable` from `packages/db/src/schema.ts`,
then collect every non-`type` value import of one of those names from `@hyperidle/db` across every
`packages/*/src/**` non-test file, excluding nested Service packages (already scanned). Re-run at HEAD.

**Result — 37 files, 79 file×table pairs, split cleanly in two:**

| Scan status today | Files | Pairs | Detail |
|---|---|---|---|
| **Already scanned** (`packages/core-api/src`) | 11 | **12** | `sessions` × 9 (`routes/{agent-profile,agents,recipients,sessions-routes,status,tasks,teams-routes,threads,users}.ts`), `userSkills` × 2 (`routes/users.ts`, `services/routine-scheduler-bindings.ts`), `propagationLog` × 1 (`server-factory.ts`) — every one on a table this WP assigns an owner to |
| **Not scanned** | 26 | **67** | **All of it `packages/eval/src`** — 18 owned tables (`agentWorkIntents, artifacts, bets, items, knowledgeAppProjection, knowledgeConflicts, knowledgeEditLog, knowledgeItems, messages, routineRuns, routines, sessions, tasks, teamMembers, teams, threads, userSkills, users`), concentrated in `seeding.ts` (15 tables) and `judges.ts` (10) |

Every other unscanned root — `agent-orchestration/src`, `agent-execution/src`, `remote-server/src`,
`remote-worker/src`, `shared/src`, `api-contract/src`, `web/src`, `desktop/src` — has **zero** table imports at
HEAD. AU12–AU18 genuinely cleaned them out.

**The scan change is still required, for a reason round 1 got wrong.** It is not "Layer code is invisible."
It is that **this WP creates code in two roots the guard does not visit**:

- **B1a** writes route files under `packages/agent-orchestration/src/routes/**`;
- **B1b** moves the repo's single `propagationLog` importer (`server-factory.ts`) into
  `packages/remote-server/src/create-server.ts` — and `remote-server` is an **Application**, not a Layer, so
  round 1's "extend the scan to Layer `src/` roots" wording would have missed exactly that file.

**Verdict GO for the mechanical part.** `architecture.md` §D-G replaces both hand-written roots with a
*derived* scope — nested Service `src/` plus the `src/` of every package in the runtime dependency closure of
`@hyperidle/{remote-server,desktop,remote-worker}`, computed from `package.json`. No package name appears in
the guard; new Layers and new Applications are picked up automatically. Cost beyond assigning the four owners:
**zero**.

**OPEN QUESTION, not a verdict — `packages/eval`.** It is `private: true`, has zero dependents repo-wide, and
is entered only via its own `npm run eval` CLI, so it falls outside that closure naturally. Round 1 proposed
excluding it "by name with a stated reason" and simultaneously claimed AC8's "no allowlist of any kind" — the
two cannot both be true, and 67 pairs across 18 tables is far too large to settle in a parenthesis. The
principle asserted instead (*the ACL governs code that runs inside a shipped Application*), the real
architectural argument on both sides, and the costed fallback increment **D3** are written out in
`architecture.md` §D-G, and the yes/no is a **founder confirmation point before D2**. This probe measures the
question; it does not answer it.

---

## Not probed (deliberately) — and why

- **Table-ACL relocation, DI-port decomposition, bake deletion.** All three are shipped patterns with
  live precedent inside this repo (AU12–AU18 relocations; AU21 K1's own bake+delete cycle). TDD
  straightens these out; a probe would prove nothing new.
- **AES-GCM primitive → `shared` (J1).** AU21 Decision J3 already discharged the proof obligation
  (key source is `HYPERIDLE_API_KEY` via HKDF, no DB read). Re-verify in the increment, don't re-probe
  here.
- **The migration in G1.** A `DROP COLUMN` + backfill on `users`/`teams` is ordinary Drizzle work;
  the risk is coverage of readers, which is a reconciliation problem (handled in
  `architecture.md`'s blast-radius block), not a feasibility one.
