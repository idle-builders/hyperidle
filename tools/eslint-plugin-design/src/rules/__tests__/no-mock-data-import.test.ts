/**
 * `design/no-mock-data-import` flags a runtime file importing from a fixtures path
 * (`/fixtures/` or `/__fixtures__/`) — never flagged from a test, story, e2e, or fixture file itself.
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noMockDataImport } from "../no-mock-data-import.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-mock-data-import", noMockDataImport, {
	valid: [
		// Permitted surface: *.test.ts - same import is allowed
		{
			filename: "/repo/layers/core-ui/src/pages/__tests__/AppShell.test.tsx",
			code: 'import { DEFAULT_SETTINGS } from "../__fixtures__/app-shell-data";',
		},
		// Permitted surface: __fixtures__ directory - importing within fixtures is ok
		{
			filename: "/repo/layers/core-ui/src/pages/__fixtures__/helper.ts",
			code: 'import { MOCK_USERS } from "../__fixtures__/work-bet-fixtures";',
		},
		// Permitted surface: .stories.tsx
		{
			filename: "/repo/layers/core-ui/src/pages/AppShell.stories.tsx",
			code: 'import { DEFAULT_SETTINGS } from "../__fixtures__/app-shell-data";',
		},
		// Permitted surface: e2e directory
		{
			filename: "/repo/layers/core-ui/src/e2e/app-shell.spec.ts",
			code: 'import { DEFAULT_SETTINGS } from "../__fixtures__/app-shell-data";',
		},
		// Permitted surface: __tests__ directory
		{
			filename: "/repo/layers/core-ui/src/__tests__/something.test.ts",
			code: 'import { data } from "../__fixtures__/some-fixture";',
		},
		// Non-fixture import in runtime: NOT flagged
		{
			filename: "/repo/layers/core-ui/src/pages/AppShell.tsx",
			code: 'import { useTheme } from "../hooks/useTheme";',
		},
		// Import from components: NOT flagged
		{
			filename: "/repo/layers/core-ui/src/pages/WorkBet.tsx",
			code: 'import { BetCard } from "../components/BetCard";',
		},
		// Import from lib: NOT flagged
		{
			filename: "/repo/layers/core-ui/src/pages/WorkBet.tsx",
			code: 'import { formatDate } from "../lib/date-utils";',
		},
	],
	invalid: [
		// Positive: import from __fixtures__/ in a runtime page file
		{
			filename: "/repo/layers/core-ui/src/pages/AppShell.tsx",
			code: 'import { DEFAULT_SETTINGS } from "../__fixtures__/app-shell-data";',
			errors: [{ messageId: "mockDataImport" }],
		},
		// Positive: import from __fixtures__/ in a runtime layouts file
		{
			filename: "/repo/layers/core-ui/src/pages/WorkBet.tsx",
			code: 'import { MOCK_BETS } from "../__fixtures__/work-bet-fixtures";',
			errors: [{ messageId: "mockDataImport" }],
		},
		// Positive: import from fixtures/ (without double-underscore) in runtime code
		// Mirrors DocumentList.tsx importing from fixtures/document-data.ts
		{
			filename: "/repo/layers/core-ui/src/components/DocumentList.tsx",
			code: 'import { MOCK_DOCUMENT_ITEMS } from "../fixtures/document-data";',
			errors: [{ messageId: "mockDataImport" }],
		},
		// Positive: import from fixtures/ in a layouts file
		{
			filename: "/repo/layers/core-ui/src/layouts/AppShell.tsx",
			code: 'import { DEFAULT_SETTINGS } from "../fixtures/app-shell-data";',
			errors: [{ messageId: "mockDataImport" }],
		},
		// Message content: rendered message must contain the policy URL.
		// RuleTester compares `data` against template variables; to assert
		// the rendered string contains the URL we rely on the rule's
		// template including {{url}} populated with POLICY_DOC_URL.
		{
			filename: "/repo/layers/core-ui/src/pages/SomeComponent.tsx",
			code: 'import { DEMO_DATA } from "../__fixtures__/demo-data";',
			errors: [
				{
					messageId: "mockDataImport",
					data: { url: "docs/guides/developer/mock-data-policy.md" },
				},
			],
		},
	],
});
