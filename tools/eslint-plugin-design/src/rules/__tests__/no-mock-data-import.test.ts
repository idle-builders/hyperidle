/**
 * Tests for design/no-mock-data-import rule.
 *
 * Red phase (M1 write-tests): all tests fail until the rule is implemented.
 * File: tools/eslint-plugin-design/src/rules/no-mock-data-import.ts
 *
 * Coverage:
 * - Positive: forbidden import from fixtures path in runtime file → violation
 * - Positive: forbidden import from __fixtures__ in runtime file → violation
 * - Message: contains policy URL + file + import path info
 * - Negative: same import inside *.test.ts → NOT flagged
 * - Negative: same import inside __fixtures__ file → NOT flagged
 * - Negative: import from non-fixture path → NOT flagged
 * - Negative: import from __tests__ dir → NOT flagged
 * - Negative: same import in *.stories.tsx → NOT flagged
 * - Negative: same import in e2e/ path → NOT flagged
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
		// Mirrors KnowledgeList.tsx importing from fixtures/knowledge-data.ts
		{
			filename: "/repo/layers/core-ui/src/components/KnowledgeList.tsx",
			code: 'import { MOCK_KNOWLEDGE_ITEMS } from "../fixtures/knowledge-data";',
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
