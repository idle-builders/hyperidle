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
		// REV pill: aria-label "1 review" (singular for N=1, review W1).
		expect(screen.getByLabelText(/^1 review$/i)).toBeInTheDocument();
		// PSD pill: must not be in the DOM when there are zero paused bets.
		expect(screen.queryByLabelText(/paused/i)).not.toBeInTheDocument();
	});

	it("renders no pills when all counts are zero, but keeps the expand chevron", () => {
		renderInRouter(
			<Rail expanded={false} onToggleExpand={vi.fn()} bets={[]} blockers={[]} cost={sampleCost} />,
		);
		// No semantic pills rendered (singular or plural noun forms).
		expect(screen.queryByLabelText(/^\d+ blocker(s)?$/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/^\d+ review(s)?$/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/^\d+ paused bet(s)?$/i)).not.toBeInTheDocument();
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
		expect(screen.queryByLabelText(/^\d+ blocker(s)?$/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/^\d+ review(s)?$/i)).not.toBeInTheDocument();
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
		// Singular nouns for N=1 (review W1).
		const blkPill = screen.getByLabelText(/^1 blocker$/i);
		expect(blkPill.className).toMatch(/text-error/);
		const revPill = screen.getByLabelText(/^1 review$/i);
		expect(revPill.className).toMatch(/text-primary/);
		const psdPill = screen.getByLabelText(/^1 paused bet$/i);
		// Neutral tone: surface-4 / text-mid (factory-dark visible neutral),
		// NOT error or primary, and NOT the invisible base-content variant.
		expect(psdPill.className).not.toMatch(/text-error/);
		expect(psdPill.className).not.toMatch(/text-primary/);
		expect(psdPill.className).toMatch(/--text-mid/);
	});

	it("uses singular noun forms when count === 1 (review W1)", () => {
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
		// Strict end-anchored regex: must NOT be the plural form.
		expect(screen.getByLabelText(/^1 blocker$/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/^1 review$/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/^1 paused bet$/i)).toBeInTheDocument();
		expect(screen.queryByLabelText(/1 blockers/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/1 reviews/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/1 paused bets/i)).not.toBeInTheDocument();
	});

	it("caps pill counts > 99 at '99+' (review O5)", () => {
		const bets: BetItem[] = Array.from({ length: 150 }, (_, i) => ({
			id: `p${i}`,
			title: `Paused ${i}`,
			product: "P",
			status: "paused" as const,
		}));
		renderInRouter(
			<Rail
				expanded={false}
				onToggleExpand={vi.fn()}
				bets={bets}
				blockers={[]}
				cost={sampleCost}
			/>,
		);
		// Both the visible label and the aria-label are capped — the cap is the
		// shared "noisy count" reduction (Rail is glanceable, not analytical).
		const psdPill = screen.getByLabelText(/99\+ paused bets/i);
		expect(psdPill.textContent).toMatch(/99\+/);
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
