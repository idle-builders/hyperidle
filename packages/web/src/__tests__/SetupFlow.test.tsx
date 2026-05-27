/**
 * P4 — SetupFlow page component tests (Task 4, AC-2 through AC-8)
 *
 * AC-2: BackendMode select with "Run locally" (default) and "Connect to shared backend"
 * AC-3: Shared backend selection shows URL + key fields and "Test Connection" button
 * AC-4: Name and email fields for user identity
 * AC-5: Product name (required) + repo path (optional)
 * AC-6: Anthropic API Key field (optional) with "Skip credentials" and "Start HyperIdle" buttons
 * AC-7: Start button disabled until name + email + product name are filled
 * AC-8: After completing setup, main UI renders at /conversations
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../pages/SetupFlow";

function ConversationsStub(): React.JSX.Element {
	return <div data-testid="landing">conversations</div>;
}

function renderSetupFlow(): typeof screen {
	render(
		<MemoryRouter initialEntries={["/setup"]}>
			<Routes>
				<Route path="/setup" element={<SetupFlow />} />
				<Route path="/conversations" element={<ConversationsStub />} />
			</Routes>
		</MemoryRouter>,
	);
	return screen;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("SetupFlow", () => {
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
						email: "alice@example.com",
						kind: "human",
					}),
				}),
			),
		);
	});

	// AC-2: BackendMode select exists with correct options
	it("renders BackendMode select with 'Run locally' and 'Connect to shared backend' options", () => {
		renderSetupFlow();
		const select = screen.getByRole("combobox", { name: /backend mode/i });
		expect(select).toBeInTheDocument();
		expect(screen.getByRole("option", { name: /run locally/i })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: /connect to shared backend/i })).toBeInTheDocument();
	});

	// AC-2: Default is "Run locally"
	it("defaults BackendMode select to 'Run locally'", () => {
		renderSetupFlow();
		const select = screen.getByRole("combobox", { name: /backend mode/i }) as HTMLSelectElement;
		const selectedOption = select.options[select.selectedIndex];
		expect(selectedOption.text).toMatch(/run locally/i);
	});

	// AC-3: Shared backend fields appear when selected
	it("shows URL, key fields and Test Connection button when shared backend is selected", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		const select = screen.getByRole("combobox", { name: /backend mode/i });
		await user.selectOptions(
			select,
			screen.getByRole("option", { name: /connect to shared backend/i }),
		);

		await waitFor(() => {
			expect(screen.getByLabelText(/server url/i)).toBeInTheDocument();
		});
		expect(screen.getByLabelText(/shared backend key/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /test connection/i })).toBeInTheDocument();
	});

	// AC-3: Shared backend fields are NOT visible in local mode
	it("does not show URL/key fields in local mode", () => {
		renderSetupFlow();
		expect(screen.queryByLabelText(/server url/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/shared backend key/i)).not.toBeInTheDocument();
	});

	// AC-4: Name and email fields exist
	it("renders name and email fields for user identity", () => {
		renderSetupFlow();
		expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
	});

	// AC-5: Product name and repo path fields exist
	it("renders product name and repo path fields", () => {
		renderSetupFlow();
		expect(screen.getByLabelText(/product name/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/repo/i)).toBeInTheDocument();
	});

	// AC-6: API key field and buttons exist
	it("renders API credentials field with skip and start buttons", () => {
		renderSetupFlow();
		expect(screen.getByLabelText(/anthropic api key/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /skip credentials/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /start hyperidle/i })).toBeInTheDocument();
	});

	// AC-7: Start button disabled initially
	it("Start button is disabled when fields are empty", () => {
		renderSetupFlow();
		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(startBtn).toBeDisabled();
	});

	// AC-7: Start button disabled when only name is filled
	it("Start button remains disabled when only name is filled", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		await user.type(screen.getByLabelText(/^name/i), "Alice");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(startBtn).toBeDisabled();
	});

	// AC-7: Start button disabled when name + email filled but no product
	it("Start button remains disabled without product name", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		await user.type(screen.getByLabelText(/^name/i), "Alice");
		await user.type(screen.getByLabelText(/^email/i), "alice@example.com");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(startBtn).toBeDisabled();
	});

	// AC-7: Start button enabled when name + email + product are filled
	it("Start button becomes enabled when name, email, and product name are filled", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		await user.type(screen.getByLabelText(/^name/i), "Alice");
		await user.type(screen.getByLabelText(/^email/i), "alice@example.com");
		await user.type(screen.getByLabelText(/product name/i), "My Product");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(startBtn).not.toBeDisabled();
	});

	// AC-8: After clicking Start, navigates to /conversations
	it("navigates to /conversations on successful submission", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		await user.type(screen.getByLabelText(/^name/i), "Alice");
		await user.type(screen.getByLabelText(/^email/i), "alice@example.com");
		await user.type(screen.getByLabelText(/product name/i), "My Product");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		await user.click(startBtn);

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("conversations");
		});
	});

	// Page title
	it("renders the page title 'HyperIdle Setup'", () => {
		renderSetupFlow();
		expect(screen.getByText(/hyperidle setup/i)).toBeInTheDocument();
	});

	// Section headings
	it("renders section headings: Backend Mode, Your Identity, First Product, API Credentials", () => {
		renderSetupFlow();
		// Use heading role to avoid ambiguity with sr-only label text
		expect(screen.getByRole("heading", { name: /backend mode/i })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: /your identity/i })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: /first product/i })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: /api credentials/i })).toBeInTheDocument();
	});

	// Validation error for invalid email
	it("shows validation error for invalid email format on blur", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		const emailInput = screen.getByLabelText(/^email/i);
		await user.type(emailInput, "not-an-email");
		await user.tab(); // blur

		await waitFor(() => {
			expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
		});
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

		await user.type(screen.getByLabelText(/^name/i), "Alice");
		await user.type(screen.getByLabelText(/^email/i), "alice@example.com");
		await user.type(screen.getByLabelText(/product name/i), "My Product");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		await user.click(startBtn);

		// During submission, button should be disabled
		expect(startBtn).toBeDisabled();

		// Clean up by resolving
		resolveFetch({
			ok: true,
			status: 201,
			json: async () => ({ id: "u-1", name: "Alice", email: "alice@example.com", kind: "human" }),
		});
	});
});
