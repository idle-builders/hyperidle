/**
 * AD5 — Settings Notifications Persistence (AC-3)
 *
 * Tests that SettingsNotifications reads initial values from useSettings and
 * calls PATCH /api/settings when a toggle changes.
 *
 * Red phase: SettingsNotifications currently uses local useState only — it does
 * NOT call useSettings or persist changes. These tests will FAIL until
 * SettingsNotifications is wired to useSettings.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsNotifications } from "../settings/SettingsNotifications";

// The architecture says SettingsNotifications should call useSettings internally.
// We mock the module to control server-side values.
vi.mock("../hooks/useSettings", () => ({
	useSettings: vi.fn(),
}));

// Mock useHumanCount — AD3 AC-4 requires it; in tests we want all 4 toggles
// visible (non-solo mode), so return humanCount: null (fail-open = all shown).
vi.mock("../settings/useHumanCount", () => ({
	useHumanCount: vi.fn(() => ({ humanCount: null, loading: false })),
}));

// Mock apiFetch used by useSettings.save
vi.mock("../services/api-fetch", () => ({
	apiFetch: vi.fn(),
}));

type UseSettingsMock = {
	settings: {
		profile: { name: string; email: string; avatarUrl: string };
		teams: [];
		users: [];
		notifications: {
			reviewAlerts: boolean;
			costAlerts: boolean;
			blockerAlerts: boolean;
			quietHoursEnabled: boolean;
			quietHoursStart: string;
			quietHoursEnd: string;
			mutedTeams: string[];
		};
		appearance: { theme: "dark"; density: "auto" };
	} | null;
	status: "loading" | "ready" | "error";
	error: string | null;
	save: ReturnType<typeof vi.fn>;
	retry: ReturnType<typeof vi.fn>;
	data: null;
};

function makeSettings(
	notificationOverrides: Partial<NonNullable<UseSettingsMock["settings"]>["notifications"]> = {},
): UseSettingsMock["settings"] {
	return {
		profile: { name: "Test", email: "test@test.com", avatarUrl: "" },
		teams: [],
		users: [],
		notifications: {
			reviewAlerts: true,
			costAlerts: true,
			blockerAlerts: false,
			quietHoursEnabled: false,
			quietHoursStart: "22:00",
			quietHoursEnd: "08:00",
			mutedTeams: [],
			...notificationOverrides,
		},
		appearance: { theme: "dark", density: "auto" },
	};
}

describe("AD5 — AC-3: SettingsNotifications persists via useSettings", () => {
	let saveMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		saveMock = vi.fn().mockResolvedValue(undefined);

		const { useSettings } = await import("../hooks/useSettings");
		vi.mocked(useSettings).mockReturnValue({
			settings: makeSettings({
				reviewAlerts: false, // server value: OFF
				costAlerts: true,
				blockerAlerts: true,
			}),
			status: "ready",
			error: null,
			save: saveMock as unknown as (...args: unknown[]) => Promise<void>,
			retry: vi.fn(),
			data: null,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("initializes 'Review requests' toggle to server value (OFF when reviewAlerts=false)", async () => {
		render(<SettingsNotifications />);

		// Find the Review requests toggle — it should reflect the server value (off)
		const reviewToggle = screen.getByRole("switch", { name: /review requests/i });
		// Server value is reviewAlerts: false → toggle should be OFF
		expect(reviewToggle).not.toBeChecked();
	});

	it("initializes 'Cost alerts' toggle to server value (ON when costAlerts=true)", async () => {
		render(<SettingsNotifications />);

		const costToggle = screen.getByRole("switch", { name: /cost alerts/i });
		// Server value is costAlerts: true → toggle should be ON
		expect(costToggle).toBeChecked();
	});

	it("initializes 'Blocker notifications' toggle to server value (ON when blockerAlerts=true)", async () => {
		render(<SettingsNotifications />);

		const blockerToggle = screen.getByRole("switch", { name: /blocker notifications/i });
		// Server value is blockerAlerts: true → toggle should be ON
		expect(blockerToggle).toBeChecked();
	});

	it("calls save() with updated notifications when Review requests toggle is clicked", async () => {
		const user = userEvent.setup();
		render(<SettingsNotifications />);

		const reviewToggle = screen.getByRole("switch", { name: /review requests/i });
		await user.click(reviewToggle);

		await waitFor(() => {
			expect(saveMock).toHaveBeenCalledOnce();
		});

		// save() should receive updated settings with reviewAlerts: true (was false)
		const savedArg = saveMock.mock.calls[0]![0] as { notifications: { reviewAlerts: boolean } };
		expect(savedArg.notifications.reviewAlerts).toBe(true);
	});

	it("calls save() with updated notifications when Cost alerts toggle is clicked", async () => {
		const user = userEvent.setup();
		render(<SettingsNotifications />);

		const costToggle = screen.getByRole("switch", { name: /cost alerts/i });
		await user.click(costToggle);

		await waitFor(() => {
			expect(saveMock).toHaveBeenCalledOnce();
		});

		// save() should receive updated settings with costAlerts: false (was true)
		const savedArg = saveMock.mock.calls[0]![0] as { notifications: { costAlerts: boolean } };
		expect(savedArg.notifications.costAlerts).toBe(false);
	});

	it("does NOT call save() when Email digests toggle is clicked (local-only field)", async () => {
		const user = userEvent.setup();
		render(<SettingsNotifications />);

		const emailToggle = screen.getByRole("switch", { name: /email digests/i });
		await user.click(emailToggle);

		// Email digests has no server field — save must NOT be called
		await new Promise<void>((resolve) => setTimeout(resolve, 50));
		expect(saveMock).not.toHaveBeenCalled();
	});

	it("renders all four toggles regardless of server state", async () => {
		render(<SettingsNotifications />);

		expect(screen.getByRole("switch", { name: /review requests/i })).toBeInTheDocument();
		expect(screen.getByRole("switch", { name: /cost alerts/i })).toBeInTheDocument();
		expect(screen.getByRole("switch", { name: /blocker notifications/i })).toBeInTheDocument();
		expect(screen.getByRole("switch", { name: /email digests/i })).toBeInTheDocument();
	});
});
