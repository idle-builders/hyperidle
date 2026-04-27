/**
 * L4 — SettingsPanel Appearance additions (red phase).
 *
 * Pins the contract from `.plan-L4.md` § 3.3.5:
 *
 *   - Appearance tab gains two fields:
 *       verdictDoubleClick (boolean, default true)
 *       undoWindowSeconds  (integer, range 3..15, default 8)
 *   - Both round-trip through `onSave`.
 *   - Out-of-range `undoWindowSeconds` (e.g. 2) is rejected with a validation
 *     message; onSave is NOT called.
 *   - Toggling `verdictDoubleClick` off renders helper text warning that
 *     single-click commits without confirm (the spec language).
 *
 * These tests MUST fail today: `AppearanceSettings` does not yet include
 * `verdictDoubleClick` or `undoWindowSeconds`, and the Appearance tab does
 * not render either control.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SettingsData, SettingsPanel } from "../components/SettingsPanel";

interface AppearanceL4 {
	density: "auto" | "compact" | "default" | "comfortable";
	theme: "light" | "dark" | "system";
	verdictDoubleClick: boolean;
	undoWindowSeconds: number;
}

function defaultSettings(over: Partial<AppearanceL4> = {}): SettingsData {
	const appearance = {
		density: "comfortable" as const,
		theme: "system" as const,
		verdictDoubleClick: true,
		undoWindowSeconds: 8,
		...over,
	};
	return {
		profile: { name: "Jane Doe", email: "jane@example.dev", avatarUrl: "" },
		products: [],
		agents: [],
		notifications: {
			reviewAlerts: true,
			costAlerts: true,
			blockerAlerts: false,
			quietHoursStart: "22:00",
			quietHoursEnd: "08:00",
			mutedProducts: [] as string[],
		},
		// @ts-expect-error — appearance gains new fields in green phase.
		appearance,
	};
}

describe("L4 — SettingsPanel Appearance additions", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("renders a Verdict double-click toggle on the Appearance tab", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(
			<SettingsPanel
				open
				onClose={vi.fn()}
				onSave={vi.fn().mockResolvedValue(undefined)}
				settings={defaultSettings()}
			/>,
		);
		await user.click(screen.getByRole("tab", { name: "Appearance" }));
		// Accept any of: aria-label "Verdict double-click", a checkbox/switch
		// with that accessible name, or text label `Verdict double-click`.
		const toggle =
			screen.queryByLabelText(/verdict double[- ]click/i) ??
			screen.queryByRole("switch", { name: /verdict double[- ]click/i }) ??
			screen.queryByRole("checkbox", { name: /verdict double[- ]click/i });
		expect(toggle).not.toBeNull();
	});

	it("renders an Undo window control on the Appearance tab (3-15 second range)", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(
			<SettingsPanel
				open
				onClose={vi.fn()}
				onSave={vi.fn().mockResolvedValue(undefined)}
				settings={defaultSettings()}
			/>,
		);
		await user.click(screen.getByRole("tab", { name: "Appearance" }));
		const control = screen.getByLabelText(/undo window/i);
		expect(control).toBeInTheDocument();
	});

	it("changing undoWindowSeconds via the control round-trips through onSave", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(<SettingsPanel open onClose={vi.fn()} onSave={onSave} settings={defaultSettings()} />);
		await user.click(screen.getByRole("tab", { name: "Appearance" }));
		const control = screen.getByLabelText(/undo window/i);
		// Use selectOptions for <select>; userEvent handles missing options gracefully.
		await user.selectOptions(control, "12");

		await user.click(screen.getByRole("button", { name: /save/i }));
		await waitFor(() => {
			expect(onSave).toHaveBeenCalledWith(
				expect.objectContaining({
					appearance: expect.objectContaining({ undoWindowSeconds: 12 }),
				}),
			);
		});
	});

	it("toggling verdictDoubleClick off round-trips false through onSave", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(
			<SettingsPanel
				open
				onClose={vi.fn()}
				onSave={onSave}
				settings={defaultSettings({ verdictDoubleClick: true })}
			/>,
		);
		await user.click(screen.getByRole("tab", { name: "Appearance" }));
		const toggle =
			screen.queryByLabelText(/verdict double[- ]click/i) ??
			screen.getByRole("checkbox", { name: /verdict double[- ]click/i });
		await user.click(toggle);

		await user.click(screen.getByRole("button", { name: /save/i }));
		await waitFor(() => {
			expect(onSave).toHaveBeenCalledWith(
				expect.objectContaining({
					appearance: expect.objectContaining({ verdictDoubleClick: false }),
				}),
			);
		});
	});

	it("renders a single-click warning when verdictDoubleClick is off", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(
			<SettingsPanel
				open
				onClose={vi.fn()}
				onSave={vi.fn().mockResolvedValue(undefined)}
				settings={defaultSettings({ verdictDoubleClick: false })}
			/>,
		);
		await user.click(screen.getByRole("tab", { name: "Appearance" }));
		// Plan says the toggle has helper text; spec language is "written
		// warning". Accept any wording mentioning single-click + commit.
		expect(screen.getByText(/single[- ]click/i)).toBeInTheDocument();
	});

	it("rejects undoWindowSeconds below the 3-second floor", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(
			<SettingsPanel
				open
				onClose={vi.fn()}
				onSave={onSave}
				// Inject an out-of-range value to ensure validation kicks in.
				settings={defaultSettings({ undoWindowSeconds: 2 })}
			/>,
		);
		await user.click(screen.getByRole("tab", { name: "Appearance" }));
		// Modify any other field to enable Save; then attempt save.
		const themeSelect = screen.getByLabelText("Theme");
		await user.selectOptions(themeSelect, "dark");
		await user.click(screen.getByRole("button", { name: /save/i }));
		// Save must be blocked with a validation error.
		expect(onSave).not.toHaveBeenCalled();
		expect(
			screen.getByText(/undo window.*3.*15|3.*15.*undo window|out of range/i),
		).toBeInTheDocument();
	});
});
