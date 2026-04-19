import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { BetItem, BlockerItem, CostInfo } from "../shell/Rail";
import { Rail } from "../shell/Rail";

function renderInRouter(ui: ReactElement): ReturnType<typeof render> {
	return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const sampleCost: CostInfo = {
	todaySpend: "$0",
	todayBudget: "$0",
	weekSpend: "$0",
	weekBudget: "$0",
};

/**
 * J2: the collapsed Rail presents up to three semantic pills —
 *   BLK (blockers, error tone)
 *   REV (review bets, primary tone)
 *   PSD (paused bets, neutral tone)
 * Each pill only renders when its count > 0. The expand chevron is always present.
 */
describe("Rail — collapsed pills (J2)", () => {
	it("renders BLK and REV pills when counts are positive, omits PSD when count is 0", () => {
		const bets: BetItem[] = [
			{ id: "r1", title: "Review bet", product: "P", status: "review" },
			{ id: "c1", title: "Committed", product: "P", status: "committed" },
		];
		const blockers: BlockerItem[] = [
			{ id: "b1", agent: "A", reason: "r", severity: "high" },
			{ id: "b2", agent: "B", reason: "r", severity: "low" },
		];
		renderInRouter(
			<Rail
				expanded={false}
				onToggleExpand={vi.fn()}
				bets={bets}
				blockers={blockers}
				cost={sampleCost}
			/>,
		);
		// BLK pill: aria-label "2 blockers", text "2".
		expect(screen.getByLabelText(/2 blockers/i)).toBeInTheDocument();
		// REV pill: aria-label "1 reviews", text "1".
		expect(screen.getByLabelText(/1 reviews/i)).toBeInTheDocument();
		// PSD pill: must not be in the DOM when there are zero paused bets.
		expect(screen.queryByLabelText(/paused bets/i)).not.toBeInTheDocument();
	});

	it("renders no pills when all counts are zero, but keeps the expand chevron", () => {
		renderInRouter(
			<Rail expanded={false} onToggleExpand={vi.fn()} bets={[]} blockers={[]} cost={sampleCost} />,
		);
		expect(screen.queryByLabelText(/blockers$/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/reviews$/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/paused bets$/i)).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: /expand/i })).toBeInTheDocument();
	});

	it("renders only the PSD pill when only paused bets exist", () => {
		const bets: BetItem[] = [
			{ id: "p1", title: "Paused", product: "P", status: "paused" },
			{ id: "p2", title: "Paused 2", product: "P", status: "paused" },
			{ id: "p3", title: "Paused 3", product: "P", status: "paused" },
		];
		renderInRouter(
			<Rail
				expanded={false}
				onToggleExpand={vi.fn()}
				bets={bets}
				blockers={[]}
				cost={sampleCost}
			/>,
		);
		expect(screen.getByLabelText(/3 paused bets/i)).toBeInTheDocument();
		expect(screen.queryByLabelText(/blockers$/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/reviews$/i)).not.toBeInTheDocument();
	});

	it("pills use the correct semantic color classes (BLK=error, REV=primary, PSD=neutral)", () => {
		const bets: BetItem[] = [
			{ id: "r1", title: "Review", product: "P", status: "review" },
			{ id: "p1", title: "Paused", product: "P", status: "paused" },
		];
		const blockers: BlockerItem[] = [{ id: "b1", agent: "A", reason: "r", severity: "high" }];
		renderInRouter(
			<Rail
				expanded={false}
				onToggleExpand={vi.fn()}
				bets={bets}
				blockers={blockers}
				cost={sampleCost}
			/>,
		);
		const blkPill = screen.getByLabelText(/1 blockers/i);
		expect(blkPill.className).toMatch(/text-error/);
		const revPill = screen.getByLabelText(/1 reviews/i);
		expect(revPill.className).toMatch(/text-primary/);
		const psdPill = screen.getByLabelText(/1 paused bets/i);
		// Neutral tone: surface/base class, NOT error or primary.
		expect(psdPill.className).not.toMatch(/text-error/);
		expect(psdPill.className).not.toMatch(/text-primary/);
	});

	it("expand chevron remains clickable in the collapsed degenerate case", async () => {
		const handleToggle = vi.fn();
		renderInRouter(
			<Rail
				expanded={false}
				onToggleExpand={handleToggle}
				bets={[]}
				blockers={[]}
				cost={sampleCost}
			/>,
		);
		const expandBtn = screen.getByRole("button", { name: /expand/i });
		expandBtn.click();
		expect(handleToggle).toHaveBeenCalledOnce();
	});
});
