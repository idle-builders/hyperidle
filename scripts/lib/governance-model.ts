/**
 * AU28 — the compact architecture model.
 *
 * FIFTEEN clauses decide every boundary crossing in the repo — the fifteen ids in `CLAUSES` below,
 * every one of which the model can return and name in a decision. They are stated here as code
 * because they are *principles*, and a principle changes only when the founder rules on the
 * architecture. The things that change when packages, surfaces or table owners change are DATA and
 * live in `governance/architecture.json` and `governance/table-owners.json`.
 *
 * @lore AU28: the count used to be stated four different ways — "nine" here, "13" in the README and
 * the commit, 15 entries in `CLAUSES`. Fifteen is the true number and the other three were counting
 * something else: `decideProduction` has NINE numbered branches, but several return more than one
 * clause id (the store branch answers with `store-tooling-measures-everything` or `store-owner-only`;
 * the reach branch with three), and the development relaxation adds two more. Count the ids, not the
 * `if`s — the ids are what a decision names and what the coverage assertion checks.
 *
 * @lore AU28: the decision artifact for this model is a 124-row table of hand-decided verdicts
 * (`governance/decided-rules.json`) — every role pair × crossing kind × world the founder ruled on.
 * Those 124 rows are deliberately NOT the implementation. Implementing them literally would mean 124
 * hand-written rules, each free to disagree with its neighbours, and a founder ruling would land as a
 * 124-way diff. Instead they are the ACCEPTANCE TEST: this model is correct if and only if it
 * reproduces all 248 verdicts (124 rows × 2 worlds) exactly. `governance-model.test.ts` asserts
 * that, so a clause edited to fix one crossing and silently breaking another cannot land.
 *
 * @lore AU28: this model is TOTAL — it returns a verdict for every crossing, including combinations
 * the 124 rows never enumerated because nothing in the repo crosses that way today. That is on
 * purpose: the previous design could fail with "instance matched no rule", which is the same failure
 * mode as a guard that scans nothing. A total model has no such hole. The cost is that it answers
 * questions the founder was never asked; `npm run governance:new-cells` lists exactly those answers.
 */

/** The six package roles. A package has exactly one. Never derived from its path — Ruling 5. */
export type Role = "layer" | "service" | "framework" | "application" | "tooling" | "deployment";

/** The nine crossing kinds the census can detect. */
export type Kind =
	| "import"
	| "manifest"
	| "di"
	| "api"
	| "mcp"
	| "event"
	| "table:read"
	| "table:write"
	| "capability";

export type World = "production" | "development";
export type Verdict = "allowed" | "forbidden";

/** Who is crossing. `layer` is the layer the package lives in; a layer package lives in itself. */
export type Actor =
	| { readonly sort: "package"; readonly name: string; readonly role: Role; readonly layer?: string }
	/** The agent CLI. Not a package in this repo — it dials in from outside. */
	| { readonly sort: "harness" }
	/** `scripts/`, config at the repo root. Outside every package. */
	| { readonly sort: "repo-root" };

/** What is being crossed to. */
export type Target =
	| { readonly sort: "package"; readonly name: string; readonly role: Role; readonly layer?: string }
	/** A named surface of a framework package — see `surfaces` in architecture.json. */
	| { readonly sort: "surface"; readonly surface: string }
	/**
	 * A database table. `owner` is the service that owns it, or null when nobody does.
	 * `missingCompanions` lists the rows the owner would have written alongside this one and the
	 * writer did not — see the companion clause in the development relaxation.
	 */
	| {
			readonly sort: "table";
			readonly table: string;
			readonly owner: string | null;
			readonly missingCompanions?: readonly string[];
	  }
	/** An HTTP API hosted by a layer. */
	| { readonly sort: "http-api"; readonly layer: string }
	| { readonly sort: "mcp-router" }
	| { readonly sort: "event-bus" }
	/**
	 * A model or agent call that does not go through the one runtime door — a vendor SDK
	 * constructed directly, or an agent CLI spawned directly.
	 *
	 * @lore AU28 Ruling 14: this used to be TWO targets, `raw-runtime` and `harness`. They were one
	 * act split by a detector detail — one is an import, the other a process spawn — and the split
	 * leaked into the rule vocabulary. It had already produced a live contradiction: production
	 * forbade both under the same stated rationale, but the development relaxation held only
	 * `raw-runtime`, so a test importing the OpenAI SDK was blocked while a test spawning `claude`
	 * was waved through the same door. There was no decided row for the second, so the founder was
	 * never asked. Collapsed by founder ruling; both spellings now emit this one sort.
	 */
	| { readonly sort: "raw-runtime" }
	| { readonly sort: "development-file" }
	| { readonly sort: "repo-root" };

