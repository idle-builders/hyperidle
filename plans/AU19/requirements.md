# AU19 — Applications · Layers · Services — Refinement

**Workpackage:** AU19 (Track AU, framework, L) — supersedes AU8 + AU17
**Gate:** `/refine` (Required — introduces three load-bearing structural primitives)
**Authoritative inputs:** `plans/AU19/concept.html` (founder-reviewed drawing, read first) · `docs/architecture/runtime-simplification.md` §"Applications, Layers, and Services" · `.pipeline/work-packages/TRACK-AU.md` §AU19 · AU17's retired spec + verified artifacts
**Design gate:** Not applicable (no UI surface). **Human concept review:** No.

This document sharpens the goal and resolves the five open questions the spec's Pre-build gate hands to `/refine`. It does **not** produce the package layout or the file-by-file classification — that is `/architecture`'s job. Package granularity (one npm workspace package per Service, nested `packages/<layer>/<service>/`) is **already settled (2026-07-13)** and carried forward here as locked, not re-litigated.

---

## 1. Sharpened goal

Organize the codebase into three mechanically-enforced tiers so that **a file's location declares both what it is permitted to do and who is permitted to wire it to anything else** — a discipline that is entirely convention today and enforced by nothing.

- **Application** — a deployment unit; bootstrap/wiring only, zero business logic. Composes Layers to boot a process.
- **Layer** — a communication-pattern boundary. Depends only downward (its own Services + `db`/`shared`), never sideways, never up. Composes its own Services.
- **Service** — a bounded unit of functionality with a clear interface, realized as its own npm workspace package. A Service that owns a SQL table is additionally the sole code path to that table (Table ACL). A Service **never** composes another Service.

Three `tsc`-module-resolution-enforced mechanisms make this real (not convention):

- **A — Table ACL.** A SQL-owning Service's barrel never exports its raw Drizzle table object → no other package can reference it. One general declarative guard replaces the **nine** hand-typed per-domain scan scripts AU10–AU18 each wrote (`au10-plugin-config`, `au11-runtime`, `au12-conversation-users`, `au13-work-routine`, `au14-knowledge`, `au18-kv-shape`, `au18-notification`, plus au6/au9 boundary guards — confirmed present in `scripts/`).
- **B — Execution boundary.** Only `agent-execution`'s Service packages may import an LLM CLI / harness adapter / MCP bridge / tool-execution symbol. Every other package is structurally forbidden — it isn't a dependency of any package that imports that surface.
- **C — Composition boundary (founder-added 2026-07-13).** A Service package's `dependencies` are only `@hyperidle/db` + `@hyperidle/shared` (+ one narrow ports/contracts package if `/architecture` warrants it) — never another Service, never a Layer. Cross-Service wiring is the owning **Layer**'s job; cross-Layer/cross-process wiring is the **Application**'s job.

**Success framing (no-behavior-change):** every currently-supported topology (laptop-solo desktop, shared-backend server + web ui, attached remote worker) behaves identically after migration; the full existing test suite passes unchanged. This WP moves and re-wraps code and changes exported function signatures **only** where a direct Service→Service import must become an injected parameter (Mechanism C). It rewrites no internal business logic and changes no user-observable behavior.

---

## 2. Load-bearing nouns (concept lock)

Three primitives the rest of the codebase's structure will lean on. Locking their meaning before `/architecture`:

| Noun | IS | IS NOT |
|---|---|---|
| **Application** | A deployment unit that bootstraps + composes Layers into one running process. Contains only wiring. | A Layer. A profile flag (`HYPERIDLE_PROFILE`) — those become *how an Application is selected*, not the boundary itself. A place for business logic. |
| **Layer** | A communication-pattern boundary (`core-ui`, `core-api`, `agent-orchestration`, `agent-execution`). A thin package that composes its own Services and wires cross-Service edges. | A Service. A dumping ground — a Layer package holds wiring + its Services' re-exports, nothing else. A thing that may reach sideways or up. |
| **Service** | A bounded unit with a clear interface, its own npm package under its Layer. May own a SQL table (then Table-ACL-enforced) or provide a capability (harness, tools, MCP). Never composes another Service. | A single file (it holds impl + tests + private helpers). A folder inside a monolith. A DDD "bounded context." Something that imports a neighbor to get work done. |

**Vocabulary collision resolved (see Q3):** the tier noun is **Service**, not "Domain." "Domain" survives only as an adjective for the SQL-owning subset ("a domain Service owns a table") — it is not the tier name, because the codebase already overloads "domain" (domain events, "core domain orchestration").

---

## 3. The five resolved decisions

### Q1 — Exact Layer boundaries, especially `agent-orchestration` / `agent-execution`

