/**
 * L3 — useConversations hook tests.
 *
 * Covers:
 *  - Successful fetch parses the wire response into ThreadListEntry[].
 *  - Refetches on window `focus` and document `visibilitychange` (the
 *    L3 stop-gap for live updates; @lore in useConversations.ts:89).
 *  - Bad shape on the wire surfaces an error rather than silently empty.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConversations } from "../useConversations";

const VALID_THREAD = {
	id: "t1",
	kind: "review",
	pinned: 0,
	participants: [],
	routedToActorId: null,
	routedToActorRole: null,
	domainTag: null,
	createdAt: "2026-04-26T00:00:00.000Z",
	lastActivityAt: "2026-04-26T00:00:00.000Z",
	blocking: false,
	resolvedAt: null,
};

function makeFetchOk(body: unknown): typeof fetch {
	const fn = vi.fn(async () => ({
		ok: true,
		status: 200,
		json: async () => body,
	}));
	return fn as unknown as typeof fetch;
}

describe("useConversations", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = makeFetchOk({ threads: [VALID_THREAD] });
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("loads and exposes the threads from /api/conversations", async () => {
		const { result } = renderHook(() => useConversations());
		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});
		expect(result.current.threads).toHaveLength(1);
		expect(result.current.threads[0].id).toBe("t1");
	});

	it("refetches on window focus", async () => {
		const fetchSpy = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ threads: [VALID_THREAD] }),
		}));
		globalThis.fetch = fetchSpy as unknown as typeof fetch;
		const { result } = renderHook(() => useConversations());
		await waitFor(() => expect(result.current.loading).toBe(false));
		const initialCalls = fetchSpy.mock.calls.length;
		act(() => {
			window.dispatchEvent(new Event("focus"));
		});
		await waitFor(() => {
			expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialCalls);
		});
	});

	it("refetches on document visibilitychange when visible", async () => {
		const fetchSpy = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ threads: [VALID_THREAD] }),
		}));
		globalThis.fetch = fetchSpy as unknown as typeof fetch;
		const { result } = renderHook(() => useConversations());
		await waitFor(() => expect(result.current.loading).toBe(false));
		const initialCalls = fetchSpy.mock.calls.length;
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "visible",
		});
		act(() => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await waitFor(() => {
			expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialCalls);
		});
	});

	it("surfaces an error when the wire response shape is invalid", async () => {
		globalThis.fetch = makeFetchOk({ notThreads: [] });
		const { result } = renderHook(() => useConversations());
		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});
		expect(result.current.error).not.toBeNull();
		expect(result.current.threads).toHaveLength(0);
	});

	it("surfaces an error on HTTP failure", async () => {
		globalThis.fetch = vi.fn(async () => ({
			ok: false,
			status: 500,
			json: async () => ({}),
		})) as unknown as typeof fetch;
		const { result } = renderHook(() => useConversations());
		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});
		expect(result.current.error).not.toBeNull();
	});
});
