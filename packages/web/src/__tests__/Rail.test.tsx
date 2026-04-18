import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BetItem, BlockerItem, CostInfo } from "../shell/Rail";
import { Rail } from "../shell/Rail";

const sampleBets: BetItem[] = [
	{ id: "bet-1", title: "Launch MVP", product: "HyperIdle", status: "committed" },
	{ id: "bet-2", title: "User Onboarding", product: "HyperIdle", status: "behind" },
];

const sampleBlockers: BlockerItem[] = [
	{
		id: "blocker-1",
		agent: "Agent Alpha",
		reason: "Waiting for API key",
		severity: "low",
	},
];

const sampleCost: CostInfo = {
	todaySpend: "$12.50",
	todayBudget: "$50.00",
	weekSpend: "$87.30",
	weekBudget: "$350.00",
};

const defaultProps = {
	expanded: true,
	onToggleExpand: vi.fn(),
	bets: sampleBets,
	blockers: sampleBlockers,
	cost: sampleCost,
};

describe("Rail", () => {
	describe("expanded state", () => {
		it("renders Active Bets section header", () => {
			render(<Rail {...defaultProps} />);
			expect(screen.getByText(/active bets/i)).toBeInTheDocument();
		});

		it("renders Blockers section header", () => {
			render(<Rail {...defaultProps} />);
			expect(screen.getByText(/blockers/i)).toBeInTheDocument();
		});

		it("renders Cost section header", () => {
			render(<Rail {...defaultProps} />);
			expect(screen.getByText(/cost/i)).toBeInTheDocument();
		});

		it("shows bet count badge on Active Bets header", () => {
			render(<Rail {...defaultProps} />);
			const betsSection = screen.getByText(/active bets/i).closest("div, section, button");
			expect(betsSection).not.toBeNull();
			// biome-ignore lint/style/noNonNullAssertion: guarded by expect above
			expect(within(betsSection!).getByText("2")).toBeInTheDocument();
		});

		it("shows blocker count badge on Blockers header", () => {
			render(<Rail {...defaultProps} />);
			const blockersSection = screen.getByText(/blockers/i).closest("div, section, button");
			expect(blockersSection).not.toBeNull();
			// biome-ignore lint/style/noNonNullAssertion: guarded by expect above
			expect(within(blockersSection!).getByText("1")).toBeInTheDocument();
		});

		it("renders bet titles", () => {
			render(<Rail {...defaultProps} />);
			expect(screen.getByText("Launch MVP")).toBeInTheDocument();
			expect(screen.getByText("User Onboarding")).toBeInTheDocument();
		});

		it("renders bet products", () => {
			render(<Rail {...defaultProps} />);
			const products = screen.getAllByText("HyperIdle");
			expect(products.length).toBeGreaterThanOrEqual(1);
		});

		it("renders blocker details", () => {
			render(<Rail {...defaultProps} />);
			expect(screen.getByText("Agent Alpha")).toBeInTheDocument();
			expect(screen.getByText("Waiting for API key")).toBeInTheDocument();
		});

		it("renders cost information", () => {
			render(<Rail {...defaultProps} />);
			expect(screen.getByText("$12.50")).toBeInTheDocument();
			expect(screen.getByText("$50.00")).toBeInTheDocument();
			expect(screen.getByText("$87.30")).toBeInTheDocument();
			expect(screen.getByText("$350.00")).toBeInTheDocument();
		});

		it("renders a toggle button to minimize", () => {
			render(<Rail {...defaultProps} />);
			expect(
				screen.getByRole("button", { name: /collapse|minimize|close|toggle/i }),
			).toBeInTheDocument();
		});

		it("calls onToggleExpand when collapse button is clicked", async () => {
			const user = userEvent.setup();
			const handleToggle = vi.fn();
			render(<Rail {...defaultProps} onToggleExpand={handleToggle} />);
			await user.click(screen.getByRole("button", { name: /collapse|minimize|close|toggle/i }));
			expect(handleToggle).toHaveBeenCalledOnce();
		});
	});

	describe("minimized state", () => {
		it("does not render full section content when minimized", () => {
			render(<Rail {...defaultProps} expanded={false} />);
			expect(screen.queryByText("Launch MVP")).not.toBeInTheDocument();
		});

		it("shows icon strip with counts when minimized", () => {
			render(<Rail {...defaultProps} expanded={false} />);
			// Should show counts for bets and blockers
			expect(screen.getByText("2")).toBeInTheDocument();
			expect(screen.getByText("1")).toBeInTheDocument();
		});

		it("renders an expand button when minimized", () => {
			render(<Rail {...defaultProps} expanded={false} />);
			expect(screen.getByRole("button", { name: /expand|open|toggle/i })).toBeInTheDocument();
		});

		it("calls onToggleExpand when expand button is clicked", async () => {
			const user = userEvent.setup();
			const handleToggle = vi.fn();
			render(<Rail {...defaultProps} expanded={false} onToggleExpand={handleToggle} />);
			await user.click(screen.getByRole("button", { name: /expand|open|toggle/i }));
			expect(handleToggle).toHaveBeenCalledOnce();
		});
	});

	describe("collapsible sections", () => {
		it("sections are individually collapsible", async () => {
			const user = userEvent.setup();
			render(<Rail {...defaultProps} />);
			// Click on Active Bets section header to collapse it
			const betsHeader = screen.getByText(/active bets/i);
			await user.click(betsHeader);
			// After collapsing, bet details should be hidden
			expect(screen.queryByText("Launch MVP")).not.toBeInTheDocument();
		});

		it("collapsed section can be re-expanded", async () => {
			const user = userEvent.setup();
			render(<Rail {...defaultProps} />);
			const betsHeader = screen.getByText(/active bets/i);
			// Collapse
			await user.click(betsHeader);
			expect(screen.queryByText("Launch MVP")).not.toBeInTheDocument();
			// Re-expand
			await user.click(betsHeader);
			expect(screen.getByText("Launch MVP")).toBeInTheDocument();
		});
	});

	describe("keyboard navigation", () => {
		it("ArrowDown moves focus between section headers", async () => {
			const user = userEvent.setup();
			render(<Rail {...defaultProps} />);
			const betsHeader = screen.getByText(/active bets/i).closest("button, [tabindex]");
			expect(betsHeader).not.toBeNull();
			// biome-ignore lint/style/noNonNullAssertion: guarded by expect above
			(betsHeader! as HTMLElement).focus();
			await user.keyboard("{ArrowDown}");
			// Focus should move to next section header (Blockers)
			expect(document.activeElement).not.toBe(betsHeader);
		});

		it("ArrowUp moves focus to previous section header", async () => {
			const user = userEvent.setup();
			render(<Rail {...defaultProps} />);
			const blockersHeader = screen.getByText(/blockers/i).closest("button, [tabindex]");
			expect(blockersHeader).not.toBeNull();
			// biome-ignore lint/style/noNonNullAssertion: guarded by expect above
			(blockersHeader! as HTMLElement).focus();
			await user.keyboard("{ArrowUp}");
			// Focus should move to previous section header (Active Bets)
			expect(document.activeElement).not.toBe(blockersHeader);
		});

		it("Enter toggles section expand/collapse", async () => {
			const user = userEvent.setup();
			render(<Rail {...defaultProps} />);
			const betsHeader = screen.getByText(/active bets/i).closest("button, [tabindex]");
			expect(betsHeader).not.toBeNull();
			// biome-ignore lint/style/noNonNullAssertion: guarded by expect above
			(betsHeader! as HTMLElement).focus();
			await user.keyboard("{Enter}");
			expect(screen.queryByText("Launch MVP")).not.toBeInTheDocument();
		});

		it("Escape calls onToggleExpand to minimize rail", async () => {
			const user = userEvent.setup();
			const handleToggle = vi.fn();
			render(<Rail {...defaultProps} onToggleExpand={handleToggle} />);
			const betsHeader = screen.getByText(/active bets/i).closest("button, [tabindex]");
			expect(betsHeader).not.toBeNull();
			// biome-ignore lint/style/noNonNullAssertion: guarded by expect above
			(betsHeader! as HTMLElement).focus();
			await user.keyboard("{Escape}");
			expect(handleToggle).toHaveBeenCalledOnce();
		});
	});

	describe("notification surface", () => {
		it("is a notification surface only (no bell icon)", () => {
			const { container } = render(<Rail {...defaultProps} />);
			// Should not contain a bell/notification icon button
			expect(screen.queryByRole("button", { name: /bell|notification/i })).not.toBeInTheDocument();
			// Should not have any global toast container
			expect(container.querySelector("[role='alert']")).not.toBeInTheDocument();
		});
	});

	describe("empty states", () => {
		it("renders empty bets section gracefully", () => {
			render(<Rail {...defaultProps} bets={[]} />);
			expect(screen.getByText(/active bets/i)).toBeInTheDocument();
		});

		it("renders empty blockers section gracefully", () => {
			render(<Rail {...defaultProps} blockers={[]} />);
			expect(screen.getByText(/blockers/i)).toBeInTheDocument();
		});

		it("shows zero count for empty sections", () => {
			render(<Rail {...defaultProps} bets={[]} blockers={[]} />);
			const betsSection = screen.getByText(/active bets/i).closest("div, section, button");
			expect(betsSection).not.toBeNull();
			// biome-ignore lint/style/noNonNullAssertion: guarded by expect above
			expect(within(betsSection!).getByText("0")).toBeInTheDocument();
		});
	});

	describe("BetStatus chip rendering (I4 S4)", () => {
		// After the mapping duplicate is removed and the shared status-mapping
		// module is used, a bet with status "behind" must render the BEHIND
		// chip (not the HEALTHY fallback the old duplicate used as default).
		it("renders the BEHIND chip for a behind bet", () => {
			const behindBets: BetItem[] = [
				{ id: "b", title: "Behind Bet", product: "P", status: "behind" },
			];
			// Empty blockers so the only chip is the bet's chip — severities
			// also render StatusChip and would otherwise collide.
			render(<Rail {...defaultProps} bets={behindBets} blockers={[]} />);
			// StatusChip uppercases the status text.
			expect(screen.getByText("BEHIND")).toBeInTheDocument();
			// Must NOT fall through to HEALTHY.
			expect(screen.queryByText("HEALTHY")).not.toBeInTheDocument();
		});

		it("renders the BLOCKED chip for a blocked bet", () => {
			const blockedBets: BetItem[] = [
				{ id: "b", title: "Blocked Bet", product: "P", status: "blocked" },
			];
			render(<Rail {...defaultProps} bets={blockedBets} blockers={[]} />);
			expect(screen.getByText("BLOCKED")).toBeInTheDocument();
		});

		it("renders the PAUSED chip for a paused bet", () => {
			const pausedBets: BetItem[] = [
				{ id: "b", title: "Paused Bet", product: "P", status: "paused" },
			];
			render(<Rail {...defaultProps} bets={pausedBets} blockers={[]} />);
			expect(screen.getByText("PAUSED")).toBeInTheDocument();
		});

		it("renders a non-HEALTHY chip for a review bet", () => {
			const reviewBets: BetItem[] = [
				{ id: "b", title: "Review Bet", product: "P", status: "review" },
			];
			render(<Rail {...defaultProps} bets={reviewBets} />);
			expect(screen.queryByText("HEALTHY")).not.toBeInTheDocument();
		});
	});
});
