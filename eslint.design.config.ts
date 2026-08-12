// lint:design — runs ONLY the design-lint rule set (eslint-plugin-design's
// hearth-config), standalone from the rest of eslint.config.ts.
//
// @lore AZ7 D3: `npx eslint 'layers/core-ui/src/**/*.tsx' 'framework/design-system/src/**/*.tsx'`
// against the FULL `eslint.config.ts` (no `--quiet`) crashed with "Oops!
// Something went wrong!" — running warn-level rules (which `--quiet` skips)
// pulls in the api-typesafety block's warn-level type-aware
// `@typescript-eslint/no-unsafe-*` rules, which need `parserOptions.project`
// to even LOAD and error out immediately without it. `npm run lint`'s
// `--quiet` flag hid this by skipping warn-level rules entirely — which is
// also why the design rules wired at `warn` never actually ran under
// `npm run lint` (D1). This config sidesteps both: it loads ONLY the design
// plugin's rules (via `hearth-config`'s total severity table), so there is no
// type-aware rule to crash on and no need for `--quiet` to hide it.
import tsParser from "@typescript-eslint/parser";
import type { Linter } from "eslint";
import { configs as designHearthConfigs } from "eslint-plugin-design/hearth-config";

const languageOptions: Linter.Config["languageOptions"] = {
	parser: tsParser,
	parserOptions: { ecmaFeatures: { jsx: true } },
};

// @lore AZ7 D3: this standalone config loads ONLY the design plugin. A file
// with a genuine `// eslint-disable-line react-hooks/exhaustive-deps` (valid
// under the FULL eslint.config.ts, which loads react-hooks) reports
// "Definition for rule 'react-hooks/exhaustive-deps' was not found" here,
// because this config never loads that plugin — ESLint validates disable
// comments against the rules actually registered in the running config. That
// is expected noise from running a narrower config standalone, not a design
// finding; `design/*` disable comments (e.g. `no-local-status-builder`
// exceptions) still work normally since inline config is NOT disabled.
export default [
	{ ignores: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"] },
	...designHearthConfigs.hearth.map((block) => ({ ...block, languageOptions })),
];
