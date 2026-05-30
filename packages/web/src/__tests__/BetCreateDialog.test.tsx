/**
 * R2 — BetCreateDialog component tests (updated from Q3)
 *
 * R2 AC coverage:
 * AC-6: BetCreateDialog requires only title and pitch. Product picker is removed (uses default product).
 *   - Hides product select when only one product is provided
 *   - Shows product select when multiple products are provided
 *   - Create button enabled with pitch only (single product)
 *   - Does not render appetite fields
 *
 * Q3 tests retained:
 *   - Title preview tests (unchanged)
 *   - "renders a pitch textarea" (unchanged)
 *   - Cancel / close tests (unchanged)
 *   - Touch target tests (unchanged)
 *
 * Q3 tests removed per R2 architecture:
 *   - "renders a product select field" → hidden when single product (AC-6)
 *   - "renders all provided products in the product select" → hidden when single product
 *   - "renders optional appetite amount input" → appetite removed (AC-6)
 *   - "renders optional appetite currency select" → appetite removed (AC-6)
 *   - "Create button is disabled when no product selected" → no longer applies for single product
 *   - "appetite amount field accepts decimal values" → appetite removed
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BetCreateDialog } from "../pages/work/BetCreateDialog";

// Mock apiFetch for submit tests
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

const SINGLE_PRODUCT = [{ id: "prod-1", name: "Test Product" }];

const MULTIPLE_PRODUCTS = [
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
			products={SINGLE_PRODUCT}
			{...overrides}
		/>,
	);
}

describe("BetCreateDialog (R2)", () => {
	// AC-6: Product select hidden when only one product provided
	describe("AC6 — single product: product select is hidden", () => {
		it("hides product select when only one product provided", () => {
			openDialog({ products: SINGLE_PRODUCT });
			// Product select must NOT be present when only one product
			expect(screen.queryByLabelText(/product/i)).not.toBeInTheDocument();
		});

		it("Create button enabled with pitch only (single product — no product selection needed)", () => {
			openDialog({ products: SINGLE_PRODUCT });

			// Fill only pitch — no product selection required
			const pitchTextarea = screen.getByLabelText(/pitch/i);
			fireEvent.change(pitchTextarea, { target: { value: "A valid pitch" } });

			const createBtn = screen.getByRole("button", { name: /create/i });
			expect(createBtn).not.toBeDisabled();
		});
	});

	// AC-6: Product select shows when multiple products provided
	describe("AC6 — multiple products: product select is shown", () => {
		it("shows product select when multiple products provided", () => {
			openDialog({ products: MULTIPLE_PRODUCTS });
			expect(screen.getByLabelText(/product/i)).toBeInTheDocument();
		});

		it("renders all provided products in the product select when multiple products", () => {
			openDialog({ products: MULTIPLE_PRODUCTS });
			expect(screen.getByRole("option", { name: "Test Product" })).toBeInTheDocument();
			expect(screen.getByRole("option", { name: "Another Product" })).toBeInTheDocument();
		});

		it("Create button disabled when multiple products but none selected", () => {
			openDialog({ products: MULTIPLE_PRODUCTS });
			const pitchTextarea = screen.getByLabelText(/pitch/i);
			fireEvent.change(pitchTextarea, { target: { value: "A valid pitch" } });

			// No product selected yet — create should be disabled
			const createBtn = screen.getByRole("button", { name: /create/i });
			expect(createBtn).toBeDisabled();
		});
	});

	// AC-6: Appetite fields are removed
	describe("AC6 — appetite fields are not rendered", () => {
		it("does not render appetite amount input", () => {
			openDialog();
			expect(screen.queryByLabelText(/appetite amount/i)).not.toBeInTheDocument();
		});

		it("does not render appetite currency select", () => {
			openDialog();
			expect(screen.queryByLabelText(/currency/i)).not.toBeInTheDocument();
		});
	});

	// Pitch textarea still required
	describe("fields present", () => {
		it("renders a pitch textarea", () => {
			openDialog();
			expect(screen.getByLabelText(/pitch/i)).toBeInTheDocument();
		});

		it("renders title preview area", () => {
			openDialog();
			expect(screen.getByTestId("bet-title-preview")).toBeInTheDocument();
		});

		it("renders Create button", () => {
			openDialog();
			expect(screen.getByRole("button", { name: /create/i })).toBeInTheDocument();
		});

		it("renders Cancel button", () => {
			openDialog();
			expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
		});

		it("uses <label> elements for field labels", () => {
			const { container } = openDialog();
			const labels = container.querySelectorAll("label");
			expect(labels.length).toBeGreaterThan(0);
		});
	});

	// Validation: empty pitch → Create disabled
	describe("validation: empty pitch", () => {
		it("Create button is disabled when pitch is empty (single product)", () => {
			openDialog({ products: SINGLE_PRODUCT });
			const createBtn = screen.getByRole("button", { name: /create/i });
			expect(createBtn).toBeDisabled();
		});
	});

	// Title preview derives from pitch
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
			expect(preview).toBeInTheDocument();
		});
	});

	// W-1 design critique: touch target
	describe("W-1 — touch targets ≥ 44px on mobile", () => {
		it("does not use btn-xs on any button (use btn-sm or min-h-[44px])", () => {
			const { container } = openDialog();
			const buttons = container.querySelectorAll("button");
			for (const btn of buttons) {
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
					products={SINGLE_PRODUCT}
				/>,
			);
			const createBtn = screen.queryByRole("button", { name: /create/i });
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