**Decision.** The split is defined by one **capability test**, applied per file, not by a topic guess:

> **A file belongs to `agent-execution` if and only if it physically talks to a harness** — invokes an LLM CLI, drives a harness adapter, bridges MCP, or executes a tool. **Everything else that concerns an agent run — deciding *whether/when* it fires, and preparing/consuming its inputs/outputs against the DB — belongs to `agent-orchestration`.**

Corollary rules that make the test unambiguous:

- **`agent-execution` holds zero Service/table references of any kind, including `knowledge`** (founder correction). It receives an assembled context bundle and returns raw run output over the existing worker channel. This is what lets a `remote-worker` run with **no DB credentials** — consistent with AU17's finding that `worker-ws.ts`/`remote-harness-adapter.ts` import nothing from `@hyperidle/db`.
- **Context assembly and capture/writeback live in `agent-orchestration`, not execution** — they read/write Knowledge, and `agent-orchestration` stays colocated with `core-api` + the database in every Application that composes it.
- **Grounded in real dirs.** `agent-execution` ≈ today's `packages/server/src/{harness,mcp,tools}` (harness/ = 20 files incl. `llm-client.ts`, `llm-types.ts`, `context-window.ts`, `adapter-pool.ts`, the builtin/cli/remote/local-sandbox adapters, `harness-discovery.ts`, `return-gate.ts`; mcp/ = 3; tools/ = 29). `agent-orchestration` ≈ the run-lifecycle files currently scattered in the flat `services/` dir (`agent-run-boundary.ts`, `agent-session-runtime.ts`, `trigger-resolution.ts`, `agent-selection.ts`/`roster.ts`, `agent-session-requests.ts`, `agent-lifecycle-projectors.ts`, `context-assembly.ts`, `writeback.ts`, `cost-cap.ts`/`cost-sentinel.ts`, `task-dispatcher.ts`/`assistant-dispatcher.ts`/`routine-scheduler.ts`/`builtin-routine-handlers.ts`, `session-provisioning.ts`/`session-lifecycle.ts`/`routine-session-reaper.ts`/`sandbox-reaper.ts`).

**The one genuinely tricky edge — harness adapters vs. the cross-process boundary.** `run-orchestration` must dispatch a run to *some* execution, which may be in-process (`desktop`) or a remote worker (`remote-server`+`remote-worker`). Resolving this without breaking Mechanism B:

- `agent-orchestration` depends on a **`HarnessPort` interface** (a contract, in the narrow ports/contracts package if `/architecture` adopts one), never on a concrete adapter.
- All concrete adapters — including `remote-harness-adapter.ts` (the WS client that proxies to a remote worker) — belong to `agent-execution`'s **`harness-registry`** Service. They are still harness adapters; one just speaks over WebSocket.
- The **Application** chooses which concrete implementation to inject: `desktop` wires the in-process registry directly; `remote-server` wires `agent-orchestration`'s `HarnessPort` to a `remote-worker` WS client. This is Mechanism C at the Application tier and is explicitly **not new abstraction work** — `worker-ws.ts`/`remote-harness-adapter.ts` already exist; AU19 only relocates ownership of the choice to the Application. (Per spec Out-of-scope: "does not design a new abstraction from scratch.")

`/architecture` owns the full file-by-file re-classification against this four-Layer taxonomy (AU17 only drew a two-package line and never split orchestration from execution). Refine fixes the **rule**; architecture applies it.

### Q2 — Is the Application list (`desktop`, `remote-server`, `ui`, `remote-worker`) exhaustive?

**Decision: Yes — exhaustive for this WP.** These four cover every currently-supported topology, with the composition schedule locked by the founder-reviewed concept:

| Application | core-ui | core-api | agent-orchestration | agent-execution |
|---|:--:|:--:|:--:|:--:|
| `desktop` | ● | ● | ● | ● |
| `remote-server` | — | ● | ● | — |
| `ui` | ● | — | — | — |
| `remote-worker` | — | — | — | ● |

- `remote-server` **never** composes `agent-execution`, unconditionally — execution always runs as a separate `remote-worker` (colocated or not). Locked founder correction.
- **`packages/eval` and `packages/web/scripts/*` are NOT Applications** — they are external *consumers* that import Layer/Service surfaces for tooling; they boot no product process. They belong in AU17's external-consumer migration table (reused as input), not the Application tier.
- Unlike the Service list (a floor), the Application list is treated as **complete for AU19**. Adding a fifth Application later is cheap and purely additive (a new bootstrap package composing existing Layers) — so nothing is lost by not speculating one now. No enterprise/multi-tenant deployment unit is in scope (ETHOS: build for the fast, not the enterprise).

