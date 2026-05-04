/**
 * L15 — TaskRequestPopover (RED phase).
 *
 * Contract:
 *  - Renders a Request ▾ trigger button anchored to the popover content.
 *  - On open, lists exactly the verbs returned by requestableVerbsFor(state).
 *  - Verb labels match verbDisplayLabel().
 *  - Clicking Send POSTs a `plain` message to the task's existing thread
 *    (or POSTs to /api/threads to create one when threadId is null).
 *  - The posted body matches formatRequestMessageBody().
 *  - Successful send invokes onSent({ threadId }).
 *  - Cmd+Enter in the textarea submits.
 *  - On error, the popover stays open and shows a danger strip.
 *  - Focus returns to the Request ▾ trigger after close.
 */

import {
	formatRequestMessageBody,
	REQUEST_VERBS,
	requestableVerbsFor,
	verbDisplayLabel,
} from "@hyperidle/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskRequestPopover } from "../shell/TaskRequestPopover";

const FOUNDER_ID = "u-founder";
const FOUNDER_NAME = "A. Founder";

interface FetchCall {
	url: string;
	init: RequestInit;
}

let fetchCalls: FetchCall[] = [];
let fetchImpl: (url: string, init: RequestInit) => Promise<Response>;

beforeEach(() => {
	fetchCalls = [];
	fetchImpl = async (url, init) => {
		fetchCalls.push({ url, init });
		// Default: append-message success response.
		return new Response(
			JSON.stringify({
				message: { id: "m-1", type: "plain", payload: { text: "ok" } },
				thread: { id: "thread-existing" },
			}),
			{ status: 201, headers: { "content-type": "application/json" } },
		);
	};
	vi.stubGlobal("fetch", (url: string, init: RequestInit) => fetchImpl(url, init));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("TaskRequestPopover — verb list derivation", () => {
	it("renders one verb row per requestableVerbsFor(state)", async () => {
		const user = userEvent.setup();
		render(
			<TaskRequestPopover
				task={{ id: "task-x", state: "in_progress", ownerAgentId: "agent-x" }}
				founderId={FOUNDER_ID}
				founderName={FOUNDER_NAME}
				threadId="thread-existing"
				onSent={vi.fn()}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /request/i }));

		const expected = requestableVerbsFor("in_progress");
		for (const verb of expected) {
			expect(
				screen.getByRole("button", { name: new RegExp(`^${verbDisplayLabel(verb)}$`, "i") }),
			).toBeInTheDocument();
		}
		// And no extra verbs leaked in.
		const allVerbButtons = REQUEST_VERBS.filter((v) => !expected.includes(v));
		for (const verb of allVerbButtons) {
			expect(
				screen.queryByRole("button", { name: new RegExp(`^${verbDisplayLabel(verb)}$`, "i") }),
			).toBeNull();
		}
	});

	it("does not render any verb rows for a terminal state", async () => {
		const user = userEvent.setup();
		render(
			<TaskRequestPopover
				task={{ id: "task-y", state: "done", ownerAgentId: "agent-y" }}
				founderId={FOUNDER_ID}
				founderName={FOUNDER_NAME}
				threadId="thread-existing"
				onSent={vi.fn()}
			/>,
		);

		// The trigger may be hidden entirely OR open to an empty list. Either is
		// acceptable; what's NOT acceptable is rendering verb buttons.
		const triggerExists = screen.queryByRole("button", { name: /request/i });
		if (triggerExists) {
			await user.click(triggerExists);
		}
		for (const verb of REQUEST_VERBS) {
			expect(
				screen.queryByRole("button", { name: new RegExp(`^${verbDisplayLabel(verb)}$`, "i") }),
			).toBeNull();
		}
	});
});

