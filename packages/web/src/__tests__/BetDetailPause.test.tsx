/**
 * L7 — Mid-session pause UI on bet detail (red phase).
 *
 * Pins AC4 from `docs/work-packages/TRACK-L.md` L7:
 *   "bet detail and team detail pages get a Pause button per running
 *    agent session. Pausing freezes the session at its next checkpoint;
 *    resume is a separate verb."
 *
 *   - PauseSessionButton is rendered on each running session row.
 *   - Click opens a confirm dialog with type-to-confirm or hold.
 *   - After submit, row shows paused state.
 *   - Resume button appears in paused state.
 *
 * These tests MUST fail today: PauseSessionButton does not exist.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PauseSessionButton } from "../components/PauseSessionButton";

describe("L7 — PauseSessionButton (bet/team detail)", () => {
	it("renders 'Pause' when session state is running", () => {
		render(
			<PauseSessionButton
				session={{ id: "session-1", state: "active", agentName: "Builder" }}
				onPause={vi.fn()}
				onResume={vi.fn()}
			/>,
		);
		expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /resume/i })).not.toBeInTheDocument();
	});

	it("renders 'Resume' when session state is paused", () => {
		render(
			<PauseSessionButton
				session={{ id: "session-1", state: "paused", agentName: "Builder" }}
				onPause={vi.fn()}
				onResume={vi.fn()}
			/>,
		);
		expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^pause$/i })).not.toBeInTheDocument();
	});

	it("clicking Pause opens a confirmation dialog with reason input", async () => {
		const user = userEvent.setup();
		render(
			<PauseSessionButton
				session={{ id: "session-1", state: "active", agentName: "Builder" }}
				onPause={vi.fn()}
				onResume={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /pause/i }));
		expect(screen.getByRole("dialog", { name: /pause session/i })).toBeInTheDocument();
		expect(screen.getByLabelText(/reason|rationale/i)).toBeInTheDocument();
	});

	it("disabled while factory is paused (factory-resume must run first)", () => {
		render(
			<PauseSessionButton
				session={{ id: "session-1", state: "active", agentName: "Builder" }}
				onPause={vi.fn()}
				onResume={vi.fn()}
				factoryPaused={true}
			/>,
		);
		expect(screen.getByRole("button", { name: /pause/i })).toBeDisabled();
	});
});
