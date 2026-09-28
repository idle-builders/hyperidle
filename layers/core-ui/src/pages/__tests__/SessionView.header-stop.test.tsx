/**
 * SessionView — the header Stop control.
 *
 * @lore: Stop button — terminal state arrives via useSessionActivity nudge, not the stop_session call result; assert from the nudge not the response
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));

vi.mock("../../services/call.js", () => ({
	call: callMock,
}));

import { SessionView } from "../../components/SessionView.js";

const IDENTITY = {
	agent: { id: "agent-1", name: "Agent", isAgent: true, isMe: false },
	viewer: { id: "viewer-1", name: "Viewer", isAgent: false, isMe: true },
	title: "A task",
	host: "Work",
};

describe("SessionView header Stop control", () => {
	beforeEach(() => {
		callMock.mockReset();
		callMock.mockResolvedValue({ ok: true, data: { session: {}, stopped: true } });
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("calls stop_session with the session id when clicked", async () => {
		render(
			<SessionView
				sessionId="sess-1"
				entries={[]}
				identity={IDENTITY}
				status="streaming"
				onOpen={() => {}}
				onSend={() => {}}
			/>,
		);

		const user = userEvent.setup();
		await user.click(screen.getByTestId("session-header-stop"));

		expect(callMock).toHaveBeenCalledWith("stop_session", { id: "sess-1" });
	});

	it("disables the Stop control once the session is no longer streaming", () => {
		render(
			<SessionView
				sessionId="sess-1"
				entries={[]}
				identity={IDENTITY}
				status="ended"
				onOpen={() => {}}
				onSend={() => {}}
			/>,
		);

		expect(screen.getByTestId("session-header-stop")).toBeDisabled();
	});

	it("renders no Stop control without a session id (story/test rendering with no live session)", () => {
		render(
			<SessionView
				entries={[]}
				identity={IDENTITY}
				status="ended"
				onOpen={() => {}}
				onSend={() => {}}
			/>,
		);

		expect(screen.queryByTestId("session-header-stop")).not.toBeInTheDocument();
	});

	it("places the Stop control inside the header row, ahead of the identity chip — not under the split pane's floating controls", () => {
		render(
			<SessionView
				sessionId="sess-1"
				entries={[]}
				identity={IDENTITY}
				status="streaming"
				onOpen={() => {}}
				onSend={() => {}}
			/>,
		);

		const stop = screen.getByTestId("session-header-stop");
		const identityChip = screen.getByTestId("session-identity-chip");

		// The Stop control lives in the header's own row (same flow container as
		// the identity chip), not in a separately-positioned overlay.
		expect(stop.parentElement).toBe(identityChip.parentElement);

		// It sits BEFORE the identity chip in DOM order — away from the header's
		// trailing edge, which is exactly where the SplitView's floating
		// expand/close controls are absolutely positioned over the destination
		// pane's top-right corner.
		expect(stop.compareDocumentPosition(identityChip) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
	});
});
