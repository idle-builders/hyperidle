import type { BetStatus } from "@hyperidle/shared";
import type { SettingsData } from "../components/SettingsPanel";
import type { BetItem, BlockerItem, CostInfo } from "../shell/Rail";

export const DEFAULT_SETTINGS: SettingsData = {
	profile: { name: "Founder", email: "founder@hyperidle.com", avatarUrl: "" },
	products: [
		{ id: "p1", name: "Product Alpha", active: true },
		{ id: "p2", name: "Product Beta", active: false },
	],
	agents: [
		{ id: "a1", name: "Architect", autonomyLevel: "supervised", paused: false },
		{ id: "a2", name: "Developer", autonomyLevel: "autonomous", paused: false },
	],
	notifications: {
		reviewAlerts: true,
		costAlerts: true,
		blockerAlerts: true,
		quietHoursStart: "22:00",
		quietHoursEnd: "08:00",
		mutedProducts: [],
	},
	appearance: { density: "default" },
};

export const MOCK_RAIL_BETS: BetItem[] = [
	{ id: "b1", title: "User auth flow", product: "Alpha", status: "in_progress" as BetStatus },
	{ id: "b2", title: "Dashboard redesign", product: "Beta", status: "blocked" as BetStatus },
];

export const MOCK_RAIL_BLOCKERS: BlockerItem[] = [
	{ id: "bl1", agent: "Developer", reason: "Waiting for API spec", severity: "high" as const },
];

export const MOCK_RAIL_COST: CostInfo = {
	todaySpend: "$12.40",
	todayBudget: "$50.00",
	weekSpend: "$84.20",
	weekBudget: "$350.00",
};
