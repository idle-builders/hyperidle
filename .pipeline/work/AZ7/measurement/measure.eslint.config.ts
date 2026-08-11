// AZ7 measurement config — runs EVERY design rule at `error` so the true
// violating population is visible. The repo's own eslint.config.ts runs most of
// these at `warn`, and `npm run lint` passes `--quiet`, which does not run
// warn-level rules at all — so this file exists to see what the repo cannot.
//
// Run from the repo root:
//   npx eslint --no-config-lookup \
//     --config .pipeline/work/AZ7/measurement/measure.eslint.config.ts \
//     -f json -o /tmp/design-all.json \
//     'layers/core-ui/src/**/*.tsx' 'framework/design-system/src/**/*.tsx'
//
// Relative imports (not workspace specifiers) because --no-config-lookup means
// this file is resolved from its own directory, outside any package.
import tsParser from "../../../../node_modules/@typescript-eslint/parser/dist/index.js";
import design from "../../../../tools/eslint-plugin-design/src/index.ts";

const DESIGN_RULES = [
	"no-hardcoded-color",
	"no-off-grid-spacing",
	"no-off-scale-radius",
	"no-off-scale-font-size",
	"no-ai-aesthetic",
	"no-raw-tailwind-color",
	"require-ds-attribute",
	"require-stories-sibling",
	"require-focus-on-interactive",
	"no-op-button",
	"no-local-status-builder",
	"no-handrolled-select",
	"no-raw-settings-textarea",
	"no-hardcoded-tracking",
	"no-off-scale-duration",
];
const rules = Object.fromEntries(DESIGN_RULES.map((r) => [`design/${r}`, "error"]));

export default [
	{ ignores: ["**/node_modules/**", "**/dist/**"] },
	{
		files: ["**/*.tsx", "**/*.ts"],
		languageOptions: { parser: tsParser as never, parserOptions: { ecmaFeatures: { jsx: true } } },
		plugins: { design: design as never },
		rules,
	},
];
