/**
 * useDocuments. One door: `call("search_documents", filter)`, kept live by
 * the global `documents` websocket nudge. Mirrors `useThreads.test.tsx`:
 * `call` is mocked directly, and the global no-op `ws-client` mock
 * (test-setup.ts) is overridden with a captureable spy.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { subscribeMock, unsubscribeMock, callMock } = vi.hoisted(() => {
	const unsubscribeMock = vi.fn();
	const subscribeMock = vi.fn().mockReturnValue(unsubscribeMock);
	const callMock = vi.fn();
	return { subscribeMock, unsubscribeMock, callMock };
});

// Override the global no-op ws-client mock with a captureable spy.
vi.mock("../../services/ws-client.js", () => ({
	getWsClient: () => ({
		subscribe: subscribeMock,
	}),
}));

vi.mock("../../services/call.js", () => ({
	call: callMock,
}));

import { useDocuments } from "../useDocuments.js";

function makeDocumentRow(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "doc-1",
		title: "A document",
		body: "body text",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		scopeKind: "team",
		scopeId: "team-1",
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "u-founder",
		createdAt: "2026-09-01T00:00:00.000Z",
		updatedAt: "2026-09-01T00:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
		...overrides,
	};
}

describe("useDocuments", () => {
	beforeEach(() => {
		callMock.mockReset();
		subscribeMock.mockReset();
		subscribeMock.mockReturnValue(unsubscribeMock);
		unsubscribeMock.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("calls search_documents with the given filter and returns the resolved data", async () => {
		callMock.mockResolvedValue({ ok: true, data: [makeDocumentRow()] });

		const { result } = renderHook(() => useDocuments({ inTree: true }));

		expect(callMock).toHaveBeenCalledWith("search_documents", { inTree: true });
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.documents).toHaveLength(1);
		expect(result.current.error).toBeNull();
	});

	it("skips the call entirely when the filter is undefined", () => {
		const { result } = renderHook(() => useDocuments(undefined));

		expect(result.current.status).toBe("ready");
		expect(result.current.documents).toEqual([]);
		expect(callMock).not.toHaveBeenCalled();
	});

	it("surfaces problems from a refused call", async () => {
		callMock.mockResolvedValue({
			ok: false,
			problems: [{ code: "two_shapes", message: "Give either inTree or a parent, not both." }],
		});

		const { result } = renderHook(() => useDocuments({ inTree: true }));

		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.error).toBe("Give either inTree or a parent, not both.");
		expect(result.current.documents).toHaveLength(0);
	});

	it("re-runs search_documents exactly once on a documents websocket frame", async () => {
		callMock.mockResolvedValue({ ok: true, data: [makeDocumentRow()] });
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useDocuments({ inTree: true }));
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(subscribeMock).toHaveBeenCalledWith("documents", expect.any(Function));

		const callCountBefore = callMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({ type: "update", topic: "documents" });
		});

		await waitFor(() => expect(callMock.mock.calls.length).toBe(callCountBefore + 1));
		expect(callMock.mock.calls.length).toBe(callCountBefore + 1);
	});

	it("does not re-run on a frame for a different topic", async () => {
		callMock.mockResolvedValue({ ok: true, data: [makeDocumentRow()] });
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useDocuments({ inTree: true }));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const callCountBefore = callMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({ type: "update", topic: "document:doc-1" });
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(callMock.mock.calls.length).toBe(callCountBefore);
	});

	it("unsubscribes on unmount", async () => {
		callMock.mockResolvedValue({ ok: true, data: [makeDocumentRow()] });

		const { result, unmount } = renderHook(() => useDocuments({ inTree: true }));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		expect(unsubscribeMock).not.toHaveBeenCalled();
		unmount();
		expect(unsubscribeMock).toHaveBeenCalledTimes(1);
	});
});
