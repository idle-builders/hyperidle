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
import reactHooks from "eslint-plugin-react-hooks";

const languageOptions: Linter.Config["languageOptions"] = {
	parser: tsParser,
	parserOptions: { ecmaFeatures: { jsx: true } },
};

// @lore AZ7 post-ship durability review (NB1): the previous version of this
// standalone config loaded ONLY the design plugin, so a file with a genuine
// `// eslint-disable-line react-hooks/exhaustive-deps` (valid under the FULL
// eslint.config.ts, which loads react-hooks) reported "Definition for rule
// 'react-hooks/exhaustive-deps' was not found" here — ESLint validates disable
// comments against the rules actually registered in the running config. That
// made `npm run lint:design` exit 1 on a clean tree (2 errors + 135 warnings).
// Fix: load react-hooks in this config too, so the disable comments resolve.
// The rule is registered at its main-config severity (warn) to match — this
// config's job is "run the design sweep clean", not to re-decide severities.
export default [
	{ ignores: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"] },
	{
		files: ["layers/core-ui/src/**/*.tsx"],
		ignores: ["layers/core-ui/src/**/*.stories.tsx", "layers/core-ui/src/**/__tests__/**"],
		languageOptions,
		plugins: { "react-hooks": reactHooks },
		rules: {
			"react-hooks/rules-of-hooks": "error",
			"react-hooks/exhaustive-deps": "warn",
		},
	},
	...designHearthConfigs.hearth.map((block) => ({ ...block, languageOptions })),
];
