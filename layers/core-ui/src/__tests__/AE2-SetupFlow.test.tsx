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
	// After AH1, SetupFlow makes 3 fetch calls:
	//   1. POST /api/users, 2. POST /api/teams, 3. PUT /api/credentials/:name
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

describe("AE2-SetupFlow — preset pills", () => {
	it("renders preset pills for team function selection", () => {
		renderSetupFlow();
		// Preset pills should include at least "Software" and "Custom"
		expect(screen.getByRole("button", { name: /software/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /custom/i })).toBeInTheDocument();
	});

	it("'Software' preset is pre-selected by default", () => {
		renderSetupFlow();
		const softwareBtn = screen.getByRole("button", { name: /^software$/i });
		// Pre-selected preset should have an aria-pressed=true or data-selected attribute,
		// or at minimum not be disabled
		expect(softwareBtn).toBeInTheDocument();
		// The button should be visually indicated as selected (aria-pressed or a selected class)
		const isSelected =
			softwareBtn.getAttribute("aria-pressed") === "true" ||
			softwareBtn.getAttribute("data-selected") === "true" ||
			softwareBtn.classList.contains("btn-primary") ||
			softwareBtn.classList.contains("selected");
		expect(isSelected).toBe(true);
	});

	it("renders roster preview text after preset selection", () => {
		renderSetupFlow();
		// With Software preset (development + product), roster preview should mention agents
		// e.g., "Builder, Product Manager, QA Engineer" or similar
		const previewEl = screen.getByTestId("roster-preview");
		expect(previewEl).toBeInTheDocument();
		expect(previewEl.textContent?.length).toBeGreaterThan(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Custom preset
// ─────────────────────────────────────────────────────────────────────────────

describe("AE2-SetupFlow — custom preset", () => {
	it("clicking 'Custom' reveals individual function chips", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		await user.click(screen.getByRole("button", { name: /^custom$/i }));

		// After clicking Custom, individual function chips should appear
		// The TEAM_FUNCTIONS include: development, product, design, marketing, sales, operations, support, research
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /development/i })).toBeInTheDocument();
		});
		expect(screen.getByRole("button", { name: /product/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /design/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /marketing/i })).toBeInTheDocument();
	});

	it("Custom with zero chips selected disables the submit button", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		// Fill required fields
		await user.type(screen.getByLabelText(/your name/i), "Alice");

		// Switch to Custom — no chips selected yet
		await user.click(screen.getByRole("button", { name: /^custom$/i }));

		// Submit should be disabled (no functions = invalid state)
		await waitFor(() => {
			const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
			expect(startBtn).toBeDisabled();
		});
	});

	it("selecting a chip in Custom mode enables submit and updates roster preview", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		// Fill required fields
		await user.type(screen.getByLabelText(/your name/i), "Alice");

		// Switch to Custom
		await user.click(screen.getByRole("button", { name: /^custom$/i }));

		// Click the "development" chip
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /development/i })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /development/i }));

		// Submit should now be enabled
		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(startBtn).not.toBeDisabled();
	});

	it("toggling chips in Custom mode updates roster preview text", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		// Switch to Custom
		await user.click(screen.getByRole("button", { name: /^custom$/i }));

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /development/i })).toBeInTheDocument();
		});

		// Get initial preview (empty)
		const previewEl = screen.getByTestId("roster-preview");
		const initialPreviewText = previewEl.textContent ?? "";

		// Click "development" — should add builder + qa_engineer to roster
		await user.click(screen.getByRole("button", { name: /development/i }));

		// Preview should update
		await waitFor(() => {
			expect(screen.getByTestId("roster-preview").textContent).not.toBe(initialPreviewText);
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Submission: functions array is sent in request body
// ─────────────────────────────────────────────────────────────────────────────

describe("AE2-SetupFlow — submitting sends functions array", () => {
	it("submitting with Software preset sends functions=['development','product'] in POST body", async () => {
		const user = userEvent.setup();
		const { capturedBody } = renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		await user.click(startBtn);

		await waitFor(() => {
			expect(screen.getByTestId("portfolio-page")).toBeInTheDocument();
		});

		// The second fetch call is POST /api/teams — check it included functions
		const body = capturedBody();
		expect(body).not.toBeNull();
		// Should have sent functions array
		expect(body?.functions).toBeDefined();
		expect(Array.isArray(body?.functions)).toBe(true);
		// Software preset = ["development", "product"]
		expect(body?.functions).toEqual(expect.arrayContaining(["development", "product"]));
	});

	it("submitting with Custom + 'design' selected sends functions=['design']", async () => {
		const user = userEvent.setup();

		let teamCreateBody: Record<string, unknown> | null = null;
		global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
			if (options?.method === "POST" && (_url as string).includes("/api/teams")) {
				try {
					teamCreateBody = JSON.parse(options.body as string) as Record<string, unknown>;
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
			<MemoryRouter initialEntries={["/setup"]}>
				<Routes>
					<Route path="/setup" element={<SetupFlow />} />
					{/* AD9: /work/portfolio retired → /work */}
					<Route path="/work" element={<WorkOverviewStub />} />
				</Routes>
			</MemoryRouter>,
		);

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		// Switch to Custom
		await user.click(screen.getByRole("button", { name: /^custom$/i }));

		// Select "design" chip
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /design/i })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /design/i }));

		// Submit
		await user.click(screen.getByRole("button", { name: /start hyperidle/i }));

		await waitFor(() => {
			expect(screen.getByTestId("portfolio-page")).toBeInTheDocument();
		});

		expect(teamCreateBody).not.toBeNull();
		expect((teamCreateBody as Record<string, unknown> | null)?.["functions"]).toEqual(["design"]);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 (navigation): Navigates to /work?onboarding=true (AD9: was /work/portfolio)
// ─────────────────────────────────────────────────────────────────────────────

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
