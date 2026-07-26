# AU21 — Requirements

DOC-CLASS: significant

## Founder redirect (2026-07-17)

Founder input that sharpens/redirects this WP beyond its seeded `plan.md` (quoted, lightly reformatted):

> I want a clear structure of how layers communicate. DI between layers is basically forbidden — we have to assume any layer could be deployed elsewhere from the rest, but we also have the setup where they're deployed together. So these boundaries need to go from in-process to remote for these APIs between layers. Also I want the connections challenged from orchestration to core-api — I don't see a legitimate reason why this should exist [as raw DI]. Core needs an agent and sets off the event to orchestration (including all that's needed). Orchestration builds the session and deploys it. Execution runs the session, and if it needs to do something, goes via MCP API back to changing stuff in core — just like the user would when using the UI to act on the core API. A clean loop. There may be exceptions, but those should be the exception, not the norm.

Reference: an artifact the founder pointed to (`AU19 Service Dependency Explorer`) is the existing interactive visualizer over `plans/AU19/as-is-dependency-graph.md`'s edge data — it is the current-state map, not a new proposal. It confirmed there's no separate design doc to reconcile against; this requirement is the first place the new principle gets written down.

This redirect changes AU21's **intent**, not just its worklist. `plan.md` is updated alongside this document — see the diff described below.

## What already exists (verified against shipped code, not the older `plans/AU19/architecture.md` planning record)

AU19 shipped (PR #450, merged, `plans/AU19/as-is-dependency-graph.md` dated 2026-07-16 is the current source of truth). Three facts from that document ground everything below:

1. **`agent-orchestration → agent-execution` already has exactly the shape the founder is asking for, generalized.** It crosses through **one seam** — `HarnessPort` (`admitSession`/`runSession`) — injected by the Application at boot, never a package dependency between the two Layers' Services. `desktop` wires it in-process; a split deployment can wire the same seam to a remote worker over the existing `worker-ws.ts`/`remote-harness-adapter.ts` channel. This is the working precedent, not a hypothetical.
2. **`core-ui → core-api` already works the same way, but via a genuinely different mechanism**: a type-only Hono RPC client import — an HTTP API contract, always over the wire even when the process happens to be local — not an Application-injected in-process/remote-swappable seam like `HarnessPort`. This is "the door a human/UI request uses." **Open question for `/architecture`, not resolved here:** should execution's write-back to core reuse this *literal* HTTP/RPC door (an actual API call, always), or should it get its own `HarnessPort`-style seam (in-process function call when colocated, RPC only when split)? The founder's phrase "just like the user would when using the UI" reads most literally as the former — the identical HTTP surface `core-ui` calls — which is a stronger, simpler claim than "any seam pattern" and probably the right one to design toward first, but the two are different mechanisms with different cost, and this requirement does not collapse them into one without `/architecture` choosing.
3. **`core-api → agent-orchestration` (against-grain) is already disciplined**, but by a rule that only allows EventBus inversion (3 edges: `filesystems→capture-writeback`, `policy→cost`, `policy→session-lifecycle`) or a named permanent synchronous exception (5 edges, each individually proven to need either an atomic same-transaction write or an immediate answer to branch on — an EventBus structurally can't serve either). Zero raw DI in this direction.

**The one boundary that never got this treatment is `agent-orchestration → core-api`**: 45 Service-pair edges (112 individually-challenged capabilities, reportedly split 49 JUSTIFIED / 52 QUESTIONABLE / 11 UNJUSTIFIED), all "ordinary downward DI, legal" — no seam, no forcing function, nothing stopping any orchestration Service from wiring to any core-api Service it wants. `plan.md`'s own "Why this matters" already named this asymmetry; the founder's message says the same thing more sharply: legality isn't legitimacy, and the fix isn't just to re-justify each of the 63 unresolved edges one at a time — it's to give this direction the same seam discipline the other three boundaries already have, then judge the 63 edges against that seam, not against a case-by-case "does this specific call make sense" rubric alone.

**Structural counts re-verified by script, just now, not taken on faith:** `npx tsx scripts/generate-dependency-graph.ts` was re-run against current `origin/main` HEAD (2026-07-17) and produced byte-identical output to the committed `plans/AU19/dependency-graph-data.json` — 31 Services, 139 port-derived DI edges, 34 EventBus edges, 0 unresolved. The structural graph is mechanically current, not stale prose. **The 49/52/11 JUSTIFIED/QUESTIONABLE/UNJUSTIFIED split is a different kind of artifact and is NOT similarly verified** — see the CRITICAL flag below.

**Concretely, where this bites hardest today:** when an agent running in `agent-execution` calls an MCP tool that changes core data (e.g. `create_bet`, `send_message`), the call does **not** go through anything resembling the UI's door. It flows execution → (harness/tool dispatch) → `agent-orchestration`'s `tool-handlers` Service, which holds direct DI ports (`ports.ts`, wired at the `packages/core-api/src/services/tool-handlers-bindings.ts` composition root) straight into `core-api` Services like `work`, `conversation`, `knowledge`. That's a raw in-process function call standing in for what should be the same API surface `core-ui` uses. `tool-handlers` alone, plus `dispatch` and `session-requests`, account for 23 of the 45 cross-layer edges (`as-is-dependency-graph.md` §"Why so many cross-layer edges") — these three Services are where the seam matters most.

## Sharpened goal

**Value.** Every real deployment topology HyperIdle ships (`desktop`: all four Layers in one Electron process; `remote-server` + `remote-worker`: `agent-execution` split onto a separate machine) must work off the *same* Layer code, unchanged — a Layer boundary that only works because two Layers happen to be colocated today is a latent bug in every future split deployment. Today three of the four Layer boundaries already meet that bar (`core-ui↔core-api`, `agent-orchestration↔agent-execution`, and the disciplined `core-api→agent-orchestration` against-grain direction). `agent-orchestration→core-api` is the one that doesn't, and it's the busiest boundary in the system (45 of ~59 cross-layer Service-pairs). Closing it removes the last place a laptop-only assumption is silently load-bearing, and gives agent-caused core writes the exact same contract (and eventually the exact same authorization path) that a human's UI action already has.

**Success.** When this ships:
1. The `core-api ↔ agent-orchestration` boundary has a named seam — a typed API surface, Application-wired, that works as an in-process call today and as a remote call without a Service-level rewrite (the same *pattern* `HarnessPort` proves — Application-injected, no package dependency — but not necessarily its *size*: `HarnessPort` is 2 methods because `agent-execution`'s consumed surface is narrow; this boundary's consumed surface is 112 capabilities across ~10 core-api Services, so the seam is realistically a family of typed contracts per consuming Service, not one 2-method interface). `/architecture` decides the concrete shape — this requirement fixes the *rule* (seam, not raw DI; Application-wired; in-process-today/remote-capable), not the interface signature.
2. The **clean loop** is real in code for core-initiated agent work: a core-api action that needs an agent run emits a domain event carrying everything orchestration needs to act (no synchronous read-back into core-api by orchestration to fill in what the event omitted); `agent-orchestration` alone builds and deploys the session; `agent-execution` alone runs it; any resulting change to core data goes back through the same seam `core-ui` uses — never a direct Service import from `tool-handlers` or any other orchestration Service into a `core-api` Service.
3. Every one of the 63 previously-unresolved edges (11 UNJUSTIFIED + 52 QUESTIONABLE) has a real disposition judged against the seam rule: served through the seam, served by richer event payload, merged/removed as a duplicate, or — rarely — kept as a named permanent exception meeting the same same-transaction/synchronous-branch bar AU19 already proved out for the 5 permanent `core-api→agent-orchestration` ports. "Exception, not the norm" is checked, not asserted: the post-fix edge count for this direction should be small next to today's 45.
4. `scripts/generate-dependency-graph.ts` reflects the new baseline, including the new seam-edge type as something distinct from a raw DI port (so a future audit can tell "goes through the seam" from "still a bypass" at a glance).

**Scope — what this deliberately leaves out (non-goals).**
- **Not a mandate to add network hops that don't exist.** `desktop` still runs all four Layers in one process; the seam is a typed interface + an Application-time wiring choice (exactly like `HarnessPort` today), not a requirement to serialize/HTTP everything even when colocated.
- **Does not reopen AU19's own rulings** — the 3 EventBus inversions and 5 permanent `core-api→agent-orchestration` DI ports stand as decided. This WP's seam generalizes a pattern AU19 already proved on one boundary (`agent-execution`); it is not a re-litigation of AU19's closed findings.
- **Does not redesign `agent-orchestration↔agent-execution`** — already meets the bar, used here as the reference precedent.
- **Does not build a new authorization layer for agent-initiated core writes** — worth naming as a natural follow-up once writes route through the same door as the UI, but tracking/enforcing per-agent permissions on that door is separate scope.
- **No UI-facing change.**

## Noun pinned by this requirement

**"The clean loop"** (informal working name — `/architecture` may propose a better one; don't let this pin block that). Definition: the request/response cycle where (a) `core-api` detects it needs an agent and emits one event carrying everything the run needs, (b) `agent-orchestration` is the sole owner of turning that event into a built, deployed session, (c) `agent-execution` is the sole owner of running it, and (d) any resulting change to core-owned data is made through the same API `core-ui` uses to act on `core-api` — never a direct Service import reaching backward from execution or orchestration into a core-api Service. Not to be confused with: an individual EventBus edge (the loop is the whole cycle, not one hop); the `HarnessPort` seam (that's the orchestration→execution leg of the loop, already built — the loop additionally covers the core→orchestration leg and the write-back leg). Hard rule: if any step of the loop is served by a raw Service-to-Service DI port instead of an event, a seam call, or a named permanent exception, the loop is broken at that step — this is the test `/architecture` and code review apply to each of the 63 edges.

## Seam & state-ownership principle (2026-07-26, founder — settled from first principles)

A principle worked out with the founder that sits *above* "the clean loop" and governs all four Layer
boundaries, not just the agent→core one:

1. **Each Layer owns and directly serves its own durable state. Nothing is duplicated across a Layer boundary
   just because a consumer only has a door into one Layer today.** Core-api owns bets/tasks/conversations/
   knowledge/users/settings. Agent-orchestration owns sessions, run history, and cost accounting.
   Agent-execution owns live harness activity. Read-model duplication across a boundary is a scale/availability
   pattern HyperIdle does not need yet (mostly one process, one machine); all it buys today is drift.

2. **Every Layer that owns durable state another Layer/UI needs gets its own real, disciplined,
   location-transparent door — symmetric to `CoreApiPort`.** When `core-ui` needs a second Layer's state, the
   answer is a second proper door (an `AgentOrchestrationPort` read API), not a mirror of that state into
   core-api. Not a workaround; it completes the four-Layer picture.

3. **Streaming is a technique scoped to a genuine continuous-delivery need, not a shared cross-cutting
   Service.** A generic "realtime" broadcaster that rebroadcasts every domain event through one mechanism
   conflates unrelated concerns; discrete state changes need at most a lightweight "refetch" signal, and true
   low-latency streaming belongs only where continuous output actually originates (live harness activity),
   owned by the Layer that produces it.

**Not hypothetical — the evidence is in the shipped code (verified 2026-07-26):**
- Orchestration's cost state has no door of its own, so a genuine gap goes unserved: per-session cost is
  *deliberately not persisted* (`@lore O2` stripped session cost columns) and the UI is handed `cost: null`
  (`packages/core-api/src/routes/tasks.ts:134`) — orchestration computes each session's cost but has no way to
  expose it. (Note: the per-entity `costActual*` running totals on core-api tables are *not* a duplicate — a
  full trace shows `cost-cap.ts` is the single authority writing each distinct aggregate via DI, and the cap
  gate reads them; so the fix here is a missing **door**, not a mirror to delete. See `/architecture` Decision D.)
- `cost_cap_warning`/`cost_cap_breached` are handled twice: correctly and statefully by `notifications`
  (`packages/core-api/notifications/src/install.ts:1490`, a persisted `notificationQueue` row) AND redundantly
  re-forwarded by the generic WS broadcaster (`packages/core-api/realtime/src/ws-broadcaster.ts:59`) to a
  `work` topic where nothing consumes it as a cost signal — dead, duplicate, currently-shipping code.

The `routine-runs-as-sessions` ruling (orchestration owns run history; core-api shrinks to definition) already
applied exactly this principle to one case; cost/sessions/activity are the same case and get the same
treatment. `/architecture` carries the concrete decisions (revised Decision D + new Decision E).

## AC alignment table (against `plan.md`'s updated Acceptance Criteria)

| # | Acceptance criterion (plan.md, post-redirect) | How this requirement covers it | Gap flag |
|---|---|---|---|
| 1 | A location-transparent seam exists for `core-api ↔ agent-orchestration`, modeled on `HarnessPort` | Sharpened goal §Success-1; precedent cited in §What already exists-1 | None — `/architecture` designs the seam's actual shape (interface, wiring point) |
| 2 | The clean loop is real in code end-to-end for core-initiated agent work | Sharpened goal §Success-2; noun pinned above | `/architecture` must locate every current "core needs an agent" call site and confirm the event payload is complete enough to remove the read-back |
| 3 | All 63 outstanding edges get a seam-rule disposition | Sharpened goal §Success-3 | **Not "None" — see §Worklist provenance above.** The 63-edge worklist's actual verdicts/reasoning are not found in any committed artifact; `/architecture` must first locate the transcript or budget re-running the adversarial challenge before disposition work can start |
| 4 | Phantom `session-requests → settings` edge stays absent | Unchanged from original `plan.md` — no new coverage needed | None |
| 5 | `generate-dependency-graph.ts` re-run, new baseline documented, seam edges distinguishable from raw DI | Sharpened goal §Success-4 | Script itself needs a new edge-classification case — flag for `/architecture` |
| 6 | AU19's 3 EventBus inversions + 5 permanent DI ports not reopened | Non-goals bullet 2 | None |
| 7 | A concrete practice for evaluating *new* cross-Layer edges going forward | Carried from original `plan.md`, now phrased as "does this go through the seam, ride the event payload, or meet the permanent-exception bar" | None |

## Worklist provenance — CRITICAL, found by `/refine-critique`, verified true

`plan.md` (both the original seed and the parts this redirect left untouched) asserts the 63-edge worklist "already exists" and this WP "starts from disposition, not discovery," citing a 112-capability adversarial-challenge run with per-edge JUSTIFIED/QUESTIONABLE/UNJUSTIFIED verdicts and written reasoning. **Checked directly, not taken on faith:** neither `plans/AU19/as-is-dependency-graph.md`, nor the freshly-regenerated `plans/AU19/dependency-graph-data.json`, nor any other file under `plans/AU19/` contains those verdicts — `grep` for `JUSTIFIED`/`QUESTIONABLE`/`UNJUSTIFIED`/"112 capabilit" across `plans/AU19/*.md` returns zero hits outside `as-is-dependency-graph.md`'s own prose, which itself only says the results are "referenced ... full results in the workflow transcript" — a transcript this search could not locate anywhere committed. The structural graph (which Services connect to which) is mechanically re-verified and solid (see above); **the individual verdicts and reasoning for the 63 non-JUSTIFIED edges are not currently retrievable from anything checked into the repo.**

This means "starts from disposition, not discovery" is not yet a safe claim. Before `/architecture` can treat the 63-edge worklist as a known input, one of two things has to happen, and this requirement does not presume which: (a) the original challenge transcript is located (ask whoever ran AU19's workflow, or check for an uncommitted local artifact) and gets committed to `plans/AU19/` so it's a real, reviewable input, or (b) if it's genuinely gone, the 112-capability adversarial challenge is re-run as the first step of this WP's own work, not assumed as already-done prior art. Flagging this now, at refine, rather than letting `/architecture` or the builder discover it mid-flight and stall.

## Doc contradiction — CRITICAL, surfaced not silently resolved

`docs/architecture/runtime-simplification.md`'s `agent-orchestration` Layer definition currently states orchestration is: *"Always colocated with core-api in the same process (every Application that composes one composes both), so its Service calls stay in-process."* That sentence is a direct, load-bearing assumption that the founder's redirect contradicts — it says the boundary is in-process *by design*, not just *in practice today*. It is not being silently overwritten here (refine does not own that call); a pointer note has been added inline in that file (see below) so no reader mistakes it for still-settled while this WP is open. `/architecture` must resolve the doc itself once the seam shape is designed — likely rephrasing "so its Service calls stay in-process" to "colocated in every deployment today; the boundary is nonetheless seam-typed, not DI, so a future split costs a wiring change, not a rewrite" (or whatever the real seam ends up requiring).

**Founder confirmation (2026-07-17), causal not just corrective:** "we breaking this always colocated, that lead to all the unwanted DI imports." This sharpens the diagnosis one level further — the colocation assumption isn't just a stale doc sentence to fix in passing, it's named as the *root cause* of the 45-edge, ungoverned `agent-orchestration → core-api` DI sprawl this WP is disposing of. "Colocation makes DI safe" removed the only pressure that would have made an engineer stop and ask "should this really be a direct call" before wiring a new Service-to-Service port — the same structural forcing function Mechanism C already supplies for the opposite direction. `/architecture` should treat breaking this assumption as load-bearing to the fix, not an optional hardening on top of it: the seam isn't only future-proofing for a split deployment that doesn't exist yet, it is the mechanism that stops today's edge count from regrowing after this WP cleans it up.

## Required reading (downstream: `/architecture`, `/design` if any, `/pipeline`)

1. `docs/architecture/runtime-simplification.md` — Layers section (`agent-orchestration`'s colocation sentence, flagged above) and the three composition-boundary mechanisms (Mechanism C: Services never import Services) this WP must not violate while building the new seam.
2. `plans/AU19/as-is-dependency-graph.md` (2026-07-16) — current source of truth for the edge graph; supersedes the older `plans/AU19/architecture.md` census tables. Read in full: the cross-layer edge lists, the "Why 5 of 8 against-grain edges are permanent" reasoning (the bar any new permanent exception must clear), and "Why so many cross-layer edges, and is that a problem" (names `dispatch`, `session-requests`, `tool-handlers` as the concentration point).
3. `packages/agent-orchestration/tool-handlers/src/ports.ts` — concrete code shape of Mechanism C (structurally-typed ports, composition root wiring, no cross-Service type imports even for types) that the new seam must compose with, not bypass.
4. `packages/core-api/src/services/*-bindings.ts` (the real composition root, per `as-is-dependency-graph.md`'s "Key structural facts") — where every current `agent-orchestration → core-api` port is wired; this is where the seam replaces per-Service ports with seam calls.
5. `docs/architecture/system-boundary.md` — not for its git/CI content, but for the pattern it already names: HyperIdle "executes nothing itself," a connected system executes and returns an Outcome. The clean loop's write-back leg (execution → same door as UI) is a same-shaped idea one layer down; worth reading for the vocabulary (Outcome, trigger-not-executor) `/architecture` may want to reuse rather than invent new terms.
6. `docs/architecture/decisions.md` — flagged stale (still references the retired `packages/fabric` runtime); do not treat its "Scheduler architecture" entry as current without re-checking against shipped code, same caution `as-is-dependency-graph.md` itself applies to the older AU19 planning doc.

## Done-when (refine-specific, distinct from plan.md's ACs above)

- [x] `requirements.md` exists with sharpened goal (value/success/scope), the founder's redirect quoted verbatim for traceability, and the noun pin.
- [x] `plan.md` updated to match (see diff summary below) — scope/ACs/intent all changed by this redirect.
- [x] Doc contradiction in `runtime-simplification.md` surfaced, not silently resolved (inline flag added, full resolution deferred to `/architecture`).
- [x] Required reading names specific files, not folders.
- [x] Structural counts (Services/edges) re-verified by script (`generate-dependency-graph.ts`), not agent lookup — round 1 of `/refine-critique`.
- [x] `/refine-critique` round 1 complete (7.8/10, passes ≥7 bar) — 1 CRITICAL (worklist provenance) + 2 WARNING (seam-mechanism ambiguity, seam-size understatement) findings addressed in this document.
- Pending: founder/human requirement review gate (Phase 3).
