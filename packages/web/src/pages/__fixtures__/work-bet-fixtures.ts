/**
 * L16 AC-3: any production module that imports values from this directory is a bug.
 * The ESLint override at eslint.config.js (the __fixtures__ block) enforces this.
 * Type-only imports are allowed (TS-erased; no runtime coupling).
 *
 * Permitted importers:
 *   - packages/web/src/pages/WorkBet.stories.tsx
 *   - Any *.test.ts / *.test.tsx file under packages/web/src/__tests__/
 *   - Any *.spec.ts Playwright file under packages/web/e2e/
 *
 * Forbidden importers: all other production source files in packages/web/src/.
 */

// @lore L18: BetComment type is deprecated; BetDetail.comments field removed.
import type { BetDetail } from "../../types/bet";

export const MOCK_BETS: Record<string, BetDetail> = {
	b1: {
		id: "b1",
		title: "User auth flow",
		product: "Alpha",
		team: "Alpha Core",
		status: "committed",
		appetite: "2 weeks",
		progress: { done: 3, total: 8 },
		pitch: `# Problem
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
				cost: "$4.20",
			},
			{
				id: "t2",
				title: "Design signup form",
				owner: "Dev Agent 2",
				state: "in_progress",
				cost: "$1.80",
			},
			{
				id: "t3",
				title: "JWT refresh logic",
				owner: "Dev Agent 1",
				state: "review",
				cost: "$6.50",
			},
		],
	},
	b2: {
		id: "b2",
		title: "Dashboard redesign",
		product: "Beta",
		team: "Beta Surface",
		status: "shaped",
		appetite: "3 weeks",
		progress: { done: 0, total: 5 },
		pitch: `# Problem
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
				cost: "$2.00",
			},
			{
				id: "t5",
				title: "Component inventory",
				owner: "Dev Agent 1",
				state: "accepted",
				cost: "$1.50",
			},
		],
	},
	/** L14: in_progress bet — shows Pause, Kill, Adjust Appetite actions. */
	b_in_progress: {
		id: "b_ip",
		title: "Payment Gateway Integration",
		product: "Alpha",
		team: "Alpha Core",
		status: "in_progress",
		appetite: "2 weeks",
		progress: { done: 2, total: 6 },
		pitch: "# Problem\nPayments are handled manually.\n\n## Solution\nIntegrate Stripe.",
		tasks: [],
	},
	/** L14: paused bet — shows Resume, Kill, Adjust Appetite actions. */
	b_paused: {
		id: "b_paused",
		title: "Notification System Overhaul",
		product: "Alpha",
		team: "Alpha Core",
		status: "paused",
		appetite: "3 weeks",
		progress: { done: 1, total: 4 },
		pitch: "# Problem\nNotifications are noisy.\n\n## Solution\nBatch and digest.",
		tasks: [],
	},
	/** L14: blocked bet — shows Unblock, Kill, Adjust Appetite. NO Pause button. */
	b_blocked: {
		id: "b_blocked",
		title: "Data Export Pipeline",
		product: "Beta",
		team: "Beta Surface",
		status: "blocked",
		appetite: "1 week",
		progress: { done: 0, total: 3 },
		pitch: "# Problem\nNo data export.\n\n## Solution\nCSV and JSON export endpoints.",
		tasks: [],
	},
	/** L14: behind bet — shows Pause, Kill, Adjust Appetite actions. */
	b_behind: {
		id: "b_behind",
		title: "Onboarding Wizard",
		product: "Beta",
		team: "Beta Surface",
		status: "behind",
		appetite: "2 weeks",
		progress: { done: 1, total: 5 },
		pitch: "# Problem\nOnboarding is manual.\n\n## Solution\nStep-by-step wizard.",
		tasks: [],
	},
	/** WithRichPitch story fixture — exercises H1, H2, paragraph, list, code, blockquote. */
	b_rich: {
		id: "b_rich",
		title: "Rich Pitch Example",
		product: "Alpha",
		team: "Alpha Core",
		status: "shaped",
		appetite: "3 weeks",
		progress: { done: 1, total: 5 },
		pitch: `# Problem
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
	product: "Unknown",
	team: "Unknown Team",
	status: "shaped",
	appetite: "—",
	progress: { done: 0, total: 0 },
	pitch: "",
	tasks: [],
};
