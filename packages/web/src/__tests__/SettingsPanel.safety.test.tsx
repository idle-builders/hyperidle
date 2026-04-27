/**
 * L7 — Settings → Safety tab (red phase).
 *
 * Pins the AC from `docs/work-packages/TRACK-L.md` L7 + plan §5:
 *   - Safety tab renders when activeTab='safety'.
 *   - Includes a factory-pause control + kill-switch button.
 *   - Lists recent recovery_audit rows.
 *   - Pause button opens KillSwitchDialog (type-to-confirm OR press-and-hold).
 *   - Empty reason blocks submit.
 *   - After resume, the paused banner clears.
 *
 * These tests MUST fail today: there is no 'safety' tab, no SafetyTab
 * sub-component, no KillSwitchDialog wiring in SettingsPanel.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SettingsData, SettingsPanel } from "../components/SettingsPanel";

function defaultSettings(): SettingsData {
	return {
		profile: { name: "Jane", email: "jane@x.dev", avatarUrl: "" },
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
		appearance: {
			density: "comfortable",
			theme: "system",
			verdictDoubleClick: true,
			undoWindowSeconds: 8,
		},
		safety: {
			killSwitchConfirmMode: "press_hold",
		},
	};
}

describe("L7 — SettingsPanel Safety tab", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});
	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
	});

	function makeProps(extra?: { onTriggerKillSwitch?: () => void }) {
		return {
			open: true,
			onClose: vi.fn(),
			onSave: vi.fn().mockResolvedValue(undefined),
			onTriggerKillSwitch: extra?.onTriggerKillSwitch ?? vi.fn(),
		};
	}

	const baseProps = makeProps();

	it("renders the Safety tab in the tab list", () => {
		render(<SettingsPanel {...baseProps} settings={defaultSettings()} />);
		expect(screen.getByRole("tab", { name: /safety/i })).toBeInTheDocument();
	});

	it("Safety tab includes the Pause Factory button", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...baseProps} settings={defaultSettings()} />);
		await user.click(screen.getByRole("tab", { name: /safety/i }));
		expect(screen.getByRole("button", { name: /pause factory/i })).toBeInTheDocument();
	});

	it("Safety tab shows the recent recovery audit rows region", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...baseProps} settings={defaultSettings()} />);
		await user.click(screen.getByRole("tab", { name: /safety/i }));
		expect(
			screen.getByRole("region", { name: /recent recovery actions|recovery history/i }),
		).toBeInTheDocument();
	});

	it("Pause Factory button delegates to AppShell's kill-switch trigger", async () => {
		// L7 (S4): the AppShell-level KillSwitchDialog owns the pause flow + audit
		// write, so the Settings → Safety entry point delegates via
		// `onTriggerKillSwitch` instead of mounting its own dialog.
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onTriggerKillSwitch = vi.fn();
		const props = makeProps({ onTriggerKillSwitch });
		render(<SettingsPanel {...props} settings={defaultSettings()} />);
		await user.click(screen.getByRole("tab", { name: /safety/i }));
		await user.click(screen.getByRole("button", { name: /pause factory/i }));
		expect(onTriggerKillSwitch).toHaveBeenCalledTimes(1);
	});

	it("offers a confirmation-mode preference (type_name | press_hold)", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<SettingsPanel {...baseProps} settings={defaultSettings()} />);
		await user.click(screen.getByRole("tab", { name: /safety/i }));
		// Either as a select or a pair of radios — assert both labels are reachable.
		expect(screen.getByText(/type.*name/i)).toBeInTheDocument();
		expect(screen.getByText(/press.*hold/i)).toBeInTheDocument();
	});

	it("L7 (S4): confirmMode change propagates into SettingsData on save", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(<SettingsPanel {...makeProps()} onSave={onSave} settings={defaultSettings()} />);
		await user.click(screen.getByRole("tab", { name: /safety/i }));
		// Switch from press_hold (default) to type_name.
		await user.click(screen.getByRole("radio", { name: /type.*name/i }));
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(onSave).toHaveBeenCalledTimes(1);
		const saved = onSave.mock.calls[0][0] as SettingsData;
		expect(saved.safety.killSwitchConfirmMode).toBe("type_name");
	});
});
