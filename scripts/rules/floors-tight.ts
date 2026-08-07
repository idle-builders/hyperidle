/**
 * AU28 — a floor that has gone slack has stopped measuring anything.
 *
 * @lore AU28: a floor used to have ONE edge. Live below it → throw, the detector broke. Nothing at
 * all guarded the other side, and that is how the rot got in: a detector floor sat loose enough that
 * a dozen lost crossings never registered. The loss turned out to be a real deletion — but nothing in
 * the build could have told the difference, which is the whole point of having a floor. The census
 * floor was worse still, sitting at roughly 70% slack: a number that could not fail until two thirds
 * of the repository had disappeared.
 *
 * @lore AU28 — why a BAND and not a self-recomputing floor. Deriving the floor from the live count at
 * run time is the tempting option and the single worst one: it can never fail, which is exactly the
 * `au6` shape this whole design exists to prevent. A pinning unit test is also wrong — it cannot see
 * the live tree without reading the filesystem, which tests here may not do. The live-tree property
 * is static, so it belongs in the lint; the band PREDICATE is runtime logic, so that gets the test.
 *
 * @lore AU28 — why the band has THREE states and not two. With a single error edge, a floor recomputed
 * to the value the tool printed landed EXACTLY on that edge: `live - allowed`. The next file anyone
 * added turned the build red, with a message telling them to raise the floor. That trains reflexive
 * floor-bumping — the precise rot floors exist to prevent — and it fires on ordinary work, because the
 * census counts untracked-but-not-ignored files and so grows the moment you start writing. So:
 * comfortably inside the band is silent, the approach to the edge WARNS and names the recompute
 * command, and only past the edge is an error. And the value the tool prints is the MIDDLE of the
 * band, never its edge, so a recompute buys real headroom instead of one file's worth.
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
	/** Inside the band but approaching its edge. A warning, and the value to write. */
	| { readonly sort: "approaching"; readonly message: string; readonly suggested: number }
	/** Past the edge. An error, and the value to write. */
	| { readonly sort: "slack"; readonly message: string; readonly suggested: number };

/**
 * How far below the live count a magnitude floor may sit before it is an ERROR.
 *
 * The `max(…, 5)` term is what keeps a small-n detector honest: a detector at 10 live keeps a floor of
 * 7, because a straight 20% band would fail the build over two sites of ordinary churn. The 20% /
 * floor-5 shape is a judgement, not a measurement — it was chosen as the tightest band that leaves
 * every classification-pattern floor valid and is actionable in one commit.
 */
export const allowedSlack = (live: number): number => Math.max(Math.ceil(live * 0.2), 5);

/**
 * Where a recomputed floor should be written: the MIDDLE of the band.
 *
 * Never `live - allowedSlack(live)`. That is the error edge, and a floor written there is one added
 * file from red — which is how the whole floor set came to sit on the edge at once.
 */
export const suggestedFloor = (live: number): number => live - Math.ceil(allowedSlack(live) / 2);

/**
 * Where the band starts WARNING. Three quarters of the way out.
 *
 * Wide enough that a floor written at the middle survives a long run of ordinary growth before it
 * says anything, narrow enough that the warning arrives with room to act on it rather than as the
 * error's herald.
 */
const warnAtSlack = (live: number): number => Math.ceil(allowedSlack(live) * 0.75);

/** The band, as one predicate. Both edges, and the approach to the upper one. */
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
	const suggested = suggestedFloor(live);
	if (slack <= warnAtSlack(live)) return { sort: "ok" };
	if (slack <= allowed) {
		return {
			sort: "approaching",
			suggested,
			message:
				`"${id}" declares a floor of ${floor} against ${live} live — ${slack} of slack, and past ${allowed} it stops ` +
				`measuring. Re-measure and raise it to ${suggested} while it is still cheap: run \`npm run governance:floors\`, ` +
				"which prints the value to write. Raising it now is maintenance; raising it after the error is a reflex.",
		};
	}
	return {
		sort: "slack",
		suggested,
		message:
			`"${id}" declares a floor of ${floor} against ${live} live — ${slack} of slack where ${allowed} is allowed. ` +
			`A floor this loose measures nothing: re-measure and raise it to ${suggested}. ` +
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
				.map((floor) => floorVerdict(floor))
				.filter((verdict): verdict is Exclude<FloorVerdict, { sort: "ok" }> => verdict.sort !== "ok")
				.map((verdict) => ({
					ruleId: "floors-tight",
					// A floor approaching the edge is maintenance, not a broken build — see the band lore.
					severity: verdict.sort === "approaching" ? ("warn" as const) : ("error" as const),
					message: verdict.message,
				})),
	};
}
