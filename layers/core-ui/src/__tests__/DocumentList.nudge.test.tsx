/**
 * BC4 architecture.md §7/§9: DocumentList refreshes on a websocket nudge from
 * the `documents` topic — through `useDocuments`, not a page-local
 * subscription. This proves the wiring end to end at the page, not just
 * inside the hook (`useDocuments.test.tsx` already proves the hook alone).
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { subscribeMock, unsubscribeMock, callMock } = vi.hoisted(() => {
	const unsubscribeMock = vi.fn();
	const subscribeMock = vi.fn().mockReturnValue(unsubscribeMock);
	const callMock = vi.fn();
	return { subscribeMock, unsubscribeMock, callMock };
});

vi.mock("../services/ws-client.js", () => ({
	getWsClient: () => ({ subscribe: subscribeMock }),
}));

vi.mock("../services/call.js", () => ({ call: callMock }));

import { DocumentList } from "../pages/DocumentList";

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<DocumentList />
		</MemoryRouter>,
	);
}

describe("DocumentList — websocket nudge re-runs the search", () => {
	beforeEach(() => {
		callMock.mockReset();
		callMock.mockResolvedValue({ ok: true, data: [] });
		subscribeMock.mockReset();
		subscribeMock.mockReturnValue(unsubscribeMock);
	});

	it("re-runs search_documents when the documents topic receives an update frame", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		renderPage();
		await screen.findByTestId("document-list-page");
		await waitFor(() =>
			expect(subscribeMock).toHaveBeenCalledWith("documents", expect.any(Function)),
		);

		const callCountBefore = callMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({ type: "update", topic: "documents" });
		});

		await waitFor(() => expect(callMock.mock.calls.length).toBeGreaterThan(callCountBefore));
	});
});
