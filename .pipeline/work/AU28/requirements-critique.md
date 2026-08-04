# Refine Critique: AU28

**Score:** 7.7/10 · **Rounds:** 1
**Verdict:** **REVISE — round 2 required before the founder gate.** The score clears 7, so this does not go back to `/refine`: the frame, the two-axis correction, and the escalation discipline are right. But the founder's Ruling 1 (`.pipeline/work/AU28/founder-rulings.md`, 2026-08-04) landed mid-pass and materially expands what `requirements.md` must cover. Five CRITICAL findings below; four of them are consequences of the ruling that the document does not yet carry, and each would put a false or incomplete statement in front of the founder.

Scored against the **founder's actual rule**, not `plan.md`'s. Reviewer: fresh evaluator, did not write `requirements.md`. Every claim re-verified against the real tree at `aaa5243f`.

**The rule being scored against** (Ruling 1):
- (a) DI is legal **only within the same Layer**.
- (b) A Layer imports only from `shared` or within its own Layer.
- (c) Cross-Layer conversation goes through **API / MCP or events** — nothing else.
- (d) The deliverable is **both** the settled definition **and** architectural governance linting that enforces it.

---

## Scores by dimension

| # | Dimension | Score | One-line |
|---|---|---|---|
| 1 | Value | 9 | Concrete beneficiary + a concrete, code-verified failure (`npm run lint` green on 6 real illegal route imports). Not paste-able onto another WP. |
| 2 | Success | 7 | S1–S9 are falsifiable and their baselines reproduce exactly. But the ruling's first-named rule (cross-Layer DI) has **no** measure, S6's target is unreachable as modelled, and Application/Tooling crossings are unmeasured. |
| 3 | Scope | 8 | Real non-goals with reasons. One narrowing recommendation (§7-C(ii)) rests on an overstated fact. |
| 4 | Guide draft | 7 | Genuinely usable page, situation-first. Two statements in it are factually wrong against real code. |
| 5 | Noun clarity | 6 | Nouns well-defined and collisions independently verified — but the "closed set of seven" omits MCP (which the founder names), mis-states worker transport, and cannot express the browser channel. |
| 6 | Tier fit | 9 | `production`. Fixture bar, refusal of a rule DSL, and the boil-the-lake 12-pair sweep all match tier and ETHOS §1. |

**Average: 7.7**

---

## CRITICAL

### C1 — MCP is absent from the taxonomy, and it is not a sub-shape of the seam call

Ruling 1 names **API / MCP / events** as the three legal cross-Layer mechanisms. `requirements.md`'s closed set of seven does not contain MCP. It appears exactly once, folded into another noun: `:112` — *"fetches it itself through its own `CoreApiPort` MCP tools during the run."* That phrase conflates two different mechanisms.

Verified against real code — MCP is structurally distinct from the seam call on every axis of the §2 `:104` definition:

| | Seam call (`requirements.md:104`) | MCP as actually built |
|---|---|---|
| Transport | injected `(req: Request) => Promise<Response>` | real HTTP + JSON-RPC with a per-session bearer token (`packages/agent-execution/harness-registry/src/mcp/index.ts:8-16`, `open()` returns `{ token }`) |
| Type contract | hand-mirrored port interface in `@hyperidle/api-contract` (`packages/api-contract/src/core-api-port.ts`) | MCP tool schemas, no `api-contract` mirror |
| Router owner | the target Layer's own routes | **agent-execution** owns the router (`McpToolBridge.router: Hono`), **core-api** hosts it (`packages/core-api/src/server-factory.ts:1043` constructs it; `packages/core-api/src/app.ts:202,207` mounts it and writes `.mcp.json` for harness auto-discovery) |
| Caller | a package | a **running harness process** — not a package at all, so §3.1's *"code in package A reaching code in package B"* does not even describe it |
| Instances | *"`CoreApiPort` and `AgentOrchestrationPort` are the two that exist"* | a third, unnamed one |

