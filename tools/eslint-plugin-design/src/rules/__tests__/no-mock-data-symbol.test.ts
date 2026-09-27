/**
 * `design/no-mock-data-symbol` flags every forbidden-prefix symbol (MOCK_, FAKE_, STUB_, etc.) in
 * production source, and disambiguates `DEFAULT_*` — flagged only in data-provider paths, never for
 * a numeric tuning constant or a theme/UI default. Never flagged in a test/fixture/story/e2e/seed
 * path.
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noMockDataSymbol } from "../no-mock-data-symbol.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

// Parametric test: every forbidden prefix must trigger exactly one error.
// ONE parametric test — not 11 copies (per plan requirement).
const FORBIDDEN_PREFIXES = [
	"MOCK_",
	"FAKE_",
	"STUB_",
	"SAMPLE_",
	"DUMMY_",
	"PLACEHOLDER_",
	"FALLBACK_",
	"DEMO_",
	"LEGACY_",
	"EXAMPLE_",
	"HARDCODED_",
] as const;

for (const prefix of FORBIDDEN_PREFIXES) {
	const symbolName = `${prefix}USERS`;
	ruleTester.run(`no-mock-data-symbol [prefix=${prefix}]`, noMockDataSymbol, {
		valid: [],
		invalid: [
			{
				filename: "/repo/layers/core-ui/src/pages/Users.tsx",
				code: `export const ${symbolName} = [];`,
				errors: [{ messageId: "mockDataSymbol" }],
			},
		],
	});
}

// Main rule test: valid + invalid cases
ruleTester.run("no-mock-data-symbol", noMockDataSymbol, {
	valid: [
		// DEFAULT_* in non-data paths: NOT flagged
		// DEFAULT_LOCAL_MS in packages/server/src/services/git-export-runner.ts
		{
			filename: "/repo/packages/server/src/services/git-export-runner.ts",
			code: "const DEFAULT_LOCAL_MS = 5_000;",
		},
		// DEFAULT_PUSH_MS in packages/server/src/services/git-export-runner.ts
		{
			filename: "/repo/packages/server/src/services/git-export-runner.ts",
			code: "const DEFAULT_PUSH_MS = 30_000;",
		},
		// DEFAULT_LIMIT in packages/server/src/routes/artifacts.ts
		{
			filename: "/repo/packages/server/src/routes/artifacts.ts",
			code: "const DEFAULT_LIMIT = 50;",
		},
		// DEFAULT_THEME in hooks path: NOT flagged (UI/theme default)
		{
			filename: "/repo/layers/core-ui/src/hooks/useTheme.ts",
			code: 'const DEFAULT_THEME = "dark";',
		},
		// DEFAULT_DENSITY in config path: NOT flagged (UI/config default)
		{
			filename: "/repo/layers/core-ui/src/config/density.ts",
			code: 'const DEFAULT_DENSITY = "compact";',
		},
		// DEFAULT_WEIGHTS in hooks path: NOT flagged (algorithm config, not data path, no suffix trigger)
		{
			filename: "/repo/layers/core-ui/src/hooks/useWeights.ts",
			code: "const DEFAULT_WEIGHTS = {};",
		},
		// Permitted surface: __tests__ file
		{
			filename: "/repo/layers/core-ui/src/__tests__/bet.test.ts",
			code: "const MOCK_BET = {};",
		},
		// Permitted surface: *.test.ts
		{
			filename: "/repo/layers/core-ui/src/pages/Users.test.ts",
			code: "const MOCK_USERS = [];",
		},
		// Permitted surface: __fixtures__ directory
		{
			filename: "/repo/layers/core-ui/src/pages/__fixtures__/work-bet-fixtures.ts",
			code: "export const MOCK_BETS = [];",
		},
		// Permitted surface: *.stories.tsx
		{
			filename: "/repo/layers/core-ui/src/pages/AppShell.stories.tsx",
			code: "const DEMO_FOUNDER_ID = 'u-founder';",
		},
		// Permitted surface: e2e directory
		{
			filename: "/repo/layers/core-ui/src/e2e/app-shell.spec.ts",
			code: "const MOCK_USERS = [];",
		},
		// Permitted surface: seed*.ts file
		{
			filename: "/repo/framework/db/src/seed.ts",
			code: "const MOCK_SEED_DATA = [];",
		},
		// Non-forbidden prefix: REAL_ is not in the forbidden set
		{
			filename: "/repo/layers/core-ui/src/pages/Users.tsx",
			code: "const REAL_USERS = [];",
		},
	],
	invalid: [
		// Positive: MOCK_* in a runtime page
		{
			filename: "/repo/layers/core-ui/src/pages/Users.tsx",
			code: "export const MOCK_USERS = [];",
			errors: [{ messageId: "mockDataSymbol" }],
		},
		// Positive: DEMO_ in a layouts file
		{
			filename: "/repo/layers/core-ui/src/layouts/AppShell.tsx",
			code: "const DEMO_FOUNDER_ID = 'u-founder';",
			errors: [{ messageId: "mockDataSymbol" }],
		},
		// DEFAULT_*: flagged when path contains /fixtures/
		// DEFAULT_SETTINGS in fixtures/app-shell-data.ts
		{
			filename: "/repo/layers/core-ui/src/fixtures/app-shell-data.ts",
			code: "const DEFAULT_SETTINGS = {};",
			errors: [{ messageId: "mockDataSymbol" }],
		},
		// DEFAULT_*: flagged when path contains /routes/ (for non-numeric objects)
		// DEFAULT_FOUNDER_ID in routes/threads.ts (string value, data shape)
		{
			filename: "/repo/packages/server/src/routes/threads.ts",
			code: 'const DEFAULT_FOUNDER_ID = "u-founder";',
			errors: [{ messageId: "mockDataSymbol" }],
		},
		// DEFAULT_*: flagged in /services/ when symbol ends with _SETTINGS (suffix trigger)
		{
			filename: "/repo/layers/core-ui/src/services/some-service.ts",
			code: "const DEFAULT_USER_SETTINGS = {};",
			errors: [{ messageId: "mockDataSymbol" }],
		},
		// DEFAULT_*: flagged when symbol ends with _DATA (suffix trigger, regardless of path)
		{
			filename: "/repo/layers/core-ui/src/components/SomeComponent.tsx",
			code: "const DEFAULT_USER_DATA = {};",
			errors: [{ messageId: "mockDataSymbol" }],
		},
		// DEFAULT_*: flagged when symbol ends with _ID (suffix trigger)
		{
			filename: "/repo/layers/core-ui/src/pages/WorkBet.tsx",
			code: 'const DEFAULT_USER_ID = "u-founder";',
			errors: [{ messageId: "mockDataSymbol" }],
		},
		// Message content: rendered message must contain the policy URL.
		// The rule's message template uses {{url}} populated with POLICY_DOC_URL.
		{
			filename: "/repo/layers/core-ui/src/pages/SomePage.tsx",
			code: "const HARDCODED_USER_LIST = [];",
			errors: [
				{
					messageId: "mockDataSymbol",
					data: { url: "docs/guides/developer/mock-data-policy.md" },
				},
			],
		},
	],
});
