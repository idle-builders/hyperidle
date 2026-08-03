#!/usr/bin/env tsx
/**
 * AU21 AC #9 — mandatory anti-regrowth guard.
 *
 * architecture.md §9 Increment 9 / §8 AC #9: "A documented + ENFORCED practice for
 * a new orchestration→core edge ... the guard fails CI on a new orchestration→core
 * read port OR a new composition-bundle core-read; a test proves it fires."
 *
 * This is the fold of two existing detectors into one enforced check:
 *  - `scripts/generate-dependency-graph.ts`'s `ports.ts` scan (an
 *    `agent-orchestration` Service's own declared port interface, resolved
 *    against real core-api exports) — catches a new RAW port read.
 *  - `scripts/scan-hidden-composition-edges.ts`'s composition-bundle scan (a
 *    "Deps"-shaped interface DEFINED in an agent-orchestration package but
 *    COMPOSED in core-api's composition root, `packages/core-api/src/services/
 *    *.ts`) — catches a new HIDDEN bundle read, the exact graph-blindness class
 *    that let the 22 hidden edges (`session-requests`/`cost`/`run-orchestration`/
 *    `agent-selection`) go undetected pre-AU21 (edge-disposition.md).
 *
 * Target end-state (post AU21 Increment 14, Decision L): agent-orchestration
 * reads ZERO core-api domain state, with NO carve-out of any kind — the
 * `cost` cap-gate consumer this file's history below once treated as "the one
 * founder-signed permanent exemption" is HARD-DELETED (Increment 14a; that
 * label was wrong the whole time — the founder confirmed it never signed off
 * a permanent exception). `ALLOWLIST` is genuinely empty. `inspect()`
 * therefore treats every `agent-orchestration -> core-api` edge (raw-port or
 * composition-bundle) as a violation, full stop.
 *
 * STATUS (AU21 Increment 0, implementation phase — GREEN): `inspect()` below
 * is the real detection, folding `generate-dependency-graph.ts`'s exported
 * `discoverServices`/`buildExposedApis`/`resolvePortEdges` (raw-port
 * resolution) and `detectHiddenCompositionEdges` (composition-bundle
 * resolution, itself folded in from the now-retired `scan-hidden-composition-
 * edges.ts`) into one finding set, filtered to `agent-orchestration ->
 * core-api` edges not in `ALLOWLIST`.
 *
 * @lore AU21 Increment 0 (builder pass): this guard was initially wired into
 * `npm run lint` as a `--fixtures` self-test only (proves the detection
 * mechanism itself is correct and stays correct), NOT as a bare
 * `inspect(process.cwd())` check against the live tree — at that point,
 * `inspect(process.cwd())` returned 60 findings / 33 distinct pairs, real,
 * intentional, currently-necessary edges pending Increments 1-8's migration,
 * not regrowth; wiring the bare check then would have red the entire build
 * on pre-existing, catalogued work.
 *
 * @lore AU21 §9 Increment 9 (forensic-triage wave, THIRD pass — current,
 * review-corrected state; see edge-disposition.md's own "THIRD pass" section
 * for the full narrative): `inspect(process.cwd())` returns **ZERO
 * findings**, and the bare check is wired into `npm run lint` for real
 * (`package.json`'s `lint` script) — but this does NOT mean AC #2
 * ("orchestration reads zero core-api domain state") is fully met. A prior
 * (second) pass reached zero by adding two builder-ruled `ALLOWLIST` entries
 * with no founder sign-off, and by presenting a `DEFERRED_FOLLOWUP` set as an
 * already-resolved descope to a new work package — both rejected on review.
 * This pass corrects the record: `ALLOWLIST` now holds ONLY the 4
 * founder-signed `cost::*` rows (see `ALLOWLIST`'s own doc comment).
 * `DEFERRED_FOLLOWUP` honestly carried 10 real, open, NOT-founder-signed, NOT
 * -permanent pairs at the end of this pass (see that set's own doc comment
 * for the full accounting, including which 2 of the prior pass's pairs are
 * now genuinely CLOSED — deleted or relocated core-side, not relabeled).
 * **Update (AU21 §9 Increment 10, Decision H1): `session-requests::work` is
 * ALSO now genuinely CLOSED** (the writeback moved to a core-api event
 * subscriber, the retention reap relocated core-side — see
 * `DEFERRED_FOLLOWUP`'s own doc comment) — 9 pairs remain open. AC #9(b)
 * ("the guard fails CI on a new orchestration→core read port or
 * composition-bundle core-read") is true both in the `--fixtures` self-test
 * sense and the live bare-check sense for every pair NOT in
 * `DEFERRED_FOLLOWUP` — but a genuinely new read on one of the 9 still-open
 * pairs would NOT be caught (a real, accepted, temporary coverage gap, same
 * shape the review's non-blocking finding flagged).
 *
 * @lore AU21 Increment 9, forensic-triage wave (post Increment 8):
 * `inspect(process.cwd())` re-run showed **42 findings, 24 distinct pairs**
 * (Increments 1-8 had already closed 9 of the original 33 pairs in spirit —
 * `tool-handlers`'s two, `cost`'s four now allowlisted, `agent-selection`'s
 * two dissolved, `session-requests`'s `cost` edge removed — but the mechanical
 * detectors hadn't been re-run since to confirm). Every one of the 42 was
 * traced to real source and triaged into exactly one of three buckets — none
 * silently ignored:
 *  - **Detection-quirk false positives, FIXED in the detector itself** (not
 *    allowlisted): (a) `tool-handlers -> conversation` — `ToolHandlersCoreApiAccessor`'s
 *    40 methods route EXCLUSIVELY through the `CoreApiPort` seam
 *    (`seamPortForActor`/`buildCoreApiPort`, real HTTP-route calls, verified
 *    by reading `tool-handlers-bindings.ts`), never same-process DI at all —
 *    the raw-port name-vote fallback mis-guessed a single low-confidence
 *    target; `SEAM_INTERFACES` (`generate-dependency-graph.ts`) now excludes
 *    it entirely. (b) `dispatch -> model-gateway` — `model-gateway` owns ZERO
 *    tables (its own barrel doc: "never reads [config] itself"; confirmed
 *    absent from `TABLE_OWNER`) — `isStatelessProvider` (this file) excludes
 *    any provider with zero owned tables. (c) `tool-handlers -> work` (the
 *    `routeItem` edge) — AU21 §6 Decision L3 deleted `routeItem`/`route_item`/
 *    `item-router.ts` outright as vestigial (its output was consumed by
 *    nothing); the exemption this edge needed (`STATELESS_METHODS`) is GONE
 *    from this file too — there is no longer any such edge to exempt.
 *    (d) `dispatch`'s 8 raw-port findings were also individually WRONG in a
 *    second way — `DispatchPorts`'s nested-composition-group shape (`readonly
 *    work: {...}`, one group per real target) was resolved via a stale
 *    12-target flat-interface `MANUAL_OVERRIDES` array dating to a
 *    pre-Increment-4 shape (phantom `review`/`knowledge`/`cost`/
 *    `session-requests` targets that don't exist on the interface anymore,
 *    plus bogus reported method names); `resolveNestedGroupEdges`
 *    (`generate-dependency-graph.ts`) now resolves each group correctly to
 *    its real methods, shrinking `dispatch` to its true remaining 5 pairs.
 *  - **Genuine dead composition, DELETED** (not allowlisted, not a detection
 *    fix): `session-requests -> conversation/review/knowledge` (whole pairs)
 *    and part of `-> users`/`-> work` — `DurableAgentQueueDeps`'s
 *    `conversation.getMessageById`/`review.findGrantedProposedCall`/
 *    `knowledge.findById`/`routine.getRoutineRunById`/`getRoutineById`/
 *    `users.getUserById`/`users.listUsersByTeam`/`work.getTaskById`/
 *    `work.getBetById` were declared but had ZERO real call sites anywhere in
 *    `@hyperidle/session-requests`'s `service.ts` — `resolveIntentInputInternal`
 *    (the function that used to call them) was already fully deleted by an
 *    earlier Increment 3/4 migration; this was leftover, unreachable
 *    composition wiring nobody cleaned up alongside it (confirmed by grep
 *    before removal, then by every existing throwing-spy regression test in
 *    the `*-baked-emit.integration.test.ts` family — built for exactly this
 *    "prove zero domain reads" purpose — passing with the spy wiring removed
 *    entirely, since the type system itself now makes the old read
 *    unreachable at compile time, a strictly stronger guarantee). The
 *    structural mirror `@hyperidle/run-orchestration`'s own `contracts.ts`
 *    `DurableQueueDeps` (Mechanism C forbids importing the real type) shrank
 *    identically.
 * @lore AU21 §9 Increment 9, forensic-triage wave — SECOND pass (closing the
 * 31 findings / 15 pairs the first pass above left open; two of this pass's
 * OWN dispositions were themselves corrected by the THIRD pass below — kept
 * here for history, not because they still stand as written):
 *  - **Genuine dead composition, DELETED** (3 pairs: `session-requests ->
 *    org/settings/users`): `createTriggeredInternal` (the `"triggered"`
 *    `CreateSessionRequestInput` kind's drain-time trigger-rule + target-agent
 *    resolution) had ZERO production callers — confirmed by git archaeology
 *    (routine firing has called `enqueueWorkIntent` directly since BEFORE
 *    AU21 started, `7b64e8d1^`/AU20's `d6dcfa2c`) and a full call-site grep
 *    (the only caller anywhere was `trigger-resolution.integration.test.ts`,
 *    deleted alongside this). Side discovery, flagged not fixed (out of
 *    AU21's scope): `settings`'s `kind:"trigger"` config entity
 *    (`SettingsAgentBehavior.tsx`'s "Triggers" tab) is fully user-editable in
 *    the UI but has had NO code path anywhere applying it to real agent
 *    selection, predating AU21 — a genuine orphaned-feature product gap.
 *    **This disposition stands, unchanged by the THIRD pass.**
 *  - ~~Bounded, permanent exceptions, ALLOWLISTED (2 pairs:
 *    `session-requests::work`, `dispatch::routine`)~~ — **REJECTED on review,
 *    corrected by the THIRD pass below:** neither had a founder ruling;
 *    `dispatch::routine` is now genuinely CLOSED (relocated core-side, not
 *    allowlisted); `session-requests::work` moved to `DEFERRED_FOLLOWUP`
 *    (honestly open, not resolved).
 *  - ~~Genuinely too large / architecturally undecided for this wave,
 *    DEFERRED to AU23 with a named closure plan (10 pairs)~~ — **REJECTED on
 *    review, corrected by the THIRD pass below:** naming AU23 as an
 *    already-decided closure owner, mid-implementation, while presenting
 *    AU21 as ready to ship, was a builder-level scope call the founder needed
 *    to make. 2 of these 10 pairs (`dispatch::work`/`::routine`) are now
 *    genuinely closed; the other 8 remain open, AU23's status downgraded to
 *    proposed.
 *
 * @lore AU21 §9 Increment 9, forensic-triage wave — THIRD pass (review-
 * corrected; this is the CURRENT, accurate state — see edge-disposition.md's
 * own "THIRD pass" section for the full per-pair narrative):
 *  - **`dispatch::work` — genuinely CLOSED, deleted (not migrated).** Full
 *    re-investigation confirmed the task-queue trigger was dead code, not
 *    merely redundant: `drainQueue` never called a session-launch function on
 *    any path (it resolved a model and discarded it); the real task-dispatch
 *    path is `@hyperidle/work`'s `task-state-machine.ts` baking a `task_run`
 *    intent, consumed by `run-orchestration`'s own independent poll loop.
 *  - **`dispatch::routine` — genuinely CLOSED, relocated core-side.**
 *    `provisionTeamRoutines` moved to `@hyperidle/routine`; a regrowth this
 *    same fix introduced (`tool-handlers -> routine`, caused by moving the
 *    composition wiring) was ALSO closed for real via a new `CoreApiPort`
 *    seam route (`POST /org/team-routines`), not allowlisted.
 *  - **`session-requests::work` — RE-CLASSIFIED into `DEFERRED_FOLLOWUP`,
 *    NOT resolved.** Real feasibility evidence found (routine's equivalent
 *    writeback already migrated to a core-api event-subscriber pattern) but
 *    completing the analogous migration needs its own dedicated pass.
 *  - **`dispatch::conversation`/`::users`/`::settings` + `run-orchestration`'s
 *    6 pairs — investigated further, confirmed genuinely unsafe to bake at
 *    emit this wave, still `DEFERRED_FOLLOWUP`.** A real staleness/regression
 *    risk was found (not merely asserted) for the assistant-turn transcript
 *    specifically; the same risk generalizes to run-orchestration's larger
 *    context-assembly cluster.
 *
 * **Net, honest result (post AU21 §9 Increment 13):**
 * `inspect(process.cwd())` returned ZERO findings on this tree, the bare
 * check was wired into `npm run lint` as a hard failure, `ALLOWLIST` held
 * ONLY the 4 `cost::*` rows (mislabeled "founder-signed" — never was), and
 * `DEFERRED_FOLLOWUP` was genuinely EMPTY — the one remaining pair carried
 * since the THIRD forensic-triage pass, `dispatch::conversation` (narrowed to
 * the single sanctioned `insertMessage` seam write), needed no founder
 * ALLOWLIST ruling at all: it is the exact same detection-quirk
 * false-positive class as the already-fixed `tool-handlers::conversation`
 * (Increment 9) — a seam-satisfied nested composition GROUP (not a whole
 * interface, since `DispatchPorts`'s sibling groups are ordinary/same-layer,
 * not seam calls), now excluded by `generate-dependency-graph.ts`'s
 * `SEAM_GROUPS` (the per-group analogue of `SEAM_INTERFACES`), verified
 * against `dispatch-bindings.ts`'s real composition wiring, not asserted.
 *
 * **SUPERSEDED (2026-08-03, Decision L, Increment 14a):** "AC #2/#9 met" above
 * was true only relative to the `cost::*` ALLOWLIST as configured — the guard
 * returned zero findings because it EXEMPTED the surviving edge, not because
 * it was gone. The founder overturned the exemption apparatus outright
 * ("as long as there is any exception I don't think AU21 is done") and
 * ordered `cost` HARD-DELETED, no replacement. `ALLOWLIST` is now genuinely
 * empty (see its own doc comment) — `agent-orchestration` holds ZERO raw or
 * hidden-bundle read edges into `core-api` domain state, of any kind, no
 * carve-out.**
 *
 * @lore Decision K1 (2026-08-02, post-CI-green founder review) — a GENERAL
 * BLIND SPOT this guard has, surfaced by a real miss, not a hypothetical:
 * connections-provisioning's `CoreApiPort.connections
 * .listHeldConnectionsForProvisioning()` was a LIVE `agent-orchestration ->
 * core-api` READ at session-provisioning time — the exact class AC #2(e)
 * forbids — yet it never showed up as a finding here, because this guard
 * classifies edges by KIND (raw-port vs. seam-routed, via `SEAM_INTERFACES`/
 * `SEAM_GROUPS` in `generate-dependency-graph.ts`), never by PURPOSE (a
 * decision-time READ vs. an agent-as-user WRITE, architecture.md §7's own
 * disposition rule). The `dispatch::conversation` `insertMessage` WRITE
 * above is correctly sanctioned riding the seam (Decision A/C: the running
 * agent acting on core like a user). The connections seam READ rode the
 * SAME seam mechanism and was WRONGLY invisible for it — "guard green"
 * proved the read went through a governed door, not that AC #2 permits a
 * read through it at all. K1 fixed the ONE known instance (baked at emit,
 * `resolve-injected-connections-for-agent.ts`; see
 * `resolve-injected-connections-for-agent.integration.test.ts` and
 * `run-orchestration-connections-provisioning-edge-closed.integration.test.ts`
 * for the composition-level proof this seam call is GONE, not merely
 * renamed) — it did NOT rearchitect this guard to classify by purpose,
 * which stays out of scope here. A FUTURE seam-routed live READ for a
 * provisioning/admission/decision purpose can regrow undetected the same
 * way, through any `SEAM_INTERFACES`/`SEAM_GROUPS` member — this guard
 * alone cannot catch that class; only a dedicated "zero core-api calls of
 * any kind at provisioning time" composition test (the idiom this K1 test
 * uses, mirroring `admit-session-defense-in-depth-only.integration.test.ts`)
 * proves it for a specific path.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	buildExposedApis,
	detectHiddenCompositionEdges,
	discoverServices,
	loadOwnedTables,
	resolvePortEdges,
	type ServiceInfo,
} from "./generate-dependency-graph";

export type EdgeKind = "raw-port" | "composition-bundle";

export interface CompositionEdgeFinding {
	readonly consumer: string; // agent-orchestration Service name
	readonly provider: string; // core-api Service name
	readonly edgeKind: EdgeKind;
	readonly detail: string;
}

/**
 * Permanent, bounded exemptions. Keyed `${consumer}::${provider}`.
 * A builder MUST NOT add an entry here unilaterally, however well-reasoned —
 * see this file's own review history (AU21 §9 Increment 9, third pass): a
 * prior pass added two "builder-ruled bounded exceptions"
 * (`session-requests::work`, `dispatch::routine`) at this same rigor bar and
 * was correctly rejected on review — permanent architectural carve-outs are a
 * founder decision, not a builder one, no matter how well-sourced the
 * reasoning. `dispatch::routine` is since genuinely CLOSED (relocated
 * core-side, not allowlisted — see `@hyperidle/dispatch`'s and
 * `@hyperidle/routine`'s own `@lore`); `session-requests::work` moved to
 * `DEFERRED_FOLLOWUP` below (honestly open, not resolved).
 *
 * @lore AU21 Increment 14a (Decision L1, founder 2026-08-03): the 4
 * `cost::*` rows this set used to hold (`cost::users`/`cost::org`/
 * `cost::settings`/`cost::work` — the cap-gate consumer, mislabeled
 * "founder-signed" everywhere it was cited; the founder confirmed it never
 * was) are DELETED along with the rest of the `cost` feature — no
 * replacement exemption of any kind. `ALLOWLIST` is genuinely empty.
 */
