/**
 * Tests for design/no-surface-network-import rule.
 *
 * AC5: A static ESLint rule that prevents `apiFetch` / `fetch` / network
 * imports inside `surfaces/**` files. Surfaces must be statically renderable
 * from their props (no network calls) — the host (ReviewComposition) is
 * responsible for fetching and forwarding data.
 *
 * Coverage:
 * - Positive: apiFetch import in surfaces/SomeSurface.tsx → violation
 * - Positive: importing from api-fetch in surfaces/SomeSurface.tsx → violation
 * - Positive: global fetch usage (window.fetch / fetch()) in surfaces/ → NOT this rule's job
 *   (rule targets import-level network deps)
 * - Positive: import from @hyperidle/server or src/services/ in surfaces/ → violation
 * - Negative: apiFetch import in non-surfaces file → NOT flagged
 * - Negative: normal design-system import in surfaces/ → NOT flagged
 * - Negative: import of apiFetch in tests → NOT flagged
 * - Negative: import of apiFetch in stories → NOT flagged
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noSurfaceNetworkImport } from "../no-surface-network-import.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-surface-network-import", noSurfaceNetworkImport, {
	valid: [
		// Non-surfaces file: apiFetch import is allowed
		{
			filename: "/repo/packages/web/src/pages/review/ReviewComposition.tsx",
			code: 'import { apiFetch } from "../../services/api-fetch.js";',
		},
		// Non-surfaces file: services import is allowed
		{
			filename: "/repo/packages/web/src/settings/SettingsConnections.tsx",
			code: 'import { apiFetch } from "../services/api-fetch.js";',
		},
		// surfaces/ file: importing from @hyperidle/shared is allowed
		{
			filename: "/repo/packages/web/src/pages/review/surfaces/StripeRefundReview.tsx",
			code: 'import type { AdoptionView } from "@hyperidle/shared";',
		},
		// surfaces/ file: importing React is allowed
		{
			filename: "/repo/packages/web/src/pages/review/surfaces/SomeSurface.tsx",
			code: 'import { type JSX } from "react";',
		},
		// surfaces/ file: importing design system is allowed
		{
			filename: "/repo/packages/web/src/pages/review/surfaces/SomeSurface.tsx",
			code: 'import { Button } from "@hyperidle/design-system";',
		},
		// tests: apiFetch import in surfaces test file → NOT flagged
		{
			filename: "/repo/packages/web/src/pages/review/surfaces/__tests__/SomeSurface.test.tsx",
			code: 'import { apiFetch } from "../../services/api-fetch.js";',
		},
		// stories: apiFetch import in surfaces stories → NOT flagged
		{
			filename: "/repo/packages/web/src/pages/review/surfaces/SomeSurface.stories.tsx",
			code: 'import { apiFetch } from "../../services/api-fetch.js";',
		},
		// resolve-surface.ts (infrastructure): not a user-facing surface, allowed
		{
			filename: "/repo/packages/web/src/pages/review/surfaces/resolve-surface.ts",
			code: 'import { SurfaceManifest } from "@hyperidle/shared";',
		},
	],
	invalid: [
		// Positive: apiFetch import in a surfaces/ surface component
		{
			filename: "/repo/packages/web/src/pages/review/surfaces/StripeRefundReview.tsx",
			code: 'import { apiFetch } from "../../services/api-fetch.js";',
			errors: [{ messageId: "noSurfaceNetworkImport" }],
		},
		// Positive: import from api-fetch in surfaces/
		{
			filename: "/repo/packages/web/src/pages/review/surfaces/SomeSurface.tsx",
			code: 'import { apiFetch } from "../../../services/api-fetch.js";',
			errors: [{ messageId: "noSurfaceNetworkImport" }],
		},
		// Positive: import from server routes in surfaces/ → violation
		{
			filename: "/repo/packages/web/src/pages/review/surfaces/SomeSurface.tsx",
			code: 'import { createSurfaceAdoptionRoutes } from "@hyperidle/server";',
			errors: [{ messageId: "noSurfaceNetworkImport" }],
		},
	],
});
