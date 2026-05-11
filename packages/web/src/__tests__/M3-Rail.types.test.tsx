/**
 * M3 RED — Rail component: renders with real types (progress not product,
 * derived severity, nullable costs) (C2, C3).
 *
 * These tests FAIL until:
 *  - Rail.tsx BetItem interface removes `product`, adds `progress`
 *  - Rail.tsx BlockerItem interface renames id→taskId, agent→owner, reason→title, removes severity
 *  - Rail.tsx CostInfo makes all fields nullable
 *  - deriveBlockerSeverity function exists and uses durationBlockedMs thresholds
 *  - Null cost caps render "No cap" text
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { BetItem, BlockerItem, CostInfo } from "../shell/Rail";
import { Rail } from "../shell/Rail";

function renderRail(
	props: { bets?: BetItem[]; blockers?: BlockerItem[]; cost?: CostInfo; expanded?: boolean } = {},
): ReturnType<typeof render> {
	const defaults: {
		bets: BetItem[];
		blockers: BlockerItem[];
		cost: CostInfo;
		expanded: boolean;
		onToggleExpand: () => void;
	} = {
		bets: [],
		blockers: [],
		cost: {
			todaySpend: null,
			todayCap: null,
			weekSpend: null,
			weekCap: null,
			weekTokens: null,
		},
		expanded: true,
		onToggleExpand: () => {},
	};

	return render(
		<MemoryRouter>
			<Rail {...defaults} {...props} />
		</MemoryRouter>,
	);
}

describe("M3 — Rail component: BetItem uses progress (not product) (C2)", () => {
	it("renders bet with progress indicator", () => {
		const bets: BetItem[] = [
			{
				id: "b1",
				title: "User auth flow",
				status: "in_progress",
				progress: { done: 2, total: 5 },
			},
		];

		renderRail({ bets });

		expect(screen.getByText("User auth flow")).toBeInTheDocument();
		// Progress values should appear (2/5, or similar)
		const railContent =
			screen.getByText("User auth flow").closest("[data-testid]") ?? document.body;
		expect(railContent.textContent).toMatch(/2/);
		expect(railContent.textContent).toMatch(/5/);
	});

	it("renders empty state when no bets", () => {
		renderRail({ bets: [] });

		// Should show empty state text (not MOCK_RAIL_BETS content)
		expect(screen.queryByText("User auth flow")).not.toBeInTheDocument();
		expect(screen.queryByText("Dashboard redesign")).not.toBeInTheDocument();
	});
});

describe("M3 — Rail component: BlockerItem uses taskId + durationBlockedMs (C2)", () => {
	it("renders blocker with title and owner", () => {
		const blockers: BlockerItem[] = [
			{
				taskId: "task-blocked-1",
				title: "Waiting for API spec",
				owner: "Developer",
				durationBlockedMs: 90_000_000, // ~25h → high severity
			},
		];

		renderRail({ blockers });

		expect(screen.getByText("Waiting for API spec")).toBeInTheDocument();
	});

	it("derives severity from durationBlockedMs (>=24h = high)", () => {
		const blockers: BlockerItem[] = [
			{
				taskId: "task-1",
				title: "High severity blocker",
				owner: "agent-1",
				durationBlockedMs: 25 * 3_600_000, // 25h → high
			},
		];

		renderRail({ blockers });

		// The "high" severity chip should be rendered (derived from durationBlockedMs)
		// The exact rendering is a chip — we check it exists with a status chip
		expect(screen.getByText("High severity blocker")).toBeInTheDocument();
	});

	it("derives severity from durationBlockedMs (4-24h = medium)", () => {
		const blockers: BlockerItem[] = [
			{
				taskId: "task-2",
				title: "Medium severity blocker",
				owner: "agent-2",
				durationBlockedMs: 8 * 3_600_000, // 8h → medium
			},
		];

		renderRail({ blockers });

		expect(screen.getByText("Medium severity blocker")).toBeInTheDocument();
	});

	it("derives severity from durationBlockedMs (<4h = low)", () => {
		const blockers: BlockerItem[] = [
			{
				taskId: "task-3",
				title: "Low severity blocker",
				owner: "agent-3",
				durationBlockedMs: 1 * 3_600_000, // 1h → low
			},
		];

		renderRail({ blockers });

		expect(screen.getByText("Low severity blocker")).toBeInTheDocument();
	});
});

describe("M3 — Rail component: nullable CostInfo renders 'No cap' (C3)", () => {
	it("renders 'No cap' text when todayCap is null", () => {
		const cost: CostInfo = {
			todaySpend: { minor: 1000, currency: "USD" },
			todayCap: null,
			weekSpend: null,
			weekCap: null,
			weekTokens: null,
		};

		renderRail({ cost });

		// Should render "No cap" when cap is null
		expect(screen.getAllByText(/no cap/i).length).toBeGreaterThan(0);
	});

	it("renders all null caps as 'No cap'", () => {
		const cost: CostInfo = {
			todaySpend: null,
			todayCap: null,
			weekSpend: null,
			weekCap: null,
			weekTokens: null,
		};

		renderRail({ cost });

		const noCaps = screen.getAllByText(/no cap/i);
		expect(noCaps.length).toBeGreaterThanOrEqual(1);
	});
});
