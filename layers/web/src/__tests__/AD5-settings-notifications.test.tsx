/**
 * AD5 — Settings Notifications Persistence (AC-3)
 *
 * @lore AF8: SettingsNotifications was rewritten in AF8 to be registry-driven
 * (uses useNotificationMute instead of useSettings + SERVER_KEY_MAP).
 * AD5 AC-3 is superseded by AF8 AC8/AC11.
 *
 * The tests below have been updated to match the AF8 behavior:
 * - Toggle ON/OFF maps to muted/un-muted state (useNotificationMute)
 * - No email-digests toggle (removed per AF8 AC11)
 * - No blocker-notifications/SERVER_KEY_MAP (replaced by NOTIFICATION_TYPES registry)
 * - No useSettings or save() calls in SettingsNotifications
 */

import { NOTIFICATION_TYPES } from "@hyperidle/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsNotifications } from "../settings/SettingsNotifications";

// Mock the mute hook used by AF8 SettingsNotifications
vi.mock("../hooks/useNotificationMute", () => ({
	useNotificationMute: vi.fn(),
}));

// Mock apiFetch
vi.mock("../services/api-fetch", () => ({
	apiFetch: vi.fn(),
}));

describe("AD5 — AC-3: SettingsNotifications persists via useNotificationMute (AF8 updated)", () => {
	let setMutedMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		setMutedMock = vi.fn().mockResolvedValue(undefined);
		const { useNotificationMute } = await import("../hooks/useNotificationMute");
		vi.mocked(useNotificationMute).mockReturnValue({
			mutedKeys: ["review_request"], // review_request is muted (OFF)
			setMuted: setMutedMock as unknown as (
				key: import("@hyperidle/shared").NotificationTypeKey,
				muted: boolean,
			) => Promise<void>,
			status: "ready",
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("initializes 'Review requests' toggle to muted state (OFF when muted)", async () => {
		render(<SettingsNotifications />);
		const reviewToggle = screen.getByRole("switch", { name: /review requests/i });
		expect(reviewToggle).not.toBeChecked();
	});

	it("initializes 'Blocker alerts' toggle as ON (not muted)", async () => {
		render(<SettingsNotifications />);
		const blockerToggle = screen.getByRole("switch", { name: /blocker alerts/i });
		expect(blockerToggle).toBeChecked();
	});

	it("calls setMuted when a toggle is clicked", async () => {
		const user = userEvent.setup();
		render(<SettingsNotifications />);

		const blockerToggle = screen.getByRole("switch", { name: /blocker alerts/i });
		await user.click(blockerToggle);

		await waitFor(() => {
			expect(setMutedMock).toHaveBeenCalled();
		});
	});

	it("does NOT render email-digests toggle (AF8 AC11: removed)", async () => {
		render(<SettingsNotifications />);
		const emailDigestsToggle = screen.queryByRole("switch", { name: /email digests/i });
		expect(emailDigestsToggle).toBeNull();
	});

	it("renders exactly NOTIFICATION_TYPES.length toggles", async () => {
		render(<SettingsNotifications />);
		const switches = screen.getAllByRole("switch");
		expect(switches).toHaveLength(NOTIFICATION_TYPES.length);
	});
});
