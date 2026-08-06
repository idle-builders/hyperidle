/**
 * AU28 — a floor that has gone slack has stopped measuring anything.
 *
 * @lore AU28: a floor used to have ONE edge. Live below it → throw, the detector broke. Nothing at
 * all guarded the other side, and that is how the rot got in: `di` was recorded as a measured 257
 * while live had fallen to 245, and a floor of 200 was loose enough that twelve lost crossings never
 * registered. Twelve turned out to be a real deletion — but nothing in the build could have told the
 * difference, which is the whole point of having a floor. `MIN_TRACKED_FILES` was worse: 1,000
 * against a live 3,296 is 70% slack, a number that could not fail until two thirds of the repository
 * disappeared.
 *
 * @lore AU28 — why a BAND and not a self-recomputing floor. Deriving the floor from the live count at
 * run time is the tempting option and the single worst one: it can never fail, which is exactly the
 * `au6` shape this whole design exists to prevent. A pinning unit test is also wrong — it cannot see
 * the live tree without reading the filesystem, which tests here may not do. The live-tree property
 * is static, so it belongs in the lint; the band PREDICATE is runtime logic, so that gets the test.
 */

import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census } from "../lib/repo-census.js";

/**
 * A magnitude floor tracks a COUNT and must stay near it. An existence floor is a check over a
 * closed enumerated set — floor exactly 1, "fail when an ENTRY dies, not when a count dips" — and is
 * exempt from the band.
 *
 * @lore AU28: this is a DECLARED field rather than a heuristic on the number 1. A heuristic would let
 * anyone dodge the band by writing `minFiles: 1` on a magnitude pattern, which is the cheapest
 * possible escape and would be indistinguishable from a real existence check.
 */
export type FloorKind = "magnitude" | "existence";

export interface FloorRecord {
	/** Stable id, reported verbatim. */
	readonly id: string;
	readonly live: number;
	readonly floor: number;
	readonly floorKind: FloorKind;
}

export type FloorVerdict =
	| { readonly sort: "ok" }
	| { readonly sort: "below"; readonly message: string }
	| { readonly sort: "slack"; readonly message: string; readonly suggested: number };

/**
 * How far below the live count a magnitude floor may sit.
 *
 * The `max(…, 5)` term is what keeps a small-n detector honest: `capability` at 10 live keeps a floor
 * of 8, because a straight 20% band would fail the build over two sites of ordinary churn. The 20% /
 * floor-5 shape is a judgement, not a measurement — it was chosen as the tightest band that leaves
 * every classification-pattern floor valid and is actionable in one commit.
 */
export const allowedSlack = (live: number): number => Math.max(Math.ceil(live * 0.2), 5);

/** The band, as one predicate. Both edges. */
export function floorVerdict(record: FloorRecord): FloorVerdict {
	const { id, live, floor, floorKind } = record;
	if (live < floor) {
		return {
			sort: "below",
			message:
				`"${id}" is at ${live}, below its declared floor of ${floor}. A drop means the measurement broke, ` +
				"not that the repo got cleaner — fix it, never lower the floor to match.",
		};
	}
	if (floorKind === "existence") return { sort: "ok" };
	const allowed = allowedSlack(live);
	const slack = live - floor;
	if (slack <= allowed) return { sort: "ok" };
	return {
		sort: "slack",
		suggested: live - allowed,
		message:
			`"${id}" declares a floor of ${floor} against ${live} live — ${slack} of slack where ${allowed} is allowed. ` +
			`A floor this loose measures nothing: re-measure and raise it to ${live - allowed}. ` +
			"`npm run governance:floors` prints the value to write.",
	};
}

export interface FloorsTightInput {
	/** Every floor the build declares — detector, classification pattern, and the census floor. */
	readonly floors: readonly FloorRecord[];
}

export function floorsTight(input: FloorsTightInput): Rule {
	return {
		id: "floors-tight",
		description: "every declared magnitude floor still sits close enough to its live count to measure something",
		scope: () => input.floors.map((f) => f.id),
		// The population is the floor set itself: 9 detector + 10 classification pattern + the census
		// floor. Deleting a floor rather than fixing it trips DeadRuleError.
		minScope: 20,
		evaluate: (_census: Census): readonly Finding[] =>
			input.floors
				.map((floor) => ({ floor, verdict: floorVerdict(floor) }))
				.filter((entry) => entry.verdict.sort !== "ok")
				.map(({ verdict }) => ({
					ruleId: "floors-tight",
					severity: "error" as const,
					message: verdict.sort === "ok" ? "" : verdict.message,
				})),
	};
}
