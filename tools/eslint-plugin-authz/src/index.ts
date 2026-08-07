/**
 * eslint-plugin-authz — HyperIdle AF11
 *
 * Three custom ESLint rules enforcing the access-boundary model (Hard Rules 1–6).
 * Flat-config-compatible plugin.
 *
 * Rules:
 *   authz/no-header-identity-in-authz        — Hard Rule 2
 *   authz/require-boundary-declaration       — Hard Rule 6
 *   authz/no-raw-db-in-route-bypassing-policy — Hard Rule 6 (belt-and-suspenders)
 */

import type { ESLint, Linter, Rule } from "eslint";

import { noHeaderIdentityInAuthz } from "./rules/no-header-identity-in-authz.js";
import { noRawDbInRouteBypassingPolicy } from "./rules/no-raw-db-in-route-bypassing-policy.js";
import { requireBoundaryDeclaration } from "./rules/require-boundary-declaration.js";

export const rules: Record<string, Rule.RuleModule> = {
	"no-header-identity-in-authz": noHeaderIdentityInAuthz,
	"require-boundary-declaration": requireBoundaryDeclaration,
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
	"authz/no-header-identity-in-authz": "error",
	"authz/require-boundary-declaration": "error",
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
