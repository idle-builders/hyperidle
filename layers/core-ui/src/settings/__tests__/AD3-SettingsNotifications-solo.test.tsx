/**
 * AD3 — AC-4: SettingsNotifications solo toggle filtering.
 *
 * @lore AF8: The solo toggle filtering was removed in AF8. SettingsNotifications
 * now renders all NOTIFICATION_TYPES entries regardless of humanCount.
 * The old filter logic (solo: show 2 toggles, multi: show 4) was based on a
 * hardcoded NOTIFICATION_SETTINGS array that no longer exists.
 * AF8 AC11 replaces this with a registry-driven approach using NOTIFICATION_TYPES.
 *
 * These tests now verify the AF8 behavior: all registry types always visible,
 * regardless of humanCount.
 */

import { NOTIFICATION_TYPES } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the mute hook
vi.mock("../../hooks/useNotificationMute", () => ({
	useNotificationMute: vi.fn(() => ({
		mutedKeys: [],
		setMuted: vi.fn().mockResolvedValue(undefined),
		status: "ready",
	})),
}));

// Mock Toggle to keep tests focused on which toggles render
vi.mock("@hyperidle/design-system", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/design-system")>();
	return {
		...original,
		Toggle: ({
			label,
		}: {
			label: string;
			on?: boolean;
			onChange?: (on: boolean) => void;
			description?: string;
		}) => <div data-testid={`toggle-${label.toLowerCase().replace(/\s+/g, "-")}`}>{label}</div>,
	};
});

import { SettingsNotifications } from "../SettingsNotifications";

describe("AD3 AC-4: SettingsNotifications — AF8 registry-driven (solo filter removed)", () => {
	beforeEach(async () => {
		// Reset mute mock to default (nothing muted)
		const { useNotificationMute } = await import("../../hooks/useNotificationMute");
		vi.mocked(useNotificationMute).mockReturnValue({
			mutedKeys: [],
			setMuted: vi.fn().mockResolvedValue(undefined),
			status: "ready",
		});
	});

	it("shows all registry toggles regardless of user count (no solo filter)", async () => {
		render(<SettingsNotifications />);

		for (const type of NOTIFICATION_TYPES) {
			expect(screen.getByText(type.label)).toBeInTheDocument();
		}
	});

	it("shows all registry toggles when humanCount = 2 (multi-user)", async () => {
		render(<SettingsNotifications />);

		expect(screen.getByText("Review requests")).toBeInTheDocument();
		expect(screen.getByText("Blocker alerts")).toBeInTheDocument();
	});

	it("fail-open: shows all toggles during loading (humanCount = null, loading = true)", async () => {
		render(<SettingsNotifications />);

		for (const type of NOTIFICATION_TYPES) {
			expect(screen.getByText(type.label)).toBeInTheDocument();
		}
	});

	it("fail-open: shows all toggles on error (humanCount = null, loading = false)", async () => {
		render(<SettingsNotifications />);

		for (const type of NOTIFICATION_TYPES) {
			expect(screen.getByText(type.label)).toBeInTheDocument();
		}
	});

	it("shows all registry toggles when humanCount = 10 (large team)", async () => {
		render(<SettingsNotifications />);

		for (const type of NOTIFICATION_TYPES) {
			expect(screen.getByText(type.label)).toBeInTheDocument();
		}
	});

	it("does NOT render email-digests toggle (removed per AF8 AC11)", async () => {
		render(<SettingsNotifications />);
		expect(screen.queryByText("Email digests")).not.toBeInTheDocument();
	});

	it("does NOT render Blocker notifications toggle (renamed to Blocker alerts)", async () => {
		render(<SettingsNotifications />);
		// Old label was "Blocker notifications" — now "Blocker alerts"
		expect(screen.queryByText("Blocker notifications")).not.toBeInTheDocument();
		expect(screen.getByText("Blocker alerts")).toBeInTheDocument();
	});
});
