/**
 * M3 RED — useCurrentUser hook: fetches /api/auth/me, returns user object (A10).
 *
 * These tests FAIL until:
 *  - layers/core-ui/src/hooks/useCurrentUser.ts is created
 *  - The hook fetches GET /api/auth/me and returns { user, status, error }
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentUser } from "../../hooks/useCurrentUser";

type AuthMeResponse = { id: string; name: string; email: string; avatarUrl: string | null };

function makeOkResponse(user: AuthMeResponse): Response {
	return new Response(JSON.stringify(user), { status: 200 });
}

function makeErrorResponse(status: number): Response {
	return new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }), { status });
}

describe("useCurrentUser (M3 A10)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state", () => {
		fetchSpy.mockImplementation(() => new Promise(() => {})); // Never resolves

		const { result } = renderHook(() => useCurrentUser());

		expect(result.current.status).toBe("loading");
		expect(result.current.user).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("returns user object on success", async () => {
		const user: AuthMeResponse = {
			id: "test-user-1",
			name: "Test User",
			email: "test@hyperidle.dev",
			avatarUrl: null,
		};
		fetchSpy.mockResolvedValueOnce(makeOkResponse(user));

		const { result } = renderHook(() => useCurrentUser());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		expect(result.current.user).not.toBeNull();
		expect(result.current.user?.id).toBe("test-user-1");
		expect(result.current.user?.name).toBe("Test User");
		expect(result.current.user?.email).toBe("test@hyperidle.dev");
		expect(result.current.user?.avatarUrl).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("fetches /api/auth/me endpoint", async () => {
		const user: AuthMeResponse = {
			id: "test-user-1",
			name: "Test User",
			email: "test@hyperidle.dev",
			avatarUrl: null,
		};
		fetchSpy.mockResolvedValueOnce(makeOkResponse(user));

		renderHook(() => useCurrentUser());

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalled();
		});

		const [url] = fetchSpy.mock.calls[0] as [string];
		expect(url).toContain("/api/auth/me");
	});

	it("returns error status on 401", async () => {
		fetchSpy.mockResolvedValueOnce(makeErrorResponse(401));

		const { result } = renderHook(() => useCurrentUser());

		await waitFor(() => {
			expect(result.current.status).toBe("error");
		});

		expect(result.current.user).toBeNull();
		expect(result.current.error).not.toBeNull();
	});

	it("exposes retry() that re-fetches after an error (NEW-24)", async () => {
		const user: AuthMeResponse = {
			id: "recovered-user",
			name: "Recovered",
			email: "recovered@hyperidle.dev",
			avatarUrl: null,
		};
		// First call: network failure. Second call (after retry): success.
		fetchSpy
			.mockRejectedValueOnce(new Error("Network error"))
			.mockResolvedValueOnce(makeOkResponse(user));

		const { result } = renderHook(() => useCurrentUser());

		await waitFor(() => {
			expect(result.current.status).toBe("error");
		});
		expect(typeof result.current.retry).toBe("function");

		result.current.retry();

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});
		expect(result.current.user?.id).toBe("recovered-user");
		expect(result.current.error).toBeNull();
	});

	it("BC4: normalizes a null teamId to undefined (no team)", async () => {
		const user = {
			id: "test-user-1",
			name: "Test User",
			email: "test@hyperidle.dev",
			avatarUrl: null,
			teamId: null,
		};
		fetchSpy.mockResolvedValueOnce(makeOkResponse(user as unknown as AuthMeResponse));

		const { result } = renderHook(() => useCurrentUser());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		expect(result.current.user?.teamId).toBeUndefined();
	});

	it("BC4: carries a real teamId through unchanged", async () => {
		const user = {
			id: "test-user-1",
			name: "Test User",
			email: "test@hyperidle.dev",
			avatarUrl: null,
			teamId: "t1",
		};
		fetchSpy.mockResolvedValueOnce(makeOkResponse(user as unknown as AuthMeResponse));

		const { result } = renderHook(() => useCurrentUser());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		expect(result.current.user?.teamId).toBe("t1");
	});

	it("returned user id is NOT the hardcoded 'u-founder' string", async () => {
		const user: AuthMeResponse = {
			id: "real-user-from-api",
			name: "Real User",
			email: "real@hyperidle.dev",
			avatarUrl: null,
		};
		fetchSpy.mockResolvedValueOnce(makeOkResponse(user));

		const { result } = renderHook(() => useCurrentUser());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		// The hook must NOT inject or default to "u-founder"
		expect(result.current.user?.id).not.toBe("u-founder");
	});
});