export const ALLOWLIST: ReadonlySet<string> = new Set([]);

/**
 * AU21 §9 Increment 9 (forensic-triage wave, THIRD pass) — TEMPORARY, NOT
 * founder-signed, NOT resolved. Every pair here is a real, still-open gap;
 * none is ruled closed. Unlike `ALLOWLIST`, a pair lands here precisely
 * because no one — founder or builder — has yet made the call needed to
 * close it for real, and the reviewed alternative (rushing a fix to a live,
 * high-traffic session-launch/chat path with no dedicated test-first design
 * pass) was judged a worse risk than an honestly-labeled, machine-tracked gap.
 *
 * **This wave's real, verified closures (removed from this set, not merely
 * relabeled):** `dispatch::work` (the task-queue trigger was confirmed
 * genuinely dead — `drainQueue` never launched a session, `task_run`'s real
 * baked-intent mechanism already replaced it — deleted, not migrated) and
 * `dispatch::routine` (`provisionTeamRoutines` relocated core-side to
 * `@hyperidle/routine`, zero cross-layer edge left; its downstream
 * `tool-handlers -> routine` regrowth, caused by this same wave's fix moving
 * the composition wiring, was ALSO closed for real via a new `CoreApiPort`
 * seam route, `POST /org/team-routines` — see `core-api-port.ts`'s
 * `CoreApiOrgPort.provisionTeamRoutines`).
 *
 * **AU21 §9 Increment 10 (Decision H1) — `session-requests::work` genuinely
 * CLOSED, not relabeled.** The credible feasibility this same pass flagged
 * below panned out: `task`'s post-session writeback (`taskDispatchAttemptStore
 * .updateIfActive`) moved to a core-api `agent_run_lifecycle_changed` event
 * subscriber (`work-session-end-reactions.ts`), `lifecycleProjectors.task`
 * flipped to `observeOnly`, and `reapTerminalTaskDispatchAttempts` relocated
 * into `server-factory.ts`'s generic retention reaper (calling
 * `taskDispatchAttemptStore.reapTerminal` directly, an intra-core-api call).
 * `DurableAgentQueueDeps.lifecycleProjection.work` and the top-level
 * `DurableAgentQueueDeps.work` field are both deleted entirely —
 * `session-requests` now holds ZERO `-> work` edge of any kind (the
 * `decomposition` half was already obsoleted by Increment 10a / Decision I).
 *
 * **AU21 §9 Increment 12 (Decision H3), Waves A-D — `run-orchestration::knowledge`
 * and `run-orchestration::org` genuinely CLOSED, not relabeled.** Wave C
 * rewrote `context.ts` to consume a `contextBundle` baked core-side at emit
 * time (the `assembleSessionKnowledge` shared assembler, `@hyperidle/knowledge`)
 * instead of reading `knowledge`/`org`/`work`/`users`/`routine` itself —
 * verified via `context-assembly-anti-regrowth.test.ts`'s raw-detector proof.
 * `run-orchestration::work` is ALSO genuinely CLOSED by Wave D (session-
 * lifecycle writes moved to core-api event subscribers on `session_started`/
 * `session_ended`; `workAccessor` deleted wholesale — see
 * `work-composition-anti-regrowth.test.ts`). All three are removed from this
 * set below, not merely relabeled.
 *
 * **CORRECTION (post Wave D review):** Wave D's own commit message
 * overclaimed "`run-orchestration` holds ZERO -> core-api edge, read or
 * write" as the full Decision H3 terminal state. That was true for `work`
 * ALONE at the time — `run-orchestration::routine`/`::settings`/`::users`
 * remained genuinely open until Wave E (below) closed them too.
 *
 * **AU21 §9 Increment 12 (Decision H3), Wave E — `run-orchestration::routine`/
 * `::settings` genuinely CLOSED, not relabeled.** `admitSession`'s Phase 3
 * `harnessDisabled` read (via `ports.settings.readServerConfig`) and the
 * admission-time routine per-run cost cap read (via
 * `ports.routine.getRoutineById`) are replaced by baked data every per-kind
 * resolver (all six intent kinds, not just the four `contextBundle`-baking
 * families) now supplies on the drained request: `harnessDisabled` (baked by
 * the four `contextBundle` families' emit sites) and
 * `contextBundle.routine.costCapPerRunMinor` (baked by the routine resolver
 * from the SAME `routine` row it already loads to validate).
 * `SessionLifecyclePorts` no longer declares `routine`/`settings` fields at
 * all — verified via the raw composition-bundle detector,
 * `run-orchestration-settings-routine-anti-regrowth.test.ts`. Both removed
 * from this set below, not merely relabeled.
 *
 * **`run-orchestration::users` was REOPENED by a second pass, then GENUINELY
 * CLOSED for good by a THIRD, founder-final pass (AU21 §9 Increment 12, Wave
 * E) — RE-CORRECTED, not merely re-labeled.** The second pass (above) restored
 * a narrow live `kind`/`status` re-check
 * (`SessionLifecycleAgentRunnabilityReader.checkAgentRunnable`), reasoning a
 * baked-only design could never catch a real emit→deactivate→drain race. The
 * founder rejected that pass outright: "the orchestration is a blind
 * executer." A follow-up attempt replaced the live read with a push-based
 * event+subscriber mechanism instead — ALSO rejected: "why does that even
 * play a role for orchestration to know? if an agent is deactivated then core
 * will not send a request... if it doesn't get a request to do something it
 * doesn't do something." Orchestration never initiates anything on its own —
 * every unit of work originates from a request core already sent — so there
 * is NO mechanism needed here at all, live or pushed. The fix is a pure
 * DELETION, no replacement of any kind: `SessionLifecycleAgentRunnabilityReader`
 * / `ports.agentRunnability` are gone entirely, `admitSession`'s baked
 * `kind`/`status` check is defense-in-depth ONLY (a resolver-bug consistency
 * assertion, never a live authority gate). `run-orchestration::users` is
 * REMOVED from this set below — genuinely closed, nothing left to defer. See
 * `provisioner.ts`'s top-of-file Wave E `@lore` for the full trace.
 *
 * **`dispatch::conversation` narrows to a single sanctioned member
 * (AU21 §9 Increment 12, third pass, dead-port cleanup) — `dispatch::users`/
 * `dispatch::settings` genuinely CLOSED, not relabeled.** Confirmed by direct
 * source read (not grep alone): `dispatch/src/service.ts` has exactly ONE
 * live `agent-orchestration -> core-api` call left,
 * `ports.conversation.insertMessage` (called twice,
 * `persistTurnFailureInternal` + `runTurnInternal`'s reply) — the sanctioned
 * `CoreApiPort` seam write (routes through the SAME `POST
 * /threads/:id/messages` route a human caller's client would use, actor
 * derived from `values.senderId`, never a raw same-process DI call).
 * `listMessagesByThread`/`getThreadById`/`updateThread`
 * (`DispatchPorts.conversation`) and the entire `users`/`settings` sub-ports
 * were genuinely dead — only referenced in stale `@lore` comments describing
 * ALREADY-COMPLETED prior-wave migrations (the assistant-turn transcript bake,
 * Increment 11 Wave A; the pin-trigger relocation core-side, Increment 11
 * Wave B), no live call site — confirmed by grepping every `ports.` call site
 * in `service.ts`. All four are deleted from `DispatchPorts` entirely;
 * `dispatch::users`/`dispatch::settings` are REMOVED from this set below —
 * genuinely closed.
 *
 * `dispatch::conversation` itself, however, is NOT fully closed — it is
 * NARROWED, not gone. `insertMessage` is a real, live, still-detected
 * `agent-orchestration -> core-api` write (re-verified by re-running this
 * guard's raw detector after the deletions above: `resolveNestedGroupEdges`
 * resolves purely by group property name, not by call-target, so a
 * `conversation` group with even one live method — a stateful provider,
 * `conversation` owns real tables — still reports). This is a genuine,
 * sanctioned, already-load-bearing production write (Increment 2's own
 * conversation-wave migration moved it onto the seam deliberately, exactly
 * the "assistant-turn writes are agent-as-user" design architecture.md §6
 * Decision A/C calls for) — not a bug, not an open design question needing a
 * closure pass. It stays in `DEFERRED_FOLLOWUP` rather than moving to
 * `ALLOWLIST` only because `ALLOWLIST` is founder-signed-only by this file's
 * own rule (see `ALLOWLIST`'s doc comment) and no founder has yet ruled on
 * formally allowlisting it — that is the one remaining, narrow, honestly-open
 * item this pass leaves behind.
 *
 * **What remains genuinely open (1 pair, narrowed from 4) — AC #2
 * ("orchestration reads zero core-api domain state") is NOT fully met while
 * this set is non-empty, but the remaining pair is a single sanctioned method,
 * not an unresolved design question:**
 *
 * - `dispatch::conversation` (narrowed to `insertMessage` only) — see the
 *   narrowing note immediately above. A real, live, sanctioned seam write —
 *   pending only a founder ALLOWLIST ruling, not further investigation or
 *   migration work.
 *
 * **Closure ownership — NOT silently assumed.** A prior pass named AU23
 * (`.pipeline/work/AU23/plan.md`) as this set's automatic closure owner and
 * presented AU21 as ready to ship anyway; that was rejected on review (a
 * founder-level scope call, not a builder one) and is corrected: AU23's plan
 * is retained (its research is real and reusable) but its status is
 * downgraded to PROPOSED — pending an explicit founder decision on whether
 * AU21 finishes this set in place or a follow-up work package is formally
 * scoped for it. See `.pipeline/AU.md` and `edge-disposition.md`'s own
 * "Increment 9 forensic-triage accounting — THIRD pass" section.
 */
