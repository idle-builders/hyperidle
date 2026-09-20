/**
 * L18 — HostThreadSection prefill tests.
 *
 * AC coverage:
 *  - renders the Re: chip when prefill is set
 *  - chip has a dismiss × button that calls onClearPrefill (F5)
 *
 * @lore BC3: re-pointed off the deleted `useHostThread`/`host-threads`
 * service onto `useThread` — posting now goes through `call("send_message")`
 * inside `HostThreadSection`'s own composer handler, not a mocked service.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostThreadSection } from "../../shell/HostThreadSection";

vi.mock("../../hooks/useThread.js", () => ({
	useThread: vi.fn(),
}));
vi.mock("../../hooks/useThreads.js", () => ({
	useThreads: vi.fn(),
}));

import { useThread } from "../../hooks/useThread.js";
import { useThreads } from "../../hooks/useThreads.js";

const THREAD_FIXTURE = {
	id: "t-prefill-001",
	hostKind: "team" as const,
	hostId: "team-prefill",
	initiatorId: "u-founder",
	members: ["u-founder", "agent-unassigned"],
	title: null,
	computedTitle: "Discussion",
	pinned: false,
	resolvedAt: null,
	deletedAt: null,
	lastActiveAt: "2026-05-05T10:00:00Z",
	createdAt: "2026-05-05T09:00:00Z",
};

function mockReadyEmptyThread(): void {
	vi.mocked(useThreads).mockReturnValue({
		status: "ready",
		threads: [],
		error: null,
		retry: vi.fn(),
	});
	vi.mocked(useThread).mockReturnValue({
		status: "ready",
		data: {
			thread: THREAD_FIXTURE,
			members: [],
			messages: [],
			headMessageId: null,
			hostTitle: null,
		},
		error: null,
		refresh: vi.fn(),
	});
}

describe("HostThreadSection prefill (L18)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders the Re: chip when prefill is set", () => {
		mockReadyEmptyThread();

		render(
			<HostThreadSection
				threadId="t-prefill-001"
				title="Discussion"
				prefill={{ blockId: "block-abc", blockExcerpt: "The auth cache TTL policy" }}
			/>,
		);

		// The Re: chip should be visible with the block excerpt
		expect(screen.getByTestId("host-thread-prefill-chip")).toBeInTheDocument();
		expect(screen.getByText(/The auth cache TTL policy/)).toBeInTheDocument();
	});

	it("does not render the Re: chip when no prefill is set", () => {
		mockReadyEmptyThread();

		render(<HostThreadSection threadId="t-prefill-001" title="Discussion" />);

		expect(screen.queryByTestId("host-thread-prefill-chip")).not.toBeInTheDocument();
	});

	it("dismiss × button calls onClearPrefill (F5)", async () => {
		const user = userEvent.setup();
		const onClearPrefill = vi.fn();
		mockReadyEmptyThread();

		render(
			<HostThreadSection
				threadId="t-prefill-001"
				title="Discussion"
				prefill={{ blockId: "block-abc", blockExcerpt: "The auth cache TTL policy" }}
				onClearPrefill={onClearPrefill}
			/>,
		);

		const dismissButton = screen.getByRole("button", { name: /cancel block reply/i });
		await user.click(dismissButton);

		expect(onClearPrefill).toHaveBeenCalledOnce();
	});

	it("does not render dismiss button when onClearPrefill is not provided", () => {
		mockReadyEmptyThread();

		render(
			<HostThreadSection
				threadId="t-prefill-001"
				title="Discussion"
				prefill={{ blockId: "block-abc", blockExcerpt: "The auth cache TTL policy" }}
			/>,
		);

		expect(screen.queryByRole("button", { name: /cancel block reply/i })).not.toBeInTheDocument();
	});
});