### Q3 — "Service" or "Domain" for the third tier?

**Decision: `Service`.** Reasons, in priority order:

1. **Vocabulary collision.** "Domain" is already loaded in this codebase and its docs — "core domain orchestration," "domain events," "domain Service." Reusing it as the tier noun overloads an in-use word; "Service" does not collide.
2. **Not every third-tier unit is a domain.** `agent-execution`'s `harness-registry` / `tool-provider` / `mcp-provider` are capability providers, not business domains. "Service" covers both a SQL-owning domain unit *and* a capability provider; "Domain" only fits the former.
3. **Existing naming already says Service.** The flat directory is literally `services/`; the owning modules are `work-service.ts`, `routine-service.ts`, `relevance-service.ts`, `attention-service.ts`. Package scopes read naturally: `@hyperidle/knowledge`, `@hyperidle/context-assembly`.
4. **"Domain" is retained as an adjective** for the SQL-owning subset only — "a domain Service owns a table." The concept drawing's "Services (Domains)" label collapses to **Service** as the tier name; the parenthetical is dropped.

### Q4 — Does `core-ui` (`packages/web`) mirror the Service names internally, or is that deferred?

**Decision: Explicitly deferred — out of scope for AU19.** `core-ui` participates in AU19 **only as a Layer boundary**:

- `packages/web` **is** the `core-ui` Layer. It is subject to **Mechanism B** (may not import `agent-execution`'s LLM/harness/MCP/tool symbols) and **Mechanism C** (may not import a Service package's internals except through a Layer surface). Its cross-Layer import edges are enforced.
- Its **internal** reorganization — from today's component-type folders (`components/`, `pages/`, `hooks/`, `layouts/`, `navigation/`, `shell/`, confirmed by directory listing) into domain-named folders (`work/`, `knowledge/`) — is **not done in AU19.**
- Whether `@hyperidle/web` is renamed to `@hyperidle/core-ui` is a low-stakes cosmetic call left to `/architecture` (rename vs. import-churn tradeoff); **no internal file reorg happens either way.**

Rationale: (a) `packages/web` is large and was never in AU17's scope — folding a UI-domain reorg in would roughly double an already-L WP; (b) it owns no SQL tables, so Table ACL (the WP's central mechanism) does not apply to it; (c) unlike the backend's flat `services/` dump, web is *already* meaningfully organized (by component type) — the "flat undifferentiated dump" problem AU19 exists to fix is absent there; (d) a UI-domain reorg is a design-adjacent decision deserving its own frame. **Follow-up candidate:** "core-ui internal domain alignment" as a future WP — flagged, not scheduled here.

### Q5 — Is the ~20-Service list a floor or a ceiling?

**Decision: Floor, not ceiling.** The ~20 in the doc are a seed pulled from the as-should graph + AU12–AU18's owning modules. `/architecture` must expect to find **more** on the real file-by-file pass — AU17's own audit found 7× its file estimate. Realistic count is **~25–35 Services.**

Candidates already visible in the current file listing that the seed-20 doesn't name (for `/architecture` to classify — **not** pre-committed here):

- `connections` — `connection-provisioning.ts`, `credential-encryption.ts`, `credential-resolver.ts`, `service-connection-projection.ts`, `service-connection-resolver.ts` (owns connection secrets; likely SQL-owning).
- `org` — `org-edges.ts`, `org-routing.ts`, `team-lookup.ts`, `team-default-harness.ts`, `scaffold-agents.ts` (org graph / roster substrate).
- `filesystems` — `file-watcher.ts`, `filesystem-reachability.ts`, `inspect-local-path.ts`, `dependency-watcher.ts`.
- `git-export` — `git-export.ts`, `git-export-runner.ts`.
- `review` — `review-item-factory.ts`, `session-review-creator.ts`, `proposed-call-workflow.ts`, `practice-meeting.ts`.
- `policy`/`trust` — `policy-engine.ts`, `approval-rate.ts`, `handoff-protocol.ts`, `lifecycle-propagation.ts`.
- `search` — knowledge FTS/`search.ts` route (may fold into `knowledge` or stand alone).
- `observability` — `services/observability/`.

**Two required disposition tables `/architecture` must produce** (called out by the spec, reaffirmed here):

1. **Ambiguous/shared files** — the ~20–30 files with no single clear domain (`ws-broadcaster.ts`, `org-edges.ts`, `credential-encryption.ts`, `like-escape.ts`, `contracts.ts`, `agent-utils.ts`, `schedule-label.ts`, `item-router.ts`, `model-gateway.ts`, …). Each needs an explicit named home; **do not default them into a flat `shared` package without naming why each one is there.**
2. **Service→Service composition edges** — every current place where one Service-shaped module imports another's exported function. Each becomes a dependency-injected parameter wired by the owning Layer (Mechanism C). This is genuinely new refactoring, not relocation, and is exactly where the "weird features" (a Service reaching into a neighbor uninvited) surface. Table it the way AU11/AU17 tabled file moves.

