/**
 * eslint-plugin-test-isolation — HyperIdle AU38
 *
 * Two ratchet rules guarding the service integration lane's migration to
 * self-isolating tests (AC6). Flat-config-compatible plugin, same shape as
 * eslint-plugin-authz.
 *
 * Rules:
 *   test-isolation/no-literal-entity-ids   — R1: no literal id/*Id values in inserts
 *   test-isolation/no-unscoped-table-read  — R2: no select().from() chain without where()
 *
 * Both apply only to `*.integration.test.ts` files that import the fixture
 * `test` from a `test-fixtures` module; files still on the old pattern are
 * listed in waivers.md and shrink per migration batch.
 */

import type { ESLint, Linter, Rule } from "eslint";

import { noLiteralEntityIds } from "./rules/no-literal-entity-ids.js";
import { noUnscopedTableRead } from "./rules/no-unscoped-table-read.js";

export const rules: Record<string, Rule.RuleModule> = {
	"no-literal-entity-ids": noLiteralEntityIds,
	"no-unscoped-table-read": noUnscopedTableRead,
};

const plugin: ESLint.Plugin = {
	meta: {
		name: "eslint-plugin-test-isolation",
		version: "0.0.1",
	},
	rules,
};

const recommendedRules: Linter.RulesRecord = {
	"test-isolation/no-literal-entity-ids": "error",
	"test-isolation/no-unscoped-table-read": "error",
};

export const configs: Record<string, Linter.Config> = {
	recommended: {
		plugins: { "test-isolation": plugin },
		rules: recommendedRules,
	},
};

const exported: ESLint.Plugin & { configs: Record<string, Linter.Config> } = {
	...plugin,
	configs,
};

export default exported;