export const DEFERRED_FOLLOWUP: ReadonlySet<string> = new Set([]);

/**
 * AU21 §9 Increment 9: a provider Service that owns ZERO tables cannot be a
 * source of "core-api domain state" (the guard's own target end-state,
 * top-of-file) — by definition it holds no persisted state of its own.
 * Computed dynamically from `service.ownedTables`
 * (`generate-dependency-graph.ts`'s `loadOwnedTables`, itself parsed from
 * `table-ownership-guard.ts`'s `TABLE_OWNER`), never hardcoded, so this stays
 * correct if a currently-stateless Service starts owning a table. Currently
 * exempts exactly `model-gateway` (its own barrel doc,
 * `model-gateway/src/index.ts`: "owns ZERO tables — its config... is owned by
 * `settings` and passed in by the caller... this Service never reads it
 * itself"; confirmed absent from `TABLE_OWNER`).
 */
function isStatelessProvider(services: readonly ServiceInfo[], provider: string): boolean {
	const svc = services.find((s) => s.name === provider);
	return svc !== undefined && svc.ownedTables.length === 0;
}

function isDomainStateEdge(services: readonly ServiceInfo[], provider: string): boolean {
	if (isStatelessProvider(services, provider)) return false;
	return true;
}

/**
 * Detect every `agent-orchestration -> core-api` composition edge (raw-port +
 * composition-bundle) in the given repo root, filtered to non-allowlisted,
 * genuinely-domain-state-reading (i.e. violating) edges only.
 *
 * Delegates both resolution mechanisms to `generate-dependency-graph.ts`:
 * `resolvePortEdges` (§ MANUAL_OVERRIDES + header-comment + reverse-export-
 * index + nested-composition-group + seam-interface resolution) for raw
 * `ports.ts` reads, and `detectHiddenCompositionEdges` (type-import +
 * composition-root usage-collection, folded in from the now-retired
 * `scan-hidden-composition-edges.ts`) for hidden bundle reads. Both are
 * cross-checked against `ALLOWLIST`, then `isDomainStateEdge` (stateless
 * providers/methods carry zero core-api domain state — the guard's actual
 * concern per its own target end-state — and are not findings at all, not an
 * allowlisted violation).
 */
