import {
	type BetStatus,
	DEFAULT_UNDO_WINDOW_SECONDS,
	DEFAULT_VERDICT_DOUBLE_CLICK,
} from "@hyperidle/shared";
import type { SettingsData } from "../components/SettingsPanel";
import { getInitialTheme } from "../hooks/useTheme";
import type { BetItem, BlockerItem, CostInfo } from "../shell/Rail";

// @lore K3: appearance.theme is sourced from useTheme()'s initial value (which
// reads localStorage with a 'system' fallback) rather than hardcoded, so the
// settings draft and the persisted theme always agree at first render.
export const DEFAULT_SETTINGS: SettingsData = {
	profile: { name: "Founder", email: "founder@hyperidle.com", avatarUrl: "" },
	products: [
		{ id: "p1", name: "Product Alpha", active: true },
		{ id: "p2", name: "Product Beta", active: false },
	],
	agents: [
		{ id: "a1", name: "Architect", autonomyLevel: 2, paused: false },
		{ id: "a2", name: "Developer", autonomyLevel: 4, paused: false },
	],
	notifications: {
		reviewAlerts: true,
		costAlerts: true,
		blockerAlerts: true,
		quietHoursStart: "22:00",
		quietHoursEnd: "08:00",
		mutedProducts: [],
	},
	// @lore K7 / AESTHETICS.md § Mobile & Touch "Density preference state":
	// `auto` is the factory default and fires the viewport-driven density
	// auto-switch (≤ 1024px → comfortable).
	appearance: {
		density: "auto",
		theme: getInitialTheme(),
		verdictDoubleClick: DEFAULT_VERDICT_DOUBLE_CLICK,
		undoWindowSeconds: DEFAULT_UNDO_WINDOW_SECONDS,
	},
};

export const MOCK_RAIL_BETS: BetItem[] = [
	{ id: "b1", title: "User auth flow", product: "Alpha", status: "in_progress" as BetStatus },
	{ id: "b2", title: "Dashboard redesign", product: "Beta", status: "blocked" as BetStatus },
];

export const MOCK_RAIL_BLOCKERS: BlockerItem[] = [
	{
		id: "bl1",
		agent: "Developer",
		reason: "Waiting for API spec",
		severity: "high" as const,
		// L8: source thread for the deep-link. Mirrors the L3 fixture's
		// `thread-blocking-review` so a click in the dev shell lands on a
		// real seeded review thread.
		sourceThreadId: "thread-blocking-review",
		durationMs: 47 * 60_000,
	},
];

export const MOCK_RAIL_COST: CostInfo = {
	todaySpend: "$12.40",
	todayBudget: "$50.00",
	weekSpend: "$84.20",
	weekBudget: "$350.00",
};
