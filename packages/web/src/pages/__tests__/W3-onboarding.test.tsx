/**
 * W3 — Onboarding AC-53 through AC-56: Red phase tests.
 *
 * AC-53: Card container with shadow, brand + tagline, illustration.
 * AC-54: Three fields: Your name (required), API key (required), Project folder (optional).
 * AC-55: "Start HyperIdle" button — disabled until name + API key filled.
 * AC-56: No step indicator, no email field, no team name field.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../../pages/SetupFlow";

// Mock window.__HYPERIDLE__ for shell.selectFolder
vi.stubGlobal("__HYPERIDLE__", undefined);

function renderSetupFlow(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/setup"]}>
			<Routes>
				<Route path="/setup" element={<SetupFlow />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// AC-53: Card container with shadow, brand + tagline, illustration
// ---------------------------------------------------------------------------
describe("W3 AC-53 — Onboarding card layout", () => {
	it("renders a card container with an onboarding card testid", () => {
		renderSetupFlow();
		const card = screen.getByTestId("onboarding-card");
		expect(card).toBeInTheDocument();
	});

	it("card has a shadow class (var(--shadow-elevated) or shadow-elevated)", () => {
		renderSetupFlow();
		const card = screen.getByTestId("onboarding-card");
		// Card should use Hearth shadow token, not raw Tailwind shadow
		expect(card.className).toMatch(/shadow-elevated|shadow-\[var\(--shadow-elevated\)\]/);
	});

	it("renders 'HyperIdle' brand name", () => {
		renderSetupFlow();
		const brand = screen.getByTestId("onboarding-brand");
		expect(brand).toBeInTheDocument();
		expect(brand.textContent).toMatch(/hyperidle/i);
	});

	it("renders the tagline text", () => {
		renderSetupFlow();
		// "Your agentic operating system. Humans steer, agents build."
		expect(screen.getByText(/your agentic operating system/i)).toBeInTheDocument();
	});

	it("renders an illustration or welcome visual", () => {
		renderSetupFlow();
		const illustration = screen.getByTestId("onboarding-illustration");
		expect(illustration).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-54: Three fields
// ---------------------------------------------------------------------------
describe("W3 AC-54 — Three fields in onboarding", () => {
	it("renders 'Your name' label (not just 'Name')", () => {
		renderSetupFlow();
		// AC-54 specifies "Your name" label
		expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
	});

	it("name field is required", () => {
		renderSetupFlow();
		const nameInput = screen.getByLabelText(/your name/i);
		expect(nameInput).toHaveAttribute("required");
	});

	it("renders Anthropic API key field (required)", () => {
		renderSetupFlow();
		const apiKeyInput = screen.getByLabelText(/anthropic api key/i);
		expect(apiKeyInput).toBeInTheDocument();
	});

	it("renders Project folder field (optional)", () => {
		renderSetupFlow();
		const folderInput = screen.getByLabelText(/project folder/i);
		expect(folderInput).toBeInTheDocument();
		// Optional — no required attribute
		expect(folderInput).not.toHaveAttribute("required");
	});

	it("renders exactly 3 form fields (no extra fields)", () => {
		renderSetupFlow();
		// Should have exactly 3 input/textarea fields
		const inputs = document.querySelectorAll("input, textarea");
		expect(inputs.length).toBe(3);
	});

	it("name field placeholder is 'Your name' (C1)", () => {
		renderSetupFlow();
		const nameInput = screen.getByLabelText(/your name/i);
		expect(nameInput).toHaveAttribute("placeholder", "Your name");
	});
});

// ---------------------------------------------------------------------------
// AC-55: "Start HyperIdle" button text and disabled state
// ---------------------------------------------------------------------------
describe("W3 AC-55 — Start HyperIdle button", () => {
	it("button text is 'Start HyperIdle'", () => {
		renderSetupFlow();
		const btn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(btn.textContent?.trim()).toBe("Start HyperIdle");
	});

	it("button is disabled when name and API key are empty", () => {
		renderSetupFlow();
		const btn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(btn).toBeDisabled();
	});

	it("button is disabled when name is filled but API key is empty", async () => {
		const user = userEvent.setup();
		renderSetupFlow();
		await user.type(screen.getByLabelText(/your name/i), "Alice");
		const btn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(btn).toBeDisabled();
	});

	it("button is disabled when API key is filled but name is empty", async () => {
		const user = userEvent.setup();
		renderSetupFlow();
		await user.type(screen.getByLabelText(/anthropic api key/i), "sk-ant-test");
		const btn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(btn).toBeDisabled();
	});

	it("button is enabled when both name and API key are filled", async () => {
		const user = userEvent.setup();
		renderSetupFlow();
		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await user.type(screen.getByLabelText(/anthropic api key/i), "sk-ant-test");
		const btn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(btn).toBeEnabled();
	});
});

// ---------------------------------------------------------------------------
// AC-56: No step indicator, no email field, no team name field
// ---------------------------------------------------------------------------
describe("W3 AC-56 — No step indicator or extra fields", () => {
	it("does NOT render a step indicator", () => {
		renderSetupFlow();
		// Step indicators usually have step numbers or a progress bar
		const stepIndicator = document.querySelector(
			"[data-testid='step-indicator'], [class*='step-indicator'], [class*='steps']",
		);
		expect(stepIndicator).toBeNull();
	});

	it("does NOT render an email field", () => {
		renderSetupFlow();
		expect(screen.queryByLabelText(/^email/i)).not.toBeInTheDocument();
	});

	it("does NOT render a team name field", () => {
		renderSetupFlow();
		expect(screen.queryByLabelText(/team name/i)).not.toBeInTheDocument();
	});

	it("does NOT render a backend mode selector", () => {
		renderSetupFlow();
		expect(screen.queryByLabelText(/backend mode/i)).not.toBeInTheDocument();
	});
});
