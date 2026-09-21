/**
 * useDocument. One door: `call("open_document", { id })`, kept live by the
 * `document:<id>` websocket nudge. Mirrors `useThread.test.tsx`: `call` is
 * mocked directly, and the global no-op `ws-client` mock (test-setup.ts) is
 * overridden with a captureable spy so a simulated WS frame can be fired at
 * the subscribed handler.
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

import { useDocument } from "../useDocument.js";

function makeDocumentView() {
	return {
		document: {
			id: "doc-1",
			title: "A document",
			body: "body text",
			format: "markdown",
			status: "active" as const,
			slot: "ordinary" as const,
			scopeKind: "team" as const,
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
			as: "document" as const,
		},
		ancestors: [],
		children: [],
		siblings: [],
		scopeName: "Alpha team",
	};
}

describe("useDocument", () => {
	beforeEach(() => {
		callMock.mockReset();
		subscribeMock.mockReset();
		subscribeMock.mockReturnValue(unsubscribeMock);
		unsubscribeMock.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("returns idle with no call and no subscription when no id is given", () => {
		const { result } = renderHook(() => useDocument(undefined));

		expect(result.current.status).toBe("idle");
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
		expect(callMock).not.toHaveBeenCalled();
		expect(subscribeMock).not.toHaveBeenCalled();
	});

	it("loads once an id appears after starting idle", async () => {
		callMock.mockResolvedValue({ ok: true, data: makeDocumentView() });

		const { result, rerender } = renderHook(
			({ id }: { id: string | undefined }) => useDocument(id),
			{ initialProps: { id: undefined as string | undefined } },
		);

		expect(result.current.status).toBe("idle");
		expect(callMock).not.toHaveBeenCalled();

		rerender({ id: "doc-1" });

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(callMock).toHaveBeenCalledWith("open_document", { id: "doc-1" });
		expect(result.current.data?.document.id).toBe("doc-1");
	});

	it("calls open_document and returns the resolved data", async () => {
		callMock.mockResolvedValue({ ok: true, data: makeDocumentView() });

		const { result } = renderHook(() => useDocument("doc-1"));

		expect(callMock).toHaveBeenCalledWith("open_document", { id: "doc-1" });
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.data?.document.id).toBe("doc-1");
		expect(result.current.error).toBeNull();
	});

	it("surfaces problems from a refused call", async () => {
		callMock.mockResolvedValue({
			ok: false,
			problems: [{ code: "forbidden", message: "You cannot see this document." }],
		});

		const { result } = renderHook(() => useDocument("doc-1"));

		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.error).toBe("You cannot see this document.");
		expect(result.current.data).toBeNull();
	});

	it("returns not-found without an error message on a not_found problem", async () => {
		callMock.mockResolvedValue({
			ok: false,
			problems: [{ code: "not_found", message: "Document doc-1 not found." }],
		});

		const { result } = renderHook(() => useDocument("doc-1"));

		await waitFor(() => expect(result.current.status).toBe("not-found"));
		expect(result.current.error).toBeNull();
	});

	it("re-runs open_document exactly once on a document:<id> websocket frame", async () => {
		callMock.mockResolvedValue({ ok: true, data: makeDocumentView() });
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useDocument("doc-1"));
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(subscribeMock).toHaveBeenCalledWith("document:doc-1", expect.any(Function));

		const callCountBefore = callMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({ type: "update", topic: "document:doc-1" });
		});

		await waitFor(() => expect(callMock.mock.calls.length).toBe(callCountBefore + 1));
		// Exactly one re-run — not more from a duplicate subscription firing twice.
		expect(callMock.mock.calls.length).toBe(callCountBefore + 1);
	});

	it("does not re-run on a frame for a different topic", async () => {
		callMock.mockResolvedValue({ ok: true, data: makeDocumentView() });
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useDocument("doc-1"));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const callCountBefore = callMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({ type: "update", topic: "documents" });
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(callMock.mock.calls.length).toBe(callCountBefore);
	});

	it("unsubscribes on unmount", async () => {
		callMock.mockResolvedValue({ ok: true, data: makeDocumentView() });

		const { result, unmount } = renderHook(() => useDocument("doc-1"));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		expect(unsubscribeMock).not.toHaveBeenCalled();
		unmount();
		expect(unsubscribeMock).toHaveBeenCalledTimes(1);
	});
});
