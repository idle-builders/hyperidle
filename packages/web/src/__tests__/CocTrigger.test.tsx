/**
 * L21 — CocTrigger in Rail tests (RED phase).
 *
 * Acceptance criteria:
 *   AC-1: CocTrigger renders in the Rail on every view (expanded + collapsed).
 *   AC-2: Clicking the trigger calls onCocClick callback.
 *   AC-3: Trigger has aria-expanded reflecting overlay state.
 *   AC-4: Trigger shows "Chief of Staff" label in expanded state, icon-only in collapsed.
 *
 * Tests import Rail from shell/Rail which will be modified (green phase) to
 * include the CocTrigger button. They FAIL until that modification is made.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { BetItem, BlockerItem, CostInfo, RailProps } from "../shell/Rail";
import { Rail } from "../shell/Rail";

function renderInRouter(ui: ReactElement): ReturnType<typeof render> {
	return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const sampleBets: BetItem[] = [
	{ id: "bet-1", title: "Launch MVP", progress: { done: 2, total: 4 }, status: "active" },
];

const sampleBlockers: BlockerItem[] = [];

const sampleCost: CostInfo = {
	todaySpend: { minor: 0, currency: "USD" },
	todayCap: { minor: 5000, currency: "USD" },
	weekSpend: { minor: 0, currency: "USD" },
	weekCap: { minor: 35000, currency: "USD" },
	weekTokens: null,
};

function defaultProps(overrides: Partial<RailProps> = {}): RailProps {
	return {
		expanded: true,
		onToggleExpand: vi.fn(),
		bets: sampleBets,
		blockers: sampleBlockers,
		cost: sampleCost,
		onCocClick: vi.fn(),
		cocOverlayOpen: false,
		...overrides,
	};
}

describe("L21 — CocTrigger in Rail", () => {
	describe("expanded Rail", () => {
		it("renders a CoC trigger button with accessible name", () => {
			renderInRouter(<Rail {...defaultProps()} />);
			// The trigger button must be findable by accessible name (label text or aria-label).
			const trigger = screen.getByRole("button", { name: /chief of staff/i });
			expect(trigger).toBeInTheDocument();
		});

		it("renders 'Chief of Staff' label text in expanded state", () => {
			renderInRouter(<Rail {...defaultProps()} />);
			expect(screen.getByText(/chief of staff/i)).toBeInTheDocument();
		});

		it("trigger has aria-expanded=false when overlay is closed", () => {
			renderInRouter(<Rail {...defaultProps({ cocOverlayOpen: false })} />);
			const trigger = screen.getByRole("button", { name: /chief of staff/i });
			expect(trigger.getAttribute("aria-expanded")).toBe("false");
		});

		it("trigger has aria-expanded=true when overlay is open", () => {
			renderInRouter(<Rail {...defaultProps({ cocOverlayOpen: true })} />);
			const trigger = screen.getByRole("button", { name: /chief of staff/i });
			expect(trigger.getAttribute("aria-expanded")).toBe("true");
		});

		it("calls onCocClick when trigger is clicked", async () => {
			const user = userEvent.setup();
			const onCocClick = vi.fn();
			renderInRouter(<Rail {...defaultProps({ onCocClick })} />);
			const trigger = screen.getByRole("button", { name: /chief of staff/i });
			await user.click(trigger);
			expect(onCocClick).toHaveBeenCalledOnce();
		});

		it("trigger is positioned at the bottom of the rail (has mt-auto class or similar)", () => {
			const { container } = renderInRouter(<Rail {...defaultProps()} />);
			// The trigger button should be the last meaningful interactive element in the Rail
			const buttons = container.querySelectorAll("button[type='button']");
			const lastButton = buttons[buttons.length - 1];
			// The last button in the expanded Rail should be the CoC trigger
			expect(lastButton).toHaveAccessibleName(/chief of staff/i);
		});
	});

	describe("collapsed Rail", () => {
		it("renders a CoC trigger button in collapsed state (icon-only)", () => {
			renderInRouter(<Rail {...defaultProps({ expanded: false })} />);
			// The collapsed trigger has an icon-only button — accessible via aria-label.
			const trigger = screen.getByRole("button", { name: /chief of staff/i });
			expect(trigger).toBeInTheDocument();
		});

		it("trigger icon-only button has no visible text label in collapsed state", () => {
			renderInRouter(<Rail {...defaultProps({ expanded: false })} />);
			// "Chief of Staff" as visible text should NOT appear in collapsed state.
			// The button remains accessible via aria-label but without visible text.
			const trigger = screen.getByRole("button", { name: /chief of staff/i });
			// The visible text content inside the button should be empty or just the icon SVG.
			// We check that the button does not contain a visible <span> with "Chief of Staff".
			const visibleTextSpan = trigger.querySelector("span:not([aria-hidden])");
			expect(visibleTextSpan?.textContent?.trim() ?? "").not.toMatch(/chief of staff/i);
		});

		it("calls onCocClick when collapsed trigger is clicked", async () => {
			const user = userEvent.setup();
			const onCocClick = vi.fn();
			renderInRouter(<Rail {...defaultProps({ expanded: false, onCocClick })} />);
			const trigger = screen.getByRole("button", { name: /chief of staff/i });
			await user.click(trigger);
			expect(onCocClick).toHaveBeenCalledOnce();
		});
	});
});
