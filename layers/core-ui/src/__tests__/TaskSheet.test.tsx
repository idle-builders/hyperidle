/**
 * L15 — TaskSheet component tests.
 *
 * Cases:
 * (a) opens when task + open=true → sheet visible (role="dialog")
 * (b) Send request disabled until intent selected
 * (c) selecting intent + clicking sends request → inline role="status" "Sent." + onClose after ~800ms
 * (d) error path: postRequest rejects → role="alert" "Couldn't send — try again.", sheet stays open,
 *     selection preserved
 * (e) [L18-removed] clicking Open thread → replaced by inline HostThreadSection; see TaskSheet.thread.test.tsx
 * (f) [L18-removed] Open thread failure → replaced by inline HostThreadSection
 * (g) ESC closes the sheet
 * (h) close-button click closes the sheet
 * (i) focus management: initial focus lands on first radio; Tab loops; Shift-Tab loops; close restores focus
 * (j) [L18-removed] Open thread disabled during submitting → Open thread button removed
 * (k) mobile bottom-sheet classes present on dialog element (F3)
 *
 * @lore L18: Tests (e), (f), (j) removed — the "Open thread" button was replaced
 * by an inline HostThreadSection. The sheet width changed from sm:max-w-[360px]
 * to sm:max-w-[min(640px,90vw)] to accommodate the thread composer.
 * See TaskSheet.thread.test.tsx for the new L18 thread AC coverage.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../shell/TaskSheet";
import { TaskSheet } from "../shell/TaskSheet";

// L18: TaskSheet now renders HostThreadSection inline; mock useHostThread to avoid fetch calls.
vi.mock("../hooks/useHostThread", () => ({
	useHostThread: vi.fn(() => ({
		data: null,
		error: null,
		isLoading: false,
		refresh: vi.fn(),
	})),
}));

// L12: TaskSheet now renders ArtifactSection which calls useNavigate internally.
// Mock it here so existing tests (which don't wrap in Router) continue to pass.
vi.mock("../components/ArtifactSection", () => ({
	ArtifactSection: () => null,
	useArtifactOpen: () => vi.fn(),
}));

// AF12: TaskSheet now renders a Sessions section backed by useTaskSessions;
// mock it to avoid a real fetch and render the (empty) populated state.
vi.mock("../hooks/useTaskSessions", () => ({
	useTaskSessions: vi.fn(() => ({ data: { sessions: [] }, isLoading: false, error: null })),
}));

const sampleTask: KanbanTask = {
	id: "task-abc",
	title: "Implement login endpoint",
	owner: "Dev Agent 1",
	state: "in_progress",
	betTag: "Auth",
};

const THREAD_ID = "thread-123";

function makeProps(
	overrides: Partial<Parameters<typeof TaskSheet>[0]> = {},
): Parameters<typeof TaskSheet>[0] {
	return {
		task: sampleTask,
		open: true,
		onClose: vi.fn(),
		resolveThreadId: vi.fn().mockResolvedValue(THREAD_ID),
		postRequest: vi.fn().mockResolvedValue(undefined),
		onNavigateToThread: vi.fn(),
		...overrides,
	};
}

describe("TaskSheet (L15)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("(a) renders a dialog when open=true with task data visible", () => {
		render(<TaskSheet {...makeProps()} />);

		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(screen.getByText("Implement login endpoint")).toBeInTheDocument();
	});

	it("(a) does not render dialog when open=false", () => {
		render(<TaskSheet {...makeProps({ open: false })} />);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("(a) does not render when task is null", () => {
		render(<TaskSheet {...makeProps({ task: null, open: true })} />);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("(b) Send request button is disabled before selecting an intent", () => {
		render(<TaskSheet {...makeProps()} />);
		const sendBtn = screen.getByRole("button", { name: /send request/i });
		expect(sendBtn).toBeDisabled();
	});

	it("(b) Send request button enables after selecting an intent", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		render(<TaskSheet {...makeProps()} />);

		const blockedRadio = screen.getByRole("radio", { name: /move to blocked/i });
		await user.click(blockedRadio);

		const sendBtn = screen.getByRole("button", { name: /send request/i });
		expect(sendBtn).not.toBeDisabled();
	});

	it("(c) selecting intent + clicking Send request calls postRequest with correct shape", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		const postRequest = vi.fn().mockResolvedValue(undefined);
		const resolveThreadId = vi.fn().mockResolvedValue(THREAD_ID);
		render(<TaskSheet {...makeProps({ postRequest, resolveThreadId })} />);

		await user.click(screen.getByRole("radio", { name: /move to blocked/i }));
		await user.click(screen.getByRole("button", { name: /send request/i }));

		await waitFor(() => {
			expect(postRequest).toHaveBeenCalledOnce();
		});

		const [calledThreadId, calledText, calledClientKey] = postRequest.mock.calls[0] as [
			string,
			string,
			string,
		];
		expect(calledThreadId).toBe(THREAD_ID);
		expect(calledText).toContain("Request: move to BLOCKED");
		expect(typeof calledClientKey).toBe("string");
		expect(calledClientKey.length).toBeGreaterThan(0);
	});

	it("(c) shows inline role='status' 'Sent.' after successful request", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		render(<TaskSheet {...makeProps()} />);

		await user.click(screen.getByRole("radio", { name: /move to blocked/i }));
		await user.click(screen.getByRole("button", { name: /send request/i }));

		// @lore L18 (M2): HostThreadSection now renders EmptyState (role="status") when
		// no messages exist. Use getByText to disambiguate from the "Sent." confirmation.
		await waitFor(() => {
			expect(screen.getByText("Sent.")).toBeInTheDocument();
		});
	});

	it("(c) calls onClose after ~800ms on success", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		const onClose = vi.fn();
		render(<TaskSheet {...makeProps({ onClose })} />);

		await user.click(screen.getByRole("radio", { name: /move to blocked/i }));
		await user.click(screen.getByRole("button", { name: /send request/i }));

		// Before timeout: not closed yet
		await waitFor(() => {
			expect(screen.getByText("Sent.")).toBeInTheDocument();
		});

		// Advance fake timer past the 800ms auto-close
		vi.advanceTimersByTime(900);
		await waitFor(() => {
			expect(onClose).toHaveBeenCalledOnce();
		});
	});

	it("(c) appends note text when provided", async () => {
		// @lore L18: TaskSheet now has two textareas; use placeholder to target the note field.
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		const postRequest = vi.fn().mockResolvedValue(undefined);
		render(<TaskSheet {...makeProps({ postRequest })} />);

		await user.click(screen.getByRole("radio", { name: /move to blocked/i }));
		await user.type(
			screen.getByPlaceholderText(/what should the agent know/i),
			"Please expedite this.",
		);
		await user.click(screen.getByRole("button", { name: /send request/i }));

		await waitFor(() => expect(postRequest).toHaveBeenCalledOnce());
		const [, calledText] = postRequest.mock.calls[0] as [string, string, string];
		expect(calledText).toContain("Please expedite this.");
	});

	it("(d) postRequest failure: shows role='alert' with error text, sheet stays open, selection preserved", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		const postRequest = vi.fn().mockRejectedValue(new Error("Network error"));
		const onClose = vi.fn();
		render(<TaskSheet {...makeProps({ postRequest, onClose })} />);

		await user.click(screen.getByRole("radio", { name: /move to blocked/i }));
		await user.click(screen.getByRole("button", { name: /send request/i }));

		await waitFor(() => {
			const alertEl = screen.getByRole("alert");
			expect(alertEl).toBeInTheDocument();
			expect(alertEl).toHaveTextContent("Couldn't send — try again.");
		});

		// Sheet stays open
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		// onClose not called
		expect(onClose).not.toHaveBeenCalled();
		// Selection preserved (radio still checked)
		expect(screen.getByRole("radio", { name: /move to blocked/i })).toBeChecked();
	});

	it("(d) resolveThreadId failure on Send request: shows error alert", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		const resolveThreadId = vi.fn().mockRejectedValue(new Error("Thread resolve failed"));
		const onClose = vi.fn();
		render(<TaskSheet {...makeProps({ resolveThreadId, onClose })} />);

		await user.click(screen.getByRole("radio", { name: /mark done/i }));
		await user.click(screen.getByRole("button", { name: /send request/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Couldn't send — try again.");
		});
		expect(onClose).not.toHaveBeenCalled();
	});

	// (e) and (f) removed — L18 replaced Open thread button with HostThreadSection.
	// See TaskSheet.thread.test.tsx for L18 AC coverage.

	it("(g) pressing ESC closes the sheet", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		const onClose = vi.fn();
		render(<TaskSheet {...makeProps({ onClose })} />);

		await user.keyboard("{Escape}");

		expect(onClose).toHaveBeenCalledOnce();
	});

	it("(h) close button click closes the sheet", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		const onClose = vi.fn();
		render(<TaskSheet {...makeProps({ onClose })} />);

		const closeBtn = screen.getByRole("button", { name: /close/i });
		await user.click(closeBtn);

		expect(onClose).toHaveBeenCalledOnce();
	});

	it("all five intents are rendered as radio options", () => {
		render(<TaskSheet {...makeProps()} />);

		expect(screen.getByRole("radio", { name: /move to blocked/i })).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: /unblock and resume/i })).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: /mark done/i })).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: /put on hold/i })).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: /stop.*kill/i })).toBeInTheDocument();
	});

	it("optional note textarea is present", () => {
		// @lore L18: TaskSheet now renders two textareas — HostThreadSection's composer
		// ("Write a message…") and the request note textarea. Use placeholder to disambiguate.
		render(<TaskSheet {...makeProps()} />);
		const textarea = screen.getByPlaceholderText(/what should the agent know/i);
		expect(textarea).toBeInTheDocument();
	});

	// ── F1: Focus management ────────────────────────────────────────────────

	it("(i) initial focus lands on the first radio when the sheet opens", async () => {
		render(<TaskSheet {...makeProps()} />);

		// Wait for the rAF-deferred focus to settle.
		await waitFor(() => {
			const firstRadio = screen.getByRole("radio", { name: /move to blocked/i });
			expect(document.activeElement).toBe(firstRadio);
		});
	});

	it("(i) Tab from the last focusable element wraps to the first (focus trap)", async () => {
		// @lore userEvent.tab() in jsdom moves focus natively, bypassing React's synthetic
		// onKeyDown handler. We use fireEvent.keyDown on the dialog element directly — this
		// is the correct way to test the focus trap since the trap listens on the dialog div.
		//
		// @lore The Send request button is disabled until an intent is selected. The focus
		// trap's getFocusableElements() excludes disabled elements, so the last focusable
		// element when no intent is selected is the note textarea (not the Send button).
		// We select an intent first to enable Send request, making it the true last element.
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		render(<TaskSheet {...makeProps()} />);

		// Select an intent so the Send request button becomes enabled (last focusable element).
		await user.click(screen.getByRole("radio", { name: /move to blocked/i }));

		const dialog = screen.getByRole("dialog");
		const sendBtn = screen.getByRole("button", { name: /send request/i });
		const closeBtn = screen.getByRole("button", { name: /close/i });

		// Place focus on the last focusable element (Send request button).
		sendBtn.focus();
		expect(document.activeElement).toBe(sendBtn);

		// Fire Tab on the dialog — the onKeyDown handler should wrap focus to the first element.
		fireEvent.keyDown(dialog, { key: "Tab", shiftKey: false });

		// Focus should now be on the Close button (first focusable element).
		expect(document.activeElement).toBe(closeBtn);
	});

	it("(i) Shift-Tab from the first focusable element wraps to the last (focus trap)", async () => {
		// @lore Same reasoning as the Tab test above — use fireEvent.keyDown on the dialog.
		// Select an intent first so the Send button is enabled and is the true last focusable element.
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		render(<TaskSheet {...makeProps()} />);

		// Select an intent so the Send request button becomes the last focusable element.
		await user.click(screen.getByRole("radio", { name: /move to blocked/i }));

		const dialog = screen.getByRole("dialog");
		const closeBtn = screen.getByRole("button", { name: /close/i });
		const sendBtn = screen.getByRole("button", { name: /send request/i });

		// Place focus on the first focusable element (Close button).
		closeBtn.focus();
		expect(document.activeElement).toBe(closeBtn);

		// Fire Shift+Tab on the dialog — the handler should wrap focus to the last element.
		fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });

		// Focus should now be on Send request (last focusable element).
		expect(document.activeElement).toBe(sendBtn);
	});

	it("(i) focus returns to the trigger element after the sheet closes", async () => {
		// Create a trigger button and focus it before opening the sheet.
		const trigger = document.createElement("button");
		trigger.textContent = "Open task";
		document.body.appendChild(trigger);
		trigger.focus();
		expect(document.activeElement).toBe(trigger);

		const onClose = vi.fn();
		const { rerender } = render(<TaskSheet {...makeProps({ open: true, onClose })} />);

		// Sheet opens: focus moves inside.
		await waitFor(() => {
			const dialog = screen.getByRole("dialog");
			expect(dialog.contains(document.activeElement)).toBe(true);
		});

		// Close the sheet by rerendering with open=false.
		rerender(<TaskSheet {...makeProps({ open: false, onClose })} />);

		// Focus should return to the trigger.
		await waitFor(() => {
			expect(document.activeElement).toBe(trigger);
		});

		document.body.removeChild(trigger);
	});

	// ── F3: Mobile bottom-sheet responsive classes ──────────────────────────

	it("(k) dialog has mobile bottom-sheet classes present", () => {
		render(<TaskSheet {...makeProps()} />);
		const dialog = screen.getByRole("dialog");

		// Mobile bottom-sheet classes (design/approved.md Mobile section).
		expect(dialog.className).toContain("inset-x-0");
		expect(dialog.className).toContain("bottom-0");
		expect(dialog.className).toContain("max-h-[85vh]");
		// Desktop right-drawer classes (sm: prefix).
		// @lore L18: Width grew from 360px to min(640px,90vw) to accommodate thread composer.
		expect(dialog.className).toContain("sm:inset-y-0");
		expect(dialog.className).toContain("sm:right-0");
		expect(dialog.className).toContain("sm:max-w-[min(640px,90vw)]");
	});

	// (j) removed — L18 removed the "Open thread" button (replaced by HostThreadSection).
});
