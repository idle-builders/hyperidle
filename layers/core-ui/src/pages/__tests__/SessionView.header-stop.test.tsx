/**
 * SessionView — the header Stop control.
 *
 * @lore BC6: `stop_session` is one of the five declarations the governance
 * rule `actions-projected` (clause 1) wants a real `call()` site for under
 * `layers/core-ui/src`. The header Stop button is that site: it calls
 * `call("stop_session", { id })` directly, disabled once the session is no
 * longer streaming (architecture.md §12 F1 — the response is the pre-stop
 * row, never asserted as "stopped" here; the terminal state arrives by the
 * session's nudge, which is `useSessionActivity`'s concern, not this test's).
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

describe("SessionView header Stop control (BC6)", () => {
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
});
