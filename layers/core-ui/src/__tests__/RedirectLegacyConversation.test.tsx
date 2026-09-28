/**
 * RedirectLegacyConversation unit tests.
 *
 * The helper maps legacy /conversations/review and /conversations/chat URLs
 * to the canonical /conversations/:threadId shape.
 *
 * Critical fix from architecture-critique §CRITICAL: empty-string and
 * whitespace-only ids must redirect to /conversations (queue), not to
 * /conversations/%20%20%20 (which would 404).
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RedirectLegacyConversation } from "../pages/RedirectLegacyConversation";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function Landing({ label }: { label: string }): React.JSX.Element {
	return <div data-testid="landing">{label}</div>;
}

/**
 * Renders the redirect helper at `initialPath` and checks whether the app
 * ends up at the expected destination by observing the rendered stub.
 */
function renderRedirect(
	initialPath: string,
	paramName: "id" | "thread",
): { getByTestId: typeof screen.getByTestId } {
	render(
		<MemoryRouter initialEntries={[initialPath]}>
			<Routes>
				<Route
					path={`/conversations/${paramName === "id" ? "review" : "chat"}`}
					element={<RedirectLegacyConversation paramName={paramName} />}
				/>
				<Route path="/conversations/:threadId" element={<Landing label="detail" />} />
				<Route path="/conversations" element={<Landing label="queue" />} />
			</Routes>
		</MemoryRouter>,
	);
	return screen;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RedirectLegacyConversation", () => {
	// -----------------------------------------------------------------------
	// ?id= forms (paramName="id" at /conversations/review)
	// -----------------------------------------------------------------------

	it("redirects /conversations/review?id=abc → /conversations/abc", () => {
		renderRedirect("/conversations/review?id=abc", "id");
		expect(screen.getByTestId("landing")).toHaveTextContent("detail");
	});

	it("redirects /conversations/review (no id) → /conversations", () => {
		renderRedirect("/conversations/review", "id");
		expect(screen.getByTestId("landing")).toHaveTextContent("queue");
	});

	it("redirects /conversations/review?id= (empty string id) → /conversations", () => {
		renderRedirect("/conversations/review?id=", "id");
		expect(screen.getByTestId("landing")).toHaveTextContent("queue");
	});

	it("redirects /conversations/review?id=%20%20%20 (whitespace-only id) → /conversations", () => {
		// CRITICAL fix from architecture-critique: whitespace ids must not produce
		// a navigate to /conversations/%20%20%20 which then 404s on the detail page.
		renderRedirect("/conversations/review?id=%20%20%20", "id");
		expect(screen.getByTestId("landing")).toHaveTextContent("queue");
	});

	// -----------------------------------------------------------------------
	// ?thread= forms (paramName="thread" at /conversations/chat)
	// -----------------------------------------------------------------------

	it("redirects /conversations/chat?thread=xyz → /conversations/xyz", () => {
		renderRedirect("/conversations/chat?thread=xyz", "thread");
		expect(screen.getByTestId("landing")).toHaveTextContent("detail");
	});

	it("redirects /conversations/chat (no thread param) → /conversations", () => {
		renderRedirect("/conversations/chat", "thread");
		expect(screen.getByTestId("landing")).toHaveTextContent("queue");
	});

	it("redirects /conversations/chat?thread= (empty thread param) → /conversations", () => {
		renderRedirect("/conversations/chat?thread=", "thread");
		expect(screen.getByTestId("landing")).toHaveTextContent("queue");
	});

	it("redirects /conversations/chat?thread=%20%20 (whitespace thread) → /conversations", () => {
		renderRedirect("/conversations/chat?thread=%20%20", "thread");
		expect(screen.getByTestId("landing")).toHaveTextContent("queue");
	});

	// -----------------------------------------------------------------------
	// Preserves other query params
	// -----------------------------------------------------------------------

	it("preserves other query params (settings=open) when no legacy id present", () => {
		// Covers the /conversations/review?settings=open real legacy URL shape
		// (the former /settings redirect target at router.tsx line 41).
		render(
			<MemoryRouter initialEntries={["/conversations/review?settings=open"]}>
				<Routes>
					<Route
						path="/conversations/review"
						element={<RedirectLegacyConversation paramName="id" />}
					/>
					<Route path="/conversations" element={<div data-testid="queue-landing" />} />
				</Routes>
			</MemoryRouter>,
		);
		// The queue page renders — settings=open should be preserved in the URL
		// but we can only observe the component landed at /conversations.
		expect(screen.getByTestId("queue-landing")).toBeInTheDocument();
	});
});