export interface Crossing {
	readonly kind: Kind;
	readonly source: Actor;
	readonly target: Target;
}

export interface Decision {
	readonly verdict: Verdict;
	/** The clause that decided it. Every decision names one — there is no unexplained verdict. */
	readonly clause: string;
	readonly why: string;
	/** True when production forbids the crossing but the development world relaxes it. */
	readonly relaxedForDevelopment?: boolean;
}

/** `everyone`, `composition roots`, or an explicit list of roles and package names. */
export type Audience = "everyone" | "composition roots" | readonly string[];

export interface Architecture {
	readonly containment: {
		readonly compositionRootRoles: readonly Role[];
		readonly repoRootIsCompositionRoot: boolean;
	};
	readonly surfaces: Readonly<Record<string, { readonly reach: Audience; readonly why: string } | string>>;
	readonly endpoints: {
		readonly httpApiLayers: { readonly layers: readonly string[]; readonly why: string };
		readonly mcpRouter: { readonly host: string; readonly alsoDialledBy: readonly string[]; readonly why: string };
	};
	readonly eventBus: { readonly host: Role; readonly typesModule: string; readonly why: string };
	readonly rawRuntime: { readonly host: string; readonly why: string };
	readonly oneDoorSurfaces: {
		readonly surfaces: readonly string[];
		/** Hold a foreign write only when it leaves a companion row unwritten — Ruling 13. */
		readonly foreignTableWriteMissingCompanion: boolean;
		readonly why: string;
	};
}

// ---------------------------------------------------------------------------------------------
// Reading the architecture
// ---------------------------------------------------------------------------------------------

const surfaceEntry = (arch: Architecture, surface: string): { reach: Audience; why: string } | undefined => {
	const entry = arch.surfaces[surface];
	return typeof entry === "object" && entry !== null && "reach" in entry ? entry : undefined;
};

/** The layer an actor lives in. A layer package lives in itself; everything else lives nowhere. */
const layerOf = (actor: Actor | Target): string | undefined => {
	if (actor.sort !== "package") return undefined;
	if (actor.layer !== undefined) return actor.layer;
	return actor.role === "layer" ? actor.name : undefined;
};

const isCompositionRoot = (arch: Architecture, actor: Actor): boolean => {
	if (actor.sort === "repo-root") return arch.containment.repoRootIsCompositionRoot;
	if (actor.sort !== "package") return false;
	return arch.containment.compositionRootRoles.includes(actor.role);
};

/**
 * True when `target` is a package inside `source` — a layer's own service, and nothing else.
 *
 * Containment is one-directional and only a layer contains anything. Two services of the same layer
 * are siblings, not contents: a service never names a sibling, it receives one through a port.
 */
const isInside = (source: Actor, target: Target): boolean => {
	if (source.sort !== "package" || target.sort !== "package") return false;
	if (source.name === target.name) return true;
	return source.role === "layer" && layerOf(target) === source.name;
};

const inAudience = (arch: Architecture, audience: Audience, actor: Actor): boolean => {
	if (audience === "everyone") return true;
	if (audience === "composition roots") return isCompositionRoot(arch, actor);
	if (actor.sort === "harness") return audience.includes("harness");
	if (actor.sort === "repo-root") return audience.includes("repo root");
	return audience.includes(actor.role) || audience.includes(actor.name);
};

/** True when the actor is the layer named `host`, or a package living inside it. */
const livesIn = (actor: Actor, host: string): boolean =>
	actor.sort === "package" && (actor.name === host || layerOf(actor) === host);

// ---------------------------------------------------------------------------------------------
// The clauses
// ---------------------------------------------------------------------------------------------

/**
 * Decide one crossing in the production world.
 *
 * NINE numbered branches, checked in order, first match wins; several answer with more than one
 * clause id, and the development relaxation adds two more, for the fifteen in `CLAUSES`. The last
 * branch is a default of `forbidden`, so the function is total: there is no crossing it declines to
 * answer.
 */