**In-scope debt confirmed (not deferred again):** `agent_work_intents` gets a `TABLE_OWNER` entry and its three known non-owner accessors (`routes/threads.ts` insert, `routes/sessions-routes.ts` read, `services/agent-layer-boot.ts` read — flagged by AU15, never closed) migrate onto the owning Service in this WP.

---

## 4. Guide-draft (developer-facing; no user-facing change)

No end-user guide changes — **user-observable behavior is identical in every topology.** The guide surface AU19 touches is the developer guide (`docs/guides/developer/`). Draft framing for `/write-docs`:

> **Where does a file live?** Under `packages/<layer>/<service>/`. Its location tells you what it may do: a `core-api` Service may read/write only its own table; an `agent-execution` Service is the only place that may touch a harness, LLM CLI, MCP bridge, or tool; no Service may import another Service.
>
> **Adding a new table?** Create a Service package whose `src/index.ts` barrel exports typed functions only — **never the raw Drizzle table object.** That single discipline (plus one general guard) is the whole Table ACL: no other package can obtain a reference to a table it doesn't own, because packages can only import what's exported.
>
> **Need one Service's data inside another?** You don't import it. You take it as a parameter (e.g. `context-assembly` receives a `KnowledgeReader`), and the **owning Layer** wires the concrete Service in. Composition is always the layer above's job — a Service does none of its own wiring, a Layer does its Services' wiring, an Application does its Layers' wiring.
>
> **Deploying differently?** Pick an Application. `desktop` runs all four Layers in one process; `remote-server` runs `core-api` + `agent-orchestration` and dispatches execution to a separate `remote-worker` (which holds no DB credentials); `ui` is `core-ui` alone against a remote API. Choosing which concrete execution to wire is the Application's job — never a Layer's, never a Service's.

---

## 5. Handoff to `/architecture`

Refine settles the **rule and vocabulary**; architecture settles the **layout**. Explicit carries:

- **Locked (do not re-open):** package-per-Service granularity; the four Layers + four Applications + composition schedule; the three enforcement mechanisms; tier noun = **Service**; `agent-execution` = zero Service/DB access; `remote-server` never composes `agent-execution`; core-ui internal reorg deferred.
- **Reuse as input (do not re-derive):** AU17's verified acyclic file classification, its external-consumer migration table (`packages/eval`, `packages/web/scripts/*`), and its `au17-package-boundary-guard.ts` `tsc`-negative-case technique — but **re-classify every file against the four-Layer / N-Service taxonomy**, since AU17 never split orchestration from execution and used a shared folder, not a package, per Service.
- **Architecture must produce:** the full Service list (≥25 expected, floor-not-ceiling); the ambiguous-file disposition table; the Service→Service composition-edge table (→ DI parameters); the Service-package scaffolding template (`package.json` + `tsconfig.json` + `vitest.config.ts` + `src/index.ts` skeleton); the `workspaces` glob widening (`"packages/*"` → also `"packages/*/*"`); the decision on whether a narrow ports/contracts package is warranted; and the ordered plan — **build + sanity-break-prove all three mechanisms on a minimal slice (`knowledge` + `harness-registry` + their two Layer packages, with `context-assembly`→`knowledge` wired at the Layer level) BEFORE the bulk 238-file migration**, per the spec's hard ordering constraint.

## 6. Self-critique

- **Over-reach risk:** Q1's `HarnessPort`-interface resolution edges toward "new abstraction," which the spec puts out of scope. Mitigated by binding it to the *existing* `worker-ws`/`remote-harness-adapter` pair — refine only names where ownership of that already-built choice lands (Application), it does not ask `/architecture` to design a client abstraction. If `/architecture` finds the existing seam already expresses this cleanly, no `HarnessPort` type is added at all.
- **Under-specified on purpose:** the concrete Service roster and file homes are deliberately left to `/architecture` — pinning them in refine would duplicate (and likely conflict with) the file-by-file pass. Refine's job was the rule, not the roster.
- **Defer risk (Q4):** deferring core-ui internal alignment could look like scope-dodging. It is the correct call — no table ownership, already-organized, would double the WP — and it is recorded as a named follow-up rather than silently dropped.
- **Naming finality (Q3):** "Service" is chosen over "Domain" decisively; the residual "domain" adjective for SQL-owners is a deliberate, bounded reuse, not ambiguity.
