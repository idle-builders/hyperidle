import type { ESLint, Rule } from "eslint";
import { loreFormat } from "./rules/lore-format.js";
import { noDomMarkerAssert } from "./rules/no-dom-marker-assert.js";
import { noExistenceOnlyTest } from "./rules/no-existence-only-test.js";
import { noMockDataImport } from "./rules/no-mock-data-import.js";
import { noMockDataSymbol } from "./rules/no-mock-data-symbol.js";
import { noPlanningIdInTest } from "./rules/no-planning-id-in-test.js";
import { noRepoIntrospectionInTest } from "./rules/no-repo-introspection-in-test.js";
import { noUngatedStreamDrain } from "./rules/no-ungated-stream-drain.js";
import { noUnknownCast } from "./rules/no-unknown-cast.js";

export const rules: Record<string, Rule.RuleModule> = {
	"no-ungated-stream-drain": noUngatedStreamDrain,
	"no-mock-data-import": noMockDataImport,
	"no-mock-data-symbol": noMockDataSymbol,
	"no-unknown-cast": noUnknownCast,
	"no-dom-marker-assert": noDomMarkerAssert,
	"no-existence-only-test": noExistenceOnlyTest,
	"lore-format": loreFormat,
	"no-planning-id-in-test": noPlanningIdInTest,
	"no-repo-introspection-in-test": noRepoIntrospectionInTest,
};

const plugin: ESLint.Plugin = {
	meta: {
		name: "eslint-plugin-design",
		version: "0.0.1",
	},
	rules,
};

export default plugin;
