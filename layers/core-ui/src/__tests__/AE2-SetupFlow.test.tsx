/**
 * AE2 — SetupFlow component tests
 *
 * AC-1 (UI): Team creation with function selector.
 * AC-4 (navigation): Navigates to /work/portfolio?onboarding=true on success.
 *
 * Tests cover:
 * - Preset pills render with "Software" pre-selected
 * - Clicking "Custom" reveals individual function chips
 * - Toggling chips updates roster preview
 * - Custom with zero chips: submit disabled
 * - Submitting sends `functions` array in request body
 * - Navigates to /work/portfolio?onboarding=true on success
 *
 * @lore AE2: Red-phase tests. They fail until Task 3 (add function selector to
 * SetupFlow) is implemented.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../pages/SetupFlow";

/** AD9: Stub target page at /work that captures the current URL for assertion. */
function WorkOverviewStub(): React.JSX.Element {
	const location = useLocation();
	return (
		<div data-testid="portfolio-page">
			work-overview
			<span data-testid="current-search">{location.search}</span>
		</div>
	);
}

interface RenderResult {
	capturedBody: () => Record<string, unknown> | null;
}

function renderSetupFlow(initialPath = "/setup"): RenderResult {
	// AH1: capture the teams POST body specifically (not the last-captured body).
	// SetupFlow makes two calls plus an optional third:
	//   1. POST /api/users, 2. POST /api/teams, 3. POST /api/filesystems (only
	//   when a folder was picked). Setup writes no credential — a harness
	//   arrives already logged in.
	// capturedBody() returns the teams POST body for AE2 assertions.
	let teamsCreateBody: Record<string, unknown> | null = null;

	// Track the body sent for each fetch call
	global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
		if (
			options?.body &&
			typeof _url === "string" &&
			_url.includes("/api/teams") &&
			options.method === "POST"
		) {
			try {
				teamsCreateBody = JSON.parse(options.body as string) as Record<string, unknown>;
			} catch {
				// ignore
			}
		}
		return Promise.resolve({
			ok: true,
			status: 201,
			json: async () => ({
				id: "u-new",
				name: "Alice",
				kind: "human",
				team: { id: "team-1", name: "My Team", phase: "build" },
				teamMembers: { id: "tm-1" },
			}),
		});
	}) as typeof fetch;

	render(
		<MemoryRouter initialEntries={[initialPath]}>
			<Routes>
				<Route path="/setup" element={<SetupFlow />} />
				{/* AD9: /work/portfolio retired → /work */}
				<Route path="/work" element={<WorkOverviewStub />} />
			</Routes>
		</MemoryRouter>,
	);

	return { capturedBody: () => teamsCreateBody };
}

afterEach(() => {
	vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Preset pill rendering
// ─────────────────────────────────────────────────────────────────────────────

// @lore BA9g: the preset pills, the custom function chips, the roster preview
// and the "submitting sends functions" assertions are all GONE with the "What
// are you building?" step. A team no longer arrives with a roster derived from
// its declared functions — it is one empty agent, and you improve it with
// plugins — so the step had no answer left to act on. What survives is the
// navigation this file also covered.
describe("AE2-SetupFlow — navigation to /work?onboarding=true", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() =>
				Promise.resolve({
					ok: true,
					status: 201,
					json: async () => ({
						id: "u-new",
						name: "Alice",
						kind: "human",
						team: { id: "team-1", name: "My Team", phase: "build" },
						teamMembers: { id: "tm-1" },
					}),
				}),
			),
		);
	});

	it("navigates to /work?onboarding=true on successful submission (AD9)", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		await user.click(screen.getByRole("button", { name: /start hyperidle/i }));

		await waitFor(() => {
			expect(screen.getByTestId("portfolio-page")).toBeInTheDocument();
		});

		// The current search should include ?onboarding=true
		const searchEl = screen.getByTestId("current-search");
		expect(searchEl.textContent).toContain("onboarding=true");
	});
});
