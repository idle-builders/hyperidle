/**
 * R2 — SetupFlow page component tests (updated from P4)
 *
 * R2 AC coverage:
 * AC-1: Setup flow's one required field is the person's name. The API key field
 *       that used to be required with it belonged to the built-in gateway; a key
 *       is now asked for only by a harness that can run on one.
 * AC-2: Backend mode selection is removed from the setup flow
 * AC-3: Email field is removed from setup
 * AC-4: Product is created silently — no visible "First Product" section
 * AC-5: After setup completion, app routes to /work/portfolio (not /conversations)
 *
 * Old P4 tests removed/inverted:
 * - "renders BackendMode select" → removed (AC-2: backend mode removed)
 * - "renders name and email fields" → updated (AC-3: email removed)
 * - "Start button remains disabled without product name" → removed (AC-4: product name not required)
 * - "Start button remains disabled when only name is filled" → inverted: a name
 *   is enough, because no key is required of a harness that logs itself in.
 * - "Section headings: Backend Mode, Your Identity, First Product, API Credentials" → removed
 * - "shows validation error for invalid email format" → removed (AC-3: email removed)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../pages/SetupFlow";

// @lore BC5 T10: the door swap — `call` is mocked at the door instead of
// `global.fetch`; `POST /api/users` → `POST /api/teams` becomes three
// `edit_user` calls (architecture.md §7).
const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

function openUserData(): Record<string, unknown> {
	return {
		user: null,
		runsOn: [],
		runConfig: null,
		documentIds: [],
		folders: [],
		subscriptions: [],
		connections: null,
		behaviour: null,
		inbox: null,
	};
}

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
		callMock.mockReset();
		callMock.mockImplementation((name: string, input: Record<string, unknown>) => {
			if (name === "open_user") return Promise.resolve({ ok: true, data: openUserData() });
			if (name === "edit_user") {
				return Promise.resolve({
					ok: true,
					data: {
						...openUserData(),
						user: { id: "u-new", kind: input.kind, name: input.name },
					},
				});
			}
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});
	});

	// AC-1: the name is the only always-present required field
	it("renders the name field", () => {
		renderSetupFlow();
		expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
	});

	// @lore A key field used to render unconditionally, because the built-in
	// gateway row was always on screen and always wanted one. Setup asks for a key
	// only when the chosen harness can actually use it — see
	// setup-bring-your-own-key.test.tsx for that path.
	it("asks for no API key when no harness wants one", () => {
		renderSetupFlow();
		expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
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

	// AC-1: a name is enough — the key that used to be required with it was the
	// built-in gateway's, and no harness here asks for one.
	it("Start button becomes enabled once the name is filled", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(startBtn).not.toBeDisabled();
	});

	// AD9: After setup, navigates to /work (not /work/portfolio)
	it("navigates to /work on successful submission", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

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
		let resolveEditUser!: (value: unknown) => void;
		callMock.mockReset();
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") return Promise.resolve({ ok: true, data: openUserData() });
			if (name === "edit_user") {
				return new Promise((resolve) => {
					resolveEditUser = resolve;
				});
			}
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});

		const user = userEvent.setup();
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		await user.click(startBtn);

		// During submission, button should be disabled
		expect(startBtn).toBeDisabled();

		// Clean up by resolving the person's edit_user call
		resolveEditUser({ ok: true, data: { ...openUserData(), user: { id: "u-1", kind: "human" } } });
	});
});