function decideProduction(arch: Architecture, crossing: Crossing): Decision {
	const { kind, source, target } = crossing;

	// 1. Production may not name development.
	if (target.sort === "development-file") {
		return {
			verdict: "forbidden",
			clause: "production-never-names-development",
			why: "a production file may never name a development file — Ruling 8.1",
		};
	}

	// 2. A table is touched by its owner. Tooling measures the whole database and is exempt.
	//    This clause claims table targets whatever the kind: importing the table symbol, reading and
	//    writing are the same act of reaching into someone else's store.
	if (target.sort === "table") {
		if (source.sort === "package" && source.role === "tooling") {
			return {
				verdict: "allowed",
				clause: "store-tooling-measures-everything",
				why: "a tool that measures or benchmarks the system reads across every table by definition — Ruling 7",
			};
		}
		if (target.owner !== null && source.sort === "package" && source.name === target.owner) {
			return {
				verdict: "allowed",
				clause: "store-owner-only",
				why: `${target.table} is owned by ${target.owner}`,
			};
		}
		return {
			verdict: "forbidden",
			clause: "store-owner-only",
			why:
				target.owner === null
					? `no service owns ${target.table}; an unowned table has no legal accessor`
					: `${target.table} is owned by ${target.owner} — go through it`,
		};
	}

	// 3. Dialling a door: the target must declare it.
	if (target.sort === "http-api") {
		const exposed = arch.endpoints.httpApiLayers.layers.includes(target.layer);
		return {
			verdict: exposed ? "allowed" : "forbidden",
			clause: "dial-declared-doors-only",
			why: exposed
				? `${target.layer} publishes an HTTP API — ${arch.endpoints.httpApiLayers.why}`
				: `${target.layer} hosts no HTTP API`,
		};
	}
	if (target.sort === "mcp-router") {
		const { host, alsoDialledBy, why } = arch.endpoints.mcpRouter;
		const permitted = livesIn(source, host) || (source.sort === "harness" && alsoDialledBy.includes("harness"));
		return { verdict: permitted ? "allowed" : "forbidden", clause: "dial-mcp-router", why };
	}

	// 4. The bus: anyone may publish except the framework that provides it.
	if (target.sort === "event-bus") {
		const isHost = source.sort === "package" && source.role === arch.eventBus.host;
		return {
			verdict: isHost ? "forbidden" : "allowed",
			clause: "publish-anyone-but-the-bus-host",
			why: arch.eventBus.why,
		};
	}

	// 5. Every model and agent call is made from one layer only — Ruling 14: one door, one name.
	if (target.sort === "raw-runtime") {
		const permitted = livesIn(source, arch.rawRuntime.host);
		return { verdict: permitted ? "allowed" : "forbidden", clause: "hold-one-runtime-door", why: arch.rawRuntime.why };
	}

	// 6. Wiring: both ends of an injected port live in the same layer, or the provider is the
	//    framework. Ruling 1 — dependency injection is legal only within a layer.
	if (kind === "di") {
		const home = layerOf(source);
		if (home === undefined) {
			return {
				verdict: "forbidden",
				clause: "wire-within-one-layer",
				why: "dependency injection is legal only within a layer, and this package lives in none — Ruling 1",
			};
		}
		if (target.sort === "package" && target.role === "framework") {
			return {
				verdict: "allowed",
				clause: "wire-within-one-layer",
				why: "the framework may satisfy a port declared inside a layer",
			};
		}
		const sameLayer = target.sort === "package" && layerOf(target) === home;
		return {
			verdict: sameLayer ? "allowed" : "forbidden",
			clause: "wire-within-one-layer",
			why: sameLayer
				? `both ends live in ${home}`
				: "dependency injection is legal only within a layer; cross-layer conversation goes through the API, MCP or the bus — Ruling 1",
		};
	}

	// 7. Naming a surface: each surface names its own audience.
	if (target.sort === "surface") {
		const entry = surfaceEntry(arch, target.surface);
		if (entry === undefined) {
			return {
				verdict: "forbidden",
				clause: "reach-declared-surfaces-only",
				why: `${target.surface} is not a declared surface — declare it in governance/architecture.json before anything names it`,
			};
		}
		const permitted = inAudience(arch, entry.reach, source);
		return { verdict: permitted ? "allowed" : "forbidden", clause: "reach-declared-surfaces-only", why: entry.why };
	}

	// 8. Nothing names the repo root.
	if (target.sort === "repo-root") {
		return {
			verdict: "forbidden",
			clause: "reach-never-the-repo-root",
			why: "a package that names a repo-root script has escaped the workspace it declares",
		};
	}

	// 9. Naming a package: your own contents, or — if you compose the system — a layer or a tool.
	const inside = isInside(source, target);
	if (inside) {
		return { verdict: "allowed", clause: "reach-your-own-contents", why: "the target lives inside the source" };
	}
	// A tool is development machinery. Only development machinery may name one — an application that
	// ships and names a tool has shipped the tool. Ruling 8.1.
	if (target.sort === "package" && target.role === "tooling") {
		const fromDevelopmentMachinery = source.sort === "repo-root" || (source.sort === "package" && source.role === "tooling");
		return {
			verdict: fromDevelopmentMachinery ? "allowed" : "forbidden",
			clause: "reach-tooling-only-from-development-machinery",
			why: "a tool is development machinery — the repo root and other tools may name one, nothing that ships may",
		};
	}
	const acrossFromARoot = isCompositionRoot(arch, source) && target.sort === "package" && target.role === "layer";
	if (acrossFromARoot) {
		return {
			verdict: "allowed",
			clause: "reach-across-only-from-a-composition-root",
			why: "whatever composes the system may name the pieces it composes — but only their public face, never inside them",
		};
	}
	return {
		verdict: "forbidden",
		clause: "reach-across-only-from-a-composition-root",
		why: "only a composition root reaches across, and only as far as a layer's public face — never sideways, never upward, never into another layer's insides",
	};
}

