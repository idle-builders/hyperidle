# AU28 — Requirements

DOC-CLASS: significant · **Round 2** (revised against `founder-rulings.md` Rulings 1–6 and
`requirements-critique.md`'s 5 CRITICALs / 7 WARNINGs)

Refines `.pipeline/work/AU28/plan.md`. **Round 1 escalated four decisions; the founder ruled on all of
them plus two more.** Nothing in this document is an open escalation. Ruling 4.2 explicitly releases
`plan.md`'s acceptance criteria, so §8 rewrites the AC set wholesale to match the real deliverable;
`plan.md`'s AC block is updated to the same text.

Companion artifacts, both binding inputs:
- `.pipeline/work/AU28/rule-matrix.md` — **the primary deliverable.** The exhaustive enumeration:
  1169 cells, 116 Allowed / 1044 Forbidden / 9 Unsettled. This document states *what must be true*;
  the matrix *is* the contract's content.
- `.pipeline/work/AU28/foundation-inventory.md` — the evidence Ruling 3 required before the
  Foundation rows could be written.

Engineering tier: **production** (fixed input from `plan.md`; not re-opened).

---

## 1. Sharpened goal

### Value & audience

**Audience:** every agent and human who adds a line of code to `packages/*`, and every reviewer who has
to decide whether that line is legal.

**The value:** today, "is this connection allowed?" is answered by reading five guard scripts (one of
which is dead), two ground-truth docs that contradict each other, and one work package's architecture
log. AU28 makes it answerable by reading **one page**, and makes the wrong answer **fail
`npm run lint` on the offending file:line** — so nobody has to know the page exists to obey it.

The concrete failure this prevents, verified in real code: an agent adds
`import { enqueueWorkIntent } from "@hyperidle/session-requests"` to a `core-api` route handler.
`npm run lint` is green. `npm run check` is green. All five boundary guards are green. It is green
because `packages/core-api/package.json` already declares the dependency,
`composition-boundary-guard.ts` deliberately does not scan Layer packages, `execution-boundary-guard.ts`
deliberately exempts `packages/core-api/src/**`, and `composition-edge-anti-regrowth-guard.ts` only ever
checks the opposite direction. Six such imports already exist in `routes/` (`bets.ts:10`,
`knowledge.ts:49`, `sessions-routes.ts:4`, `tasks.ts:3`, `threads.ts:43`,
`agent-orchestration-sessions-routes.ts:39`). Nobody added them carelessly; the system had no way to
say no.

### The rule being enforced is a *new* rule, and the founder has ratified it

Round 1 escalated this and **Ruling 1 affirmed it.** It is settled, not proposed.

`docs/architecture/runtime-simplification.md:30-31` states a *hierarchy* rule ("a Layer may depend only
on Layers/Services **below** it… never sideways, never up"), and `:164-172` explicitly sanctions the
pattern the founder now forbids ("a Layer package … if it needs a Service that belongs to a Layer below
it — **composes across that boundary too**"). `CLAUDE.md:84` says the same in the older 3-layer
vocabulary. Under that written rule, **38 of the 39 live crossings are legal.** AU21's guard did not
miss a direction by oversight — it faithfully implemented the rule as written.

AU28 replaces a hierarchy rule with an **isolation** rule (Ruling 1): a Layer imports only Foundation
or its own Layer; cross-Layer conversation goes through **API / MCP or events**; DI is legal only
within one Layer.

**Supersede list — a closed instruction for `/architecture`, not a question:**

| Location | Statement | Disposition |
|---|---|---|
| `runtime-simplification.md:30-31` | "depend only on Layers/Services **below** it" | **Superseded** — becomes "only Foundation and its own Layer" |
| `runtime-simplification.md:164-172` | "composes across that boundary too" | **Superseded** — this is the cross-Layer DI Ruling 1(1) forbids |
| `CLAUDE.md:84` | "strict downward dependency… No layer reaches past its neighbor" | **Superseded** (same rule, older vocabulary) |
| `runtime-simplification.md:126-128` | the four Layer packages "depend on their own Layer's Service packages (**nothing more**)" | **KEEP AND CITE.** Already states the new rule. Do not rewrite it. (W7) |

`plans/strategy-kernel-plugin-split/as-should-dependency-graph.md` also states a downward contract but
is already marked SUPERSEDED (2026-08-02) — noted, not a live conflict.

### What success looks like (measurable)

| # | Measure | Today (verified this session) | Target |
|---|---|---|---|
| S1 | Cells of the connection space with a written verdict | **0** (no contract) | **1169 of 1169** — every cell `Allowed`/`Forbidden`/`Unsettled`, arithmetic reconciling |
| S2 | Ordered Layer pairs with a written **and enforced** verdict | **1 of 12** (`agent-orchestration → core-api` only) | **12 of 12** |
| S3 | Crossing kinds in a closed, fixture-proven set | 0 (three unrelated "Mechanism N" numbering schemes, none a taxonomy) | **9**, each with ≥1 Allowed and ≥1 Forbidden fixture, or documented as not statically detectable and therefore Forbidden outright |
| S4 | Package roles derived from a **registry**, not a path | **0** (`layer-boundary-scan.ts` infers from directory structure) | **34 of 34** from an explicit registry; a directory move changes no verdict |
| S5 | Forbidden **module-import** crossings, unaccounted for | **39** | **0** unaccounted; every survivor is a dated debt row with a named closing WP |
| S6 | Forbidden **injected-port** (cross-Layer DI) crossings, counted at all | **not measured by anything** (4 exist) | measured; baseline **4**; a 5th hard-fails |
| S7 | Forbidden **owned-table** crossings, counted at all | **not measured** — guard passes green with **57** outside its scan scope | measured; baseline 57; a 58th hard-fails |
| S8 | Tables with exactly one owning Service | **39 of 43** (4 in an exempt set Ruling 6 abolishes) | **43 of 43** mapped, exempt set deleted; the 4 report as debt |
| S9 | Roles scanned as a crossing **source** | **1 of 6** (`layer-boundary-scan.ts:247` returns early unless the source role is `layer`) | **6 of 6** — Foundation, Layer, Service, Application, Tooling, harness process |
| S10 | The governance lint runs in `npm run lint` | **no** (`layer-boundary-scan.ts` is report-only) | **yes**, warn-at-landing / hard-fail-on-new |
| S11 | Contract rows with no named enforcing guard | n/a | **0** |
| S12 | Enforcing guards implementing a rule absent from the contract | **4 live + 1 dead** (see §6) | **0** — every guard maps to ≥1 contract row; the dead one is retired or re-rooted |
| S13 | Debt rows protected by a **mechanical** shrink-only ratchet | **0** (convention only, and it already failed once) | **all**; adding a row fails the build |
| S14 | `agent-orchestration → core-api` crossings, any kind | **0** (AU21 Increment 14e end-state) | **0**, unregressed |
| S15 | A newly-added Forbidden crossing reddens CI | **no** for 11 of 12 Layer pairs, and for **every** Application/Tooling/table crossing | **yes**, proven by a real red on a scratch commit, not only by fixtures |

### Scope

**In scope.** (a) The contract — the 1169-cell matrix, written as one page. (b) The architectural
governance lint that enforces it, sourced from a package-role **registry**. (c) The mechanical debt
ratchet. (d) Deleting the dead Hono RPC client (Ruling 4.1). (e) Reconciliation against the five
existing guards so S12 goes to zero.

**Non-goals — deliberately out.**

- **Any relocation.** Ruling 2: *"lets start with a round of building the rules and the linters and
  then we figure out what we do where."* The composition-root split, the 26 crossings inside
  `packages/core-api/src/**`, AU26's work, the `shared` split, the `api-contract` re-cut, assigning
  `sessions` an owner — all later rounds. The lint **reports** the full real violation set rather than
  exempting it, so the later round is scoped from live data.
- **Reducing Service method surfaces.** AU20.
- **Renaming the existing AU19 "Mechanism A/B/C" or the scan's "Mechanism 1/2/3" names.** They keep
  their meanings; the contract cross-references them.
- **A configurable architecture-lint framework.** No rule DSL, no `dependency-cruiser`, no plugin
  registry. A closed table and one tsx script, matching every other guard in `scripts/`. ETHOS §1:
  ceremony added "to be safe" is the smell. "Architectural governance linting" means one coherent,
  complete guard set — not a framework.
- **A pairwise Service matrix.** ~400 cells nobody maintains. `rule-matrix.md` §7 is role-based across
  six relations, stated as a deliberate choice with its reason.
- **Fixing the unchecked-cast problem in `packages/web`.** Deleting `client.ts` does not close it — see
  §7.4. Separate WP.
- **Any UI change.** `packages/web/src` is a scan source, and one dead file is deleted from it. No
  design surface.
- **Runtime enforcement.** Static-only: source AST + manifests + `tsconfig` paths. A runtime call graph
  is an ocean, not a lake.

---

## 2. Guide draft (the page this ships)

> Working title: `docs/architecture/connection-contract.md`. Path is architecture's call. `rule-matrix.md`
> supplies the tables; this is the prose that fronts them.

---

### The connection contract

Every package in `packages/` has exactly one **role**, assigned by an explicit registry — never guessed
from its directory. Every time one unit reaches another, that is a **boundary crossing**, and it happens
through exactly one of **nine crossing kinds**. This page carries the verdict for every combination.
There is no tenth kind. If you want to do something not on this page, the answer is no — the page
changes first, then the code.

**Roles.** Look up your package once:

| Role | Packages |
|---|---|
| **Foundation** | `@hyperidle/shared`, `@hyperidle/db`, `@hyperidle/api-contract`, `@hyperidle/design-system` |
| **Layer** | `@hyperidle/core-ui` (core-ui), `@hyperidle/core-api`, `@hyperidle/agent-orchestration`, `@hyperidle/agent-execution` |
| **Service** | the 20 nested packages at `packages/<layer>/<service>/` |
| **Application** | `@hyperidle/desktop`, `@hyperidle/remote-server`, `@hyperidle/remote-worker` |
| **Tooling** | `@hyperidle/eval`, `eslint-plugin-authz`, `eslint-plugin-design` |
| **Harness process** | a running harness CLI — not a package, but a real actor with exactly one door in |

A package with no registry entry is a build error, not a default. **A role is a property of a package,
never of a file and never of a path** — the founder may reorganize into `layer/<pkg>` / `shared/<pkg>`
and every verdict on this page must survive it unchanged.

**The one-line rule.** *A Layer imports only Foundation and its own Layer.* Everything else between
Layers goes over **API, MCP, or events** — and nothing else works.

**The nine crossing kinds.**

1. **Module import** — `import` / `export … from` / `import()`. Legal within your own Layer and into
   the Foundation packages your Layer is allowed. Never across Layers, in either direction — not even
   `import type`, not even a subpath, not even "just wiring."
2. **Declared resolution** — a `@hyperidle/*` row in your `package.json`, or a `tsconfig` path mapping.
   Checked separately from #1 in both directions: the hoisted monorepo resolves imports you never
   declared, and you can declare deps you never import.
3. **Injected port** — someone hands you an object typed by an interface you declared. This is how one
   Service reaches a sibling Service: it takes a `KnowledgeReader` parameter and the Layer wires the
   real one in. **Legal inside one Layer only.** Across a Layer boundary it is forbidden, and it hides
   from import-based guards by construction — which is exactly why it is named first.
4. **API call** — a request to an HTTP or WebSocket endpoint the target Layer hosts on its own router.
   Three shapes, one kind: the injected-transport seam (`CoreApiPort`, `AgentOrchestrationPort`), the
   browser channel (`apiFetch`), and a WebSocket dial. **The dialler owns the crossing** — a server
   push back down a socket the client opened is not a second, reverse crossing.
5. **MCP tool call** — JSON-RPC to an MCP router, per-session bearer token, tool-schema contract. The
   caller is a running harness process, not a package. It is the only door a harness has.
6. **Domain event** — `EventBus.emit` / `.on` with an event type from `@hyperidle/shared`. In-process;
   the browser has no access. The publisher never names a subscriber.
7. **Owned table** — a Drizzle read or write of a table, **or an import of the table symbol** (type-only
   included). Exactly one Service owns each table and is the only code that may touch it. A shared table
   is not a message channel: it is a cross-Layer channel with zero imports and zero DI, invisible to
   every other check on this page.
8. **Workspace handoff** — a file written into an agent's working directory that a harness process
   reads (`.mcp.json`, `AGENTS.md`, injected credentials). Only `agent-execution` writes these.
9. **Capability reach** — importing a raw runtime SDK or spawning a harness CLI. Only `agent-execution`
   may.

**What you actually do, by situation.**

- *My `core-api` route needs to start an agent run.* Emit a domain event (#6). Do not import
  `@hyperidle/session-requests`.
- *My `agent-orchestration` code needs a bet.* You don't. `core-api` bakes everything a run needs onto
  the request at emit time (AU21 Decision H). If the running agent needs live detail, it fetches it
  itself through MCP tools during the run.
- *My Service needs another Service in the same Layer.* Declare a narrow interface, take it as a
  parameter (#3), let your Layer wire it.
- *My Service needs a Service in another Layer.* You emit an event, or you call that Layer's API.
- *`packages/web` needs the API's types.* Through `@hyperidle/api-contract` (Foundation), never by
  importing `@hyperidle/core-api`.
- *I need a table another Service owns.* Call that Service. Not the table, not `import type`, not
  through `schema`.
- *I'm writing an Application.* You may import Layer packages and dial their APIs. You may not reach
  past a Layer barrel into its Services, you may not wire a port across two Layers, and you may not
  touch a table.
- *I'm writing a bench.* Same rights as an Application. You do not get privileged database access
  because you are "just a test."

**When you break it.** `npm run lint` prints the file, the line, the crossing kind, the actor pair, and
the legal alternative. It fails the build. **There is no allowlist to add yourself to.**

**Open debt, not exceptions.** The contract has no permanent exception state. What it has is a dated,
individually-listed **debt** table: crossings that exist today, are agreed to be wrong, warn loudly on
every lint run, and each carry the work package that closes them. The count is **committed to the repo
and can only shrink** — adding a row fails the build, so debt can never be used to make your own change
pass.

**Unsettled, not silently missing.** Nine cells of 1169 cannot be decided today. Each is written down
with the thing that must land first. Incompleteness is countable, not invisible.

---

## 3. Nouns pinned

### 3.1 Boundary crossing

**Is.** One concrete instance of code — or a running process — in unit A reaching unit B: a specific
`file:line`, a specific `package.json` row, or a specific runtime channel.

**Is not.** Not a rule, not a verdict, not a graph edge between Services.
`generate-dependency-graph.ts`'s "edge" is an inferred Service-to-Service relationship; a crossing is a
literal, locatable fact.

**Hard rule.** A crossing is always identified by location, never by inference. This is the property
that made `layer-boundary-scan.ts` reliable where `resolvePortEdges`' name-voting produced three
independent bugs.

*Precedent:* already the codebase's vernacular —
`packages/core-api/src/services/run-orchestration-composition.ts:234` says `@lore boundary-crossing cast`.

**Round-2 widening.** A crossing's source is not always a package. The MCP caller is a **running harness
process**, so "code in package A reaching code in package B" is too narrow. The registry names the
harness process as an actor explicitly.

### 3.2 Crossing kind

**Is.** One entry in a **closed set of nine**: module import, declared resolution, injected port, API
call, MCP tool call, domain event, owned table, workspace handoff, capability reach.

**Is not.**
- **Not a "mechanism."** Triple-booked already: AU19's *Mechanism A/B/C* (three enforcement scripts),
  `layer-boundary-scan.ts`'s *Mechanism 1/2/3* (three detectors), `plan.md`'s "mechanism kind." The
  contract keeps all three intact and cross-references them; it does not add a fourth numbering.
- **Not a "channel."** Already a closed enum twice — notification egress
  (`notification-primitive.md:70`) and harness return-enforcement (`return-gate-enforcement.md:39`).
- **Not a verdict.** "Foundation import" and "same-layer import" are not kinds; they are *module import*
  with a particular verdict.
- **Not a role.** "Application-tier composition" is not a kind; it is the Application role's permissive
  verdict on kinds 1, 2, and 4.

**Hard rules.**
- The set is **closed**. Anything not on the list is Forbidden by default, in every direction, for every
  actor pair. A new kind requires editing the contract — there is no guard allowlist.
- Every kind must be **mechanically detectable**, or documented as *not statically detectable and
  therefore Forbidden outright*. A kind nobody can detect is a hole with a name on it.
- Type-only-ness and subpath-ness are **sub-properties of module import**, not separate kinds and not
  exemptions. This closes a live hole: `import type { bets } from "@hyperidle/db"` currently passes the
  table ACL (`table-ownership-guard.ts:580,585` both require `!isTypeOnly`).

### 3.3 Package role

**Is.** Exactly one of **Foundation | Layer | Service | Application | Tooling**, plus the non-package
**harness process** actor. Assigned by an explicit registry.

**Is not.** Not a directory convention, not a description. It is the lookup key that, with the crossing
kind, determines the verdict.

**Hard rules.**
- **Total and exclusive.** Every package has exactly one role. An unregistered package **throws**, never
  defaults. `discoverAllPackages` already has this property (34 packages, 0 unclassified); the
  governance lint must inherit it, not re-derive a softer one.
- **Never derived from a path** (Ruling 5). The founder is considering reorganizing into
  `layer/<package>` / `shared/<package>`. If roles are inferred from directory structure, that
  restructure silently invalidates every rule on the page. The registry is a manifest field or an
  explicit map; a directory move must change no verdict, and a fixture must prove it.
- **A role is a property of a package, not of a file.** No file-grained overrides. This resolves both
  open role questions in one stroke — `packages/core-api/src/**`'s composition-root files are core-api
  Layer code, and `packages/web/scripts/*` is core-ui Layer code. Their crossings are Forbidden, not
  exempt. The rejected alternative — a file-grained map — is the exact failure mode
  `runtime-simplification.md:108-114` names and `au6-agent-boundary-guard.ts` is the live proof of.

### 3.4 Verdict

**Is.** The contract's answer for one `(crossing kind, source actor, target actor)` triple:
**Allowed | Forbidden | Unsettled**.

**Is not.** Not a severity and not a lint level. Debt is a *state of a crossing*, not a fourth verdict —
a Forbidden crossing that exists today.

**Hard rules — two separate rules, not one** (W6):
- **R1 — Contract completeness.** A missing row is a **contract validation failure**: the contract's own
  self-check fails if any cell of the enumerated space has no verdict. This is what makes symmetry
  structural. Every verdict is stated for an *ordered* pair; A→B and B→A are two rows, always both
  written, even when identical. This is the literal root cause AU28 exists to fix.
- **R2 — Deny by default at the crossing.** A crossing whose kind, or whose actor pair, matches no
  Allowed row **fails lint**. Different mechanism, different failure surface. Both are required; round 1
  stated them as one sentence and architecture would have had to guess.

### 3.5 Debt

**Is.** A dated, individually listed, currently-existing Forbidden crossing that (a) warns on every
`npm run lint` run, (b) names the work package that closes it, and (c) leaves the table only by being
fixed.

**Is not.** **Not an exception.** An exception is permanent permission; debt is a tracked wrong.
- The standing founder rule is *zero exceptions in ownership ACLs*.
- AU21 Increment 14e **deleted the exemption apparatus outright** — `ALLOWLIST`, `STATELESS_METHODS`,
  `isStatelessProvider` are gone from `composition-edge-anti-regrowth-guard.ts`, not emptied, precisely
  so nothing can be re-populated. Founder verbatim: *"as long as there is any exception I don't think
  AU21 is done."*
- That guard already models the right shape and named it: `DEFERRED_FOLLOWUP`, documented in-file as
  *"an honestly-open, not-yet-closed gap set, currently empty — never a permanent carve-out"* (`:417`,
  real and empty). Debt is that concept promoted to the contract.

**Hard rules — and the ratchet is now load-bearing** (W5, Ruling 2):

Round 1 stated three rules in prose and measured none of them. That is not enough here, because
**convention already failed at exactly this table, one work package ago and under review**:
`composition-edge-anti-regrowth-guard.ts:56-58` records that *"a prior (second) pass reached zero by
adding two builder-ruled `ALLOWLIST` entries with no founder sign-off, and by presenting a
`DEFERRED_FOLLOWUP` set as an already-resolved descope to a new work package — both rejected on
review."* Debt with no mechanical guarantee is the same allow-state with a better name, and under
Ruling 2 — where the 26 composition crossings *stay* as warn-rows until a later round — it is how 26
rows become permanent.

Therefore:
- **A committed count that can only shrink.** The debt count per category lives in a tracked file. The
  lint compares the live count to it: **greater → build fails; smaller → build fails with "update the
  ratchet."** Not a convention, not a review habit.
- **A fixture proves a newly-added row fails.** Not just that a newly-added *crossing* fails — that
  adding a *debt row* to accommodate one fails.
- Every row carries a date and a closing work-package id. A row with neither is a contract defect.
- **The contract has no Allowed-by-exception state at all.** If a crossing is legal, it is legal by a
  **general rule** any equivalent crossing also satisfies — never by naming one file.

---

## 4. Two axes, not one list

`plan.md` names five candidates: *foundation import, same-layer import, EventBus, the seam call,
Application-tier composition.* Interrogated against real code, **only two are crossing kinds.**

| `plan.md` candidate | Verdict | Correct placement |
|---|---|---|
| foundation import | **Not a kind** — conflates kind with verdict | *module import* where the target is Foundation → verdict varies **per Layer and per Foundation package** (Ruling 3) |
| same-layer import | **Not a kind, and mis-grained** | *module import* where both sides share a Layer. The verdict is **not uniform**: Layer root → its own Service = Allowed; **Service → sibling Service = Forbidden** (AU19 Mechanism C, `composition-boundary-guard.ts`). Stated as one kind, it would silently legalise the exact edge that guard exists to block. |
| EventBus | **A real kind** ✓ | *domain event* |
| the seam call | **Too narrow to be a kind** | one *shape* of **API call** — see below |
| Application-tier composition | **Not a kind** — it is a role | the Application role's Allowed verdict on kinds 1, 2, 4 |

**Seven kinds are missing from the candidate set**, each verified present in real code:

1. **Injected port.** Ruling 1(1) names it first and the candidate list omits it. `layer-boundary-scan.ts`
   Mechanism 3 finds **4 live** (`dispatch → harness-registry` via `DispatchPorts`;
   `run-orchestration → harness-registry` via `RunOptions`, `RunTransitionSpec`, `RuntimeDeps`). Invisible
   to every import-based check by construction. Omitting it produces a contract that passes green while
   the exact thing the founder forbade continues.
2. **Declared resolution.** `composition-boundary-guard.ts`'s C1 `@lore` proves both halves are needed. And
   the blind spot is live: `packages/desktop/package.json` declares **zero** `@hyperidle` dependencies
   while `desktop/src` imports five, resolving purely by hoisting plus `tsconfig.base.json:25`.
3. **MCP tool call.** (C1) Ruling 1(3) names it as one of the three legal mechanisms. Round 1 folded it
   into the seam. It is structurally distinct on every axis: real HTTP + JSON-RPC with a per-session
   bearer token (`harness-registry/src/mcp/index.ts:8-16`); no `api-contract` mirror; the router is owned
   by **agent-execution** (`McpToolBridge.router: Hono`) and hosted by **core-api**
   (`server-factory.ts:1043,1199`); and the caller is a **harness process**, not a package. It is a third
   port surface the round-1 text asserted did not exist.
4. **API call, superseding "seam call".** (C2) Round 1 claimed the seam is *"the only way one Layer
   synchronously asks another"* and that *"there is no eighth kind."* Both are false. **97 `apiFetch(`
   invocations across 51 files** in `packages/web/src`, plus 4 WebSocket topic subscriptions
   (`ws-client.ts:41`, consumed by `useSessionActivity`, `useThreadDetail`, `useAssistantThread`,
   `useConversationsThreads`), carry ~100% of the UI's data and matched no kind at all. The founder's own
   word is "API"; the injected-transport seam is one shape of it, the browser channel another, a socket
   dial a third.
5. **Owned table.** Two Layers can communicate through a shared table with zero imports and zero DI.
   Ruling 6 makes this the largest bypass in the system (§7.5).
6. **Workspace handoff.** Files written into a session working dir that a harness reads. Zero imports,
   zero DB, zero HTTP. Live writers in three Layers.
7. **Capability reach.** `execution-boundary-guard.ts:133-138` bans external modules and `:30-36` bans a
   `child_process` harness spawn. External packages hold no role and a spawn is not a package-to-package
   crossing, so `verdict = f(kind, source role+identity, target role+identity)` cannot express them. This
   is the second half of C5 and why `S12 = 0` was unreachable as round 1 modelled it.

**And one candidate deleted.** Round 1's kind 7, "worker transport," is **gone** (C4). It was described as
*"the link between an agent-orchestration host and a remote-worker."* Verified false: the WS server is
`packages/core-api/src/server-factory.ts:1230`; `/api/workers` is
`packages/core-api/src/routes/workers.ts`; `agent-orchestration` hosts **zero** routers (confirmed
independently by `AU26/plan.md:7`); the host-side remote adapter is constructed at
`core-api/src/services/run-orchestration-composition.ts:283`; and `packages/remote-worker/package.json`
declares exactly one dependency (`@hyperidle/shared`). As built it is a remote Application dialling
core-api's socket — an **API call**. Left as written, the taxonomy would have asked the founder to ratify
a fourth cross-Layer mechanism Ruling 1(3) does not name.

**Route mounting** is resolved as **not a separate kind** — mechanically it is a module import with a
Forbidden verdict — but it gets an explicit examples row, because it is the shape most likely to be
argued as "just wiring."

**Corrected model.** `verdict = f(crossing kind, source actor, target actor)`, where an actor is a role
plus an identity where the verdict varies by identity. Every defect in the candidate list — non-exclusive
entries, mis-grained "same-layer", seven omissions — follows from collapsing kind, role, and verdict into
one flat enumeration.

---

## 5. Ground truth: the live scan

`npx tsx scripts/layer-boundary-scan.ts`, this worktree, `aaa5243f` — 34 packages, 0 unclassified,
**39 module-import statements across 7 pairs**:

| Source | Target | Target Layer | Statements |
|---|---|---|---|
| `core-api` | `session-requests` | agent-orchestration | 15 |
| `core-api` | `harness-registry` | agent-execution | 10 |
| `core-api` | `run-orchestration` | agent-orchestration | 5 |
| `core-api` | `dispatch` | agent-orchestration | 4 |
| `core-api` | `tool-handlers` | agent-orchestration | 3 |
| `core-api` | `agent-execution` | agent-execution | 1 |
| `web` | `core-api` | core-api | 1 |

**By file role:**

| Bucket | Files | Statements |
|---|---|---|
| Composition-root-shaped | `app.ts`, `server-factory.ts`, `session.ts`, `services/*-bindings.ts`, `services/run-orchestration-composition.ts` | **26** |
| `core-api` route handlers | `routes/{bets,knowledge,sessions-routes,tasks,threads,agent-orchestration-sessions-routes}.ts` | **7** |
| `core-api` reactors / read models | `agent-run-admission-reactions`, `assistant-turn-coherence-trigger`, `durable-agent-queue`, `harness-capability-read-model`, `work-session-started-reactions` | **5** |

Also live: **21 domain-event edges** · **4 injected-port crossings** (all `→ harness-registry`) · **0**
`agent-orchestration → core-api` of any kind (AU21 end-state, holding).

**What the scan does not see** (S9, W4) — `layer-boundary-scan.ts:247` returns early unless the source's
role is `layer`, so Application, Tooling, Service, and Foundation sources are never scanned:

| Unmeasured | Count | Where |
|---|---|---|
| Foreign-table imports | **57** | `@hyperidle/eval` 52 (22 files) · `packages/web/scripts` 5 |
| `schema` namespace imports | 4 | `eval/src/runner.ts:14` · `web/scripts/ah{1,5,6}` |
| Application → Service | 2+ | `desktop/src/boot-server.ts:19` · `remote-server`'s declared `harness-registry` |
| Application → Application | 1 | `desktop/src/main.ts:20` → `@hyperidle/remote-worker` |
| Tooling → Service | 3 pkgs | `eval` → `harness-registry`, `settings`, `users` |
| Tooling → raw LLM SDK | 1 | `eval/src/judges.ts:502` → `@anthropic-ai/sdk` |
| Foundation → Foundation | 50 | `design-system → shared` 44 · `db → shared` 6 |
| Undeclared manifest crossings | 5 | `desktop` declares zero `@hyperidle` deps, imports five |
| Workspace handoff outside agent-execution | 3 files | `run-orchestration/{provisioner,connection-provisioning}.ts` · `core-api/src/app.ts` |

Under Ruling 1(4) — governance linting *is* the deliverable — a governance surface with a structurally
blind source set is a defect, not a follow-up.

---

## 6. The governance baseline is wrong: one of the five guards is dead

(C5) Round 1 counted five enforcing guards. **The real baseline is four enforcing and one dead.**

`scripts/au6-agent-boundary-guard.ts:27` — `const SOURCE_ROOTS = ["packages/server/src"] as const;`
`packages/server` **does not exist** (dissolved into `packages/core-api/src/**`; the 14 top-level entries
of `packages/` confirm). Its only allowlist (`:45`) is empty. Verified by running it:
`npx tsx scripts/au6-agent-boundary-guard.ts --check` → `au6-agent-boundary-guard: PASS`, **exit 0,
having visited zero files** — while sitting **7th in the `npm run lint` chain**, vacuously green on
every run this repo has made since `packages/server` dissolved.

This is precisely the failure `docs/architecture/runtime-simplification.md:108-114` names — *"a
hand-maintained scan-root/ownership-list guard silently goes blind when files move and nobody re-roots
it… a guard is a promise someone kept the map current"* — found **inside AU28's own baseline**, in a work
package whose thesis is that boundary enforcement silently misses things. It is the single strongest
piece of evidence for AU28, and round 1 reported it as a live guard.

It is also the strongest argument for Ruling 5. A path-derived scan root is the same defect class as a
path-derived role: both go silently blind when the tree moves.

**The corrected baseline, and what each must map to (S12):**

| Guard | Status | Contract rows it implements |
|---|---|---|
| `table-ownership-guard.ts` | live, PASS — 57 violations outside its scan scope | kind 7, M2b, M5 (j–l) |
| `execution-boundary-guard.ts` | live | M1 kind 1 into agent-execution; **kind 9** (checks 3+4) |
| `composition-boundary-guard.ts` | live | M5 (d) Service → sibling Service; kind 2 |
| `composition-edge-anti-regrowth-guard.ts` | live | M1 cell 8, kinds 1+3; must not be weakened (`plan.md` constraint) |
| `au6-agent-boundary-guard.ts` | **DEAD** — 0 files visited | none. Retire it, or re-root it and state which row it implements. |
| `layer-boundary-scan.ts` | report-only, not in `lint` | M1 kinds 1, 3, 6 — the basis of the new guard |

**And `S12 = 0` was unreachable as round 1 modelled it.** `verdict = f(kind, source role+identity, target
role+identity)` only expresses `@hyperidle` package → `@hyperidle` package. Two live rules are not of that
shape: `execution-boundary-guard.ts:133-138` bans **external** modules outside `agent-execution/`, and
`:30-36` bans a `child_process` spawn of a literal harness binary. External packages hold no role; a
process spawn is not a package-to-package crossing at all. §4's **kind 9** adds the capability axis that
makes both expressible, so `S12 = 0` is now reachable rather than aspirational.

---

## 7. Decided items (round 1 escalations A–D, plus the new rulings)

Round 1 escalated four decisions. All four are settled. Nothing here is open.

### 7.1 No exception state — Ruling 1 + the standing zero-exceptions rule (was escalation A)

`plan.md` AC #5(b)/#7's "individually justified exception" would rebuild, one work package later, the
apparatus AU21 Increment 14e tore out. **Settled: the contract has no exception state.** Those ACs are
re-expressed as **debt** (§3.5) — dated, listed, warning, each with a closing WP, mechanically
shrink-only. The ratchet (S13) is a condition of this, not a nicety.

### 7.2 The supersede is decided, and one statement is kept (was escalation B — W7)

Ruling 1 affirms it. See §1's supersede table. **Do not supersede `runtime-simplification.md:126-128`** —
it already states the new rule and the contract cites it as precedent.

### 7.3 AC #6 is re-scoped — and the claim round 1 rested it on was false (was escalation C — W1, W2)

**Ruling 2 settles the scope:** AU28 owns the rule and its enforcement for
`core-api → agent-execution`; it does **not** own the relocation. The old AC #6 ("resolved first and
completely") is deleted, not reinterpreted.

Two corrections round 1 owes, because the reviewer refuted them and correcting the *principle* matters
more than the example:

- **W1 — the "26 = role conflation" bucket over-reaches by 5 statements.** The arithmetic is exact
  (26 + 7 + 5 = 38, file by file), but the authority quoted — `execution-boundary-guard.ts:62-64`,
  founder ruling `97b8728b` — enumerates specific files and two bucket members are not among them:
  `packages/core-api/src/session.ts:9,15` (a Layer's *public* barrel re-exporting another Layer's values,
  consumed by `eval/src/provision-harness.ts:14`) and
  `services/run-orchestration-composition.ts:4,10,21` (not a `*-bindings.ts`; created **after** the
  ruling, `41a57411`). **21 of 26** are squarely ruled composition root. The general correction, not just
  the two files: *round 1 cited a founder ruling as covering a bucket the ruling's own text does not
  enumerate.* Every appeal to a prior ruling in this contract must quote the ruling's scope, not
  paraphrase it.
- **W2 — "core-api constructs zero harness adapters today" is false.**
  `core-api/src/services/run-orchestration-composition.ts:283` calls `createHarnessAdapter({ kind: "remote", … })`;
  `:122` calls `createReturnEnforcement()`; `:128,:130` call `provisionHarnessEnvironment(...)`. And
  `.pipeline/AU.md:27` reads the same facts the opposite way — *"the more severe subset, since core-api's
  own composition files directly construct/invoke harness adapters."* The general correction: *round 1
  re-labelled "composition file" as "not Layer-role code" and then applied the label to the exact file
  doing the forbidden thing.* Under Ruling 5 the re-labelling is dead anyway — roles are package-grained,
  so these files are core-api Layer code and the crossings are Forbidden.

**W3 — the successor is real, not a hope.** `AU26/plan.md:32` carries a **settled direction**: *"each
Layer owns and exports its own Hono app… composition (DB/reactors/`WsConnectionHub`/MCP-bridge, mounting
both Layer apps, `serve()`) moves to the Application tier (`remote-server`, `desktop`), never to a third
'neutral' package"* — and enumerates the very files in the 26, plus `eval/src/provision-harness.ts`,
`web/scripts/{ah1,ah5,ah6}`, and 11 `core-api` integration tests. **Reconcile:** `.pipeline/AU.md:40`
states AU28 is *"Independent of AU26."* That remains true for AU28's deliverable (rules + linting) and is
**false** for the cleanup — 3 Unsettled cells and 26 debt rows close under AU26. Say so in the track file.

### 7.4 The dead RPC client is deleted inside AU28 (was escalation D — Ruling 4.1)

`packages/web/src/api/client.ts` — verified dead: `AppType = Hono` bare (`core-api/src/app.ts:741`, zero
route inference), `apiClient` has **zero call sites** (the only match repo-wide is its own doc comment),
and it is protected by a bespoke eslint carve-out (`eslint.config.ts:481-483`) that exists solely to
exempt it. In scope for AU28:

1. Delete `packages/web/src/api/client.ts`.
2. Remove `@hyperidle/core-api` and `hono` from `packages/web/package.json:19,22`.
3. Remove the `ignores` carve-out at `eslint.config.ts:481-483`.

Result: **`packages/web/src` is clean under the contract** with no behaviour, bundle, or type change.

**Two consequences that must not be lost:**

- **Removing the manifest dep does not clean `packages/web`.** `web/scripts/ah{1,5,6}-test-server.ts`
  import `@hyperidle/core-api/server-factory`. With the dep removed they resolve only by hoisting — the
  crossing survives and becomes an *undeclared* one, which is strictly worse for kind 2. Architecture must
  choose: relocate the three scripts to a Tooling package in AU28, or record all three as debt with a
  named closer. Same applies to `@hyperidle/connections` and `@hyperidle/harness-registry`, which
  `packages/web/package.json` declares **only** for those scripts.
- **The underlying risk stays open.** Every response shape in `packages/web` is an unchecked cast
  (`hooks/useFetch.ts:29`, `res.json() as Promise<T>`), so server/client drift is undetectable by `tsc`.
  Deleting the RPC client removes the *illegal import*, not the *correctness gap*. Separate WP (§9).

### 7.5 Table ownership is complete — no unowned state (Ruling 6, new)

**Every table has exactly one owning Service. The exempt set is abolished.**

The mapping is already complete: `TABLE_OWNER` 39 rows + `UNOWNED_SHARED_TABLES` 4 = 43 = every table in
`packages/db/src/schema.ts`, with `assertDisjointOwnership` hard-throwing on overlap at load time. **The
exempt set is the hole, not the mapping.**

Its rationale (`table-ownership-guard.ts:276-330`) is circular: because many Services access the table,
naming one owner "would be a false-ownership claim the zero-exceptions ACL principle forbids." That
inverts the principle — many Services touching a table directly **is** the violation. The exemption
preserves the smell and calls it rigor.

`sessions` sprawl, measured: **34 non-test files across 8 package areas in 3 Layers** — `eval/src` 12,
`core-api/src` 9, `agent-orchestration/run-orchestration` 7, `core-api/policy` 2,
`core-api/{work,review,realtime}` 3, `agent-orchestration/tool-handlers` 1.

Requirements this produces:

- The contract states the completeness rule (every table, exactly one owner, enforced) and names **owned
  table** as a crossing kind whose cross-Layer verdict is Forbidden, closed structurally by single-Service
  ownership. Without that, the biggest bypass in the system is unlisted: a shared table is a cross-Layer
  channel with zero imports and zero DI, invisible to every import- and DI-based check **by construction**.
- The lint **reports the four unowned tables as debt** (Ruling 2: warn now, clean later), never exempts
  them. `db:owned-table` for those four is `Unsettled — blocked on the sessions-ownership WP`.
- **`sessions` has no Service and one should exist.** Assigning an owner is identifying a missing
  boundary, not bookkeeping. Registered as a successor (§9).
- **Tooling → owned table gets its own explicit verdict: Forbidden, no carve-out.** `eval` is the single
  largest consumer of `sessions` (12 files) and holds 52 of the 57 foreign-table imports. The alternative
  is that a bench seeds through the owning Service's API — it already boots the real server.
- **Type-only does not exempt a table import**, closing the `!isTypeOnly` hole at
  `table-ownership-guard.ts:580,585`.
- **`export * as schema`** (`packages/db/src/index.ts:32`) hands all 43 tables through one symbol no
  name-based ACL can see. Forbidden for every actor; alternative is `createPgliteDb` / `applyMigrations`,
  which the four live users are re-implementing anyway.

### 7.6 Cross-Layer DI: the ruling's first-named rule, and what closing it costs (C3)

Round 1 declared injected ports Forbidden across Layers and reported the four live instances — then
dropped them: no measure counted them, no AC covered them, no alignment row named them. Fixed by **S6**,
**AC-5**, and the alignment table in §8.

**And the cost is larger than the 38 imports, which round 1 never stated.** The four —
`dispatch → harness-registry` (`DispatchPorts`) and `run-orchestration → harness-registry` (`RunOptions`,
`RunTransitionSpec`, `RuntimeDeps`) — are how `agent-orchestration` reaches a harness in-process.
`packages/desktop/src/boot-server.ts:19` injects `createLocalAdapterPool` / `createSandboxAdapter` into
`createServer`, and `run-orchestration` consumes the resulting `AdapterPool` as an injected object. Under
Ruling 1(1) that is Forbidden, so **laptop-solo's in-process embedding of the harness must become
API/MCP/events too — a runtime topology change to the product's primary deployment**, not an import
rewrite. AU28 states the rule and measures the violations; the topology change is a successor (§9).

Note also that routing a port through an Application does not legalise it: an Application may wire only
ports whose declaring interface belongs to the **receiving** Layer. Ruling 1(1) is about the port, not the
wirer.

### 7.7 The founder's own legal mechanism is illegally wired (new finding)

MCP is one of the three mechanisms Ruling 1(3) declares legal. It exists today **only by virtue of a
Forbidden crossing**: agent-execution owns `McpToolBridge.router: Hono`
(`harness-registry/src/mcp/index.ts:8-16`); core-api imports `createMcpToolBridge`
(`server-factory.ts:44` — kind 1, Forbidden), constructs it (`:1043`), and hosts its router (`:1199`).
The alternative is exactly AU26's locked design: agent-execution exports its own Hono app; the Application
mounts both. Recorded so the contract does not accidentally bless the plumbing while naming the mechanism.

---

## 8. Acceptance criteria — rewritten

**Ruling 4.2 releases `plan.md`'s ACs explicitly** (*"fuck the ACs"*): #5/#6/#7 assumed AU28 does the
cleanup, and Ruling 2 says it does not. This is a founder release, not a silent scope reduction. The set
below replaces them and is mirrored into `plan.md`.

| # | Acceptance criterion | Verification |
|---|---|---|
| **AC-1** | **The contract exists as one written page** enumerating every cell of the connection space — 9 crossing kinds × the full actor space — each marked `Allowed` (with the general rule), `Forbidden` (with the legal alternative), or `Unsettled — blocked on <named thing>`. All 12 ordered Layer pairs written in both directions. No cell without a verdict. | The page's own scorecard arithmetic reconciles (per-matrix totals sum to the grand total; Allowed + Forbidden + Unsettled = total). A contract self-check script fails if any enumerated cell has no verdict (**R1**). |
| **AC-2** | **Package roles come from an explicit registry, never a directory path.** All 34 packages classified; an unregistered package throws. | A fixture that relocates a package directory (e.g. `packages/db` → `packages/shared/db`) and asserts **every verdict is unchanged**. Without this fixture, Ruling 5 is unproven. |
| **AC-3** | **The governance lint runs in `npm run lint`**, warns on every violation known at landing (visible, not silent), and **hard-fails on any new one** (**R2**). | `npm run lint` on the landing commit reports the full debt set and exits 0. A scratch commit adding one new Forbidden crossing of each kind exits non-zero, citing file, line, kind, actor pair, and the legal alternative. A **real red**, not a fixture-only green. |
| **AC-4** | **Every crossing kind is fixture-proven** — ≥1 Allowed and ≥1 Forbidden synthetic case each — or documented in the contract as not statically detectable and therefore Forbidden outright. | The guard's `--fixtures` mode covers all 9 kinds; a missing kind fails the fixture run. |
| **AC-5** | **Cross-Layer injected ports are detected and counted** — the ruling's first-named rule, unmeasured today. Baseline 4. | The lint reports exactly 4 at landing; a 5th hard-fails. A fixture proves an injected port that crosses a Layer boundary is caught while the same shape inside one Layer passes. |
| **AC-6** | **Debt is mechanically shrink-only.** A committed per-category count; live count above it fails the build, below it fails with "update the ratchet." No exception state exists anywhere in the contract or the guard. | A fixture proving that **adding a debt row** to accommodate a new crossing fails the build. Grep proving no `ALLOWLIST`/exemption set is introduced. |
| **AC-7** | **Guard reconciliation: zero orphans in both directions.** Every contract row names ≥1 enforcing guard; every guard in the `lint` chain maps to ≥1 contract row. `au6-agent-boundary-guard.ts` — verified dead, 0 files visited, exit 0 — is retired or re-rooted with its row named. | A reconciliation table in the contract, plus re-running each guard and recording its real file-visit count (not just its exit code). |
| **AC-8** | **Table ownership is complete: 43 of 43 tables have exactly one owning Service; `UNOWNED_SHARED_TABLES` is deleted, not emptied.** The four current members report as debt with the sessions-ownership WP named. Type-only table imports and `schema`-namespace imports are Forbidden. | `table-ownership-guard` covers all 43 with no exempt branch; fixtures for a type-only table import and a `schema` namespace import both fail. |
| **AC-9** | **Application, Tooling, Service, and Foundation are scanned as crossing sources**, not only Layers. | The lint's landing report includes non-zero counts for: 57 foreign-table imports, `desktop`'s 5 undeclared manifest crossings, Application→Application (1), Tooling→Service (3), Foundation→Foundation (50). Today all are structurally invisible (`layer-boundary-scan.ts:247`). |
| **AC-10** | **The dead Hono RPC client is deleted**: `packages/web/src/api/client.ts`, the `@hyperidle/core-api` + `hono` deps at `packages/web/package.json:19,22`, and the eslint carve-out at `eslint.config.ts:481-483`. `packages/web/src` has zero cross-Layer crossings afterward. | `npm run check` + `npm run build` green; bundle unchanged; `layer-boundary-scan` shows zero `web/src` crossings. The three `web/scripts` crossings are explicitly relocated or recorded as debt — **not left undeclared**. |
| **AC-11** | **`agent-orchestration → core-api` stays at zero**, any kind, unregressed from AU21's end-state, and `composition-edge-anti-regrowth-guard.ts` is not weakened. | The guard's existing `--fixtures` scenarios pass unchanged; if it is subsumed, the replacement is proven equivalent-or-stronger against the **same** fixtures. |
| **AC-12** | **The superseded ground-truth statements are amended in place**, and `runtime-simplification.md:126-128` is kept and cited. | The three superseded statements carry a supersede note pointing at the contract page; `:126-128` is unchanged and quoted by the contract. |

### Validation scenarios

- Given the lint is in CI, when a PR adds a raw `import` from a `core-api` file into an
  `agent-orchestration` or `agent-execution` package, then `npm run lint` fails citing file, line, kind
  (module import), actor pair, and the legal alternative.
- Given the lint is in CI, when a PR adds an injected port whose interface belongs to another Layer, then
  `npm run lint` fails — **and the equivalent port inside one Layer passes.**
- Given the lint is in CI, when a PR imports a table symbol it does not own — including `import type` and
  including via `schema` — then `npm run lint` fails.
- Given the debt ratchet, when a PR adds a debt row to make its own change pass, then the build fails.
- Given the role registry, when a package directory is relocated, then every verdict is unchanged and the
  lint result is byte-identical.
- Given the pre-existing violations at landing, when `npm run lint` runs on the landing commit, then all
  of them are reported as WARNINGS (visible, not silent) and the build succeeds.

---

## 9. Successor work packages

Named so every Unsettled cell has an owner and every Forbidden cell with live instances has a closer. All
are **out of AU28** per Ruling 2.

| WP | Closes | Size signal |
|---|---|---|
| **AU26** (registered, design locked at `AU26/plan.md:32`) | each Layer owns and exports its own Hono app; composition moves to the Application tier | 3 Unsettled cells · 26 debt rows · the MCP-hosting import (§7.7) |
| **sessions-ownership** (new — Ruling 6) | every table gets exactly one owning Service; `sessions` gets the Service it is missing | 4 Unsettled cells · 34 `sessions` files across 3 Layers · 8 `core-api/src` foreign-table imports |
| **db ACL hardening** (new) | widen `table-ownership-guard`'s scan scope beyond nested Services + `core-api/src`; close the type-only and `schema`-namespace holes | 57 foreign-table imports · 4 namespace sites |
| **`shared` decomposition** (new — Ruling 3.3) | inventory S1–S5; relocate the cross-Layer port pair out of `agent-work-intent-recorder.ts:425,433` | ~180 of ~940 symbol-occurrences · 20 of 49 clusters used by ≤1 Layer |
| **api-contract disposition** (new — Ruling 3.1) | re-cut a package with 1 live consumer cell of 6 and 11 zero-importer exports; fix the false "no runtime code" claim at `index.ts:6` | per-family scoping of the `→ api-contract` column |
| **web ↔ core-api typed contract** (new — Ruling 4.1's note) | every `packages/web` response shape is an unchecked cast; drift undetectable by `tsc` | 97 `apiFetch` call sites |
| **cross-Layer DI dissolution** (new — §7.6) | the 4 injected-port crossings and `desktop`'s in-process topology | runtime topology change to laptop-solo |
| **core-ui Service decomposition** (open question, unregistered — `runtime-simplification.md:89-94`) | whether `core-ui` decomposes at all | 2 Unsettled cells |

---

## 10. Required reading (downstream: `/architecture`, `/architecture-critique`, `/pipeline`)

**Binding, read first:**
- `.pipeline/work/AU28/founder-rulings.md` — Rulings 1–6. Override `docs/`, `CLAUDE.md`, and any prior WP.
- `.pipeline/work/AU28/rule-matrix.md` — the 1169-cell contract content.
- `.pipeline/work/AU28/foundation-inventory.md` — api-contract / shared / db-ACL evidence.

**Ground truth being superseded:**
- `docs/architecture/runtime-simplification.md` — lines 30-31 and 164-172 superseded; **126-128 kept and
  cited**; 139-186 define AU19 Mechanisms A/B/C (cross-reference, do not renumber); 108-114 is the
  hand-maintained-map warning `au6-agent-boundary-guard.ts` now proves.
- `CLAUDE.md:84`; `docs/architecture/{index,system-overview,decisions}.md`.

**The boundary as built:**
- `.pipeline/work/AU21/architecture.md` — Decisions A/C (the `CoreApiPort` seam), D
  (`AgentOrchestrationPort`), H/H1/H2 (bake-at-emit), L + Increment 14e (**exemption apparatus deleted
  outright** — §3.5 turns on it).
- `packages/api-contract/src/{core-api-port,agent-orchestration-port}.ts` — the seam shape; fidelity is a
  *tested* obligation, never a compiler guarantee.
- `packages/agent-execution/harness-registry/src/mcp/index.ts` + `packages/core-api/src/server-factory.ts:1043,1199`
  — MCP as actually built (§7.7).
- `packages/web/src/services/{api-fetch,ws-client}.ts` — the browser channel, kind 4's dominant shape.

**The enforcement surface — read every header:**
- `scripts/layer-boundary-scan.ts` — the 3 detectors, `--fixtures`, the hard-throw on unclassified
  packages, and **`:247`**, the early return that makes 5 of 6 source roles invisible.
- `scripts/au6-agent-boundary-guard.ts:27` — **dead**; run it and read the file count.
- `scripts/execution-boundary-guard.ts:30-36, 55-128, 133-138` — founder ruling `97b8728b`; the two
  capability checks kind 9 exists to express.
- `scripts/composition-boundary-guard.ts:1-47` — Layer packages deliberately unscanned; the C1 `@lore` on
  why import *and* manifest checks are both required.
- `scripts/table-ownership-guard.ts:276-354, 399-418, 514-630` — the exempt set Ruling 6 abolishes, the
  test exclusion, and the scan scope that hides 57 violations.
- `scripts/composition-edge-anti-regrowth-guard.ts:26-31, 56-58, 417` — `DEFERRED_FOLLOWUP` real and
  empty; the recorded review rejection that makes the ratchet load-bearing.
- `package.json` `"lint"` — the exact chain S12 reconciles against.

**Constraints:**
- `ETHOS.md` §1 (no enterprise ceremony — one table and one script, not a rule framework), §3 (boil the
  lake: all 12 ordered pairs and all 1169 cells, not the ones someone complained about), §4 (extract
  before invent).

**Cross-reference, do not duplicate:** `.pipeline/work/AU26/plan.md` (locked Hono-app split — 3 Unsettled
cells and 26 debt rows close there); `.pipeline/AU.md` (track frame; **`:40`'s "Independent of AU26" needs
the qualification in §7.3**).
