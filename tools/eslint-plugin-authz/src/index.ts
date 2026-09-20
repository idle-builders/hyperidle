/**
 * eslint-plugin-authz — HyperIdle AF11
 *
 * @lore BC3 architecture.md §5 B13: `authz/no-header-identity-in-authz` is
 * DELETED along with the `canRead`/`canWrite`/`authorizeRead`/`authorizeWrite`
 * functions it guarded — their only production caller, `routes/threads.ts`,
 * is deleted; the property it enforced ("the actor never comes from a
 * header") is structural now (the actions router reads
 * `c.get("userId")` and nothing else, and there is no other door). A rule
 * whose sink set is empty reads as passing forever, which is the failure
 * mode this deletion avoids.
 *
 * Rules:
 *   authz/no-raw-db-in-route-bypassing-policy — Hard Rule 6 (belt-and-suspenders;
 *     already a pre-existing no-op — its own `requireBoundary({kind:"enforced"})`
 *     sink was deleted before this item, and re-keying it is not this item's work)
 */

import type { ESLint, Linter, Rule } from "eslint";

import { noRawDbInRouteBypassingPolicy } from "./rules/no-raw-db-in-route-bypassing-policy.js";

export const rules: Record<string, Rule.RuleModule> = {
	"no-raw-db-in-route-bypassing-policy": noRawDbInRouteBypassingPolicy,
};

const plugin: ESLint.Plugin = {
	meta: {
		name: "eslint-plugin-authz",
		version: "0.0.1",
	},
	rules,
};

const recommendedRules: Linter.RulesRecord = {
	"authz/no-raw-db-in-route-bypassing-policy": "error",
};

export const configs: Record<string, Linter.Config> = {
	recommended: {
		plugins: { authz: plugin },
		rules: recommendedRules,
	},
};

const exported: ESLint.Plugin & { configs: Record<string, Linter.Config> } = {
	...plugin,
	configs,
};

export default exported;