describe("TaskRequestPopover — Send posts the right message", () => {
	it("appends to an existing thread via POST /api/threads/:id/messages", async () => {
		const user = userEvent.setup();
		const onSent = vi.fn();
		render(
			<TaskRequestPopover
				task={{ id: "task-x", state: "in_progress", ownerAgentId: "agent-x" }}
				founderId={FOUNDER_ID}
				founderName={FOUNDER_NAME}
				threadId="thread-existing"
				onSent={onSent}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /request/i }));
		await user.click(screen.getByRole("button", { name: /^Mark blocked$/i }));
		await user.click(screen.getByRole("button", { name: /^Send$/i }));

		await waitFor(() => expect(fetchCalls.length).toBe(1));
		const call = fetchCalls[0];
		expect(call.url).toBe("/api/threads/thread-existing/messages");
		expect(call.init.method).toBe("POST");
		const body = JSON.parse(String(call.init.body));
		expect(body.type).toBe("plain");
		expect(body.payload.text).toBe(
			formatRequestMessageBody({
				actorName: FOUNDER_NAME,
				verb: "mark_blocked",
			}),
		);
		expect(typeof body.clientKey).toBe("string");
		expect(body.clientKey.length).toBeGreaterThan(0);

		await waitFor(() => expect(onSent).toHaveBeenCalledWith({ threadId: "thread-existing" }));
	});

	it("creates a new thread via POST /api/threads when threadId is null", async () => {
		fetchImpl = async (url, init) => {
			fetchCalls.push({ url, init });
			return new Response(
				JSON.stringify({
					thread: { id: "thread-new" },
					messages: [{ id: "m-1", type: "plain", payload: { text: "ok" } }],
				}),
				{ status: 201, headers: { "content-type": "application/json" } },
			);
		};

		const user = userEvent.setup();
		const onSent = vi.fn();
		render(
			<TaskRequestPopover
				task={{ id: "task-orphan", state: "accepted", ownerAgentId: "agent-z" }}
				founderId={FOUNDER_ID}
				founderName={FOUNDER_NAME}
				threadId={null}
				onSent={onSent}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /request/i }));
		await user.click(screen.getByRole("button", { name: /^Pause$/i }));
		await user.click(screen.getByRole("button", { name: /^Send$/i }));

		await waitFor(() => expect(fetchCalls.length).toBe(1));
		const call = fetchCalls[0];
		expect(call.url).toBe("/api/threads");
		expect(call.init.method).toBe("POST");
		const body = JSON.parse(String(call.init.body));
		expect(body.hostKind).toBe("task");
		expect(body.hostId).toBe("task-orphan");
		expect(body.participants).toEqual([FOUNDER_ID, "agent-z"]);
		expect(body.initialMessage.type).toBe("plain");
		expect(body.initialMessage.payload.text).toBe(
			formatRequestMessageBody({ actorName: FOUNDER_NAME, verb: "pause" }),
		);
		expect(typeof body.initialMessage.clientKey).toBe("string");

		await waitFor(() => expect(onSent).toHaveBeenCalledWith({ threadId: "thread-new" }));
	});

	it("includes the trimmed note as line 2 when typed", async () => {
		const user = userEvent.setup();
		render(
			<TaskRequestPopover
				task={{ id: "task-x", state: "in_progress", ownerAgentId: "agent-x" }}
				founderId={FOUNDER_ID}
				founderName={FOUNDER_NAME}
				threadId="thread-existing"
				onSent={vi.fn()}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /request/i }));
		await user.click(screen.getByRole("button", { name: /^Mark blocked$/i }));
		const note = screen.getByRole("textbox");
		await user.type(note, "   docs disagree   ");
		await user.click(screen.getByRole("button", { name: /^Send$/i }));

		await waitFor(() => expect(fetchCalls.length).toBe(1));
		const body = JSON.parse(String(fetchCalls[0].init.body));
		expect(body.payload.text).toBe(
			formatRequestMessageBody({
				actorName: FOUNDER_NAME,
				verb: "mark_blocked",
				note: "   docs disagree   ",
			}),
		);
	});
});

describe("TaskRequestPopover — clientKey stability across retries (apply A)", () => {
	it("reuses the same clientKey when a failed send is retried", async () => {
		// Fail the first POST, succeed on the second.
		let calls = 0;
		fetchImpl = async (url, init) => {
			fetchCalls.push({ url, init });
			calls += 1;
			if (calls === 1) {
				return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
			}
			return new Response(
				JSON.stringify({
					message: { id: "m-1", type: "plain", payload: { text: "ok" } },
					thread: { id: "thread-existing" },
				}),
				{ status: 201, headers: { "content-type": "application/json" } },
			);
		};
		const user = userEvent.setup();
		render(
			<TaskRequestPopover
				task={{ id: "task-x", state: "in_progress", ownerAgentId: "agent-x" }}
				founderId={FOUNDER_ID}
				founderName={FOUNDER_NAME}
				threadId="thread-existing"
				onSent={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /request/i }));
		await user.click(screen.getByRole("button", { name: /^Pause$/i }));
		await user.click(screen.getByRole("button", { name: /^Send$/i }));
		// First send fails → error strip rendered, popover stays open.
		await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
		// Retry.
		await user.click(screen.getByRole("button", { name: /^Send$/i }));
		await waitFor(() => expect(fetchCalls.length).toBe(2));
		const k1 = JSON.parse(String(fetchCalls[0].init.body)).clientKey;
		const k2 = JSON.parse(String(fetchCalls[1].init.body)).clientKey;
		expect(typeof k1).toBe("string");
		expect(k1).toBe(k2);
	});
});

describe("TaskRequestPopover — Esc + click-outside (apply B)", () => {
	it("closes when Escape is pressed", async () => {
		const user = userEvent.setup();
		render(
			<TaskRequestPopover
				task={{ id: "task-x", state: "in_progress", ownerAgentId: "agent-x" }}
				founderId={FOUNDER_ID}
				founderName={FOUNDER_NAME}
				threadId="thread-existing"
				onSent={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /request/i }));
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	it("closes on a mousedown outside the dialog and trigger", async () => {
		const user = userEvent.setup();
		render(
			<div>
				<button type="button" data-testid="outside">
					Outside
				</button>
				<TaskRequestPopover
					task={{ id: "task-x", state: "in_progress", ownerAgentId: "agent-x" }}
					founderId={FOUNDER_ID}
					founderName={FOUNDER_NAME}
					threadId="thread-existing"
					onSent={vi.fn()}
				/>
			</div>,
		);
		await user.click(screen.getByRole("button", { name: /request/i }));
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		// userEvent.click fires mousedown → mouseup → click; mousedown is enough
		// to trip the outside-handler, which removes the dialog before click.
		await user.click(screen.getByTestId("outside"));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});
});

describe("TaskRequestPopover — error handling", () => {
	it("renders a danger strip and stays open on POST failure", async () => {
		fetchImpl = async (url, init) => {
			fetchCalls.push({ url, init });
			return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
		};
		const user = userEvent.setup();
		render(
			<TaskRequestPopover
				task={{ id: "task-x", state: "in_progress", ownerAgentId: "agent-x" }}
				founderId={FOUNDER_ID}
				founderName={FOUNDER_NAME}
				threadId="thread-existing"
				onSent={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /request/i }));
		await user.click(screen.getByRole("button", { name: /^Pause$/i }));
		await user.click(screen.getByRole("button", { name: /^Send$/i }));

		await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
		expect(screen.getByRole("alert").textContent).toMatch(/couldn'?t post/i);
		// Send button is still available for retry.
		expect(screen.getByRole("button", { name: /^Send$/i })).toBeEnabled();
	});
});
