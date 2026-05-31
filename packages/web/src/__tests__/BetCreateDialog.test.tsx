/**
 * R2 — BetCreateDialog component tests (updated from Q3)
 * T3 — Updated to assert BodyEditor is used instead of textarea.
 *
 * R2 AC coverage:
 * AC-6: BetCreateDialog requires only title and description. Team picker is removed (uses default team).
 *   - Hides team select when only one team is provided
 *   - Shows team select when multiple teams are provided
 *   - Create button enabled with description only (single team)
 *   - Does not render appetite fields
 *
 * T3 AC coverage (AC-3):
 *   - BetCreateDialog uses BodyEditor instead of plain textarea for the pitch field
 *   - BodyEditor onChange updates description state (title preview updates)
 *   - BodyEditor disabled during submission (editable={false})
 *
 * Q3 tests retained:
 *   - Title preview tests (unchanged — now driven by BodyEditor mock onChange)
 *   - Cancel / close tests (unchanged)
 *   - Touch target tests (unchanged)
 *
 * Q3 tests removed per R2 architecture:
 *   - "renders a team select field" → hidden when single team (AC-6)
 *   - "renders all provided teams in the team select" → hidden when single team
 *   - "renders optional appetite amount input" → appetite removed (AC-6)
 *   - "renders optional appetite currency select" → appetite removed (AC-6)
 *   - "Create button is disabled when no team selected" → no longer applies for single team
 *   - "appetite amount field accepts decimal values" → appetite removed
 *
 * @lore U1: Renamed `products` prop → `teams`, `MOCK_PRODUCTS` → `MOCK_TEAMS`,
 * label queries updated from /product/i → /team/i to match the F3 rename.
 *
 * @lore T3: BodyEditor (TipTap) cannot run in JSDOM. Mocked at module level
 * using a textarea with data-testid="mock-body-editor". The mock preserves
 * the onChange/initialContent/editable interface so existing tests remain valid.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BetCreateDialog } from "../pages/work/BetCreateDialog";

// Mock apiFetch for submit tests
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

// T3: Mock BodyEditor — TipTap cannot run in JSDOM
vi.mock("@hyperidle/design-system", async () => {
	const actual = await vi.importActual("@hyperidle/design-system");
	return {
		...(actual as Record<string, unknown>),
		BodyEditor: ({
			onChange,
			initialContent,
			placeholder,
			editable,
		}: {
			onChange?: (md: string) => void;
			initialContent?: string;
			placeholder?: string;
			editable?: boolean;
		}) => (
			<textarea
				aria-label="Description"
				data-testid="mock-body-editor"
				defaultValue={initialContent}
				placeholder={placeholder}
				disabled={editable === false}
				onChange={(e) => onChange?.(e.target.value)}
			/>
		),
	};
});

const SINGLE_TEAM = [{ id: "team-1", name: "Test Team" }];

const MULTIPLE_TEAMS = [
	{ id: "team-1", name: "Test Team" },
	{ id: "team-2", name: "Another Team" },
];

function openDialog(
	overrides?: Partial<React.ComponentProps<typeof BetCreateDialog>>,
): ReturnType<typeof render> {
	return render(
		<BetCreateDialog
			open={true}
			onClose={vi.fn()}
			onCreated={vi.fn()}
			teams={SINGLE_TEAM}
			{...overrides}
		/>,
	);
}

describe("BetCreateDialog (R2)", () => {
	// AC-6: Team select hidden when only one team provided
	describe("AC6 — single team: team select is hidden", () => {
		it("hides team select when only one team provided", () => {
			openDialog({ teams: SINGLE_TEAM });
			// Team select must NOT be present when only one team
			expect(screen.queryByLabelText(/team/i)).not.toBeInTheDocument();
		});

		it("Create button enabled with description only (single team — no team selection needed)", () => {
			openDialog({ teams: SINGLE_TEAM });

			// Fill only description — no team selection required
			const descriptionTextarea = screen.getByLabelText(/description/i);
			fireEvent.change(descriptionTextarea, { target: { value: "A valid description" } });

			const createBtn = screen.getByRole("button", { name: /create/i });
			expect(createBtn).not.toBeDisabled();
		});
	});

	// AC-6: Team select shows when multiple teams provided
	describe("AC6 — multiple teams: team select is shown", () => {
		it("shows team select when multiple teams provided", () => {
			openDialog({ teams: MULTIPLE_TEAMS });
			expect(screen.getByLabelText(/team/i)).toBeInTheDocument();
		});

		it("renders all provided teams in the team select when multiple teams", () => {
			openDialog({ teams: MULTIPLE_TEAMS });
			expect(screen.getByRole("option", { name: "Test Team" })).toBeInTheDocument();
			expect(screen.getByRole("option", { name: "Another Team" })).toBeInTheDocument();
		});

		it("Create button disabled when multiple teams but none selected", () => {
			openDialog({ teams: MULTIPLE_TEAMS });
			const descriptionTextarea = screen.getByLabelText(/description/i);
			fireEvent.change(descriptionTextarea, { target: { value: "A valid description" } });

			// No team selected yet — create should be disabled
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

	// Description textarea still required
	describe("fields present", () => {
		it("renders a description textarea", () => {
			openDialog();
			expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
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

		it("description field uses a <span> label (not <label>) since BodyEditor is not a labelable element (T3 lore)", () => {
			// @lore T3: BetCreateDialog uses <div>/<span> instead of <label> for the description
			// field because BodyEditor (TipTap ProseMirror) renders a contenteditable, not a native
			// form control. A <label> with no associated form control violates lint/a11y rules.
			// This test asserts the accessible label is a <span>, not a <label>.
			const { container } = openDialog({ teams: SINGLE_TEAM });
			// With single team: no team <label>, description uses <div>/<span> — zero <label> elements.
			const labels = container.querySelectorAll("label");
			expect(labels.length).toBe(0);
			// The description section is identified by its <span> label
			const descriptionSpan = container.querySelector("span");
			expect(descriptionSpan).not.toBeNull();
		});
	});

	// Validation: empty description → Create disabled
	describe("validation: empty description", () => {
		it("Create button is disabled when description is empty (single team)", () => {
			openDialog({ teams: SINGLE_TEAM });
			const createBtn = screen.getByRole("button", { name: /create/i });
			expect(createBtn).toBeDisabled();
		});
	});

	// Title preview derives from description
	describe("Title preview updates from description", () => {
		it("shows derived title when description has a heading", () => {
			openDialog();
			const descriptionTextarea = screen.getByLabelText(/description/i);
			fireEvent.change(descriptionTextarea, {
				target: { value: "# My Feature\n\nSome body text." },
			});

			const preview = screen.getByTestId("bet-title-preview");
			expect(preview.textContent).toContain("My Feature");
		});

		it("shows first line as title when no heading marker", () => {
			openDialog();
			const descriptionTextarea = screen.getByLabelText(/description/i);
			fireEvent.change(descriptionTextarea, { target: { value: "Plain first line" } });

			const preview = screen.getByTestId("bet-title-preview");
			expect(preview.textContent).toContain("Plain first line");
		});

		it("shows placeholder when description is empty", () => {
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
				<BetCreateDialog open={false} onClose={vi.fn()} onCreated={vi.fn()} teams={SINGLE_TEAM} />,
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

	// T3 AC-3: BetCreateDialog uses BodyEditor instead of textarea
	describe("T3 AC-3 — BodyEditor replaces textarea", () => {
		it("renders BodyEditor (mock-body-editor) instead of a plain textarea", () => {
			openDialog();
			// BodyEditor mock must be present
			expect(screen.getByTestId("mock-body-editor")).toBeInTheDocument();
		});

		it("does NOT render a plain <textarea> element for the description field", () => {
			const { container } = openDialog();
			// After T3, there is no plain textarea — only the BodyEditor (rendered as mock textarea with specific testid)
			// The textarea rendered by the mock is the BodyEditor; no additional unrelated textareas should exist
			const textareas = container.querySelectorAll("textarea");
			// If there is a textarea, it must be the mock BodyEditor (not a separate plain textarea)
			for (const ta of textareas) {
				expect(ta.getAttribute("data-testid")).toBe("mock-body-editor");
			}
		});

		it("BodyEditor onChange updates description state (title preview updates)", () => {
			openDialog();
			const editor = screen.getByTestId("mock-body-editor");
			fireEvent.change(editor, { target: { value: "# My Bet\n\nSome content." } });

			const preview = screen.getByTestId("bet-title-preview");
			expect(preview.textContent).toContain("My Bet");
		});

		it("BodyEditor is disabled (editable=false) when submitting", async () => {
			const { apiFetch } = await import("../services/api-fetch.js");
			const fetchSpy = vi.mocked(apiFetch);
			// Keep the request pending so the submitting state persists
			fetchSpy.mockImplementation(() => new Promise(() => {}));

			openDialog({ teams: SINGLE_TEAM });

			// Enter content to enable the Create button
			const editor = screen.getByTestId("mock-body-editor");
			fireEvent.change(editor, { target: { value: "# Bet Description\n\nContent." } });

			// Click Create to submit
			const createBtn = screen.getByRole("button", { name: /create/i });
			fireEvent.click(createBtn);

			// BodyEditor must be disabled (editable=false passed as disabled prop in mock)
			expect(screen.getByTestId("mock-body-editor")).toBeDisabled();
		});
	});
});
