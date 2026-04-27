/**
 * L7 — FactoryPausedBanner component (red phase).
 *
 * Pins AC8 from `docs/work-packages/TRACK-L.md` L7:
 *   "factory-wide banner visible on every page while paused"
 *
 *   - Renders when paused; hidden otherwise.
 *   - Shows paused-by actor + reason + relative time.
 *   - Resume button opens a confirm dialog.
 *
 * These tests MUST fail today: FactoryPausedBanner does not exist.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FactoryPausedBanner } from "../components/FactoryPausedBanner";

describe("L7 — FactoryPausedBanner", () => {
	it("renders nothing when factory is running", () => {
		const { container } = render(
			<FactoryPausedBanner
				state={{ paused: false, pausedBy: null, pausedAt: null, pausedReason: null }}
				onResume={vi.fn()}
			/>,
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders banner with paused-by actor + reason when paused", () => {
		render(
			<FactoryPausedBanner
				state={{
					paused: true,
					pausedBy: "actor:ceo",
					pausedAt: "2026-04-27T10:00:00.000Z",
					pausedReason: "spotted bad output",
				}}
				onResume={vi.fn()}
			/>,
		);
		expect(screen.getByRole("status")).toBeInTheDocument();
		expect(screen.getByText(/spotted bad output/i)).toBeInTheDocument();
		expect(screen.getByText(/ceo/i)).toBeInTheDocument();
	});

	it("Resume button is rendered when paused", () => {
		render(
			<FactoryPausedBanner
				state={{
					paused: true,
					pausedBy: "actor:ceo",
					pausedAt: "2026-04-27T10:00:00.000Z",
					pausedReason: "x",
				}}
				onResume={vi.fn()}
			/>,
		);
		expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument();
	});

	it("clicking Resume invokes onResume", async () => {
		const onResume = vi.fn();
		const user = userEvent.setup();
		render(
			<FactoryPausedBanner
				state={{
					paused: true,
					pausedBy: "actor:ceo",
					pausedAt: "2026-04-27T10:00:00.000Z",
					pausedReason: "x",
				}}
				onResume={onResume}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /resume/i }));
		expect(onResume).toHaveBeenCalled();
	});
});
