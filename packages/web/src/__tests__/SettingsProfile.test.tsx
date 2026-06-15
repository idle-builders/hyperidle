/**
 * P4 — SettingsProfile section component tests (Task 8, AC-13, AC-24, AC-25)
 *
 * AC-13: Profile section: name + email edits persist via PATCH /api/users/:id
 * AC-24: Settings save feedback via toast (toast "Profile saved" appears)
 * AC-25: Profile edits do NOT silently revert (bug fix)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProfile } from "../settings/SettingsProfile";

const DEFAULT_USER = {
	id: "u-founder-1",
	name: "Alice Founder",
	email: "alice@example.com",
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
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					json: async () => ({
						...DEFAULT_USER,
						name: "Updated Name",
					}),
				}),
			),
		);
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// AC-13: Name and email pre-filled from current user
	it("pre-fills name and email from current user", () => {
		render(<SettingsProfile />);

		expect(screen.getByLabelText(/display name/i)).toHaveValue("Alice Founder");
		expect(screen.getByLabelText(/^email/i)).toHaveValue("alice@example.com");
	});

	// AC-13: Save button calls PATCH /api/users/:id
	it("Save Profile button calls PATCH /api/users/:id with updated values", async () => {
		const user = userEvent.setup();
		render(<SettingsProfile />);

		const nameInput = screen.getByLabelText(/display name/i);
		await user.clear(nameInput);
		await user.type(nameInput, "Bob Updated");

		const saveBtn = screen.getByRole("button", { name: /save profile/i });
		await user.click(saveBtn);

		await waitFor(() => {
			const fetchMock = vi.mocked(fetch);
			const patchCall = fetchMock.mock.calls.find(
				([url, opts]) =>
					typeof url === "string" &&
					url.includes("/api/users/") &&
					(opts as RequestInit)?.method === "PATCH",
			);
			expect(patchCall).toBeDefined();
			const body = JSON.parse((patchCall?.[1] as RequestInit)?.body as string);
			expect(body.name).toBe("Bob Updated");
		});
	});

	// AC-24: Toast "Profile saved" on success
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

	// AC-24: Toast on error
	it("shows error toast when save fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() =>
				Promise.resolve({
					ok: false,
					status: 500,
					json: async () => ({ error: "Server error" }),
				}),
			),
		);

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

	// AC-25: Save button disabled when form is clean (no changes)
	it("Save Profile button is disabled when form matches saved values", () => {
		render(<SettingsProfile />);

		const saveBtn = screen.getByRole("button", { name: /save profile/i });
		expect(saveBtn).toBeDisabled();
	});

	// AC-25: Save button enabled when form is dirty
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
		});

		render(<SettingsProfile />);
		// Should not crash and should show some loading indicator
		expect(screen.queryByRole("button", { name: /save profile/i })).not.toBeInTheDocument();
		// AG7: SkeletonList renders role="status" for loading state
		expect(document.querySelector('[role="status"]')).toBeInTheDocument();
	});
});
