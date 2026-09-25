/**
 * useCurrentUser hook: fetches the caller's own row via `open_user({})`,
 * returns { user, status, error, retry } (A10 shape unchanged).
 *
 * @lore BC5 T9: the door swap — `call("open_user", {})` replaces
 * `apiFetch("/api/auth/me")`. `call` is mocked directly (the door), the same
 * idiom SettingsPlugins/ScopeChangeDialog use.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));

vi.mock("../../services/call.js", () => ({ call: callMock }));

import { useCurrentUser } from "../../hooks/useCurrentUser";

function userView(user: Record<string, unknown> | null): {
	ok: true;
	data: Record<string, unknown>;
} {
	return {
		ok: true,
		data: {
			user,
			runsOn: [],
			runConfig: null,
			documentIds: [],
			folders: [],
			subscriptions: [],
			connections: null,
			inbox: null,
		},
	};
}

describe("useCurrentUser", () => {
	beforeEach(() => {
		callMock.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state", () => {
		callMock.mockImplementation(() => new Promise(() => {})); // never resolves
		const { result } = renderHook(() => useCurrentUser());
		expect(result.current.status).toBe("loading");
		expect(result.current.user).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("calls open_user with no id", async () => {
		callMock.mockResolvedValueOnce(
			userView({
				id: "test-user-1",
				name: "Test User",
				email: "test@hyperidle.dev",
				avatarUrl: null,
				team: null,
			}),
		);
		renderHook(() => useCurrentUser());
		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("open_user", {});
		});
	});

	it("returns user object on success", async () => {
		callMock.mockResolvedValueOnce(
			userView({
				id: "test-user-1",
				name: "Test User",
				email: "test@hyperidle.dev",
				avatarUrl: null,
				team: null,
			}),
		);

		const { result } = renderHook(() => useCurrentUser());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		expect(result.current.user?.id).toBe("test-user-1");
		expect(result.current.user?.name).toBe("Test User");
		expect(result.current.user?.email).toBe("test@hyperidle.dev");
		expect(result.current.user?.avatarUrl).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("returns error status when the action fails", async () => {
		callMock.mockResolvedValueOnce({ ok: false, problems: [{ code: "not_found", message: "no" }] });

		const { result } = renderHook(() => useCurrentUser());

		await waitFor(() => {
			expect(result.current.status).toBe("error");
		});

		expect(result.current.user).toBeNull();
		expect(result.current.error).not.toBeNull();
	});

	it("exposes retry() that re-fetches after an error", async () => {
		callMock.mockRejectedValueOnce(new Error("Network error"));
		callMock.mockResolvedValueOnce(
			userView({
				id: "recovered-user",
				name: "Recovered",
				email: "recovered@hyperidle.dev",
				avatarUrl: null,
				team: null,
			}),
		);

		const { result } = renderHook(() => useCurrentUser());

		await waitFor(() => {
			expect(result.current.status).toBe("error");
		});

		result.current.retry();

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});
		expect(result.current.user?.id).toBe("recovered-user");
	});

	it("normalizes a null team to an undefined teamId", async () => {
		callMock.mockResolvedValueOnce(
			userView({
				id: "test-user-1",
				name: "Test User",
				email: "test@hyperidle.dev",
				avatarUrl: null,
				team: null,
			}),
		);

		const { result } = renderHook(() => useCurrentUser());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		expect(result.current.user?.teamId).toBeUndefined();
	});

	it("carries a real teamId through from user.team.id", async () => {
		callMock.mockResolvedValueOnce(
			userView({
				id: "test-user-1",
				name: "Test User",
				email: "test@hyperidle.dev",
				avatarUrl: null,
				team: { id: "t1", name: "Core" },
			}),
		);

		const { result } = renderHook(() => useCurrentUser());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		expect(result.current.user?.teamId).toBe("t1");
	});
});
