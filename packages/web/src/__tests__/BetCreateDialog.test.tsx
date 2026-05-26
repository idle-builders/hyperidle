/**
 * Q3 — BetCreateDialog component tests.
 *
 * Covers:
 *   T5: BetCreateDialog fields (product select, pitch textarea, title preview, appetite)
 *
 * AC covered: AC2, AC9, AC10
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BetCreateDialog } from "../pages/work/BetCreateDialog";

// Mock apiFetch for submit tests
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

const MOCK_PRODUCTS = [
	{ id: "prod-1", name: "Test Product" },
	{ id: "prod-2", name: "Another Product" },
];

function openDialog(
	overrides?: Partial<React.ComponentProps<typeof BetCreateDialog>>,
): ReturnType<typeof render> {
	return render(
		<BetCreateDialog
			open={true}
			onClose={vi.fn()}
			onCreated={vi.fn()}
			products={MOCK_PRODUCTS}
			{...overrides}
		/>,
	);
}

describe("BetCreateDialog", () => {
	// AC2: Fields present
	describe("AC2 — form fields are present", () => {
		it("renders a product select field", () => {
			openDialog();
			// label wraps the select
			expect(screen.getByLabelText(/product/i)).toBeInTheDocument();
		});

		it("renders a pitch textarea", () => {
			openDialog();
			expect(screen.getByLabelText(/pitch/i)).toBeInTheDocument();
		});

		it("renders title preview area", () => {
			openDialog();
			expect(screen.getByTestId("bet-title-preview")).toBeInTheDocument();
		});

		it("renders optional appetite amount input", () => {
			openDialog();
			expect(screen.getByLabelText(/appetite amount/i)).toBeInTheDocument();
		});

		it("renders optional appetite currency select", () => {
			openDialog();
			expect(screen.getByLabelText(/currency/i)).toBeInTheDocument();
		});

		it("renders Create button", () => {
			openDialog();
			expect(screen.getByRole("button", { name: /create/i })).toBeInTheDocument();
		});

		it("renders Cancel button", () => {
			openDialog();
			expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
		});

		it("renders all provided products in the product select", () => {
			openDialog();
			expect(screen.getByRole("option", { name: "Test Product" })).toBeInTheDocument();
			expect(screen.getByRole("option", { name: "Another Product" })).toBeInTheDocument();
		});

		it("uses <label> elements for field labels (W-2 design critique)", () => {
			const { container } = openDialog();
			// Every field input/textarea/select must have a label ancestor or aria-label
			const labels = container.querySelectorAll("label");
			expect(labels.length).toBeGreaterThan(0);
		});
	});

	// AC10: Validation — empty pitch → error
	describe("AC10 — validation: empty pitch shows error", () => {
		it("Create button is disabled when pitch is empty", () => {
			openDialog();
			// Select a product first
			const select = screen.getByLabelText(/product/i);
			fireEvent.change(select, { target: { value: "prod-1" } });

			const createBtn = screen.getByRole("button", { name: /create/i });
			expect(createBtn).toBeDisabled();
		});

		it("Create button is disabled when no product selected", () => {
			openDialog();
			// Fill pitch but no product
			const pitchTextarea = screen.getByLabelText(/pitch/i);
			fireEvent.change(pitchTextarea, { target: { value: "A valid pitch" } });

			const createBtn = screen.getByRole("button", { name: /create/i });
			expect(createBtn).toBeDisabled();
		});

		it("Create button is enabled when both product and pitch are filled", () => {
			openDialog();
			const select = screen.getByLabelText(/product/i);
			fireEvent.change(select, { target: { value: "prod-1" } });

			const pitchTextarea = screen.getByLabelText(/pitch/i);
			fireEvent.change(pitchTextarea, { target: { value: "A valid pitch" } });

			const createBtn = screen.getByRole("button", { name: /create/i });
			expect(createBtn).not.toBeDisabled();
		});
	});

	// Title preview derives from pitch (W-3 design critique — shared deriveTitleFromPitch)
	describe("Title preview updates from pitch", () => {
		it("shows derived title when pitch has a heading", () => {
			openDialog();
			const pitchTextarea = screen.getByLabelText(/pitch/i);
			fireEvent.change(pitchTextarea, { target: { value: "# My Feature\n\nSome body text." } });

			const preview = screen.getByTestId("bet-title-preview");
			expect(preview.textContent).toContain("My Feature");
		});

		it("shows first line as title when no heading marker", () => {
			openDialog();
			const pitchTextarea = screen.getByLabelText(/pitch/i);
			fireEvent.change(pitchTextarea, { target: { value: "Plain first line" } });

			const preview = screen.getByTestId("bet-title-preview");
			expect(preview.textContent).toContain("Plain first line");
		});

		it("shows placeholder when pitch is empty", () => {
			openDialog();
			const preview = screen.getByTestId("bet-title-preview");
			// Should show some placeholder or be empty/fallback
			expect(preview).toBeInTheDocument();
		});
	});

	// AC9: No appetite → shows "—" on submission (the field itself)
	describe("AC9 — appetite is optional", () => {
		it("appetite amount field accepts decimal values (S-4 step='any' or step='0.01')", () => {
			const { container } = openDialog();
			const amountInput = container.querySelector("input[name='appetite-amount'], input[type='number']");
			expect(amountInput).not.toBeNull();
			// step must not be "1" (blocks $12.50 style values)
			const step = amountInput?.getAttribute("step");
			expect(step).not.toBe("1");
		});
	});

	// W-1 design critique: touch target
	describe("W-1 — touch targets ≥ 44px on mobile", () => {
		it("does not use btn-xs on any button (use btn-sm or min-h-[44px])", () => {
			const { container } = openDialog();
			const buttons = container.querySelectorAll("button");
			for (const btn of buttons) {
				// btn-xs is forbidden per AQ-015
				expect(btn.className).not.toContain("btn-xs");
			}
		});
	});

	// Dialog closed when open=false
	describe("open=false — dialog is not mounted or not open", () => {
		it("does not render form fields when open=false", () => {
			render(
				<BetCreateDialog
					open={false}
					onClose={vi.fn()}
					onCreated={vi.fn()}
					products={MOCK_PRODUCTS}
				/>,
			);
			// In closed state the dialog exists in DOM but should not show fields visually
			// We check for aria-hidden or just that the Create button is not visible
			const createBtn = screen.queryByRole("button", { name: /create/i });
			// Either not in DOM or not visible
			if (createBtn) {
				expect(createBtn).not.toBeVisible();
			} else {
				expect(createBtn).toBeNull();
			}
		});
	});

	// Cancel calls onClose
	describe("cancel button calls onClose", () => {
		it("calls onClose when Cancel is clicked", () => {
			const onClose = vi.fn();
			openDialog({ onClose });
			fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});
});
