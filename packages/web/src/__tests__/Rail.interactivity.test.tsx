/**
 * L8 — Rail Interactivity unit tests.
 *
 * Acceptance:
 * - Bet rows deep-link to `/work/bet/:id` (already covered in Rail.test.tsx;
 *   re-asserted here as part of the interactivity contract).
 * - Blocker rows deep-link to `/conversations/review?thread=<sourceThreadId>`.
 * - Cost rows deep-link to `/conversations/review?settings=open` (Settings → Caps)
 *   with a title attribute documenting the temporary destination.
 * - Stability strip renders the right counts; hidden when all zero.
 * - Collapsed pills surface non-zero stability counts as red BLK-style pills.
 * - ARIA labels describe the destination.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { BetItem, BlockerItem, CostInfo, SystemStability } from "../shell/Rail";
import { Rail } from "../shell/Rail";

function LocationProbe(): JSX.Element {
	const loc = useLocation();
	return (
		<div data-testid="loc">
			{loc.pathname}
			{loc.search}
		</div>
	);
}

function renderInRouter(
	ui: ReactElement,
	initialEntries: string[] = ["/"],
): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={initialEntries}>
			<Routes>
				<Route
					path="*"
					element={
						<>
							{ui}
							<LocationProbe />
						</>
					}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

const sampleBets: BetItem[] = [
	{ id: "bet-1", title: "Launch MVP", product: "HyperIdle", status: "committed" },
];
const sampleBlockers: BlockerItem[] = [
	{
		id: "blocker-1",
		agent: "Developer",
		reason: "Waiting for API spec",
		severity: "high",
		sourceThreadId: "thread-42",
		durationMs: 47 * 60_000,
	},
];
const sampleCost: CostInfo = {
	todaySpend: "$12.50",
	todayBudget: "$50.00",
	weekSpend: "$87.30",
	weekBudget: "$350.00",
};
const zeroStability: SystemStability = {
	crashed_sessions: 0,
	cap_reached: 0,
	api_degraded: 0,
};

const baseProps = {
	expanded: true,
	onToggleExpand: () => {},
	bets: sampleBets,
	blockers: sampleBlockers,
	cost: sampleCost,
	stability: zeroStability,
};

describe("Rail Interactivity (L8)", () => {
	describe("blocker deep-link", () => {
		it("renders each blocker row as a button/link", () => {
			renderInRouter(<Rail {...baseProps} />);
			const row = screen.getByRole("button", { name: /developer.*waiting for api spec/i });
			expect(row).toBeInTheDocument();
		});

		it("clicking a blocker navigates to /conversations/review?thread=<id>", async () => {
			const user = userEvent.setup();
			renderInRouter(<Rail {...baseProps} />);
			const row = screen.getByRole("button", { name: /developer.*waiting for api spec/i });
			await user.click(row);
			expect(screen.getByTestId("loc").textContent).toBe("/conversations/review?thread=thread-42");
		});

		it("blocker row title attribute reveals duration and source agent on hover", () => {
			renderInRouter(<Rail {...baseProps} />);
			const row = screen.getByRole("button", { name: /developer.*waiting for api spec/i });
			const title = row.getAttribute("title") ?? "";
			expect(title).toMatch(/47m/);
			expect(title.toLowerCase()).toContain("developer");
		});

		it("blocker row has accessible label describing destination", () => {
			renderInRouter(<Rail {...baseProps} />);
			const row = screen.getByRole("button", { name: /developer.*waiting for api spec/i });
			const label = row.getAttribute("aria-label") ?? "";
			expect(label.toLowerCase()).toMatch(/open|conversation|thread/);
		});
	});

	describe("bet deep-link aria", () => {
		it("bet row has accessible label describing destination", () => {
			renderInRouter(<Rail {...baseProps} />);
			const row = screen.getByRole("button", { name: /open bet.*launch mvp/i });
			expect(row).toBeInTheDocument();
		});
	});

	describe("cost deep-link", () => {
		it("renders Today / Week / Today Budget / Week Budget rows as buttons", () => {
			renderInRouter(<Rail {...baseProps} />);
			expect(
				screen.getByRole("button", { name: /^open settings caps for today$/i }),
			).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: /^open settings caps for week$/i }),
			).toBeInTheDocument();
		});

		it("clicking a cost row navigates to /conversations/review?settings=open", async () => {
			const user = userEvent.setup();
			renderInRouter(<Rail {...baseProps} />);
			const todayRow = screen.getByRole("button", { name: /^open settings caps for today$/i });
			await user.click(todayRow);
			expect(screen.getByTestId("loc").textContent).toContain("/conversations/review");
			expect(screen.getByTestId("loc").textContent).toContain("settings=open");
		});

		it("cost row title attribute documents 'until cost-drill ships'", () => {
			renderInRouter(<Rail {...baseProps} />);
			const todayRow = screen.getByRole("button", { name: /^open settings caps for today$/i });
			const title = todayRow.getAttribute("title") ?? "";
			expect(title.toLowerCase()).toContain("cost-drill");
		});
	});

	describe("system-stability strip", () => {
		it("does not render when all stability counts are zero", () => {
			renderInRouter(<Rail {...baseProps} />);
			expect(screen.queryByText(/system stability/i)).not.toBeInTheDocument();
		});

		it("renders when crashed_sessions > 0", () => {
			renderInRouter(
				<Rail
					{...baseProps}
					stability={{ crashed_sessions: 1, cap_reached: 0, api_degraded: 0 }}
				/>,
			);
			expect(screen.getByText(/system stability/i)).toBeInTheDocument();
			expect(screen.getByText(/1 crashed session/i)).toBeInTheDocument();
		});

		it("pluralizes crashed sessions correctly", () => {
			renderInRouter(
				<Rail
					{...baseProps}
					stability={{ crashed_sessions: 3, cap_reached: 0, api_degraded: 0 }}
				/>,
			);
			expect(screen.getByText(/3 crashed sessions/i)).toBeInTheDocument();
		});

		it("renders cap_reached count when > 0", () => {
			renderInRouter(
				<Rail
					{...baseProps}
					stability={{ crashed_sessions: 0, cap_reached: 2, api_degraded: 0 }}
				/>,
			);
			expect(screen.getByText(/2 cap.reached/i)).toBeInTheDocument();
		});

		it("renders api_degraded indicator when 1", () => {
			renderInRouter(
				<Rail
					{...baseProps}
					stability={{ crashed_sessions: 0, cap_reached: 0, api_degraded: 1 }}
				/>,
			);
			expect(screen.getByText(/api degraded/i)).toBeInTheDocument();
		});

		it("each stability row has aria-label describing destination", () => {
			renderInRouter(
				<Rail
					{...baseProps}
					stability={{ crashed_sessions: 1, cap_reached: 1, api_degraded: 1 }}
				/>,
			);
			const panel = screen.getByTestId("rail-stability-strip");
			const rows = within(panel).getAllByRole("button");
			expect(rows.length).toBe(3);
			for (const b of rows) {
				expect(b.getAttribute("aria-label")).toMatch(/open/i);
			}
		});
	});

	describe("collapsed-rail stability pills", () => {
		it("shows red CRASH pill next to cluster when crashed_sessions > 0", () => {
			renderInRouter(
				<Rail
					{...baseProps}
					expanded={false}
					stability={{ crashed_sessions: 5, cap_reached: 0, api_degraded: 0 }}
				/>,
			);
			expect(screen.getByLabelText(/5 crashed sessions/i)).toBeInTheDocument();
		});

		it("hides stability pills when all counts are zero", () => {
			renderInRouter(<Rail {...baseProps} expanded={false} />);
			expect(screen.queryByLabelText(/crashed/i)).not.toBeInTheDocument();
			expect(screen.queryByLabelText(/cap reached/i)).not.toBeInTheDocument();
			expect(screen.queryByLabelText(/api degraded/i)).not.toBeInTheDocument();
		});

		it("shows CAP pill when cap_reached > 0", () => {
			renderInRouter(
				<Rail
					{...baseProps}
					expanded={false}
					stability={{ crashed_sessions: 0, cap_reached: 2, api_degraded: 0 }}
				/>,
			);
			expect(screen.getByLabelText(/2 cap.reached/i)).toBeInTheDocument();
		});

		it("shows API pill when api_degraded === 1", () => {
			renderInRouter(
				<Rail
					{...baseProps}
					expanded={false}
					stability={{ crashed_sessions: 0, cap_reached: 0, api_degraded: 1 }}
				/>,
			);
			expect(screen.getByLabelText(/api degraded/i)).toBeInTheDocument();
		});
	});
});
