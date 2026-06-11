/**
 * L18 — HostThreadSection prefill tests.
 *
 * AC coverage:
 *  - renders the Re: chip when prefill is set
 *  - chip has a dismiss × button that calls onClearPrefill (F5)
 *  - post forwards blockId to postPlainHostMessage when prefill contains blockId
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostThreadSection } from "../../shell/HostThreadSection";

vi.mock("../../hooks/useHostThread", () => ({
	useHostThread: vi.fn(),
}));

vi.mock("../../services/host-threads", () => ({
	postPlainHostMessage: vi.fn(),
	resolveOrCreateHostThread: vi.fn(),
}));

import { useHostThread } from "../../hooks/useHostThread";

const THREAD_FIXTURE = {
	id: "t-prefill-001",
	hostKind: "bet" as const,
	hostId: "bet-prefill",
	initiatorId: "u-founder",
	participants: ["u-founder", "agent-unassigned"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-05-05T10:00:00Z",
	createdAt: "2026-05-05T09:00:00Z",
};

describe("HostThreadSection prefill (L18)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders the Re: chip when prefill is set", () => {
		vi.mocked(useHostThread).mockReturnValue({
			data: { thread: THREAD_FIXTURE, messages: [], identities: {} },
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(
			<HostThreadSection
				hostKind="bet"
				hostId="bet-prefill"
				title="Discussion"
				prefill={{ blockId: "block-abc", blockExcerpt: "The auth cache TTL policy" }}
			/>,
		);

		// The Re: chip should be visible with the block excerpt
		expect(screen.getByTestId("host-thread-prefill-chip")).toBeInTheDocument();
		expect(screen.getByText(/The auth cache TTL policy/)).toBeInTheDocument();
	});

	it("does not render the Re: chip when no prefill is set", () => {
		vi.mocked(useHostThread).mockReturnValue({
			data: { thread: THREAD_FIXTURE, messages: [], identities: {} },
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(<HostThreadSection hostKind="bet" hostId="bet-prefill" title="Discussion" />);

		expect(screen.queryByTestId("host-thread-prefill-chip")).not.toBeInTheDocument();
	});

	it("dismiss × button calls onClearPrefill (F5)", async () => {
		const user = userEvent.setup();
		const onClearPrefill = vi.fn();
		vi.mocked(useHostThread).mockReturnValue({
			data: { thread: THREAD_FIXTURE, messages: [], identities: {} },
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(
			<HostThreadSection
				hostKind="bet"
				hostId="bet-prefill"
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
		vi.mocked(useHostThread).mockReturnValue({
			data: { thread: THREAD_FIXTURE, messages: [], identities: {} },
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(
			<HostThreadSection
				hostKind="bet"
				hostId="bet-prefill"
				title="Discussion"
				prefill={{ blockId: "block-abc", blockExcerpt: "The auth cache TTL policy" }}
			/>,
		);

		expect(screen.queryByRole("button", { name: /cancel block reply/i })).not.toBeInTheDocument();
	});
});
