/**
 * J3 — SettingsPanel overlay behavior.
 *
 * AC:
 * - Settings opens as overlay panel (z-40) with focus-trap.
 * - Closes on Esc and on an explicit close button (aria-label=Close settings).
 * - role="dialog", aria-modal="true", focusable content inside the trap.
 *
 * These assertions extend the SettingsPanel.test.tsx baseline without editing
 * the protected file.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { type SettingsData, SettingsPanel } from "../components/SettingsPanel";

const defaultSettings: SettingsData = {
	profile: { name: "Jane", email: "j@x.dev", avatarUrl: "" },
	products: [],
	agents: [],
	notifications: {
		reviewAlerts: true,
		costAlerts: true,
		blockerAlerts: false,
		quietHoursStart: "22:00",
		quietHoursEnd: "08:00",
		mutedProducts: [],
	},
	appearance: {
		density: "default",
		theme: "system",
		verdictDoubleClick: true,
		undoWindowSeconds: 8,
	},
};

const baseProps = {
	open: true,
	onClose: vi.fn(),
	onSave: vi.fn().mockResolvedValue(undefined),
	settings: defaultSettings,
};

describe("SettingsPanel overlay (J3)", () => {
	it("renders a dialog with aria-modal true", () => {
		render(<SettingsPanel {...baseProps} />);
		const dialog = screen.getByRole("dialog", { name: /settings/i });
		expect(dialog).toHaveAttribute("aria-modal", "true");
	});

	it("container carries z-40 so Command-K (z-50) can stack above it", () => {
		const { container } = render(<SettingsPanel {...baseProps} />);
		const overlay = container.querySelector(".modal.modal-open");
		expect(overlay).not.toBeNull();
		expect(overlay?.className).toMatch(/z-40/);
	});

	it("renders an explicit close button with an accessible label", async () => {
		const onClose = vi.fn();
		render(<SettingsPanel {...baseProps} onClose={onClose} />);
		const closeBtn = screen.getByRole("button", { name: /close settings/i });
		expect(closeBtn).toBeInTheDocument();
		const user = userEvent.setup();
		await user.click(closeBtn);
		expect(onClose).toHaveBeenCalled();
	});

	it("Escape triggers onClose via focus-trap deactivation", async () => {
		const onClose = vi.fn();
		render(<SettingsPanel {...baseProps} onClose={onClose} />);
		const user = userEvent.setup();
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalled();
	});
});
