/**
 * L6 — ConversationsReview page integration with RequestChangesComposer (red phase).
 *
 * Pins ACs:
 *   - Click "Request changes" opens the composer modal (no silent commit).
 *   - R keyboard shortcut on a text_diff thread opens the composer.
 *   - Cancel discards composer state with NO API call.
 *   - Esc cancels with NO API call.
 *   - Submit POSTs to /api/conversations/responses with summary +
 *     inline_comments[] payload shape per `.plan-L6.md` § 3.6.
 *   - When composer is open, single-key pre-fill (J4) is suppressed.
 *
 * These tests MUST fail today: handleVerdict('request-changes') still calls
 * commitVerdict; no composer is rendered; no fetch wiring exists.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationsReview } from "./ConversationsReview";

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<ConversationsReview />
		</MemoryRouter>,
	);
}

describe("ConversationsReview — Request Changes composer (L6)", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: "resp-1" }), {
				status: 201,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("clicking 'Request changes' opens the composer modal (no immediate API call)", async () => {
		const user = userEvent.setup();
		renderPage();
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Request changes" }));
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		// L7 (AI8): useRecoveryFetch calls /api/me; only assert no
		// /api/conversations/responses POST.
		const responsesCalls = fetchMock.mock.calls.filter((c) =>
			String(c[0]).includes("/api/conversations/responses"),
		);
		expect(responsesCalls).toHaveLength(0);
	});

	it("pressing R on a text_diff thread opens the composer with summary focused", () => {
		renderPage();
		// R at document level (no input focused) should open the composer.
		fireEvent.keyDown(document.body, { key: "r" });
		const dialog = screen.getByRole("dialog");
		expect(dialog).toBeInTheDocument();
		const summary = screen.getByRole("textbox", { name: /summary/i });
		expect(document.activeElement).toBe(summary);
	});

	it("Cancel button closes the composer with NO API call", async () => {
		const user = userEvent.setup();
		renderPage();
		await user.click(screen.getByRole("button", { name: "Request changes" }));
		await user.type(screen.getByRole("textbox", { name: /summary/i }), "draft text");
		await user.click(screen.getByRole("button", { name: /cancel/i }));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		// L7 (AI8): useRecoveryFetch calls /api/me; only assert no
		// /api/conversations/responses POST.
		const responsesCalls = fetchMock.mock.calls.filter((c) =>
			String(c[0]).includes("/api/conversations/responses"),
		);
		expect(responsesCalls).toHaveLength(0);
	});

	it("Esc inside composer cancels with NO API call", async () => {
		const user = userEvent.setup();
		renderPage();
		await user.click(screen.getByRole("button", { name: "Request changes" }));
		const dialog = screen.getByRole("dialog");
		fireEvent.keyDown(dialog, { key: "Escape" });
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		// L7 (AI8): useRecoveryFetch calls /api/me; only assert no
		// /api/conversations/responses POST.
		const responsesCalls = fetchMock.mock.calls.filter((c) =>
			String(c[0]).includes("/api/conversations/responses"),
		);
		expect(responsesCalls).toHaveLength(0);
	});

	it("submit POSTs to /api/conversations/responses with request_changes payload shape", async () => {
		const user = userEvent.setup();
		renderPage();
		await user.click(screen.getByRole("button", { name: "Request changes" }));
		await user.type(screen.getByRole("textbox", { name: /summary/i }), "tighten the wording");
		await user.click(screen.getByRole("button", { name: /submit/i }));
		const responsesCalls = fetchMock.mock.calls.filter((c) =>
			String(c[0]).includes("/api/conversations/responses"),
		);
		expect(responsesCalls).toHaveLength(1);
		const [url, init] = responsesCalls[0];
		expect(String(url)).toContain("/api/conversations/responses");
		expect((init as RequestInit).method).toBe("POST");
		const body = JSON.parse(String((init as RequestInit).body)) as {
			decision: string;
			summary: string;
			inline_comments: Array<{ line_index: number; body: string }>;
		};
		expect(body.decision).toBe("request-changes");
		expect(body.summary).toBe("tighten the wording");
		expect(Array.isArray(body.inline_comments)).toBe(true);
	});

	it("when composer is open, single-key A/X/S do NOT pre-fill the global verdict bar", async () => {
		const user = userEvent.setup();
		renderPage();
		await user.click(screen.getByRole("button", { name: "Request changes" }));
		// Send a stray A keydown at the document body — the global handler must skip it.
		fireEvent.keyDown(document.body, { key: "a" });
		// The J4 pending-verdict banner uses data-testid="pending-verdict".
		expect(screen.queryByTestId("pending-verdict")).toBeNull();
	});

	/**
	 * @lore L6 review (adv CRIT-2 / fix H): Esc precedence. When both the
	 * undo toast (L4) and the request-changes composer (L6) are open, Esc
	 * must close the composer FIRST, leaving the toast in place. This
	 * proves the page-level capture-phase listener short-circuits to the
	 * composer-Esc when the composer is mounted.
	 */
	it("Esc closes composer first when both composer and undo toast are visible", async () => {
		const user = userEvent.setup();
		renderPage();
		// 1) Approve to mount the L4 undo toast (verdictDoubleClick=true →
		//    first click pre-fills, second click commits).
		await user.click(screen.getByRole("button", { name: /^approve$/i }));
		await user.click(screen.getByRole("button", { name: /confirm approve/i }));
		// Toast (UndoToast) uses role="status".
		expect(await screen.findByTestId("undo-toast")).toBeInTheDocument();
		// 2) Open the request-changes composer on top of the toast.
		await user.click(screen.getByRole("button", { name: "Request changes" }));
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		// 3) Esc should close the composer first; the toast survives.
		fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		// Toast still mounted.
		expect(screen.queryByTestId("undo-toast")).toBeInTheDocument();
	});

	/**
	 * @lore L6 DoD-fix: regression for the Playwright failure where a second
	 * gutter click was blocked because the modal wrapper intercepted pointer
	 * events. The implementation now (a) does not call `openComposer()` when
	 * the composer is already open in `handleAddComment`, and (b) sets
	 * `pointer-events: none` on the modal wrapper so the diff stays
	 * clickable through the (transparent) overlay area. This unit test pins
	 * the first half of that contract: clicking two `+ Comment` buttons
	 * with the composer ALREADY OPEN appends 2 drafts (no reopen / reset).
	 */
	it("two '+ Comment' clicks with composer already open append 2 drafts (no reset)", async () => {
		const user = userEvent.setup();
		renderPage();
		// Open the composer and type into the summary field — proves the
		// "already open" state.
		await user.click(screen.getByRole("button", { name: "Request changes" }));
		const summary = screen.getByRole("textbox", { name: /summary/i });
		await user.type(summary, "tighten the wording");
		expect(summary).toHaveValue("tighten the wording");
		// Now click two gutter buttons in sequence.
		const gutterButtons = screen.getAllByRole("button", { name: /add comment to line/i });
		expect(gutterButtons.length).toBeGreaterThanOrEqual(2);
		await user.click(gutterButtons[0]);
		await user.click(gutterButtons[1]);
		// Both drafts present; composer still open; summary text preserved
		// (i.e. the composer was NOT closed-then-reopened).
		const rows = screen.getAllByTestId(/^inline-comment-row-/);
		expect(rows).toHaveLength(2);
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: /summary/i })).toHaveValue("tighten the wording");
	});

	it("'+ Comment' clicks on diff lines populate composer drafts; submit sends inline_comments[]", async () => {
		const user = userEvent.setup();
		renderPage();
		// First, click one of the gutter affordances on the underlying diff.
		// It is rendered always-in-DOM per .plan-L6.md (opacity-0 group-hover trick).
		const gutterButtons = screen.getAllByRole("button", { name: /add comment to line/i });
		expect(gutterButtons.length).toBeGreaterThan(0);
		await user.click(gutterButtons[0]);
		await user.click(gutterButtons[1]);
		// Composer should have opened and prepopulated with 2 draft rows.
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		const rows = screen.getAllByTestId(/^inline-comment-row-/);
		expect(rows).toHaveLength(2);
		// Type bodies + summary.
		const textareas = screen.getAllByRole("textbox", { name: /comment/i });
		await user.type(textareas[0], "rename");
		await user.type(textareas[1], "null check");
		await user.type(screen.getByRole("textbox", { name: /summary/i }), "fix");
		await user.click(screen.getByRole("button", { name: /submit/i }));
		const responsesCalls = fetchMock.mock.calls.filter((c) =>
			String(c[0]).includes("/api/conversations/responses"),
		);
		expect(responsesCalls).toHaveLength(1);
		const [, init] = responsesCalls[0];
		const body = JSON.parse(String((init as RequestInit).body)) as {
			inline_comments: Array<{ line_index: number; body: string }>;
		};
		expect(body.inline_comments).toHaveLength(2);
		expect(body.inline_comments[0].body).toBe("rename");
		expect(body.inline_comments[1].body).toBe("null check");
	});
});
