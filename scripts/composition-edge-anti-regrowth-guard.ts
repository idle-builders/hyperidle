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
 * Target end-state (post Increment 8): agent-orchestration reads ZERO core-api
 * domain state, except the one founder-signed permanent exemption — the
 * `cost` cap-gate consumer (`cost-bindings.ts`'s `CostDeps`, Decision D /
 * edge-disposition.md "Consumer: cost"). `inspect()` therefore treats every
 * `agent-orchestration -> core-api` edge (raw-port or composition-bundle) as a
 * violation UNLESS it exactly matches `ALLOWLIST`.
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
 * @lore AU21 §9 Increment 9 (forensic-triage wave, SECOND pass — closes AC #9):
 * `inspect(process.cwd())` now returns **ZERO findings** (every one of the
 * post-Increment-8 42 findings / 24 pairs traced to real source and closed —
 * see the two `@lore` blocks below for the full accounting). The bare check
 * is now wired into `npm run lint` for real (`package.json`'s `lint` script)
 * — `agent-orchestration -> core-api` reads are enforced at ZERO, except
 * `ALLOWLIST` (permanent, founder-signed + builder-ruled bounded exceptions)
 * and `DEFERRED_FOLLOWUP` (temporary, AU23-owned, shrinking to empty as that
 * work package lands). AC #9(b) ("the guard fails CI on a new
 * orchestration→core read port or composition-bundle core-read") is now
 * true both in the `--fixtures` self-test sense (proves the mechanism fires)
 * AND the live bare-check sense (proves it fires on THIS tree, continuously).
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
 *    `routeItem` edge) — a pure `{riskTier,kind,verb} -> view` string switch,
 *    zero `db` parameter, verified against `@hyperidle/work`'s real
 *    implementation — `STATELESS_METHODS` (this file) excludes it by name.
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
 * @lore AU21 §9 Increment 9, forensic-triage wave — SECOND pass (this wave,
 * closing the 31 findings / 15 pairs the first pass above left open). Every
 * one re-investigated against real, current source (not re-derived from the
 * doc) and closed into exactly one of three final dispositions — zero left
 * unaccounted:
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
 *  - **Bounded, permanent exceptions, ALLOWLISTED** (2 pairs:
 *    `session-requests::work`, `dispatch::routine`) — see `ALLOWLIST`'s own
 *    doc comment for the full, source-verified reasoning per pair.
 *  - **Genuinely too large / architecturally undecided for this wave,
 *    DEFERRED to AU23 with a named closure plan** (10 pairs: `dispatch ->
 *    work/conversation/users/settings`, `run-orchestration ->
 *    knowledge/org/routine/settings/users/work`) — see `DEFERRED_FOLLOWUP`'s
 *    own doc comment. All ten share one root cause: each needs LIVE state at
 *    decision/run time (which tasks are dispatchable right now; the live
 *    conversation transcript + server config for a turn; per-session
 *    knowledge/org/routine/settings/user context), not a value that can be
 *    baked once at an earlier emit point the way the other 25 pairs were.
 *    Decision B's own text left this an open choice ("bake at emit OR agent
 *    pulls via MCP") and never picked one — rushing either choice inside this
 *    forensic-triage wave, for the system's most sensitive live paths
 *    (session launch, assistant chat, task dispatch), risks exactly the kind
 *    of in-flight redesign this WP's own discipline forbids. AU23
 *    (`.pipeline/work/AU23/plan.md`) is registered as the named closure
 *    owner, with these ten pairs as its concrete starting scope.
 *
 * **Net result: `inspect(process.cwd())` now returns ZERO findings** on this
 * tree (verify: `npx tsx scripts/composition-edge-anti-regrowth-guard.ts`).
 * The bare check can be wired into `npm run lint` as-is — every excluded
 * edge is accounted for in `ALLOWLIST` (permanent) or `DEFERRED_FOLLOWUP`
 * (temporary, AU23-owned), never a silent gap.
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
 * Permanent, bounded exemptions. Keyed `${consumer}::${provider}`. Two
 * classes, both PERMANENT (not "not yet migrated" — see `DEFERRED_FOLLOWUP`
 * below for that):
 *  - **Founder-signed** (edge-disposition.md "Consumer: `cost`" / Decision D)
 *    — the cap-gate consumer, ruled untouched by the founder directly.
 *  - **Builder-ruled bounded exceptions** (AU21 §9 Increment 9, forensic-
 *    triage wave, same rigor bar as the founder-signed entries — a short,
 *    specific, source-verified reason, not a blanket carve-out): a real,
 *    live, architecturally-legitimate residual that migrating would either
 *    violate an established principle (Decision A's "same real door" for
 *    `CoreApiPort` — no genuine human-facing route exists for the operation)
 *    or redesign an already-reasoned-about, unrelated mechanism (AU9's
 *    lifecycle-fact projection) — added here, not silently, with the exact
 *    reasoning in-line.
 */
export const ALLOWLIST: ReadonlySet<string> = new Set([
	"cost::users", // findUser/incrementUserCost/sumAllUserCost/updateUser/resetAllUserCost — cap accounting
	"cost::org", // getTeamMembers/applyTeamCost — team cap accounting
	"cost::settings", // readServerConfig/updateServerConfig — factory cap + sentinel level
	"cost::work", // get/create/update — bet-cost accumulation + breach review-item creation
	// AU21 §9 Increment 9 (forensic-triage wave, second pass) — builder-ruled,
	// not founder-signed; both verified against real source, both re-examined
	// for a resolve-at-emit path and found genuinely bounded:
	"session-requests::work", // taskDispatchAttemptStore.reapTerminal (AU9 CAS/dedup) + lifecycleProjection.work's guarded (CAS-style) writeback of a session's OWN outcome into taskDispatchAttempts/bets.decompositionStatus on completion — the write-back analog of the "own-state dedup reads remain" rule (Decision B), not a resolveIntentInputInternal-style domain read; @hyperidle/work owns both tables, the write is state-guarded (precondition-checked), not a blind mutation.
	"dispatch::routine", // routine.insertRoutine — provisionTeamRoutinesInternal's team-creation-time BUILTIN_SPECS seed write, a one-time deterministic definition insert, not a live agent-run-path read; architecture.md's own Increment 4 ruling explicitly scoped it OUT of the routine-scheduler relocation ("provisionTeamRoutines stays on dispatchOps... unchanged this increment" — packages/core-api/src/routines.ts). Migrating it requires either a new CoreApiPort route with no genuine human-facing surface (violates Decision A) or restructuring tool-handlers' create_team tool flow (a redesign, out of this wave's scope) — a bounded, low-risk residual.
]);

/**
 * AU21 §9 Increment 9 (forensic-triage wave, second pass) — TEMPORARY,
 * NAMED-OWNER deferrals. NOT an exemption: every pair here is a real,
 * still-open gap (edge-disposition.md's own "§2 resolve-at-emit"/"§2/§3
 * baked" dispositions — always meant to migrate away) that this wave
 * determined needs a genuinely separate, dedicated design/build pass rather
 * than a rushed fix inside this forensic-triage wave — see AU23
 * (`.pipeline/work/AU23/plan.md`, registered this wave) for the closure plan.
 * Distinguished from `ALLOWLIST` on purpose: `ALLOWLIST` entries are ruled
 * closed (permanent); these are ruled OPEN, tracked, and expected to shrink
 * to empty as AU23 lands. Ships here (rather than leaving the bare check
 * red) only because AU23 is registered with a named closure plan, not a
 * silent carve-out — see edge-disposition.md's "Increment 9 forensic-triage
 * accounting" section for the full per-pair reasoning.
 */
export const DEFERRED_FOLLOWUP: ReadonlySet<string> = new Set([
	// dispatch's task-queue (startupSweep/handleTaskStateChanged/handleSessionEnded)
	// + assistant-turn runner (runTurnInternal/registerAssistantTriggerInternal):
	// both need LIVE state at decision/run time (which accepted tasks exist right
	// now; the live conversation transcript + server config for a turn), not a
	// value bake-able once at an earlier emit point — the same open architectural
	// question as run-orchestration's context-assembly cluster below (Decision B:
	// "bake at emit OR agent pulls via MCP", never decided for either).
	"dispatch::work",
	"dispatch::conversation",
	"dispatch::users",
	"dispatch::settings",
	// run-orchestration's context-assembly reads (context.ts's per-session
	// knowledge/org/routine/settings/users/work context, resolved at RUN time,
	// not admission time) — Decision B's two sanctioned resolutions ("bake at
	// emit OR agent pulls via MCP") were never chosen; AU23 makes that call.
	"run-orchestration::knowledge",
	"run-orchestration::org",
	"run-orchestration::routine",
	"run-orchestration::settings",
	"run-orchestration::users",
	"run-orchestration::work",
]);

/**
 * AU21 §9 Increment 9: individually-verified pure/stateless methods that
 * structurally cannot read core-api domain state — zero `db`/`HyperIdleDb`/
 * `WriteExecutor` parameter, deterministic — even though their owning Service
 * otherwise owns real tables (so `isStatelessProvider` below can't exempt the
 * whole Service). Keyed `${provider}:${method}`. Currently exactly one:
 * `work:routeItem` (`packages/core-api/work/src/item-router.ts` — a pure
 * `{riskTier,kind,verb} -> view` string switch; `tool-handlers/src/ports.ts`'s
 * own doc comment already states this: "zero DB access, verified against
 * `@hyperidle/work`'s real implementation"). Keep this list short and
 * source-verified, same bar as `ALLOWLIST`.
 */
const STATELESS_METHODS: ReadonlySet<string> = new Set(["work:routeItem"]);

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

function isDomainStateEdge(services: readonly ServiceInfo[], provider: string, methods: readonly string[]): boolean {
	if (isStatelessProvider(services, provider)) return false;
	if (methods.length > 0 && methods.every((m) => STATELESS_METHODS.has(`${provider}:${m}`))) return false;
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
		if (!isDomainStateEdge(services, edge.target, edge.methods)) continue;
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
		if (!isDomainStateEdge(services, edge.provider, edge.methods)) continue;
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
 * Scenario 3 — the founder-signed cap-gate exemption, reproduced structurally
 * (a "Deps"-shaped bundle composed in `packages/core-api/src/services/*.ts`,
 * exactly the `cost`/`CostDeps` shape edge-disposition.md documents) so the
 * guard proves it does NOT fire on the one legitimately-permanent edge.
 */
function buildAllowlistedCostFixture(root: string): void {
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
 * here is on neither `ALLOWLIST` nor `STATELESS_METHODS`; only its owned-table
 * census, deliberately left EMPTY, drives the exemption).
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

	// Scenario 3 — the founder-signed `cost` cap-gate exemption must NOT fire,
	// even though it is structurally identical to Scenario 2's hidden
	// composition-bundle shape.
	const allowlistedRoot = mkdtempSync(join(tmpdir(), "au21-anti-regrowth-allowlisted-cost-"));
	try {
		buildAllowlistedCostFixture(allowlistedRoot);
		const findings = inspect(allowlistedRoot);
		const violations = findings.filter((f) => f.consumer === "cost");
		if (violations.length > 0) {
			throw new Error(
				`composition-edge-anti-regrowth-guard: the founder-signed cost cap-gate exemption must not fire, got ${JSON.stringify(violations)}`,
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
	// NOT on STATELESS_METHODS) must not fire, purely from its empty owned-
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
