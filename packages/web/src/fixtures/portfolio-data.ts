import type { Status } from "../components/StatusChip";

/**
 * I4 P1: mock product portfolio for the WorkPortfolio overview. Real wiring
 * to /api/products is deferred — this fixture proves the page composition.
 */
export interface PortfolioProduct {
	id: string;
	name: string;
	status: Status;
	activeBets: number;
	shipRate: string;
}

export const MOCK_PRODUCTS: readonly PortfolioProduct[] = [
	{
		id: "p1",
		name: "HyperIdle Core",
		status: "healthy",
		activeBets: 4,
		shipRate: "78%",
	},
	{
		id: "p2",
		name: "Knowledge Fabric",
		status: "behind",
		activeBets: 2,
		shipRate: "62%",
	},
	{
		id: "p3",
		name: "Review Workbench",
		status: "blocked",
		activeBets: 1,
		shipRate: "—",
	},
];
