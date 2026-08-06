#!/usr/bin/env npx tsx
/**
 * AU28 — print every declared floor against its live count, and the value to write.
 *
 * @lore AU28: the ABSENCE of this command is what caused the rot it exists to fix. Re-measuring a
 * floor used to mean archaeology — find the detector, work out what it counts, write a throwaway
 * script — so nobody did it, and `di` sat at a recorded 257 against a live 245 for two commits while
 * `repo-census.ts` documented a tree 40 files smaller than the one it was describing. Making the
 * re-measure one command is the difference between a rule people follow and a rule people mean to.
 *
 * Usage:
 *   npm run governance:floors
 */

import {
	buildCrossings,
	buildLiveCensus,
	declaredFloors,
	loadArchitecture,
	trackedFiles,
} from "./governance-context.js";
import { allowedSlack, floorVerdict } from "./rules/floors-tight.js";

const architecture = loadArchitecture();
const census = buildLiveCensus(architecture, trackedFiles());
const detected = buildCrossings(census, architecture);
const floors = declaredFloors(census, detected.countsByKind);

const columns = ["floor", "kind", "live", "declared", "slack", "allowed", "verdict", "write"] as const;
const widths = [42, 10, 7, 9, 7, 8, 8, 7];
const row = (cells: readonly string[]): string =>
	cells.map((cell, i) => (i < 2 ? cell.padEnd(widths[i] ?? 0) : cell.padStart(widths[i] ?? 0))).join("  ");

console.log(`\n  every floor the build declares, against the tree as it is right now\n`);
console.log(`  ${row([...columns])}`);
console.log(`  ${"─".repeat(widths.reduce((a, b) => a + b, 0) + 2 * (widths.length - 1))}`);

let drifted = 0;
for (const floor of floors) {
	const verdict = floorVerdict(floor);
	const allowed = floor.floorKind === "existence" ? "—" : String(allowedSlack(floor.live));
	const write = verdict.sort === "slack" ? String(verdict.suggested) : "—";
	if (verdict.sort !== "ok") drifted += 1;
	console.log(
		`  ${row([
			floor.id,
			floor.floorKind,
			String(floor.live),
			String(floor.floor),
			String(floor.live - floor.floor),
			allowed,
			verdict.sort,
			write,
		])}`,
	);
}

console.log("");
if (drifted === 0) {
	console.log(`  ${floors.length} floor(s), zero drift. Every magnitude floor is inside its band.\n`);
	process.exit(0);
}
console.log(
	`  ${drifted} of ${floors.length} floor(s) have drifted. Copy the \`write\` column into the declaration ` +
		`— never lower a floor to make a run go green.\n`,
);
process.exit(1);
