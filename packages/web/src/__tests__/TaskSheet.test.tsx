/**
 * L15 — TaskSheet component tests.
 *
 * Cases:
 * (a) opens when task + open=true → sheet visible (role="dialog")
 * (b) Send request disabled until intent selected
 * (c) selecting intent + clicking sends request → inline role="status" "Sent." + onClose after ~800ms
 * (d) error path: postRequest rejects → role="alert" "Couldn't send — try again.", sheet stays open,
 *     selection preserved
 * (e) clicking Open thread calls onNavigateToThread(threadId)
 * (f) Open thread failure: resolveThreadId rejects → role="alert" "Couldn't open thread — try again."
 * (g) ESC closes the sheet
 * (h) close-button click closes the sheet
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../shell/Kanban";
import { TaskSheet } from "../shell/TaskSheet";

const sampleTask: KanbanTask = {
	id: "task-abc",
	title: "Implement login endpoint",
	owner: "Dev Agent 1",
	state: "in_progress",
	cost: "$4.20",
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

		await waitFor(() => {
			const statusEl = screen.getByRole("status");
			expect(statusEl).toBeInTheDocument();
			expect(statusEl).toHaveTextContent("Sent.");
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
			expect(screen.getByRole("status")).toHaveTextContent("Sent.");
		});

		// Advance fake timer past the 800ms auto-close
		vi.advanceTimersByTime(900);
		await waitFor(() => {
			expect(onClose).toHaveBeenCalledOnce();
		});
	});

	it("(c) appends note text when provided", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		const postRequest = vi.fn().mockResolvedValue(undefined);
		render(<TaskSheet {...makeProps({ postRequest })} />);

		await user.click(screen.getByRole("radio", { name: /move to blocked/i }));
		await user.type(screen.getByRole("textbox"), "Please expedite this.");
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

	it("(e) clicking Open thread calls onNavigateToThread with the resolved thread id", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		const onNavigateToThread = vi.fn();
		const resolveThreadId = vi.fn().mockResolvedValue(THREAD_ID);
		render(<TaskSheet {...makeProps({ onNavigateToThread, resolveThreadId })} />);

		await user.click(screen.getByRole("button", { name: /open thread/i }));

		await waitFor(() => {
			expect(onNavigateToThread).toHaveBeenCalledOnce();
			expect(onNavigateToThread).toHaveBeenCalledWith(THREAD_ID);
		});
	});

	it("(f) Open thread failure: shows role='alert' 'Couldn't open thread — try again.', sheet stays open", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		const resolveThreadId = vi.fn().mockRejectedValue(new Error("Not found"));
		const onClose = vi.fn();
		render(<TaskSheet {...makeProps({ resolveThreadId, onClose })} />);

		await user.click(screen.getByRole("button", { name: /open thread/i }));

		await waitFor(() => {
			const alertEl = screen.getByRole("alert");
			expect(alertEl).toBeInTheDocument();
			expect(alertEl).toHaveTextContent("Couldn't open thread — try again.");
		});

		// Sheet stays open
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
	});

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
		render(<TaskSheet {...makeProps()} />);
		const textarea = screen.getByRole("textbox");
		expect(textarea).toBeInTheDocument();
	});
});
