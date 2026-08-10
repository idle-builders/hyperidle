/**
 * AU28 — what the compact model decides that the founder was never asked.
 *
 * The 125 decided rows cover every crossing that exists in the repo today. The model is total: it
 * answers every crossing that *could* exist. The difference is the price of compression — verdicts
 * derived from a principle rather than chosen one at a time.
 *
 * This script lists that difference so it can be read and challenged rather than discovered later.
 * It is a report, not a gate: `npm run governance:new-cells`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type Architecture,
	type Crossing,
	decide,
	type Kind,
	type Role,
	type Target,
} from "./lib/governance-model.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));

const architecture = readJson("tools/governance/architecture.json") as Architecture;
const decided = readJson("tools/governance/decided-rules.json") as {
	rows: readonly {
		source: string;
		target: string;
		kind: Kind;
		production: string;
		development: string;
	}[];
};

const SOURCES = [
	"layer",
	"service",
	"framework",
	"application",
	"tooling",
	"deployment",
	"harness",
	"repo root",
	"core-ui",
	"harness-registry",
	"agent-execution",
] as const;

/** Only the targets a given kind can actually produce. An `api` crossing has no db surface. */
const TARGETS_BY_KIND: Readonly<Record<Kind, readonly string[]>> = {
	import: [
		"layer (own)",
		"layer (other)",
		"service (same layer)",
		"service (other layer)",
		"layer",
		"service",
		"application",
		"tooling",
		"framework/api-contract",
		"framework/design-system",
		"framework/db",
		"db:client",
		"db:row-type",
		"db:bootstrap",
		"db:util",
		"db:schema-ns",
		"db:testing",
		"db:unknown",
		"db:table (own)",
		"db:table (other)",
		"development file",
		"repo root",
	],
	manifest: [
		"layer (own)",
		"layer (other)",
		"service (same layer)",
		"service (other layer)",
		"layer",
		"service",
		"application",
		"tooling",
		"framework/api-contract",
		"framework/design-system",
		"framework/db",
	],
	di: [
		"layer (own)",
		"layer (other)",
		"service (same layer)",
		"service (other layer)",
		"framework",
		"service",
		"application",
	],
	api: ["core-api", "agent-orchestration", "agent-execution"],
	mcp: ["MCP router"],
	event: ["EventBus"],
	"table:read": ["db:table (own)", "db:table (other)"],
	"table:write": ["db:table (own)", "db:table (other)"],
	capability: ["raw runtime"],
};

const SOURCE_LAYER = "core-api";
const OTHER_LAYER = "agent-orchestration";

function makeActor(name: string): Crossing["source"] {
	switch (name) {
		case "harness":
			return { sort: "harness" };
		case "repo root":
			return { sort: "repo-root" };
		case "core-ui":
			return { sort: "package", name: "core-ui", role: "layer" };
		case "agent-execution":
			return { sort: "package", name: "agent-execution", role: "layer" };
		case "harness-registry":
			return {
				sort: "package",
				name: "harness-registry",
				role: "service",
				layer: "agent-execution",
			};
		case "layer":
			return { sort: "package", name: SOURCE_LAYER, role: "layer" };
		case "service":
			return { sort: "package", name: "work", role: "service", layer: SOURCE_LAYER };
		default:
			return { sort: "package", name: `a-${name}`, role: name as Role };
	}
}