/**
 * Decide one crossing in the development world.
 *
 * A development file may cross any boundary it needs in order to build the world and boot the
 * system. It may not go around a door that production has only one of.
 */
function relaxForDevelopment(arch: Architecture, crossing: Crossing, production: Decision): Decision {
	if (production.verdict === "allowed") return production;

	const { kind, source, target } = crossing;

	// Development naming development is not a crossing at all.
	if (target.sort === "development-file") {
		return {
			verdict: "allowed",
			clause: "development-may-arrange-the-world",
			why: "development naming development is not a boundary crossing",
		};
	}

	// The one-runtime-door requirement (Ruling 14) is narrowed to the production world by a later
	// founder ruling: calls being recorded, priced, replayable, and provider-agnostic are properties
	// the shipped product must have, not development tooling. A development file may construct a
	// vendor SDK or spawn an agent CLI directly to build the world it needs — `raw-runtime` targets
	// fall through to `development-may-arrange-the-world` below like any other crossing. Production
	// stays fully guarded: `decideProduction`'s own `hold-one-runtime-door` branch is untouched.
	const guarded =
		(target.sort === "surface" && arch.oneDoorSurfaces.surfaces.includes(target.surface)) ||
		(target.sort === "table" &&
			kind === "table:write" &&
			arch.oneDoorSurfaces.foreignTableWriteMissingCompanion &&
			(target.missingCompanions?.length ?? 0) > 0);

	if (guarded) {
		// Tooling never had a door to bypass — it reads and writes across the whole database by
		// definition, so there is nothing for it to be going around.
		if (target.sort === "table" && source.sort === "package" && source.role === "tooling") return production;
		if (target.sort === "table" && kind === "table:write") {
			return {
				verdict: "forbidden",
				clause: "write-the-whole-row-set",
				why:
					`writing ${target.table} without ${(target.missingCompanions ?? []).join(", ")} builds a state production ` +
					`cannot produce — ${target.owner ?? "its owner"} always writes them together`,
			};
		}
		return { ...production, clause: `${production.clause} (held: one door)`, why: production.why };
	}

	return {
		verdict: "allowed",
		clause: "development-may-arrange-the-world",
		why: "a test may cross any boundary it needs to build the world and boot the system",
		relaxedForDevelopment: true,
	};
}

/** Decide one crossing. Total — every crossing gets a verdict and the clause that produced it. */
export function decide(arch: Architecture, crossing: Crossing, world: World): Decision {
	const production = decideProduction(arch, crossing);
	return world === "production" ? production : relaxForDevelopment(arch, crossing, production);
}

/**
 * Every clause id the model can return, for coverage assertions. FIFTEEN — this array is the count.
 */
export const CLAUSES = [
	"production-never-names-development",
	"store-tooling-measures-everything",
	"store-owner-only",
	"dial-declared-doors-only",
	"dial-mcp-router",
	"publish-anyone-but-the-bus-host",
	"hold-one-runtime-door",
	"wire-within-one-layer",
	"reach-declared-surfaces-only",
	"reach-never-the-repo-root",
	"reach-tooling-only-from-development-machinery",
	"reach-your-own-contents",
	"reach-across-only-from-a-composition-root",
	"development-may-arrange-the-world",
	"write-the-whole-row-set",
] as const;
