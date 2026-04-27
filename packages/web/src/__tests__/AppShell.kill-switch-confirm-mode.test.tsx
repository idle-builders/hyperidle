/**
 * L7 (AC4-GAP-A) — AppShell desktop kill-switch confirm-mode honors Settings.
 *
 * The desktop branch of AppShell previously hardcoded `mode="press_hold"` on
 * the KillSwitchDialog mount, ignoring `settings.safety.killSwitchConfirmMode`
 * — so a user who picked "Type factory name" in Settings → Safety still got
 * the press-and-hold UI on the primary form factor. The mobile branch already
 * threaded the preference through. This test pins the desktop branch to the
 * same contract:
 *
 *   - Default settings (`press_hold`) → press-and-hold confirm UI is shown.
 *   - User-selected `type_name` → type-name confirm UI is shown.
 *
 * The test drives the user-facing flow: open the AvatarMenu, navigate to
 * Settings → Safety, pick the desired confirm mode, save, then trigger the
 * kill-switch from the AvatarMenu and inspect the rendered dialog.
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

describe("L7 (AC4-GAP-A): AppShell desktop kill-switch confirm-mode honors Settings", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/me")) {
				return new Response(JSON.stringify({ id: "actor:ceo", role: "CEO", domain_tags: [] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			if (url.includes("/api/factory/state")) {
				return new Response(
					JSON.stringify({
						paused: false,
						pausedBy: null,
						pausedAt: null,
						pausedReason: null,
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			return new Response("{}", {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof globalThis.fetch;
	});

	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	async function openKillSwitchFromAvatar(user: ReturnType<typeof userEvent.setup>): Promise<void> {
		await user.click(screen.getByRole("button", { name: /user profile/i }));
		await user.click(await screen.findByRole("menuitem", { name: /pause factory/i }));
		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: /pause factory/i })).toBeInTheDocument();
		});
	}

	it("renders the press-and-hold UI by default (press_hold mode)", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderShell();

		await waitFor(() => {
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});
		await openKillSwitchFromAvatar(user);

		// Press-and-hold UI exposes a "Hold to confirm" affordance.
		expect(screen.getByRole("button", { name: /hold to confirm/i })).toBeInTheDocument();
		// The type-name input must NOT render in press_hold mode.
		expect(screen.queryByLabelText(/type "hyperidle" to confirm/i)).not.toBeInTheDocument();
	});

	it("renders the type-name UI when Settings → Safety selects type_name", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderShell();

		await waitFor(() => {
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});

		// Open AvatarMenu → Settings.
		await user.click(screen.getByRole("button", { name: /user profile/i }));
		await user.click(await screen.findByRole("menuitem", { name: /settings/i }));
		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: /settings/i })).toBeInTheDocument();
		});

		// Switch to the Safety tab and pick "Type factory name".
		await user.click(screen.getByRole("tab", { name: /safety/i }));
		await user.click(screen.getByRole("radio", { name: /type factory name/i }));

		// Save the settings — AppShell mirrors the draft into local state.
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		// handleSettingsSave awaits a 300ms timer before persisting.
		await vi.advanceTimersByTimeAsync(400);
		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: /settings/i })).not.toBeInTheDocument();
		});

		// Now trigger the kill switch. Desktop branch must thread the new
		// preference through to KillSwitchDialog.
		await openKillSwitchFromAvatar(user);

		// Type-name UI exposes a labeled input demanding the factory name
		// be typed verbatim.
		expect(screen.getByLabelText(/type "hyperidle" to confirm/i)).toBeInTheDocument();
		// The press-and-hold affordance must NOT render in type_name mode.
		expect(screen.queryByRole("button", { name: /hold to confirm/i })).not.toBeInTheDocument();
	});
});
