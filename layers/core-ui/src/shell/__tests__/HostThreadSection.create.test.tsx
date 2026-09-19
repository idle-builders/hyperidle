/**
 * HostThreadSection — BC3 review fix: create-on-first-post.
 *
 * @lore BC3 review: the other `HostThreadSection*.test.tsx` files mock
 * `useThread`/`useThreads` directly, which can never reach the
 * create-on-first-post branch — that branch depends on the hooks' own state
 * transition (search_threads finds nothing → post → adjust_thread creates →
 * search_threads retry finds it → useThread(id) mounts for the first time).
 * This file leaves both hooks real and mocks `call` instead, so the whole
 * chain actually runs.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostThreadSection } from "../HostThreadSection.js";

const callMock = vi.fn();
vi.mock("../../services/call.js", () => ({
	call: (...args: [string, unknown]) => callMock(...args),
}));

const HOST = { kind: "knowledge_item" as const, id: "k-create-001" };

function makeThreadRow(id: string) {
	return {
		id,
		hostKind: HOST.kind,
		hostId: HOST.id,
		initiatorId: "u-founder",
		members: ["u-founder"],
		title: null,
		computedTitle: "Discussion",
		pinned: false,
		resolvedAt: null,
		deletedAt: null,
		lastActiveAt: "2026-09-18T10:00:00Z",
		createdAt: "2026-09-18T10:00:00Z",
	};
}

function makeMessageRow(threadId: string, clientKey: string) {
	return {
		id: "msg-new-1",
		threadId,
		senderId: "u-founder",
		type: "plain" as const,
		payload: { text: "Hello there" },
		clientKey,
		blockId: null,
		resolvedAt: null,
		deletedAt: null,
		redactedAt: null,
		createdAt: "2026-09-18T10:01:00Z",
	};
}

describe("HostThreadSection — create-on-first-post (BC3 review)", () => {
	beforeEach(() => {
		callMock.mockReset();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders the section's empty state and the composer, not the skeleton, for a host with no thread", async () => {
		callMock.mockResolvedValue({ ok: true, data: [] });

		render(<HostThreadSection host={HOST} title="Discussion" />);

		await waitFor(() => expect(callMock).toHaveBeenCalledWith("search_threads", { host: HOST }));
		expect(screen.queryByTestId("host-thread-section-loading")).not.toBeInTheDocument();
		expect(screen.getByTestId("host-thread-section-empty")).toBeInTheDocument();
		expect(screen.getByTestId("composer-textarea")).toBeInTheDocument();
	});

	it("calls adjust_thread to create the thread, then send_message into it, in that order, and the message then shows", async () => {
		const user = userEvent.setup();
		const createdRow = makeThreadRow("new-thread-1");
		let searchCallCount = 0;

		callMock.mockImplementation(async (name: string, input: unknown) => {
			if (name === "search_threads") {
				searchCallCount += 1;
				if (searchCallCount === 1) return { ok: true, data: [] };
				return {
					ok: true,
					data: [{ ...createdRow, hasUnresolvedReview: false, lastMessagePreview: "Hello there" }],
				};
			}
			if (name === "adjust_thread") {
				return {
					ok: true,
					data: {
						thread: createdRow,
						members: [],
						messages: [],
						headMessageId: null,
						hostTitle: null,
					},
				};
			}
			if (name === "send_message") {
				const { clientKey } = input as { clientKey: string };
				return {
					ok: true,
					data: { message: makeMessageRow("new-thread-1", clientKey), thread: createdRow },
				};
			}
			if (name === "open_thread") {
				return {
					ok: true,
					data: {
						thread: createdRow,
						members: [],
						messages: [makeMessageRow("new-thread-1", "ck-does-not-matter")],
						headMessageId: null,
						hostTitle: null,
					},
				};
			}
			throw new Error(`unexpected call: ${name}`);
		});

		render(<HostThreadSection host={HOST} title="Discussion" />);

		await waitFor(() =>
			expect(screen.getByTestId("host-thread-section-empty")).toBeInTheDocument(),
		);

		await user.type(screen.getByTestId("composer-textarea"), "Hello there");
		await user.click(screen.getByRole("button", { name: "Send" }));

		await waitFor(() => expect(screen.getByText("Hello there")).toBeInTheDocument());

		const names = callMock.mock.calls.map((c) => c[0]);
		const adjustIndex = names.indexOf("adjust_thread");
		const sendIndex = names.indexOf("send_message");
		expect(adjustIndex).toBeGreaterThanOrEqual(0);
		expect(sendIndex).toBeGreaterThan(adjustIndex);
	});

	it("shows a refused adjust_thread's reason in the composer's alert, and sends nothing", async () => {
		const user = userEvent.setup();

		callMock.mockImplementation(async (name: string) => {
			if (name === "search_threads") return { ok: true, data: [] };
			if (name === "adjust_thread") {
				return {
					ok: false,
					problems: [{ code: "forbidden", message: "Cannot start a thread here." }],
				};
			}
			throw new Error(`unexpected call: ${name}`);
		});

		render(<HostThreadSection host={HOST} title="Discussion" />);

		await waitFor(() =>
			expect(screen.getByTestId("host-thread-section-empty")).toBeInTheDocument(),
		);

		await user.type(screen.getByTestId("composer-textarea"), "Hello there");
		await user.click(screen.getByRole("button", { name: "Send" }));

		await waitFor(() =>
			expect(screen.getByRole("alert")).toHaveTextContent("Cannot start a thread here."),
		);
		expect(callMock.mock.calls.some((c) => c[0] === "send_message")).toBe(false);
	});
});
