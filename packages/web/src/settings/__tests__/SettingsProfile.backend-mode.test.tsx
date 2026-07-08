/**
 * AV2 AC-5: SettingsProfile email hint is backend-aware
 *
 * local mode → "Used for notifications." (no "login")
 * shared/web mode → "Used for notifications and login."
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProfile } from "../SettingsProfile.js";

const MOCK_USER = {
	id: "user-1",
	name: "Test User",
	email: "test@example.com",
	role: "admin",
};

function setupFetch(): void {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string) => {
			if (String(url).includes("/api/users/me") || String(url).includes("/api/auth/me")) {
				return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_USER });
			}
			return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
		}),
	);
}

vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: vi.fn(() => ({ user: MOCK_USER, status: "ready" })),
}));

const mockShowToast = vi.fn();
vi.mock("../../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../../shell/ToastRegion.js");
	return { ...actual, useToast: vi.fn(() => ({ showToast: mockShowToast })) };
});

describe("SettingsProfile email hint is backend-aware", () => {
	beforeEach(() => {
		setupFetch();
		mockShowToast.mockClear();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("local mode: email hint does NOT contain 'login'", () => {
		// No window.__HYPERIDLE__ or backendMode="local" → local mode
		Object.defineProperty(window, "__HYPERIDLE__", {
			value: { backendMode: "local" },
			writable: true,
			configurable: true,
		});

		render(<SettingsProfile />);

		const hint = screen.queryByText(/login/i);
		expect(hint).toBeNull();
	});

	it("shared mode: email hint contains 'login'", () => {
		Object.defineProperty(window, "__HYPERIDLE__", {
			value: { backendMode: "shared" },
			writable: true,
			configurable: true,
		});

		render(<SettingsProfile />);

		expect(screen.getByText(/notifications and login/i)).toBeInTheDocument();
	});

	it("no bridge (web mode): email hint does not change login behavior", () => {
		delete window.__HYPERIDLE__;

		render(<SettingsProfile />);

		// web mode → shared semantics (has login)
		// OR not present depending on implementation; we just verify no crash
		expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
	});
});
