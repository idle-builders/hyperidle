/**
 * L7 (SEC1) — AppShell kill-switch identity injection.
 *
 * Pins the contract that factory pause/resume go through useRecoveryFetch
 * so the X-Actor-Id header is sent on every audit-writing call. Raw
 * fetch() bypassed identity, breaking forensic attribution on the
 * highest-blast-radius surface in L7. This test asserts the regression
 * is gone.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";

function renderShell(): ReturnType<typeof render> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [{ path: "conversations/review", element: <div>page</div> }],
			},
		],
		{ initialEntries: ["/conversations/review"] },
	);
	return render(<RouterProvider router={router} />);
}

describe("L7 (SEC1): AppShell kill-switch identity injection", () => {
	let originalFetch: typeof globalThis.fetch;
	let recordedCalls: Array<{ url: string; init?: RequestInit }>;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		recordedCalls = [];
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			recordedCalls.push({ url, init });
			// `useMe` queries `/api/me`; return a minimal payload so the
			// recovery hook resolves an actor id.
			if (url.includes("/api/me")) {
				return new Response(
					JSON.stringify({
						id: "actor:cpo",
						role: "CPO",
						domain_tags: [],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			if (url.includes("/api/factory/state")) {
				return new Response(
					JSON.stringify({
						paused: true,
						pausedBy: "actor:ceo",
						pausedAt: "2026-04-27T10:00:00.000Z",
						pausedReason: "investigating",
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			if (url.includes("/api/factory/pause") || url.includes("/api/factory/resume")) {
				return new Response(JSON.stringify({ state: "paused", auditId: "a-1" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		}) as unknown as typeof globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("Resume button on the FactoryPausedBanner sends X-Actor-Id (not raw fetch)", async () => {
		const user = userEvent.setup();
		renderShell();
		// Wait for the banner to render after the factory-state poll
		// resolves to paused.
		await waitFor(() => {
			expect(screen.getByTestId("factory-paused-banner")).toBeInTheDocument();
		});
		const resumeBtn = screen.getByRole("button", { name: /resume/i });
		await user.click(resumeBtn);

		await waitFor(() => {
			const resumeCall = recordedCalls.find((c) => c.url.includes("/api/factory/resume"));
			expect(resumeCall).toBeTruthy();
			const headers = resumeCall?.init?.headers as Record<string, string> | undefined;
			// CRITICAL: the resume call MUST include the resolved actor
			// id. Raw fetch() (the prior implementation) omitted this
			// header entirely; useRecoveryFetch injects it.
			expect(headers?.["X-Actor-Id"]).toBe("actor:cpo");
		});
	});
});
