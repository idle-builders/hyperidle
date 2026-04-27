/**
 * L7 (AC1 resume-confirm) — FactoryPausedBanner Resume opens an explicit
 * confirm dialog before POSTing /api/factory/resume.
 *
 * TRACK-L L7 AC1 says "Resuming requires explicit confirm." The prior
 * implementation wired Resume directly to the POST, so a single fat-finger
 * click resumed the factory with no confirm gate. This test pins the new
 * contract:
 *
 *   - Click Resume → confirmation dialog opens; NO POST is fired yet.
 *   - The dialog reuses the kill-switch chrome (verb=factory_resume) and
 *     respects Settings → Safety confirm-mode.
 *   - Reason field is OPTIONAL on resume (AC5 only mandates rationale for
 *     rollback / kill-switch / mid-session-stop).
 *   - POST fires only after the user completes the confirm gate
 *     (press-hold or type-name).
 *   - Cancel closes the dialog and never POSTs.
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

describe("L7 (AC1): factory-resume confirm gate", () => {
	let originalFetch: typeof globalThis.fetch;
	let recordedCalls: Array<{ url: string; init?: RequestInit }>;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		recordedCalls = [];
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			recordedCalls.push({ url, init });
			if (url.includes("/api/me")) {
				return new Response(JSON.stringify({ id: "actor:ceo", role: "CEO", domain_tags: [] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			if (url.includes("/api/factory/state")) {
				return new Response(
					JSON.stringify({
						paused: true,
						pausedBy: "actor:cpo",
						pausedAt: "2026-04-27T10:00:00.000Z",
						pausedReason: "investigating",
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			if (url.includes("/api/factory/resume")) {
				return new Response(JSON.stringify({ state: "active", auditId: "a-1" }), {
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

	it("clicking Resume opens the confirm dialog and does NOT POST yet", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByTestId("factory-paused-banner")).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /resume/i }));

		// The confirm dialog is now visible…
		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: /resume factory/i })).toBeInTheDocument();
		});
		// …and no POST has been issued. The previous implementation fired
		// /api/factory/resume on the click; the new contract defers it.
		const resumeCall = recordedCalls.find((c) => c.url.includes("/api/factory/resume"));
		expect(resumeCall).toBeUndefined();
	});

	it("reason field is optional — confirm proceeds even when reason is blank", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByTestId("factory-paused-banner")).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /resume/i }));

		const dialog = await screen.findByRole("dialog", { name: /resume factory/i });
		// Optional indicator visible to the user.
		expect(dialog).toHaveTextContent(/optional/i);

		// Default Settings → Safety confirm mode is press_hold; the
		// "Hold to confirm" button is enabled with a blank reason.
		const holdBtn = screen.getByRole("button", { name: /hold to confirm/i });
		expect(holdBtn).not.toBeDisabled();

		// Drive the press-hold to fire the POST.
		await user.pointer({ keys: "[MouseLeft>]", target: holdBtn });
		await new Promise((resolve) => setTimeout(resolve, 1700));
		await user.pointer({ keys: "[/MouseLeft]", target: holdBtn });

		await waitFor(() => {
			const resumeCall = recordedCalls.find((c) => c.url.includes("/api/factory/resume"));
			expect(resumeCall).toBeTruthy();
		});
	});

	it("Cancel closes the dialog without POSTing", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByTestId("factory-paused-banner")).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /resume/i }));

		await screen.findByRole("dialog", { name: /resume factory/i });
		await user.click(screen.getByRole("button", { name: /^cancel$/i }));

		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: /resume factory/i })).not.toBeInTheDocument();
		});
		const resumeCall = recordedCalls.find((c) => c.url.includes("/api/factory/resume"));
		expect(resumeCall).toBeUndefined();
	});
});
