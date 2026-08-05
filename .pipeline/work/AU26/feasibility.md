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

## P6 — Census: what does the table-ownership guard actually scan, and what does fixing it cost? **GO — round-2 census withdrawn and re-run**

**Round-1 correction, up front.** Round 1 stated the guard's scan root "only visits
`packages/<layer>/<service>/` — every **Layer**-level file (`packages/core-api/src/**`) is invisible to it."
**That is false.** `inspect()` (`scripts/table-ownership-guard.ts:604-630`) runs `nestedServiceRoots()`
**and then** an explicit second pass over `packages/core-api/src` — the AU19 Increment 5 scan-widening, with
its own `@lore` at `:612-624`. The nine Layer `sessions` readers are visited on every run today; they pass
only because `sessions ∈ UNOWNED_SHARED_TABLES` (`:349-354`, filtered at `:543`).

**Consequence: deleting the Set alone is not theatre — it fires immediately** on all 12 already-scanned Layer
pairs. That is D1/D2's work, not a no-op. *(This half of round 1's correction survives round 3 intact; what
did not survive is the census built on top of it — see below.)*

**Why probed anyway.** The requirement is **zero** exceptions. Two separate questions had to be measured:
(1) what does the guard *not* see, and does this WP make that worse? (2) what would closing it cost?

**Probe.** Census script (`probes/`): parse every `export const X = pgTable` from `packages/db/src/schema.ts`,
then collect every non-`type` value import of one of those names from `@hyperidle/db` across every
`packages/*/src/**` non-test file, excluding nested Service packages (already scanned). Re-run at HEAD.

**Round-2 census WITHDRAWN — it was measured with the wrong instrument.** Round 2's census collected only
*value imports of a table name from `@hyperidle/db`*. The guard's Tier-2 check has **two** branches: that
one, **and** a direct-access branch (`table-ownership-guard.ts:565-575`) that calls `consider()` on the
identifier name of the first argument to `.from/.insert/.update/.delete`, **with no import-specifier
condition**. A file that imports its tables from a *relative* path — `packages/db/src/demo-fixture.ts` and
`factory-bootstrap.ts` both `import … from "./schema.js"` — is invisible to the round-2 method and fully
visible to the guard. That is how 18 accesses went unreported and how "zero new work" was concluded.

**Re-probe (round 3).** `probes/census/census.ts` reimplements the guard's **own** `checkAccess` — both
branches, plus the namespace-import branch — over every `packages/*/src` and `packages/*/*/src` non-test
file, with `UNOWNED_SHARED_TABLES` deleted and this WP's four new `TABLE_OWNER` rows applied. It is checked
in and becomes `scripts/table-ownership-census.ts` at increment D0, so the number is a gate rather than a
paragraph (**AC14**).

**Result at HEAD (`94cc2dfe`) — 803 files scanned, 379 findings, 100 file×table pairs, 48 files, 20 tables:**

| Region | Pairs | Files | Scanned today | Note |
|---|---:|---:|---|---|
| `packages/core-api/src` | 12 | 11 | **yes** | `sessions` ×9, `userSkills` ×2, `propagationLog` ×1 — round 2's figure, and the only region it counted |
| nested Services | 10 | 8 | **yes** | §D-H sites 1–6 + `settings`/`work`; **includes `agent-orchestration/tool-handlers/src/tool-definitions.ts`'s `sessions` write, which no round named** |
| `packages/db/src` | 9 | 2 | no | `demo-fixture.ts` (10 accesses), `factory-bootstrap.ts` (8) — invisible to round 2's method |
| `packages/eval/src` | 69 | 27 | no | 18 tables; `judges.ts` 52 findings, `seeding.ts` 34 |
| everything else (`remote-server`, `remote-worker`, `desktop`, `web`, `shared`, `api-contract`, `design-system`) | **0** | 0 | no | AU12–AU18 genuinely cleaned them out — that part of round 2 holds |

**The two derivation facts round 2 asserted, re-measured:**

- **`agent-orchestration` and `agent-execution` are NOT in the Application dependency closure at HEAD.**
  Both umbrella packages have zero dependents (`rg -a -l '"@hyperidle/agent-orchestration"' --glob
  package.json` → only their own); `packages/agent-orchestration/package.json` declares no `dependencies`
  field and its barrel is `export {}`. So round 2's derived scope missed the directory **B1a creates route
  files in**.
- **`desktop` declares its real dependencies under `devDependencies`.** Its `dependencies` field is
  `{"@electric-sql/pglite"}` alone. A closure computed from `dependencies` gives `desktop` a one-package
  closure; the scan only survived because `remote-server` independently pulled `core-api` in.

**Verdict GO — but the scope becomes *simpler*, not more derived.** `architecture.md` §D-G replaces both
hand-written roots with **the whole workspace**: `src/` of every package under `packages/` carrying a
`package.json`. No closure, no dependency graph, no `dependencies`-vs-`devDependencies` question, no package
name in the guard, and — verified by computation at HEAD, not asserted — it reaches
`packages/agent-orchestration/src` and `packages/remote-server/src` **before** any `package.json` edit, so
the guard's correctness does not ride on a build step. Cost beyond assigning the four owners: **not zero** —
9 pairs in `packages/db/src` (increment D2a) and 69 in `packages/eval/src` (D2b).

**The `packages/eval` open question is CLOSED, in the plan.** Round 2 left it as a founder yes/no with an
exclusion as the default. §D-G answers it: eval is governed, its two supporting arguments are addressed by
name (the service-surface cost is one the WP pays for `packages/db` anyway; the grading-through-the-code-
under-test argument does not apply, because an eval's system under test is the LLM + tools + prompts, not
the persistence Services). The founder confirmation point survives — as a request to *narrow*, with
"proceed as written" as the stated default (§12).


---

## P5′ — Does the *interleaved* split (same path prefix, different methods, two apps) actually route? **GO**

**Why load-bearing, and why it needed its own probe.** P1 proved two sub-apps mounted at the same prefix
both route — but only for **disjoint** prefixes (`/api/bets` vs `/api/agent-orchestration/*`). §D-H #16
invents a shape P1 never tested: `/api/sessions` served by **both** apps, split by method and sub-path
(`POST /` on core; `GET /`, `GET /starts/:startId`, `GET /:id/activity`, `PATCH /:id` on orchestration).
The whole per-route split rests on it, and the round-2 critique flagged that the one construction this
design invented was the one not probed.

**Probe.** `probes/two-app-mount/poc4.ts`, run on the installed `hono@4.12.30` via `npx tsx`.

| Request | Resolves to |
|---|---|
| `POST /api/sessions` | **core** |
| `GET /api/sessions` | **orchestration** |
| `GET /api/sessions/starts/es-1` | **orchestration** (not shadowed by the `:id` patterns) |
| `GET /api/sessions/s-1/activity` | **orchestration** |
| `PATCH /api/sessions/s-1` | **orchestration** |
| `DELETE /api/sessions/s-1` | root JSON 404 `{"error":"Not found","code":"NOT_FOUND"}` |
| `GET /api/sessions/s-1` | root JSON 404 — **confirms the route genuinely does not exist**, matching the checklist's note that the string in `sessions-routes.ts:211`'s 202 message points at nothing |

Parent middleware ran for **7 of 7** requests, including the two that 404'd.

**GO.** The interleaved split routes exactly as §D-H #16 assumes, and the root `notFound` branch from P1
still serves the canonical JSON for unmatched `/api/*`. The one hazard is unchanged and already closed:
a duplicate `method + path` across the two apps would resolve silently by registration order — **AC12**.

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
