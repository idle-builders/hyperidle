/**
 * AU29 §4.5 — every symbol reachable through the database package resolves to a named surface.
 *
 * @lore AU29: closes plan validation scenario 3 ("a developer adds a new export to `framework/db`
 * that performs no database access; `npm run lint` fails naming that symbol"). The detection already
 * existed — the barrel scan places any re-export from an unmapped module into `unplacedDbSymbols`
 * with no consumer needed (`tools/governance/src/lib/db-surfaces.ts`) — but its only voice was a
 * non-fatal NOTE printed after the verdict (`tools/governance/src/governance-lint.ts`), which
 * `hasErrors` never saw. This rule
 * gives that same detection an error severity, deleting the NOTE in the same commit so there are not
 * two reporters of one fact.
 *
 * @lore AU29: registers only once the unplaced list is genuinely empty on a clean tree — this rule
 * lands in the commit that clears the last pre-existing unplaced symbol (task E's `seed` phantom fix,
 * §2.8), after task A cleared the three template-module symbols. Registering it earlier would error on
 * every commit in between; that ordering is load-bearing, not incidental (`architecture.md` §4.5,
 * §5 task E, `feasibility.md` §5).
 */

import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census } from "../lib/repo-census.js";

export interface DbSymbolsAllPlacedInput {
	/** Symbol → why it could not be placed. Mutated live by `db.resolve()` during crossing detection. */
	readonly unplacedDbSymbols: ReadonlyMap<string, string>;
	/** The database package's source root, for scoping — e.g. `framework/db/src`. */
	readonly dbSourceRoot: string;
	/** The database package's barrel, where every finding is reported. */
	readonly dbBarrel: string;
}

export function dbSymbolsAllPlaced(input: DbSymbolsAllPlacedInput): Rule {
	const { unplacedDbSymbols, dbSourceRoot, dbBarrel } = input;
	const prefix = `${dbSourceRoot}/`;

	return {
		id: "db-symbols-all-placed",
		description: "every symbol reachable through the database package resolves to a named surface",
		scope: (census: Census): readonly string[] =>
			census.files.filter((f) => f.path.startsWith(prefix)).map((f) => f.path),
		minScope: 5,
		evaluate: (): readonly Finding[] =>
			[...unplacedDbSymbols].map(([symbol, why]) => ({
				ruleId: "db-symbols-all-placed",
				severity: "error" as const,
				message: `${symbol} — ${why}`,
				path: dbBarrel,
				world: "production" as const,
			})),
	};
}
