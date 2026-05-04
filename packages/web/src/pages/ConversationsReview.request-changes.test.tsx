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
		expect(fetchMock).not.toHaveBeenCalled();
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
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("Esc inside composer cancels with NO API call", async () => {
		const user = userEvent.setup();
		renderPage();
		await user.click(screen.getByRole("button", { name: "Request changes" }));
		const dialog = screen.getByRole("dialog");
		fireEvent.keyDown(dialog, { key: "Escape" });
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("submit POSTs to /api/conversations/responses with request_changes payload shape", async () => {
		const user = userEvent.setup();
		renderPage();
		await user.click(screen.getByRole("button", { name: "Request changes" }));
		await user.type(screen.getByRole("textbox", { name: /summary/i }), "tighten the wording");
		await user.click(screen.getByRole("button", { name: /submit/i }));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
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
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, init] = fetchMock.mock.calls[0];
		const body = JSON.parse(String((init as RequestInit).body)) as {
			inline_comments: Array<{ line_index: number; body: string }>;
		};
		expect(body.inline_comments).toHaveLength(2);
		expect(body.inline_comments[0].body).toBe("rename");
		expect(body.inline_comments[1].body).toBe("null check");
	});
});
