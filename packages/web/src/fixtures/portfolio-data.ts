import type { Status } from "../components/StatusChip";

/**
 * I4 P1: mock product portfolio for the WorkPortfolio overview. Real wiring
 * to /api/products is deferred — this fixture proves the page composition.
 *
 * @lore J5: extended with `lead` (avatar / name), `shipped` count, and
 * `progress` (done/total of the active cycle). The fourth product keeps
 * the validation scenario "4 products, each shows lead + bets + shipped"
 * satisfied.
 */
export interface PortfolioProduct {
	id: string;
	name: string;
	status: Status;
	activeBets: number;
	shipRate: string;
	lead: { name: string; initials: string };
	shipped: number;
	progress: { done: number; total: number };
}

export const MOCK_PRODUCTS: readonly PortfolioProduct[] = [
	{
		id: "p1",
		name: "HyperIdle Core",
		status: "healthy",
		activeBets: 4,
		shipRate: "78%",
		lead: { name: "CEO Agent", initials: "CE" },
		shipped: 12,
		progress: { done: 3, total: 5 },
	},
	{
		id: "p2",
		name: "Knowledge Fabric",
		status: "behind",
		activeBets: 2,
		shipRate: "62%",
		lead: { name: "Fabric Lead", initials: "FL" },
		shipped: 6,
		progress: { done: 1, total: 4 },
	},
	{
		id: "p3",
		name: "Review Workbench",
		status: "blocked",
		activeBets: 1,
		shipRate: "—",
		lead: { name: "Review Lead", initials: "RL" },
		shipped: 2,
		progress: { done: 0, total: 3 },
	},
	{
		id: "p4",
		name: "Agent Runtime",
		status: "healthy",
		activeBets: 3,
		shipRate: "84%",
		lead: { name: "Runtime Lead", initials: "RT" },
		shipped: 9,
		progress: { done: 2, total: 4 },
	},
];

/**
 * J5: cycle-management stripe data for the Portfolio page. A real system
 * pulls this from the Process Layer; the fixture lets us exercise the UI.
 */
export const MOCK_CYCLE = {
	label: "Cycle 12",
	daysRemaining: 9,
} as const;