export function inspect(root: string): CompositionEdgeFinding[] {
	const services = discoverServices(root);
	// Populates `service.ownedTables` (empty by construction from
	// `discoverServices` alone) — `isStatelessProvider` needs the real
	// owned-table census to tell a genuinely-stateless provider (owns zero
	// tables) from one `table-ownership-guard.ts` just doesn't happen to
	// mention in this repo (e.g. a fixture root in a test, which legitimately
	// has none registered — see `isStatelessProvider`'s own doc comment).
	loadOwnedTables(root, services);
	const layerByName = new Map(services.map((s) => [s.name, s.layer]));
	const reverseIndex = buildExposedApis(services);

	const findings: CompositionEdgeFinding[] = [];

	// Mechanism 1 — raw `ports.ts` reads (generate-dependency-graph.ts's own resolution).
	for (const edge of resolvePortEdges(services, reverseIndex)) {
		if (edge.confidence === "unresolved") continue; // target not a real Service — can't attribute
		if (layerByName.get(edge.source) !== "agent-orchestration") continue;
		if (layerByName.get(edge.target) !== "core-api") continue;
		if (ALLOWLIST.has(`${edge.source}::${edge.target}`)) continue;
		if (DEFERRED_FOLLOWUP.has(`${edge.source}::${edge.target}`)) continue;
		if (!isDomainStateEdge(services, edge.target)) continue;
		findings.push({
			consumer: edge.source,
			provider: edge.target,
			edgeKind: "raw-port",
			detail: `${edge.portInterface}.{${edge.methods.join(", ")}} — ${edge.resolutionNote}`,
		});
	}

	// Mechanism 2 — hidden composition-bundle reads (folded scan-hidden-composition-edges.ts).
	for (const edge of detectHiddenCompositionEdges(root, services)) {
		if (edge.consumerLayer !== "agent-orchestration" || edge.providerLayer !== "core-api") continue;
		if (ALLOWLIST.has(`${edge.consumer}::${edge.provider}`)) continue;
		if (DEFERRED_FOLLOWUP.has(`${edge.consumer}::${edge.provider}`)) continue;
		if (!isDomainStateEdge(services, edge.provider)) continue;
		findings.push({
			consumer: edge.consumer,
			provider: edge.provider,
			edgeKind: "composition-bundle",
			detail: `via ${edge.viaType} @ ${edge.file}: {${edge.methods.join(", ")}}`,
		});
	}

	return findings;
}

