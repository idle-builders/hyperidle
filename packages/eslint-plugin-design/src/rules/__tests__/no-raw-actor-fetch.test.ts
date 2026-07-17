import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noRawActorFetch } from "../no-raw-actor-fetch.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-raw-actor-fetch", noRawActorFetch, {
	valid: [
		// Allowlisted: hooks directory is where wrappers live.
		{
			filename: "/repo/packages/web/src/hooks/useRecoveryFetch.ts",
			code: 'await fetch("/api/conversations/responses", { method: "POST" });',
		},
		{
			filename: "/repo/packages/web/src/hooks/useFirstRun.ts",
			code: 'await fetch("/api/first-run/status");',
		},
		{
			filename: "/repo/packages/web/src/hooks/useMe.ts",
			code: 'fetch("/api/me").then((r) => r.json());',
		},
		// Tests are exempt — they routinely call raw fetch to simulate boundaries.
		{
			filename: "/repo/packages/web/src/__tests__/something.test.ts",
			code: 'await fetch("/api/me");',
		},
		{
			filename: "/repo/packages/web/src/pages/foo.spec.ts",
			code: 'await fetch("/api/conversations");',
		},
		// Non-/api path: not actor-authenticated, no rule trigger.
		{
			filename: "/repo/packages/web/src/pages/Static.tsx",
			code: 'await fetch("/static/logo.svg");',
		},
		{
			filename: "/repo/packages/web/src/pages/Cdn.tsx",
			code: 'await fetch("https://cdn.example.com/asset.json");',
		},
		// Member call (e.g. window.fetch) — not the bare global identifier we
		// detect; rule conservatively skips to avoid false positives.
		{
			filename: "/repo/packages/web/src/pages/Win.tsx",
			code: 'await window.fetch("/api/me");',
		},
	],
	invalid: [
		// String literal /api/ path in a page.
		{
			filename: "/repo/packages/web/src/pages/ConversationsReview.tsx",
			code: 'await fetch("/api/conversations/responses", { method: "POST" });',
			errors: [{ messageId: "rawActorFetch", data: { path: "/api/conversations/responses" } }],
		},
		// Template literal whose first quasi is /api/.
		{
			filename: "/repo/packages/web/src/pages/ConversationsReview.tsx",
			code: `const id = 'x'; await fetch(\`/api/threads/\${id}/verdict/undo\`, { method: 'POST' });`,
			errors: [{ messageId: "rawActorFetch", data: { path: "/api/threads/" } }],
		},
		// In a component file (not in hooks/, not in __tests__).
		{
			filename: "/repo/packages/web/src/components/KillSwitch.tsx",
			code: 'await fetch("/api/admin/kill", { method: "POST" });',
			errors: [{ messageId: "rawActorFetch", data: { path: "/api/admin/kill" } }],
		},
		// Plain GET in a page.
		{
			filename: "/repo/packages/web/src/pages/Search.tsx",
			code: 'await fetch("/api/search?q=hello");',
			errors: [{ messageId: "rawActorFetch", data: { path: "/api/search?q=hello" } }],
		},
	],
});
