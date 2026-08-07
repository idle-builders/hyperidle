/**
 * AF8 — Settings notification type-list component tests (RED phase)
 *
 * Covers:
 *   AC8  — Settings renders one Toggle per NOTIFICATION_TYPES registry entry
 *   AC11 — Old hardcoded toggles (email-digests, solo-filter) are gone;
 *           registry-driven toggles render
 */

import { NOTIFICATION_TYPES } from "@hyperidle/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsNotifications } from "../settings/SettingsNotifications.js";

// Mock the mute API calls used by SettingsNotifications
vi.mock("../hooks/useNotificationMute", () => ({
	useNotificationMute: vi.fn(),
}));

// Also mock apiFetch for any direct calls
vi.mock("../services/api-fetch", () => ({
	apiFetch: vi.fn(),
}));

describe("AF8 AC8 — Settings type-list renders registry entries", () => {
	beforeEach(async () => {
		const { useNotificationMute } = await import("../hooks/useNotificationMute");
		vi.mocked(useNotificationMute).mockReturnValue({
			mutedKeys: [],
			setMuted: vi.fn().mockResolvedValue(undefined),
			status: "ready",
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders one Toggle per NOTIFICATION_TYPES entry", async () => {
		render(<SettingsNotifications />);

		for (const type of NOTIFICATION_TYPES) {
			// Each type's label should appear as a Toggle
			expect(screen.getByRole("switch", { name: new RegExp(type.label, "i") })).toBeInTheDocument();
		}
	});

	it("renders review_request toggle", async () => {
		render(<SettingsNotifications />);
		expect(screen.getByRole("switch", { name: /review requests/i })).toBeInTheDocument();
	});

	it("renders blocker_alert toggle", async () => {
		render(<SettingsNotifications />);
		expect(screen.getByRole("switch", { name: /blocker alerts/i })).toBeInTheDocument();
	});

	// @lore AU21 Increment 14a: "renders cost_alert toggle" is HARD-DELETED —
	// the cost_alert notification type no longer exists, no replacement.
});

describe("AF8 AC11 — Old hardcoded toggles removed from Settings", () => {
	beforeEach(async () => {
		const { useNotificationMute } = await import("../hooks/useNotificationMute");
		vi.mocked(useNotificationMute).mockReturnValue({
			mutedKeys: [],
			setMuted: vi.fn().mockResolvedValue(undefined),
			status: "ready",
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("does NOT render email-digests toggle (digest is an egress mode, not a type)", async () => {
		render(<SettingsNotifications />);

		// email-digests must NOT exist in AF8 Settings
		const emailDigestsToggle = screen.queryByRole("switch", { name: /email digests/i });
		expect(emailDigestsToggle).toBeNull();
	});

	it("renders exactly NOTIFICATION_TYPES.length toggles (no extras)", async () => {
		render(<SettingsNotifications />);
		const switches = screen.getAllByRole("switch");
		expect(switches).toHaveLength(NOTIFICATION_TYPES.length);
	});

	it("section intro text is present", async () => {
		render(<SettingsNotifications />);
		// Section intro per approved.md design
		expect(screen.getByText(/each type below is a real notification source/i)).toBeInTheDocument();
	});
});

describe("AF8 AC8/11 — Settings toggle behavior", () => {
	beforeEach(async () => {
		const { useNotificationMute } = await import("../hooks/useNotificationMute");
		vi.mocked(useNotificationMute).mockReturnValue({
			mutedKeys: [],
			setMuted: vi.fn().mockResolvedValue(undefined),
			status: "ready",
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("muted type shows toggle as OFF (un-checked)", async () => {
		const { useNotificationMute } = await import("../hooks/useNotificationMute");
		vi.mocked(useNotificationMute).mockReturnValue({
			mutedKeys: ["review_request"],
			setMuted: vi.fn().mockResolvedValue(undefined),
			status: "ready",
		});

		render(<SettingsNotifications />);

		const reviewToggle = screen.getByRole("switch", { name: /review requests/i });
		expect(reviewToggle).not.toBeChecked();
	});

	it("un-muted type shows toggle as ON (checked)", async () => {
		render(<SettingsNotifications />);

		const reviewToggle = screen.getByRole("switch", { name: /review requests/i });
		expect(reviewToggle).toBeChecked();
	});

	it("clicking a toggle calls setMuted with the correct key and value", async () => {
		const setMutedMock = vi.fn().mockResolvedValue(undefined);
		const { useNotificationMute } = await import("../hooks/useNotificationMute");
		vi.mocked(useNotificationMute).mockReturnValue({
			mutedKeys: [],
			setMuted: setMutedMock,
			status: "ready",
		});

		const user = userEvent.setup();
		render(<SettingsNotifications />);

		const reviewToggle = screen.getByRole("switch", { name: /review requests/i });
		await user.click(reviewToggle);

		await waitFor(() => {
			expect(setMutedMock).toHaveBeenCalledWith("review_request", true);
		});
	});
});
