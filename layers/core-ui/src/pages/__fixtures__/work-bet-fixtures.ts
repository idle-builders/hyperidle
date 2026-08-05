/**
 * L16 AC-3: any production module that imports values from this directory is a bug.
 * The ESLint override at eslint.config.js (the __fixtures__ block) enforces this.
 * Type-only imports are allowed (TS-erased; no runtime coupling).
 *
 * Permitted importers:
 *   - layers/core-ui/src/pages/WorkBet.stories.tsx
 *   - Any *.test.ts / *.test.tsx file under layers/core-ui/src/__tests__/
 *   - Any *.spec.ts Playwright file under layers/core-ui/e2e/
 *
 * Forbidden importers: all other production source files in layers/core-ui/src/.
 *
 * @lore U5: Removed `product` field (renamed to `team`). Renamed `pitch` → `description`.
 * Added `atRisk` boolean. L14 fixtures updated to include required WireMoney fields.
 */

// @lore L18: BetComment type is deprecated; BetDetail.comments field removed.
// @lore T3: Renamed pitch->description to align with API contract (U1 DB rename).
import type { BetDetail } from "../../types/bet";

export const MOCK_BETS: Record<string, BetDetail> = {
	b1: {
		id: "b1",
		title: "User auth flow",
		team: "Alpha Core",
		// @lore T3: status is "completed" so WorkBet.detail.test.tsx (L16) can assert
		// that BetPitch (data-testid="bet-pitch") renders. With T3, only immutable bets
		// (completed/killed) show BetPitch. Mutable bets (draft/active) show BodyEditor.
		status: "completed",
		atRisk: false,
		tokenAppetite: null,
		tokensActual: null,
		progress: { done: 3, total: 8 },
		description: `# Problem
Current auth is hand-rolled and leaks sessions on reload.

## Appetite
2 weeks.

## Solution
Migrate to JWT with refresh rotation.

## Rabbit holes
- Do not rebuild the signup flow in this bet.`,
		tasks: [
			{
				id: "t1",
				title: "Implement login endpoint",
				owner: "Dev Agent 1",
				state: "done",
			},
			{
				id: "t2",
				title: "Design signup form",
				owner: "Dev Agent 2",
				state: "in_progress",
			},
			{
				id: "t3",
				title: "JWT refresh logic",
				owner: "Dev Agent 1",
				state: "review",
			},
		],
	},
	b2: {
		id: "b2",
		title: "Dashboard redesign",
		team: "Beta Surface",
		status: "draft",
		atRisk: false,
		tokenAppetite: null,
		tokensActual: null,
		progress: { done: 0, total: 5 },
		description: `# Problem
The dashboard has grown to 14 widgets with no hierarchy.

## Appetite
3 weeks.

## Solution
Replace the grid with a three-column layout driven by user roles.

## Rabbit holes
- Do not ship new widgets in this bet.`,
		tasks: [
			{
				id: "t4",
				title: "Wireframe layouts",
				owner: "Designer Agent",
				state: "accepted",
			},
			{
				id: "t5",
				title: "Component inventory",
				owner: "Dev Agent 1",
				state: "accepted",
			},
		],
	},
	/** @lore U1: old in_progress/paused/blocked/behind statuses are now "active". */
	b_active: {
		id: "b_active",
		title: "Payment Gateway Integration",
		team: "Alpha Core",
		status: "active",
		atRisk: false,
		tokenAppetite: null,
		tokensActual: null,
		progress: { done: 2, total: 6 },
		description: "# Problem\nPayments are handled manually.\n\n## Solution\nIntegrate Stripe.",
		tasks: [],
	},
	/** WithRichDescription story fixture — exercises H1, H2, paragraph, list, code, blockquote. */
	b_rich: {
		id: "b_rich",
		title: "Rich Description Example",
		team: "Alpha Core",
		status: "draft",
		atRisk: false,
		tokenAppetite: null,
		tokensActual: null,
		progress: { done: 1, total: 5 },
		description: `# Problem
The dashboard has grown to 14 widgets with no clear hierarchy.

## Appetite
Three weeks maximum.

A paragraph describing the scope of the work in plain prose.

- First bullet point describing one constraint.
- Second bullet point with another constraint.
- Third bullet: do not touch the notification system.

> This is a blockquote from the CEO: focus on the primary user journey first.

\`\`\`ts
// Example schema definition for the new layout.
const layout = { columns: 3, mode: "role-based" };
\`\`\`

## Solution
Replace the grid with a three-column layout driven by user roles.

## Rabbit holes
- Do not ship new widgets in this bet.
- Do not redesign the auth flow here.
`,
		tasks: [],
	},
};

export const FALLBACK_BET: BetDetail = {
	id: "unknown",
	title: "Unknown Bet",
	team: "Unknown Team",
	status: "draft",
	atRisk: false,
	tokenAppetite: null,
	tokensActual: null,
	progress: { done: 0, total: 0 },
	description: "",
	tasks: [],
};