// --- fixtures -----------------------------------------------------------------

function writeFixture(root: string, rel: string, source: string): void {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, source);
}

/**
 * Writes a minimal `scripts/table-ownership-guard.ts` fixture so
 * `loadOwnedTables` (which `inspect()` now calls to drive `isStatelessProvider`)
 * sees the fixture's provider Service(s) as genuinely stateful — without this,
 * every fixture provider has an empty `ownedTables` (no real
 * `table-ownership-guard.ts` exists in an isolated tmp root) and would be
 * wrongly treated as a zero-table, exempt-from-domain-state-findings provider.
 */
function writeTableOwnershipFixture(root: string, owners: Readonly<Record<string, string>>): void {
	const rows = Object.entries(owners)
		.map(([table, pkgPath]) => `\t${table}: "${pkgPath}",`)
		.join("\n");
	writeFixture(root, "scripts/table-ownership-guard.ts", `const TABLE_OWNER: Record<string, string> = {\n${rows}\n};\n`);
}

/**
 * Scenario 1 — a NEW raw `ports.ts` core-api read on an agent-orchestration
 * Service. Mirrors `generate-dependency-graph.ts`'s own resolution signals: a
 * `// <target> — ...` header comment directly preceding the interface, whose
 * declared method resolves against a real core-api Service's real export.
 */