MCP is the mechanism by which an `agent-execution`-hosted harness reaches `core-api` and `agent-orchestration` tool handlers (`packages/core-api/src/services/tool-provider-bindings.ts`, `tool-handlers-bindings.ts`). It is one of the three things the founder declared legal. It must be a named kind with its own ordered-pair verdicts, in the founder's own vocabulary.

**Ruling: real gap, not a folding.** Add MCP as a kind.

### C2 — "Seam call" is too narrow to be the founder's "API", and `core-ui ↔ core-api` runtime traffic still has no kind

`:83` promises *"There is no eighth kind"*; `:104` states the seam call is *"the **only** way one Layer synchronously asks another Layer for something."* Both are false against real code:

- `packages/web/src/api/client.ts:39` — `hc<AppType>(baseUrl, { fetch: apiFetch })`. A real network call from `core-ui` to `core-api`. No injected transport, no `api-contract` mirror. This is how the entire product talks to its backend, and under Ruling 1(c) it is plainly legal — it *is* "API".
- `packages/web/src/services/ws-client.ts` (`new WebSocket(...)`) ← `packages/core-api/src/services/work-state-push-gateway.ts:40,51` (`target.broadcast(...)` via `@hyperidle/realtime`'s `WsConnectionHub`). A `core-api → core-ui` push with zero imports. Not the seam, not `EventBus`.

The §1 non-goal *"Runtime enforcement. Static-only"* does not cover this — that non-goal is about the enforcement mechanism, and the set already names three other runtime channels (seam call, domain event, worker transport).

Consequence at the gate: `S1` demands 12 of 12 ordered Layer pairs get a written verdict, and these are two of the twelve. They cannot be given a truthful one under the set as written, and a `packages/web` reader following the guide draft gets a wrong answer.

**Fix, now easy because the founder supplied the vocabulary:** rename/widen kind 4 from `seam call` to **API call** — a request to a route the target Layer owns, over any transport — with the `CoreApiPort`/`AgentOrchestrationPort` injected-transport seam as one *shape* of it, the Hono RPC client another. Then rule explicitly on the WS push (widen "events" to cover it, or give it a row).

### C3 — The ruling's first-named rule — cross-Layer DI — has no AC, no measure, and no AC-alignment row, and 4 live violations exist today

Ruling 1(1): *"DI is legal only within the same Layer… this is the crossing the founder names first and the one invisible to import-based checks by construction."* `requirements.md:103` correctly declares injected port *"Forbidden across Layers"* and `:205` correctly reports the four live instances. Then it drops them:

- `S3` counts **module imports** only (39). No measure counts injected-port crossings.
- §8's AC-alignment table has rows for ACs 1–7 plus two "no AC" rows (`web → core-api`, guard reconciliation). **No row for injected ports.**
- Every AC in `plan.md` enumerates only the 38 module imports.

The four are real and reproduce on the live scan (Mechanism 3): `dispatch → harness-registry` via `DispatchPorts`; `run-orchestration → harness-registry` via `RunOptions`, `RunTransitionSpec`, `RuntimeDeps` — all wired at `packages/core-api/src/services/dispatch-bindings.ts` and `run-orchestration-composition.ts`.

**And their cost is larger than the 38 imports.** These four are how `agent-orchestration` reaches a harness in-process. `packages/desktop/src/boot-server.ts:19` injects `createLocalAdapterPool`/`createSandboxAdapter` into `createServer`, and `run-orchestration` consumes the resulting `AdapterPool` as an injected object. Under Ruling 1(1) that is forbidden, so laptop-solo's in-process embedding must become API/MCP/events too — a **runtime topology change to the product's primary deployment**, not an import rewrite. `requirements.md` never states this. It is the single largest unstated consequence of the ruling and the founder needs it in front of him before he signs.

**Fix:** add a success measure for injected-port crossings (target 0), an AC-alignment row recommending a new AC, and a plain statement of what closing the 4 costs `desktop`.

### C4 — Kind 7 (worker transport) is factually mis-attributed, and as described it is a fourth legal cross-Layer mechanism the ruling does not name

`:107` — *"the `worker-ws` / `remote-harness-adapter` link between an **agent-orchestration host** and a `remote-worker` running `agent-execution`."* Repeated at `:208`. Verified false:

- The WS server is created in **`packages/core-api/src/server-factory.ts`** (`new WebSocketServer({ noServer: true })`, `websocket: { server: … }`, worker auth via `HYPERIDLE_WORKER_TOKEN` query param). `agent-orchestration` hosts nothing — confirmed independently by `.pipeline/work/AU26/plan.md:7`: *"`agent-orchestration` hosts **zero** of its own HTTP/WS routes today."*
- `GET /api/workers` is `packages/core-api/src/routes/workers.ts`, a core-api route.
- `remote-harness-adapter.ts` lives in `packages/agent-execution/harness-registry/src/`, but the host-side instance is constructed at `packages/core-api/src/services/run-orchestration-composition.ts:283`.
- `packages/remote-worker/package.json` declares exactly one dependency: `@hyperidle/shared`.

This matters for the gate: **as written**, kind 7 is an `agent-orchestration ↔ agent-execution` conversation that is neither API, MCP, nor events — i.e. `requirements.md`'s taxonomy admits a cross-Layer crossing Ruling 1(c) forbids. **As actually built**, it is core-api hosting a WS endpoint that a remote Application dials, which collapses cleanly into "API" once C2's widening lands. Stating the fact correctly dissolves the conflict; leaving it as-is asks the founder to ratify a set with a fourth mechanism smuggled into it.

### C5 — The enforcement baseline handed to the founder is wrong: one of the five guards is dead

Ruling 1(4) makes **architectural governance linting** the deliverable, which makes the governance-surface inventory (`S6`) load-bearing rather than housekeeping. That inventory is wrong.

`:50` counts `au6-agent-boundary` among the 5 "enforcing guards"; `:335` calls it *"file-scoped legacy rules still in lint."* It enforces nothing. `scripts/au6-agent-boundary-guard.ts:27` — `const SOURCE_ROOTS = ["packages/server/src"] as const;` — and `packages/server` does not exist (dissolved into `packages/core-api/src/**`; `ls packages/` confirms). Its only allowlist (`:45`) is empty. `npx tsx scripts/au6-agent-boundary-guard.ts --check` → `PASS`, exit 0, having visited zero files. It sits in the `lint` chain, vacuously green.

This is precisely the failure `docs/architecture/runtime-simplification.md:108-114` names — *"a hand-maintained scan-root/ownership-list guard silently goes blind when files move and nobody re-roots it… a guard is a promise someone kept the map current"* — found inside AU28's own baseline, in a work package whose thesis is that boundary enforcement silently misses things. It is the strongest single piece of evidence for AU28 and the requirement reports it as a live guard. Real baseline: 4 enforcing + 1 dead.

**Related, same finding family:** `S6 = 0` is unreachable as modelled. `verdict = f(crossing kind, source role + identity, target role + identity)` (`:211`) only expresses `@hyperidle` package → `@hyperidle` package. Two live rules are not of that shape — `scripts/execution-boundary-guard.ts:133-138` bans **external** modules (`@modelcontextprotocol/sdk`, raw `openai`/`@anthropic-ai/sdk`) outside `agent-execution/`, and `:30-36` (check 4) bans a `child_process` spawn of a literal harness binary. External packages hold no role; a process spawn is not a package-to-package crossing at all. These are the two checks that implement the older *"only `agent-execution` invokes a harness"* rule AC #6 leans on. Either add a capability axis, or scope S6 explicitly to `@hyperidle`-to-`@hyperidle` and name what stays outside the contract and why.

---

## WARNING

### W1 — §6's "26 of 38 = role conflation" over-reaches by 5 statements; the founder ruling it cites does not cover them

**The load-bearing scope claim survives.** I re-ran `npx tsx scripts/layer-boundary-scan.ts` and the arithmetic is exact, file by file: 26 composition + 7 routes + 5 reactors = 38. AU28's true size is not 3x what refine says.

But the authority quoted — `scripts/execution-boundary-guard.ts:62-64`, founder ruling `97b8728b` — enumerates specific files: *"`app.ts`, `server-factory.ts`, `routes/`, `middleware/`, `auth/`, `schemas/`, the 10 `*-bindings.ts` Service-wiring files."* Two bucket members are not in it:

- `packages/core-api/src/session.ts:9,15` (2 statements). Its own header (`:1-8`) says *"Session provisioning barrel — exported for external consumers (e.g. eval package)"*, and it re-exports `AdapterPool` and `createSandboxAdapter` — **values** — from `@hyperidle/harness-registry` through `core-api`'s public subpath surface, consumed by `packages/eval/src/provision-harness.ts:14`. That is a Layer's public API re-exporting another Layer, not composition wiring.
- `packages/core-api/src/services/run-orchestration-composition.ts:4,10,21` (3 statements). Not a `*-bindings.ts`; created **after** the ruling (`git log --diff-filter=A --follow` → `41a57411`, AU20 #456).

The guard's blanket exemption is `packages/core-api/src/**`, so the guard covers them; the **ruling text** cited as evidence does not. 21 of 26 are squarely ruled composition root. State the claim at its real strength.

### W2 — "core-api constructs zero harness adapters today" is false at file grain, and it is what escalation C's recommendation rests on

`:254` concludes *"`core-api`'s Layer-role business code already constructs and invokes zero harness adapters today"* → *"AC #6's substance is met at the Layer grain right now"* → §7-C recommends option **(ii)**.

`packages/core-api/src/services/run-orchestration-composition.ts:283` — `return createHarnessAdapter({ kind: "remote", ws, registration: … })`. Also `:122` `createReturnEnforcement()`, `:128`/`:130` `provisionHarnessEnvironment(...)`. And it reaches `@hyperidle/eval` as a public export via `session.ts`.

The WP's own registry row reads the same facts the opposite way — `.pipeline/AU.md:27`: *"11 `core-api → agent-execution` (harness-registry — **the more severe subset, since core-api's own composition files directly construct/invoke harness adapters**, violating the separate, older 'only agent-execution invokes a harness' rule)."*

The re-labelling from "composition file" to "not Layer-role code" is the entire argument, and it is applied to the exact file that does the forbidden thing. Presenting (ii) without `:283` and without `AU.md:27`'s framing is the founder's named failure mode — **scope-narrowing to the example**. Escalation C's *collision* is real and correctly raised; the recommended exit must carry its counter-evidence.

### W3 — Escalation C is under-sourced exactly where it is strongest

`.pipeline/work/AU26/plan.md:32` already carries a **settled direction** — *"each Layer owns and exports its own Hono app… composition (DB/reactors/`WsConnectionHub`/MCP-bridge, mounting both Layer apps, `serve()`) moves to the Application tier (`remote-server`, `desktop`), never to a third 'neutral' package"* — and enumerates the very files in §6's 26, plus `packages/eval/src/provision-harness.ts`, `web/scripts/{ah1,ah5,ah6}`, and 11 `core-api` integration tests. `requirements.md:344` cites AU26 only under "cross-reference, do not duplicate." Option (ii) is far stronger with AU26:32 as evidence that the closing WP exists with a **locked design**, not a hope.

Also reconcile: `.pipeline/AU.md:40` states AU28 is *"Independent of AU26."* Option (ii) makes AC #6's completion depend on AU26. Say so.

### W4 — Application and Tooling crossings are structurally invisible to the tool the requirement measures with, and one role pair has no verdict at all

`scripts/layer-boundary-scan.ts:247` — `if (fromPkg.kind.kind !== "layer") return [];`. Application and Tooling packages are never scanned as a **source**. So §7's two flagged rows have zero baseline, zero success measure, and cannot be closed by re-running the scan the way `S3` and AC #7 assume. Under Ruling 1(4) — governance linting as the deliverable — a governance surface with a structurally blind source set is a defect, not a follow-up.

Real, verified, unmeasured:
- `packages/desktop/src/boot-server.ts:18-19` imports `@hyperidle/core-api/server-factory` and `@hyperidle/harness-registry` while `packages/desktop/package.json` declares **zero** `@hyperidle` dependencies — a pure kind-#2 (manifest dependency) blind spot, exactly the asymmetry §3.2 says kind #2 exists to catch.
- `packages/desktop/src/main.ts:20` imports `@hyperidle/remote-worker` — an **Application → Application** pair, absent from §3.3's role model, §7's flagged rows, and the guide draft.
- `packages/eval/package.json` declares `@hyperidle/{core-api, harness-registry, settings, users, db, shared}` — Tooling reaching four packages deep past three barrels.

### W5 — "Open debt" has no mechanical shrink-only guarantee, so today it is `DEFERRED_FOLLOWUP` plus a promise

The distinction from "exception" is real and its factual basis fully verified (N3). But §3.5's three hard rules — never used to pass your own change, only shrinks, every row dated with a closing WP — are prose, measured by nothing. No entry in S1–S9 enforces monotonic decrease, row-shape validity, or authorship.

The precedent cuts both ways. `scripts/composition-edge-anti-regrowth-guard.ts:56-58` records that one work package ago, *"a prior (second) pass reached zero by adding two builder-ruled `ALLOWLIST` entries with no founder sign-off, and by presenting a `DEFERRED_FOLLOWUP` set as an already-resolved descope to a new work package — both rejected on review."* Convention failed at this exact table, in this exact file, under review. Open debt needs a measure — a count floor that only ratchets down, plus a fixture proving a newly-added row fails — or it is the same allow-state with a better name. This matters more under Ruling 1(4): governance linting whose escape hatch is governed by convention is not governance.

### W6 — §3.4's two hard rules contradict each other

`:171` — *"**Default is Forbidden.** An unwritten row is a build error, not permission."* Deny-by-default (the *crossing* fails lint) and contract-completeness (the *contract* fails validation because a row is missing) are different mechanisms with different failure surfaces. The second is what makes symmetry structural; the first alone does not. Architecture will guess. Pick one, or state both as two separate rules.

### W7 — The supersede is now decided, and `requirements.md` must state it as a decision, not a proposal

Ruling 1 affirms escalation B. `requirements.md:39` and §7-B still frame it as *"for the founder to ratify."* Rewrite as settled: `docs/architecture/runtime-simplification.md:30-31`, `:164-172`, and `CLAUDE.md:84` are **superseded**, and the contract page says so on its face. Architecture needs the supersede list to be a closed instruction, not an open question — and per `plan.md`'s Plan-calls (a), reconciling-or-superseding ground truth is an explicit deliverable.

One correction for whoever writes the supersede: `runtime-simplification.md` is internally contradictory, and one statement is already **aligned** with the new rule — `:126-128` says the 4 Layer packages *"depend on their own Layer's Service packages (**nothing more**)."* Supersede three statements; keep and cite that one, don't rewrite it.

---

## The two open questions the ruling leaves — what each answer costs

### Open question 1 — does "shared" mean `@hyperidle/shared`, or the whole Foundation set?

**Literal `@hyperidle/shared` only: not implementable.** It breaks three load-bearing things simultaneously:
- **All database access.** A Service owns its table by being the sole importer of the table object from `@hyperidle/db`. `scripts/composition-boundary-guard.ts:9-16` encodes exactly `@hyperidle/db` + `@hyperidle/shared` as a Service's permitted deps. Remove `db` and the entire Table-ACL model (AU12–AU18, `table-ownership-guard.ts`, crossing kind #6) collapses.
- **The seam itself.** `CoreApiPort`/`AgentOrchestrationPort`'s type mirrors live in `packages/api-contract/src/core-api-port.ts`. Kind #4 — one of the founder's three legal mechanisms — cannot exist without importing `@hyperidle/api-contract`.
- **All UI.** `packages/web` (the `core-ui` Layer) imports `@hyperidle/design-system` for every component.

**Foundation set (4 packages): the only workable reading**, and it is already what `plan.md`'s constraints line states (*"Foundation packages … remain importable by every Layer"*) and what `requirements.md:87-93` encodes. Cost: essentially zero — it is the status quo, verified clean at the Service grain.

**What `requirements.md` must do:** it answers this correctly *by construction* but never surfaces it as a question or states the cost. Now that the founder has asked, add it explicitly, with the three breakages above as the evidence. Also state the sub-rule the founder's wording implies and the codebase already enforces: `@hyperidle/shared` itself imports nothing but itself (`plan.md` constraint, currently unchecked).

### Open question 2 — Application tier / composition root (= escalation C)

| Option | What AU28 ships | Cost |
|---|---|---|
| **(i) AU28 relocates the 26 to the Application tier** | Definition + governance linting + a genuinely clean tree | AU28 absorbs AU26's settled workspace-api/orchestration-api split (`AU26/plan.md:32`), including 3 `web/scripts` test servers, 4 eval files, and 11 `core-api` integration tests that construct `createApp()` directly. Effort L → XL. AU28 and AU26 collide on the same files. AU28 stops shipping independently. |
| **(ii) Open debt, closed under AU26** *(refine's recommendation)* | Definition + governance linting + the 12 genuine Layer-grain violations (7 routes, 5 reactors) + the 4 injected ports (C3) | AU28 stays L and independent. Ships with 26 dated Open-debt rows warning on every lint run and AC #6 unmet as literally worded. Risk: the warn state persists if AU26 slips — which W5's missing shrink-only measure does nothing to bound. |
| **(iii) AU28 depends on AU26** | Same as (i), serialized | Governance linting — the founder's stated deliverable (b) — lands behind an L work package with four independent sub-tracks. Longest path to the thing actually asked for. |

**My read, independent of refine's:** (ii), for one reason refine does not state — Ruling 1(4) makes the deliverable *the definition plus the linting*, and neither requires the cleanup. (ii) delivers 100% of the founder's stated ask on the shortest path and converts the 26 into a tracked, visible debt owned by a WP with a locked design. But (ii) is only safe if W5 is fixed first: Open debt with no mechanical ratchet is how 26 rows become permanent. Make the shrink-only measure a condition of choosing (ii), not a nicety.

---

## NOTE

- **N1 — Symmetry is genuinely delivered at Layer grain.** 4 Layers → 12 ordered pairs (`S1`), verdicts per *ordered* pair with both directions always written (`:170`), default Forbidden. A real structural fix for AU28's literal root cause. Scoping Service rules role-based rather than a ~400-cell matrix (`:68`) is correct and well-reasoned.
- **N2 — Every scan number reproduces exactly.** Live re-run: 39 Mechanism-1 statements across 7 pairs (15/10/5/4/3/1/1 — matches §5 row for row), 21 EventBus edges, 4 hidden-composition edges (all `→ harness-registry`), **0** `agent-orchestration → core-api` of any kind, 34 packages / 0 unclassified, 20 nested Service packages. §5's bucket split (26/7/5) is correct file-by-file. The six route imports at `:19` are real and `npm run lint` does not see them.
- **N3 — Escalation A's factual basis is fully verified.** No `ALLOWLIST`, `STATELESS_METHODS`, or `isStatelessProvider` declaration survives in `scripts/composition-edge-anti-regrowth-guard.ts` (only historical doc-comment references at `:25`, `:56`, `:59`, `:144`, `:186`, `:191`). `DEFERRED_FOLLOWUP` is real and empty: `:417` — `export const DEFERRED_FOLLOWUP: ReadonlySet<string> = new Set([]);`. Header `:26-31` confirms *"DELETED OUTRIGHT (Increment 14e), not merely emptied."*
- **N4 — Kind 6 (owned table) reconciles with Ruling 1(c) as written.** `:106` — exactly one Service owns each table and is the only code that may read or write it — makes cross-Layer table access Forbidden, so the DB is not a fourth conversation mechanism. Correct. But its legality depends entirely on Open question 1's answer (`@hyperidle/db` must stay importable), so state the dependency.
- **N5 — Noun-collision research holds up.** "Mechanism" is genuinely triple-booked (AU19 A/B/C enforcement scripts; the scan's 1/2/3 detectors; `plan.md`'s taxonomy). "Channel" is genuinely taken twice. Extract-before-invent respected: `@lore boundary-crossing cast`, and `layer-boundary-scan.ts:73-77`'s `PackageKind` union (`layer | foundation | application | tooling`) really is the role concept minus `Service`.
- **N6 — Escalation D verified exactly as stated.** `packages/web/src/api/client.ts:27` — `import type { AppType } from "@hyperidle/core-api/schemas"`. Real `core-ui → core-api` crossing, covered by no AC while AC #1 demands symmetry. Recommending an AC either way is right. C2 is the larger version: the *runtime* half of the same boundary.
- **N7 — ETHOS §1 respected.** Rejecting a rule DSL / `dependency-cruiser` / plugin registry for one table and one tsx script matching every other guard in `scripts/` is correct for this repo and correctly justified. Ruling 1(4)'s "architectural governance linting" does not change this — governance here means one coherent, complete guard set, not a framework.
- **N8 — Leaving `plan.md` unchanged and escalating was procedurally right**, and Ruling 1 vindicates it: two of the four escalations reached the founder and produced a binding decision. §7's structure (conflict / evidence / options / marked recommendation / "not decided here") is the right shape. Keep it for round 2's new items.

---

## Escalation verdicts (independent re-verification, post-ruling)

| # | Escalation | Verdict |
|---|---|---|
| **A** | AC #5(b)/#7 would rebuild the exemption apparatus AU21 Inc 14e deleted | **CONFIRM.** Code-verified: sets deleted not emptied; `DEFERRED_FOLLOWUP` present and empty at `:417`. Caveat W5 — the Open-debt replacement needs a mechanical ratchet, not a rule in prose. Still open for the founder. |
| **B** | Ground truth sanctions cross-Layer DI; the founder is ratifying a new rule, not enforcing an old one | **CONFIRMED AND NOW SETTLED** by Ruling 1. All three quotes verbatim-accurate; 38 of 39 crossings were legal under them. Refine called this correctly and it was the highest-value thing this pass produced. Two carries into round 2: rewrite §7-B as a decision (W7), and do not supersede `runtime-simplification.md:126-128`, which already states the new rule. |
| **C** | AC #6 collides with the out-of-scope composition-root split | **CONFIRM the collision. REFUTE the supporting claim behind the recommended exit.** 10 of 11 harness-registry crossings really are composition-root files, and `AU26/plan.md:32` really does own the fix with a settled design. But *"core-api constructs zero harness adapters today"* is false (`run-orchestration-composition.ts:283`, W2), and `.pipeline/AU.md:27` reads the same facts as *"the more severe subset."* Now the founder's Open question 2 — costed above. |
| **D** | The 39th crossing (`web/src/api/client.ts:27`) has no AC | **CONFIRM**, and it under-states itself — the *runtime* `core-ui ↔ core-api` channel has no crossing kind at all (C2). |

---

## What's working

- The two-axis correction (`verdict = f(kind, role + identity, role + identity)`) is the right diagnosis of `plan.md`'s flat 5-candidate list, and §4's per-candidate table is honest and specific.
- The "same-layer import is mis-grained" catch is correct and verified: `scripts/composition-boundary-guard.ts:1-20` does forbid Service → sibling Service while Layer-root → own Service is a Layer's job. Stated as one uniform kind, the contract would have legalised the exact edge Mechanism C exists to block.
- Rejecting "mechanism" and "channel" on verified collisions rather than on taste.
- Symmetry made structural via ordered pairs — the literal root cause, actually addressed.
- Naming **injected port** as a kind at all (`:205`) — `plan.md`'s candidate list omitted it, and Ruling 1 names it first. Refine got there before the founder said it. C3 is about finishing that thread, not starting it.
- `S9`'s insistence on a **real red on a scratch commit**, not fixtures alone — the right bar, and a direct answer to the repo's own mock-validation-trap rule.
- §5's bucket decomposition is the most valuable artifact this pass produced. It survives W1's trim and it should drive cleanup sequencing.