function makeTarget(labelText: string, source: Crossing["source"], kind: Kind): Target {
	if (kind === "api") return { sort: "http-api", layer: labelText };
	switch (labelText) {
		case "development file":
			return { sort: "development-file" };
		case "EventBus":
			return { sort: "event-bus" };
		case "MCP router":
			return { sort: "mcp-router" };
		case "raw runtime":
			return { sort: "raw-runtime" };
		case "repo root":
			return { sort: "repo-root" };
		case "db:table (own)":
			return {
				sort: "table",
				table: "bets",
				owner: source.sort === "package" ? source.name : "work",
			};
		case "db:table (other)":
			return { sort: "table", table: "bets", owner: "some-other-service" };
		case "layer (own)":
			return {
				sort: "package",
				name: source.sort === "package" ? (source.layer ?? source.name) : SOURCE_LAYER,
				role: "layer",
			};
		case "layer (other)":
			return { sort: "package", name: OTHER_LAYER, role: "layer" };
		case "service (same layer)":
			return {
				sort: "package",
				name: "review",
				role: "service",
				layer: source.sort === "package" ? (source.layer ?? source.name) : SOURCE_LAYER,
			};
		case "service (other layer)":
			return { sort: "package", name: "run-orchestration", role: "service", layer: OTHER_LAYER };
		case "layer":
			return { sort: "package", name: OTHER_LAYER, role: "layer" };
		case "service":
			return { sort: "package", name: "run-orchestration", role: "service", layer: OTHER_LAYER };
		case "application":
			return { sort: "package", name: "another-application", role: "application" };
		case "tooling":
			return { sort: "package", name: "eval", role: "tooling" };
		case "framework":
			return { sort: "package", name: "another-framework", role: "framework" };
		default:
			return { sort: "surface", surface: labelText };
	}
}

/** A source that cannot sensibly appear on the left of this kind. */
const skip = (source: string, kind: Kind, target: string): boolean => {
	if (source === "harness") return kind !== "mcp" && kind !== "capability";
	if (source === "repo root") return kind !== "import" && kind !== "manifest";
	// "own"/"same layer" relations are only meaningful for a package that lives in a layer.
	const inALayer = ["layer", "service", "core-ui", "harness-registry", "agent-execution"].includes(
		source,
	);
	if (!inALayer && (target.includes("(own)") || target.includes("(same layer)"))) return true;
	// A layer has no "own layer" other than itself, already covered by "layer (own)" for services.
	return false;
};

const decidedKeys = new Set(decided.rows.map((r) => `${r.source}|${r.target}|${r.kind}`));

interface Cell {
	source: string;
	target: string;
	kind: Kind;
	production: string;
	development: string;
	clause: string;
	why: string;
}
const fresh: Cell[] = [];

for (const kind of Object.keys(TARGETS_BY_KIND) as Kind[]) {
	for (const source of SOURCES) {
		for (const target of TARGETS_BY_KIND[kind]) {
			if (skip(source, kind, target)) continue;
			if (decidedKeys.has(`${source}|${target}|${kind}`)) continue;
			const actor = makeActor(source);
			const crossing: Crossing = { kind, source: actor, target: makeTarget(target, actor, kind) };
			const p = decide(architecture, crossing, "production");
			const d = decide(architecture, crossing, "development");
			fresh.push({
				source,
				target,
				kind,
				production: p.verdict,
				development: d.verdict,
				clause: p.clause,
				why: p.why,
			});
		}
	}
}

const total = Object.values(TARGETS_BY_KIND).reduce((n, ts) => n + ts.length * SOURCES.length, 0);
console.log(`governance model — coverage beyond the decided rows\n`);
console.log(`  decided by the founder, one at a time : ${decided.rows.length}`);
console.log(`  derived by the model, never asked     : ${fresh.length}`);
console.log(`  (upper bound on the enumerated space  : ${total})\n`);

const byClause = new Map<string, Cell[]>();
for (const c of fresh) byClause.set(c.clause, [...(byClause.get(c.clause) ?? []), c]);

for (const [clause, cells] of [...byClause].sort((a, b) => b[1].length - a[1].length)) {
	const allowed = cells.filter((c) => c.production === "allowed").length;
	console.log(
		`── ${clause}  (${cells.length} cells · ${allowed} allowed · ${cells.length - allowed} forbidden)`,
	);
	console.log(`   ${cells[0]?.why ?? ""}`);
	for (const c of cells) {
		const flag = c.production === "allowed" ? "ALLOW " : "FORBID";
		const dev = c.development === c.production ? "" : `  (dev: ${c.development})`;
		console.log(`   ${flag}  ${c.source} → ${c.target} [${c.kind}]${dev}`);
	}
	console.log("");
}
