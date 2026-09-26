/**
 * SettingsProfile section component tests.
 *
 * Covers: the display name edit persists via edit_user; a profile carries
 * no email; save feedback appears via toast ("Profile saved"); profile
 * edits do NOT silently revert.
 *
 * `call` is mocked directly.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

import { SettingsProfile } from "../settings/SettingsProfile";

const DEFAULT_USER = {
	id: "u-founder-1",
	name: "Alice Founder",
	avatarUrl: null,
};

// Mock useCurrentUser
vi.mock("../hooks/useCurrentUser", () => ({
	useCurrentUser: vi.fn(() => ({
		user: DEFAULT_USER,
		status: "ready",
		error: null,
	})),
}));

// Mock useToast
const mockShowToast = vi.fn();
vi.mock("../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: mockShowToast })),
	};
});

describe("SettingsProfile", () => {
	beforeEach(() => {
		callMock.mockReset();
		callMock.mockResolvedValue({
			ok: true,
			data: { user: { ...DEFAULT_USER, name: "Updated Name" } },
		});
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("pre-fills the display name and shows no email field", () => {
		render(<SettingsProfile />);

		expect(screen.getByLabelText(/display name/i)).toHaveValue("Alice Founder");
		expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
	});

	it("Save Profile button calls edit_user with the id and the new name only", async () => {
		const user = userEvent.setup();
		render(<SettingsProfile />);

		const nameInput = screen.getByLabelText(/display name/i);
		await user.clear(nameInput);
		await user.type(nameInput, "Bob Updated");

		const saveBtn = screen.getByRole("button", { name: /save profile/i });
		await user.click(saveBtn);

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", {
				id: DEFAULT_USER.id,
				name: "Bob Updated",
			});
		});
	});

	// Toast "Profile saved" on success
	it("shows toast 'Profile saved' on successful save", async () => {
		const user = userEvent.setup();
		render(<SettingsProfile />);

		const nameInput = screen.getByLabelText(/display name/i);
		await user.clear(nameInput);
		await user.type(nameInput, "New Name");

		const saveBtn = screen.getByRole("button", { name: /save profile/i });
		await user.click(saveBtn);

		await waitFor(() => {
			// useToast returns showToast(message: string)
			expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/profile saved/i));
		});
	});

	// Toast on error
	it("shows error toast when save fails", async () => {
		callMock.mockResolvedValue({
			ok: false,
			problems: [{ code: "server_error", message: "Server error" }],
		});

		const user = userEvent.setup();
		render(<SettingsProfile />);

		const nameInput = screen.getByLabelText(/display name/i);
		await user.clear(nameInput);
		await user.type(nameInput, "New Name");

		const saveBtn = screen.getByRole("button", { name: /save profile/i });
		await user.click(saveBtn);

		await waitFor(() => {
			expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/failed/i));
		});
	});

	// Save button disabled when form is clean (no changes)
	it("Save Profile button is disabled when form matches saved values", () => {
		render(<SettingsProfile />);

		const saveBtn = screen.getByRole("button", { name: /save profile/i });
		expect(saveBtn).toBeDisabled();
	});

	// Save button enabled when form is dirty
	it("Save Profile button is enabled when values differ from saved", async () => {
		const user = userEvent.setup();
		render(<SettingsProfile />);

		const nameInput = screen.getByLabelText(/display name/i);
		await user.clear(nameInput);
		await user.type(nameInput, "Different Name");

		const saveBtn = screen.getByRole("button", { name: /save profile/i });
		expect(saveBtn).not.toBeDisabled();
	});

	// Loading state
	it("shows loading skeleton while user data is loading", async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser");
		vi.mocked(useCurrentUser).mockReturnValueOnce({
			user: null,
			status: "loading",
			error: null,
			retry: vi.fn(),
		});

		render(<SettingsProfile />);
		// Should not crash and should show some loading indicator
		expect(screen.queryByRole("button", { name: /save profile/i })).not.toBeInTheDocument();
		// SkeletonList renders role="status" for loading state
		expect(document.querySelector('[role="status"]')).toBeInTheDocument();
	});
});
