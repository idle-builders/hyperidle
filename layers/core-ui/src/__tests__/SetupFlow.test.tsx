/**
 * R2 — SetupFlow page component tests (updated from P4)
 *
 * R2 AC coverage:
 * AC-1: Setup flow has two required fields: name and API key
 * AC-2: Backend mode selection is removed from the setup flow
 * AC-3: Email field is removed from setup
 * AC-4: Product is created silently — no visible "First Product" section
 * AC-5: After setup completion, app routes to /work/portfolio (not /conversations)
 *
 * Old P4 tests removed/inverted:
 * - "renders BackendMode select" → removed (AC-2: backend mode removed)
 * - "renders name and email fields" → updated (AC-3: email removed)
 * - "Start button remains disabled without product name" → removed (AC-4: product name not required)
 * - "Start button remains disabled when only name is filled" → updated (AC-1: only need name + API key)
 * - "Section headings: Backend Mode, Your Identity, First Product, API Credentials" → removed
 * - "shows validation error for invalid email format" → removed (AC-3: email removed)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../pages/SetupFlow";

// AD9: /work/portfolio retired → /work is the new landing
function WorkOverviewStub(): React.JSX.Element {
	return <div data-testid="landing">work-overview</div>;
}

function renderSetupFlow(): typeof screen {
	render(
		<MemoryRouter initialEntries={["/setup"]}>
			<Routes>
				<Route path="/setup" element={<SetupFlow />} />
				<Route path="/work" element={<WorkOverviewStub />} />
			</Routes>
		</MemoryRouter>,
	);
	return screen;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("SetupFlow (R2)", () => {
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
					}),
				}),
			),
		);
	});

	// AC-1: Only name and API key are required fields
	it("renders name and API key fields", () => {
		renderSetupFlow();
		expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/anthropic api key/i)).toBeInTheDocument();
	});

	// AC-3: Email field is removed
	it("does not render email field", () => {
		renderSetupFlow();
		expect(screen.queryByLabelText(/^email/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
	});

	// AC-2: Backend mode selector is removed
	it("does not render backend mode selector", () => {
		renderSetupFlow();
		expect(screen.queryByRole("combobox", { name: /backend mode/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("option", { name: /run locally/i })).not.toBeInTheDocument();
		expect(
			screen.queryByRole("option", { name: /connect to shared backend/i }),
		).not.toBeInTheDocument();
	});

	// AC-4: No product name field (product is created silently)
	it("does not render product name field", () => {
		renderSetupFlow();
		expect(screen.queryByLabelText(/product name/i)).not.toBeInTheDocument();
	});

	// AC-4: No "First Product" section heading
	it("does not render 'First Product' section heading", () => {
		renderSetupFlow();
		expect(screen.queryByRole("heading", { name: /first product/i })).not.toBeInTheDocument();
	});

	// AC-1: Repo path is optional (present but not required)
	it("renders optional repo path field", () => {
		renderSetupFlow();
		// The label should mention "optional" or repo path should be present
		expect(screen.getByLabelText(/project folder/i)).toBeInTheDocument();
	});

	// AC-1: Start button disabled when all fields are empty
	it("Start button is disabled when fields are empty", () => {
		renderSetupFlow();
		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(startBtn).toBeDisabled();
	});

	// AC-1: Start button disabled when only name is filled (API key required too)
	it("Start button remains disabled when name filled but no API key", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(startBtn).toBeDisabled();
	});

	// AC-1: Start button enabled when name AND API key are filled
	it("Start button becomes enabled when name and API key are filled", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await user.type(screen.getByLabelText(/anthropic api key/i), "sk-ant-test");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(startBtn).not.toBeDisabled();
	});

	// AD9: After setup, navigates to /work (not /work/portfolio)
	it("navigates to /work on successful submission", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await user.type(screen.getByLabelText(/anthropic api key/i), "sk-ant-test");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		await user.click(startBtn);

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("work-overview");
		});
	});

	// Page brand/title
	it("renders the brand heading 'HyperIdle'", () => {
		renderSetupFlow();
		// W3 AC-53: brand heading shows "HyperIdle" with tagline below
		expect(screen.getByTestId("onboarding-brand")).toBeInTheDocument();
		expect(screen.getByTestId("onboarding-brand")).toHaveTextContent("HyperIdle");
	});

	// AC-2: No section headings for removed sections
	it("does not render 'Backend Mode' section heading", () => {
		renderSetupFlow();
		expect(screen.queryByRole("heading", { name: /backend mode/i })).not.toBeInTheDocument();
	});

	// AC-3: No "Your Identity" section (was email+name, now reduced)
	// The section heading is removed per architecture plan — fields are flat
	it("does not render 'Your Identity' section heading", () => {
		renderSetupFlow();
		expect(screen.queryByRole("heading", { name: /your identity/i })).not.toBeInTheDocument();
	});

	// Submitting state
	it("Start button shows loading state while submitting", async () => {
		let resolveFetch!: (value: unknown) => void;
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(
				() =>
					new Promise((resolve) => {
						resolveFetch = resolve;
					}),
			),
		);

		const user = userEvent.setup();
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await user.type(screen.getByLabelText(/anthropic api key/i), "sk-ant-test");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		await user.click(startBtn);

		// During submission, button should be disabled
		expect(startBtn).toBeDisabled();

		// Clean up by resolving
		resolveFetch({
			ok: true,
			status: 201,
			json: async () => ({ id: "u-1", name: "Alice", kind: "human" }),
		});
	});
});
