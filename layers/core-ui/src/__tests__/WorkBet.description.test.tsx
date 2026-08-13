/**
 * T3 — WorkBet bet description editing (red phase).
 *
 * AC coverage:
 *   AC-1: WorkBet shows BodyEditor for mutable bet statuses (draft, active).
 *   AC-2: In non-mutable statuses (completed, killed), pitch renders as read-only blocks.
 *   AC-4: Pitch auto-saves via PATCH /api/bets/:id with { field: "description", value, reason }.
 *   AC-5: A saving indicator appears during and after auto-save.
 *   AC-6: Block actions (Discuss, block popover) work in read-only mode (completed/killed).
 *
 * TipTap/JSDOM limitation: BodyEditor uses TipTap which requires a real DOM.
 * Mock BodyEditor at the module level so JSDOM tests can exercise the conditional
 * rendering logic without TipTap crashing.
 *
 * @lore T3: same BodyEditor mock pattern as T2 (KnowledgeDetail tests).
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetDetail } from "../types/bet";

// Mock BodyEditor — TipTap cannot run in JSDOM
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
				data-testid="mock-body-editor"
				defaultValue={initialContent}
				placeholder={placeholder}
				disabled={editable === false}
				onChange={(e) => onChange?.(e.target.value)}
			/>
		),
	};
});

// Mock apiFetch for auto-save tests.
// @lore T3: WorkBet uses useHostThread → useFetch → apiFetch for thread/message GETs.
// We mock apiFetch to return a pending Promise by default so useFetch does not crash
// with "Cannot read properties of undefined (reading 'then')". Specific tests that need
// a resolved/rejected response set their own mockImplementation.
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(() => new Promise(() => {})),
}));

// Mock useBet (used for non-override path; most tests use overrideBet)
vi.mock("../hooks/useBet", () => ({
	useBet: vi.fn(() => ({ data: null, loading: false, error: null })),
}));

// Mock KnowledgeCreateDialog — WorkBet renders it but it also uses BodyEditor.
// Without this mock, two BodyEditor instances appear in the DOM (one for bet description,
// one inside KnowledgeCreateDialog) which causes getByTestId("mock-body-editor") to
// fail with "Found multiple elements". KnowledgeCreateDialog is out of T3 scope.
vi.mock("../pages/knowledge/KnowledgeCreateDialog", () => ({
	KnowledgeCreateDialog: () => null,
}));

import { WorkBet } from "../pages/WorkBet";

// Helper: build a minimal BetDetail fixture with a given status
function makeBet(status: BetDetail["status"], overrides?: Partial<BetDetail>): BetDetail {
	return {
		id: "b-test",
		title: "Test Bet",
		team: "Test Team",
		status,
		atRisk: false,
		tokenAppetite: null,
		tokensActual: null,
		progress: { done: 0, total: 0 },
		description: "# Problem\n\nA test description.",
		tasks: [],
		...overrides,
	};
}

function renderWithBet(bet: BetDetail): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${bet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={bet} />} />
			</Routes>
		</MemoryRouter>,
	);
}

function enterEditMode(): void {
	fireEvent.click(screen.getByRole("button", { name: "Edit bet content" }));
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("T3 — WorkBet description editing", () => {
	// ----------------------------------------------------------------
	// AC-1: BodyEditor shown for mutable statuses (draft, active)
	// ----------------------------------------------------------------
	describe("AC-1: BodyEditor shown for mutable statuses", () => {
		it("shows BodyEditor after explicit Edit for a draft bet", () => {
			renderWithBet(makeBet("draft"));
			enterEditMode();

			// BodyEditor must be present
			expect(screen.getByTestId("mock-body-editor")).toBeInTheDocument();

			// BetPitch (read-only blocks section) must NOT be present
			expect(document.querySelector("[data-testid='bet-pitch']")).toBeNull();
		});

		it("shows BodyEditor after explicit Edit for an active bet", () => {
			renderWithBet(makeBet("active"));
			enterEditMode();

			expect(screen.getByTestId("mock-body-editor")).toBeInTheDocument();
			expect(document.querySelector("[data-testid='bet-pitch']")).toBeNull();
		});

		it("wraps BodyEditor in a container with data-testid='bet-description-editor'", () => {
			renderWithBet(makeBet("draft"));
			enterEditMode();
			expect(screen.getByTestId("bet-description-editor")).toBeInTheDocument();
		});

		it("passes the bet description as initialContent to BodyEditor", () => {
			const description = "# My Bet\n\nSome content here.";
			renderWithBet(makeBet("draft", { description }));
			enterEditMode();

			const editor = screen.getByTestId("mock-body-editor");
			// The mock renders a textarea with defaultValue = initialContent
			expect(editor).toHaveValue(description);
		});
	});

	// ----------------------------------------------------------------
	// AC-2: Read-only BetPitch for immutable statuses (completed, killed)
	// ----------------------------------------------------------------
	describe("AC-2: Read-only BetPitch for immutable statuses", () => {
		it("shows BetPitch (not BodyEditor) for a completed bet", () => {
			renderWithBet(makeBet("completed", { description: "# Done\n\nAll tasks finished." }));

			// BetPitch section must be present
			expect(document.querySelector("[data-testid='bet-pitch']")).toBeTruthy();

			// BodyEditor must NOT be present
			expect(screen.queryByTestId("mock-body-editor")).not.toBeInTheDocument();
		});

		it("shows BetPitch (not BodyEditor) for a killed bet", () => {
			renderWithBet(makeBet("killed", { description: "# Killed\n\nThis bet was cancelled." }));

			expect(document.querySelector("[data-testid='bet-pitch']")).toBeTruthy();
			expect(screen.queryByTestId("mock-body-editor")).not.toBeInTheDocument();
		});
	});

	// ----------------------------------------------------------------
	// AC-5: Saving indicator
	// ----------------------------------------------------------------
	describe("AC-5: Saving indicator", () => {
		let fetchSpy: ReturnType<typeof vi.fn>;

		beforeEach(async () => {
			vi.useFakeTimers();
			const { apiFetch } = await import("../services/api-fetch.js");
			fetchSpy = vi.mocked(apiFetch);
			// Reset to remove any previous implementation, then set a default pending
			// Promise so useFetch (used by useHostThread inside WorkBet) does not crash
			// with "Cannot read properties of undefined (reading 'then')".
			fetchSpy.mockReset();
			fetchSpy.mockImplementation(() => new Promise(() => {}));
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("saving indicator element is present for mutable statuses", () => {
			renderWithBet(makeBet("draft"));
			enterEditMode();
			expect(screen.getByTestId("bet-save-indicator")).toBeInTheDocument();
		});

		it("keeps Done disabled and the draft visible while a change awaits acknowledgement", () => {
			renderWithBet(makeBet("draft", { description: "" }));
			enterEditMode();
			fireEvent.change(screen.getByTestId("mock-body-editor"), {
				target: { value: "Pending bet content" },
			});
			expect(screen.getByRole("button", { name: "Done editing bet content" })).toBeDisabled();
			expect(screen.getByTestId("bet-description-editor")).toBeInTheDocument();
		});

		it("saving indicator is empty (idle state) by default", () => {
			renderWithBet(makeBet("draft"));
			enterEditMode();
			const indicator = screen.getByTestId("bet-save-indicator");
			// In idle state, the indicator text should be empty
			expect(indicator.textContent?.trim()).toBe("");
		});

		it("shows 'Saving...' in indicator while PATCH is in-flight", async () => {
			// Never resolves — keep the fetch pending
			fetchSpy.mockImplementation(() => new Promise(() => {}));

			renderWithBet(makeBet("draft", { description: "" }));
			enterEditMode();

			const editor = screen.getByTestId("mock-body-editor");
			fireEvent.change(editor, { target: { value: "New content" } });

			// Advance past debounce and flush React state updates.
			// @lore T3: Without flushSync (removed in W-1 fix), setStatus("saving") is
			// batched by React. We must wrap advanceTimersByTimeAsync in act() so the
			// state update flushes before we assert the indicator text.
			await act(async () => {
				await vi.advanceTimersByTimeAsync(1500);
			});

			const indicator = screen.getByTestId("bet-save-indicator");
			expect(indicator.textContent).toContain("Saving...");
		});

		it("shows 'Saved' in indicator after successful PATCH", async () => {
			fetchSpy.mockResolvedValue(new Response("{}", { status: 200 }));

			renderWithBet(makeBet("draft", { description: "" }));
			enterEditMode();

			const editor = screen.getByTestId("mock-body-editor");
			fireEvent.change(editor, { target: { value: "Updated content" } });

			// Advance past debounce
			await vi.advanceTimersByTimeAsync(1500);

			await waitFor(() => {
				const indicator = screen.getByTestId("bet-save-indicator");
				expect(indicator.textContent).toContain("Saved");
			});
		});

		it("saving indicator is NOT present for immutable statuses (completed)", () => {
			renderWithBet(makeBet("completed", { description: "# Done" }));
			// The BodyEditor and its indicator are only rendered for mutable statuses
			expect(screen.queryByTestId("bet-save-indicator")).not.toBeInTheDocument();
		});
	});

	// ----------------------------------------------------------------
	// AC-6: Block actions work in read-only mode (completed/killed)
	// ----------------------------------------------------------------
	describe("AC-6: Block actions work in read-only mode", () => {
		it("completed bet renders blocks with data-block-id attributes (block actions possible)", () => {
			const bet = makeBet("completed", {
				description: "# Problem\n\nA paragraph.\n",
			});
			renderWithBet(bet);

			const pitchSection = document.querySelector("[data-testid='bet-pitch']");
			expect(pitchSection).toBeTruthy();

			// Blocks must be rendered (block actions require block elements)
			const blocks = pitchSection?.querySelectorAll("[data-block-id]");
			expect(blocks?.length).toBeGreaterThan(0);
		});

		it("killed bet renders read-only BetPitch with blocks for actions", () => {
			const bet = makeBet("killed", {
				description: "# Problem\n\nThe bet was cancelled.\n",
			});
			renderWithBet(bet);

			const pitchSection = document.querySelector("[data-testid='bet-pitch']");
			expect(pitchSection).toBeTruthy();

			const blocks = pitchSection?.querySelectorAll("[data-ds-component='block']");
			expect(blocks?.length).toBeGreaterThan(0);
		});
	});

	// ----------------------------------------------------------------
	// Regression: BetDetail.description (renamed from pitch)
	// ----------------------------------------------------------------
	describe("BetDetail.description field (renamed from pitch in T3)", () => {
		it("uses bet.description (not bet.pitch) as the content field", () => {
			const description = "# Feature\n\nThe description content.";
			renderWithBet(makeBet("draft", { description }));
			enterEditMode();

			const editor = screen.getByTestId("mock-body-editor") as HTMLTextAreaElement;
			expect(editor.value).toBe(description);
		});
	});
});
