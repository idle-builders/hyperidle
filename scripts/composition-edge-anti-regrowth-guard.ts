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
 * @lore AU21 Increment 0 (builder pass): this guard is wired into `npm run
 * lint` as a `--fixtures` self-test only (proves the detection mechanism
 * itself is correct and stays correct), NOT as a bare `inspect(process.cwd())`
 * check against the live tree. Verified 2026-07-27 by actually running
 * `inspect(process.cwd())` against this tree: **60 findings, 33 distinct
 * consumer::provider pairs** — exactly `edge-disposition.md`'s 37 cataloged
 * pairs minus the 4 founder-exempted `cost` pairs (`tool-handlers` 7,
 * `dispatch` 8, `session-requests` 8, `run-orchestration` 8, `agent-selection`
 * 2). Those are real, intentional, currently-necessary edges pending
 * Increments 1-8's migration — not regrowth. Wiring the bare check into
 * `npm run lint` today would red the entire build on pre-existing, catalogued
 * work, not a new violation. architecture.md §9 Increment 9 ("Ship the guard
 * ... Gate: ...") already reserves the bare-check CI wiring for AFTER
 * Increments 1-8 land and the founder's ALLOWLIST becomes the true
 * steady-state. Flagged to the planner/reviewer as a BLOCKER against the
 * instruction to wire the bare check now — do not wire it into `npm run
 * lint` before that gate lands.
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
	resolvePortEdges,
} from "./generate-dependency-graph";

export type EdgeKind = "raw-port" | "composition-bundle";

export interface CompositionEdgeFinding {
	readonly consumer: string; // agent-orchestration Service name
	readonly provider: string; // core-api Service name
	readonly edgeKind: EdgeKind;
	readonly detail: string;
}

/**
 * Founder-signed, permanent exemptions (edge-disposition.md "Consumer: `cost`"
 * / Decision D). Keyed `${consumer}::${provider}`. This is the ONLY allowlist —
 * every other `agent-orchestration -> core-api` edge (raw-port or
 * composition-bundle) is a violation once Increment 9 implements detection.
 */
export const ALLOWLIST: ReadonlySet<string> = new Set([
	"cost::users", // findUser/incrementUserCost/sumAllUserCost/updateUser/resetAllUserCost — cap accounting
	"cost::org", // getTeamMembers/applyTeamCost — team cap accounting
	"cost::settings", // readServerConfig/updateServerConfig — factory cap + sentinel level
	"cost::work", // get/create/update — bet-cost accumulation + breach review-item creation
]);

/**
 * Detect every `agent-orchestration -> core-api` composition edge (raw-port +
 * composition-bundle) in the given repo root, filtered to non-allowlisted
 * (i.e. violating) edges only.
 *
 * Delegates both resolution mechanisms to `generate-dependency-graph.ts`:
 * `resolvePortEdges` (§ MANUAL_OVERRIDES + header-comment + reverse-export-
 * index resolution) for raw `ports.ts` reads, and `detectHiddenCompositionEdges`
 * (type-import + composition-root usage-collection, folded in from the now-
 * retired `scan-hidden-composition-edges.ts`) for hidden bundle reads. Both
 * are cross-checked against `ALLOWLIST`.
 */
export function inspect(root: string): CompositionEdgeFinding[] {
	const services = discoverServices(root);
	const layerByName = new Map(services.map((s) => [s.name, s.layer]));
	const reverseIndex = buildExposedApis(services);

	const findings: CompositionEdgeFinding[] = [];

	// Mechanism 1 — raw `ports.ts` reads (generate-dependency-graph.ts's own resolution).
	for (const edge of resolvePortEdges(services, reverseIndex)) {
		if (edge.confidence === "unresolved") continue; // target not a real Service — can't attribute
		if (layerByName.get(edge.source) !== "agent-orchestration") continue;
		if (layerByName.get(edge.target) !== "core-api") continue;
		if (ALLOWLIST.has(`${edge.source}::${edge.target}`)) continue;
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