function buildRawPortFixture(root: string): void {
	writeFixture(
		root,
		"packages/agent-orchestration/demo-orch/package.json",
		JSON.stringify({ name: "@hyperidle/demo-orch", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(root, "packages/agent-orchestration/demo-orch/src/index.ts", "export const demoOrch = 1;\n");
	writeFixture(
		root,
		"packages/agent-orchestration/demo-orch/src/ports.ts",
		[
			"// demo-core — resolved core-api Service for this port",
			"export interface DemoOrchPorts {",
			"  readCoreThing(): Promise<string>;",
			"}",
			"",
		].join("\n"),
	);
	writeFixture(
		root,
		"packages/core-api/demo-core/package.json",
		JSON.stringify({ name: "@hyperidle/demo-core", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(
		root,
		"packages/core-api/demo-core/src/index.ts",
		'export function readCoreThing(): Promise<string> {\n  return Promise.resolve("x");\n}\n',
	);
	writeTableOwnershipFixture(root, { demo_things: "packages/core-api/demo-core" });
}

/**
 * Scenario 2 — a NEW hidden composition-bundle core-read. Mirrors
 * `scan-hidden-composition-edges.ts`'s mechanism: a "Deps"-shaped interface
 * DEFINED in the agent-orchestration package but COMPOSED (type-annotated +
 * wired with a real core-api export) inside
 * `packages/core-api/src/services/*.ts`.
 */
function buildHiddenBundleFixture(root: string): void {
	writeFixture(
		root,
		"packages/agent-orchestration/demo-orch2/package.json",
		JSON.stringify({ name: "@hyperidle/demo-orch2", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(
		root,
		"packages/agent-orchestration/demo-orch2/src/index.ts",
		[
			"export interface DemoOrch2Deps {",
			"  readonly demoRead: () => Promise<string>;",
			"}",
			"",
		].join("\n"),
	);
	writeFixture(
		root,
		"packages/core-api/demo-core2/package.json",
		JSON.stringify({ name: "@hyperidle/demo-core2", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(
		root,
		"packages/core-api/demo-core2/src/index.ts",
		'export function demoRead(): Promise<string> {\n  return Promise.resolve("y");\n}\n',
	);
	writeFixture(
		root,
		"packages/core-api/src/services/demo-orch2-bindings.ts",
		[
			'import type { DemoOrch2Deps } from "@hyperidle/demo-orch2";',
			'import { demoRead } from "@hyperidle/demo-core2";',
			"",
			"export const demoOrch2Deps: DemoOrch2Deps = { demoRead };",
			"",
		].join("\n"),
	);
	writeTableOwnershipFixture(root, { demo_things2: "packages/core-api/demo-core2" });
}

/**
 * Scenario 3 — AU21 Increment 14a: the `cost` cap-gate consumer is HARD
 * DELETED (founder, 2026-08-03: "no everything delete... send of a swarm of
 * agent and have them hard rip out everything") — `ALLOWLIST`'s 4 `cost::*`
 * rows are removed with NO replacement exemption. This fixture reproduces
 * the exact same structural shape the old exemption used to cover (a
 * "Deps"-shaped bundle composed in `packages/core-api/src/services/*.ts`)
 * to prove the regrowth guard now FIRES on it — the inverse of what this
 * scenario asserted before the exemption existed to protect a real feature.
 * If a future `cost`-shaped edge regrows, this is the test that catches it.
 */
function buildDeletedCostExemptionFixture(root: string): void {
	writeFixture(
		root,
		"packages/agent-orchestration/cost/package.json",
		JSON.stringify({ name: "@hyperidle/cost", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(
		root,
		"packages/agent-orchestration/cost/src/index.ts",
		[
			"export interface CostDeps {",
			"  readonly findUser: (id: string) => Promise<unknown>;",
			"  readonly getTeamMembers: (teamId: string) => Promise<unknown>;",
			"  readonly readServerConfig: () => Promise<unknown>;",
			"  readonly get: (id: string) => Promise<unknown>;",
			"}",
			"",
		].join("\n"),
	);
	writeFixture(
		root,
		"packages/core-api/users/package.json",
		JSON.stringify({ name: "@hyperidle/users", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(
		root,
		"packages/core-api/users/src/index.ts",
		'export function findUser(id: string): Promise<unknown> {\n  return Promise.resolve({ id });\n}\n',
	);
	writeFixture(
		root,
		"packages/core-api/org/package.json",
		JSON.stringify({ name: "@hyperidle/org", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(
		root,
		"packages/core-api/org/src/index.ts",
		"export function getTeamMembers(teamId: string): Promise<unknown> {\n  return Promise.resolve([]);\n}\n",
	);
	writeFixture(
		root,
		"packages/core-api/settings/package.json",
		JSON.stringify({ name: "@hyperidle/settings", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(
		root,
		"packages/core-api/settings/src/index.ts",
		"export function readServerConfig(): Promise<unknown> {\n  return Promise.resolve({});\n}\n",
	);
	writeFixture(
		root,
		"packages/core-api/work/package.json",
		JSON.stringify({ name: "@hyperidle/work", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(root, "packages/core-api/work/src/index.ts", "export function get(id: string): Promise<unknown> {\n  return Promise.resolve({ id });\n}\n");
	writeFixture(
		root,
		"packages/core-api/src/services/cost-bindings.ts",
		[
			'import type { CostDeps } from "@hyperidle/cost";',
			'import { findUser } from "@hyperidle/users";',
			'import { getTeamMembers } from "@hyperidle/org";',
			'import { readServerConfig } from "@hyperidle/settings";',
			'import { get } from "@hyperidle/work";',
			"",
			"export const costDeps: CostDeps = { findUser, getTeamMembers, readServerConfig, get };",
			"",
		].join("\n"),
	);
	// @lore AU21 Increment 14a: `isDomainStateEdge` filters out a provider that
	// owns zero real tables (a genuinely-stateless provider) — without
	// registering fake ownership here, `users`/`org`/`settings`/`work` in this
	// isolated fixture root would show zero owned tables and the guard would
	// (wrongly) treat the reads as stateless and report zero findings, the
	// exact false-negative this scenario exists to prevent.
	writeTableOwnershipFixture(root, {
		demo_users: "packages/core-api/users",
		demo_org: "packages/core-api/org",
		demo_settings: "packages/core-api/settings",
		demo_work: "packages/core-api/work",
	});
}

/**
 * Scenario 4 — AU21 §9 Increment 9: a NEW nested-composition-group interface
 * (the real `DispatchPorts` shape — every top-level member its own `{...}`
 * group) must still resolve PER-GROUP to a real finding with the group's OWN
 * real methods, proving `resolveNestedGroupEdges` catches genuine regrowth
 * through this shape post-refactor (not just the old flat-interface shape
 * Scenario 1 already covers).
 */
function buildNestedGroupPortFixture(root: string): void {
	writeFixture(
		root,
		"packages/agent-orchestration/demo-orch3/package.json",
		JSON.stringify({ name: "@hyperidle/demo-orch3", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(root, "packages/agent-orchestration/demo-orch3/src/index.ts", "export const demoOrch3 = 1;\n");
	writeFixture(
		root,
		"packages/agent-orchestration/demo-orch3/src/ports.ts",
		[
			"export interface DemoOrch3Ports {",
			"  readonly demoCore3: {",
			"    readCoreThing3(): Promise<string>;",
			"  };",
			"}",
			"",
		].join("\n"),
	);
	writeFixture(
		root,
		"packages/core-api/demo-core3/package.json",
		JSON.stringify({ name: "@hyperidle/demo-core3", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(
		root,
		"packages/core-api/demo-core3/src/index.ts",
		'export function readCoreThing3(): Promise<string> {\n  return Promise.resolve("z");\n}\n',
	);
	writeTableOwnershipFixture(root, { demo_things3: "packages/core-api/demo-core3" });
}

/**
 * Scenario 5 — AU21 §9 Increment 9: `isStatelessProvider` must exempt a
 * genuinely zero-owned-table provider WITHOUT it being founder-signed on
 * `ALLOWLIST` — distinct from Scenario 3's allowlist mechanism (`demo-core4`
 * here is on neither `ALLOWLIST` nor any method-exemption set (`STATELESS_METHODS`
 * was removed entirely by AU21 §6 Decision L3 — its one member, `work:routeItem`,
 * is deleted, not exempted); only its owned-table census, deliberately left
 * EMPTY, drives the exemption).
 */
function buildStatelessProviderFixture(root: string): void {
	writeFixture(
		root,
		"packages/agent-orchestration/demo-orch4/package.json",
		JSON.stringify({ name: "@hyperidle/demo-orch4", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(root, "packages/agent-orchestration/demo-orch4/src/index.ts", "export const demoOrch4 = 1;\n");
	writeFixture(
		root,
		"packages/agent-orchestration/demo-orch4/src/ports.ts",
		[
			"// demo-core4 — resolved core-api Service for this port",
			"export interface DemoOrch4Ports {",
			"  readCoreThing4(): Promise<string>;",
			"}",
			"",
		].join("\n"),
	);
	writeFixture(
		root,
		"packages/core-api/demo-core4/package.json",
		JSON.stringify({ name: "@hyperidle/demo-core4", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(
		root,
		"packages/core-api/demo-core4/src/index.ts",
		'export function readCoreThing4(): Promise<string> {\n  return Promise.resolve("w");\n}\n',
	);
	// NOTE: deliberately NO `writeTableOwnershipFixture` call — `demo-core4`
	// has an empty `ownedTables` census, exactly like a genuinely stateless
	// real Service (`model-gateway`). This is the fixture's whole point.
}

/**
 * Scenario 6 — AU21 §9 Increment 13: the real, production `dispatch::conversation`
 * nested group (`insertMessage`, verified in `dispatch-bindings.ts` to route
 * exclusively through the `CoreApiPort` seam, never raw DI — see
 * `DEFERRED_FOLLOWUP`'s own doc comment history) must NOT fire, now that
 * `generate-dependency-graph.ts`'s `SEAM_GROUPS` excludes it at the
 * per-group level (narrower than the whole-interface `SEAM_INTERFACES`
 * mechanism, since `DispatchPorts` has other, non-seam groups). Reuses the
 * REAL production key (`dispatch:DispatchPorts:conversation`), same idiom as
 * Scenario 3's real `ALLOWLIST` reuse — not a fixture-only stand-in. A
 * sibling, non-excluded group on the SAME interface targeting a different
 * core-api provider must still fire — proving the exclusion is genuinely
 * per-group, not a backdoor that blinds the whole interface to future
 * regrowth.
 */
function buildSeamGroupFixture(root: string): void {
	writeFixture(
		root,
		"packages/agent-orchestration/dispatch/package.json",
		JSON.stringify({ name: "@hyperidle/dispatch", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(root, "packages/agent-orchestration/dispatch/src/index.ts", "export const dispatch = 1;\n");
	writeFixture(
		root,
		"packages/agent-orchestration/dispatch/src/ports.ts",
		[
			"export interface DispatchPorts {",
			"  readonly conversation: {",
			"    insertMessage(): Promise<void>;",
			"  };",
			"  readonly otherCore6: {",
			"    readOtherThing6(): Promise<string>;",
			"  };",
			"}",
			"",
		].join("\n"),
	);
	writeFixture(
		root,
		"packages/core-api/conversation/package.json",
		JSON.stringify({ name: "@hyperidle/conversation", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(
		root,
		"packages/core-api/conversation/src/index.ts",
		"export function insertMessage(): Promise<void> {\n  return Promise.resolve();\n}\n",
	);
	writeFixture(
		root,
		"packages/core-api/other-core6/package.json",
		JSON.stringify({ name: "@hyperidle/other-core6", dependencies: { "@hyperidle/db": "*" } }),
	);
	writeFixture(
		root,
		"packages/core-api/other-core6/src/index.ts",
		'export function readOtherThing6(): Promise<string> {\n  return Promise.resolve("x");\n}\n',
	);
	writeTableOwnershipFixture(root, {
		messages6: "packages/core-api/conversation",
		other_things6: "packages/core-api/other-core6",
	});
}

function fixtureCheck(): void {
	// Scenario 1 — new raw ports.ts core-read must fire.
	const rawPortRoot = mkdtempSync(join(tmpdir(), "au21-anti-regrowth-raw-port-"));
	try {
		buildRawPortFixture(rawPortRoot);
		const findings = inspect(rawPortRoot);
		const hit = findings.find(
			(f) => f.consumer === "demo-orch" && f.provider === "demo-core" && f.edgeKind === "raw-port",
		);
		if (!hit) {
			throw new Error(
				`composition-edge-anti-regrowth-guard: expected a raw-port finding for demo-orch -> demo-core, got ${JSON.stringify(findings)}`,
			);
		}
	} finally {
		rmSync(rawPortRoot, { recursive: true, force: true });
	}

	// Scenario 2 — new hidden composition-bundle core-read must fire.
	const hiddenBundleRoot = mkdtempSync(join(tmpdir(), "au21-anti-regrowth-hidden-bundle-"));
	try {
		buildHiddenBundleFixture(hiddenBundleRoot);
		const findings = inspect(hiddenBundleRoot);
		const hit = findings.find(
			(f) => f.consumer === "demo-orch2" && f.provider === "demo-core2" && f.edgeKind === "composition-bundle",
		);
		if (!hit) {
			throw new Error(
				`composition-edge-anti-regrowth-guard: expected a composition-bundle finding for demo-orch2 -> demo-core2, got ${JSON.stringify(findings)}`,
			);
		}
	} finally {
		rmSync(hiddenBundleRoot, { recursive: true, force: true });
	}

	// Scenario 3 — AU21 Increment 14a: a `cost`-shaped hidden composition-bundle
	// edge (the exact shape the now-deleted ALLOWLIST exemption used to cover)
	// MUST fire — there is no replacement exemption of any kind.
	const allowlistedRoot = mkdtempSync(join(tmpdir(), "au21-anti-regrowth-deleted-cost-exemption-"));
	try {
		buildDeletedCostExemptionFixture(allowlistedRoot);
		const findings = inspect(allowlistedRoot);
		const violations = findings.filter((f) => f.consumer === "cost");
		if (violations.length === 0) {
			throw new Error(
				"composition-edge-anti-regrowth-guard: a cost-shaped edge must fire now that the cost cap-gate exemption is deleted (AU21 Increment 14a), got zero findings",
			);
		}
	} finally {
		rmSync(allowlistedRoot, { recursive: true, force: true });
	}

	// Scenario 4 — a NEW nested-composition-group raw port (the real
	// `DispatchPorts` shape) must still resolve per-group to a real finding.
	const nestedGroupRoot = mkdtempSync(join(tmpdir(), "au21-anti-regrowth-nested-group-"));
	try {
		buildNestedGroupPortFixture(nestedGroupRoot);
		const findings = inspect(nestedGroupRoot);
		const hit = findings.find(
			(f) =>
				f.consumer === "demo-orch3" &&
				f.provider === "demo-core3" &&
				f.edgeKind === "raw-port" &&
				f.detail.includes("readCoreThing3"),
		);
		if (!hit) {
			throw new Error(
				`composition-edge-anti-regrowth-guard: expected a nested-group raw-port finding for demo-orch3 -> demo-core3 (readCoreThing3), got ${JSON.stringify(findings)}`,
			);
		}
	} finally {
		rmSync(nestedGroupRoot, { recursive: true, force: true });
	}

	// Scenario 5 — a genuinely zero-owned-table provider (NOT founder-signed,
	// no method-exemption set exists anymore) must not fire, purely from its empty owned-
	// table census.
	const statelessProviderRoot = mkdtempSync(join(tmpdir(), "au21-anti-regrowth-stateless-provider-"));
	try {
		buildStatelessProviderFixture(statelessProviderRoot);
		const findings = inspect(statelessProviderRoot);
		const violations = findings.filter((f) => f.provider === "demo-core4");
		if (violations.length > 0) {
			throw new Error(
				`composition-edge-anti-regrowth-guard: a zero-owned-table provider must not fire, got ${JSON.stringify(violations)}`,
			);
		}
	} finally {
		rmSync(statelessProviderRoot, { recursive: true, force: true });
	}

	// Scenario 6 — the real, production `dispatch::conversation` seam-satisfied
	// nested group must not fire, but a sibling non-excluded group on the same
	// interface must still fire (the exclusion is per-group, not per-interface).
	const seamGroupRoot = mkdtempSync(join(tmpdir(), "au21-anti-regrowth-seam-group-"));
	try {
		buildSeamGroupFixture(seamGroupRoot);
		const findings = inspect(seamGroupRoot);
		const excluded = findings.filter((f) => f.consumer === "dispatch" && f.provider === "conversation");
		if (excluded.length > 0) {
			throw new Error(
				`composition-edge-anti-regrowth-guard: the seam-satisfied dispatch::conversation group must not fire, got ${JSON.stringify(excluded)}`,
			);
		}
		const sibling = findings.find(
			(f) => f.consumer === "dispatch" && f.provider === "other-core6" && f.edgeKind === "raw-port" && f.detail.includes("readOtherThing6"),
		);
		if (!sibling) {
			throw new Error(
				`composition-edge-anti-regrowth-guard: expected the sibling non-seam-excluded group to still fire, got ${JSON.stringify(findings)}`,
			);
		}
	} finally {
		rmSync(seamGroupRoot, { recursive: true, force: true });
	}

	process.stdout.write("composition-edge-anti-regrowth-guard fixtures: PASS\n");
}

if (process.argv.includes("--fixtures")) {
	fixtureCheck();
} else {
	const findings = inspect(process.cwd());
	for (const f of findings) {
		process.stderr.write(`${f.consumer} -> ${f.provider} [${f.edgeKind}]: ${f.detail}\n`);
	}
	if (findings.length > 0) {
		process.stderr.write(`composition-edge-anti-regrowth-guard: ${findings.length} finding(s)\n`);
		process.exit(1);
	}
	process.stdout.write("composition-edge-anti-regrowth-guard: PASS\n");
}
