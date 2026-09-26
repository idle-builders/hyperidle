/**
 * SetupFlow page component tests.
 *
 * The one required field is the person's name — no API key field renders
 * unconditionally (a harness that can use a key asks for one itself, see
 * setup-bring-your-own-key.test.tsx), there is no backend-mode selector, no
 * email field, and no "First Product" section (the product is created
 * silently). After setup completes the app routes to /work.
 *
 * @lore: the door swap — `call` is mocked at the door instead of
 * `global.fetch`; `POST /api/users` → `POST /api/teams` becomes three
 * `edit_user` calls (architecture.md §7). `apiFetch` is mocked separately
 * for the one plumbing route this page still calls directly,
 * `POST /api/filesystems/inspect-path`.
 */

import { OBJECT_EVENTS } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../SetupFlow.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock("../../services/api-fetch.js", () => ({ apiFetch: apiFetchMock }));

const HARNESS = {
	type: "claude-code",
	name: "Claude Code",
	kind: "local",
	authAction: { kind: "native_cli_login", label: "Log in to Claude Code", command: ["claude"] },
	discovery: { state: "ready" },
	models: [
		{
			id: "claude-sonnet-4-6",
			label: "Sonnet",
			provider: "anthropic",
			selectable: true,
			options: [],
		},
	],
	modelProviders: ["anthropic"],
};

function openUserData(): Record<string, unknown> {
	return {
		user: null,
		runsOn: [HARNESS],
		runConfig: null,
		documentIds: [],
		folders: [],
		subscriptions: [],
		connections: null,
		inbox: null,
	};
}

// /work/portfolio retired → /work is the new landing
function WorkOverviewStub(): React.JSX.Element {
	return <div data-testid="landing">work-overview</div>;
}

function renderSetupFlow(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/setup"]}>
			<Routes>
				<Route path="/setup" element={<SetupFlow />} />
				<Route path="/work" element={<WorkOverviewStub />} />
			</Routes>
		</MemoryRouter>,
	);
}

beforeEach(() => {
	callMock.mockReset();
	apiFetchMock.mockReset();
	apiFetchMock.mockResolvedValue({
		ok: true,
		json: async () => ({ exists: true, isGitRepo: true, branch: "main" }),
	});
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

afterEach(() => {
	vi.restoreAllMocks();
});

describe("SetupFlow", () => {
	it("mounts by calling open_user({}) for the machine's harnesses", async () => {
		renderSetupFlow();

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("open_user", {});
		});
	});

	// The one always-present required field is the name.
	it("renders the name field", () => {
		renderSetupFlow();
		expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
	});

	// @lore A key field used to render unconditionally, because the built-in
	// gateway row was always on screen and always wanted one. Setup asks for a
	// key only when the chosen harness can actually use it — see
	// setup-bring-your-own-key.test.tsx for that path.
	it("asks for no API key when no harness wants one", () => {
		renderSetupFlow();
		expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
	});

	it("does not render an email field", () => {
		renderSetupFlow();
		expect(screen.queryByLabelText(/^email/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
	});

	it("does not render a backend mode selector", () => {
		renderSetupFlow();
		expect(screen.queryByRole("combobox", { name: /backend mode/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("option", { name: /run locally/i })).not.toBeInTheDocument();
		expect(
			screen.queryByRole("option", { name: /connect to shared backend/i }),
		).not.toBeInTheDocument();
	});

	it("does not render a product name field or 'First Product' heading — the product is created silently", () => {
		renderSetupFlow();
		expect(screen.queryByLabelText(/product name/i)).not.toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: /first product/i })).not.toBeInTheDocument();
	});

	it("renders an optional repo path field", () => {
		renderSetupFlow();
		expect(screen.getByLabelText(/project folder/i)).toBeInTheDocument();
	});

	it("Start button is disabled when fields are empty", () => {
		renderSetupFlow();
		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(startBtn).toBeDisabled();
	});

	// A name is enough — the key that used to be required with it was the
	// built-in gateway's, and no harness here asks for one.
	it("Start button becomes enabled once the name is filled", async () => {
		const user = userEvent.setup();
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(startBtn).not.toBeDisabled();
	});

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

	it("renders the brand heading 'HyperIdle'", () => {
		renderSetupFlow();
		expect(screen.getByTestId("onboarding-brand")).toBeInTheDocument();
		expect(screen.getByTestId("onboarding-brand")).toHaveTextContent("HyperIdle");
	});

	it("does not render 'Backend Mode' or 'Your Identity' section headings", () => {
		renderSetupFlow();
		expect(screen.queryByRole("heading", { name: /backend mode/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: /your identity/i })).not.toBeInTheDocument();
	});

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

	it("submits two edit_user calls (person+team, owned assistant with nine empty subscriptions) and still calls inspect-path", async () => {
		callMock.mockImplementation((name: string, input: Record<string, unknown>) => {
			if (name === "open_user") return Promise.resolve({ ok: true, data: openUserData() });
			if (name === "edit_user") {
				if (input.kind === "human") {
					return Promise.resolve({
						ok: true,
						data: { ...openUserData(), user: { id: "u-founder", kind: "human", name: "Ada" } },
					});
				}
				return Promise.resolve({
					ok: true,
					data: { ...openUserData(), user: { id: "u-agent", kind: "ai", name: input.name } },
				});
			}
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});

		const user = userEvent.setup();
		renderSetupFlow();

		await waitFor(() => screen.getByLabelText(/your name/i));
		await user.type(screen.getByLabelText(/your name/i), "Ada");
		await user.type(screen.getByLabelText(/project folder/i), "/Users/ada/my-repo");

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /start hyperidle/i })).not.toBeDisabled();
		});
		await user.click(screen.getByRole("button", { name: /start hyperidle/i }));

		await waitFor(() => {
			expect(apiFetchMock).toHaveBeenCalledWith(
				"/api/filesystems/inspect-path",
				expect.objectContaining({ method: "POST" }),
			);
		});

		await waitFor(() => {
			const editUserCalls = callMock.mock.calls.filter(([name]) => name === "edit_user");
			expect(editUserCalls).toHaveLength(2);
		});

		const editUserCalls = callMock.mock.calls.filter(([name]) => name === "edit_user");

		// 1. the person, with a team named from the folder basename
		expect(editUserCalls.at(0)?.[1]).toMatchObject({
			kind: "human",
			name: "Ada",
			team: { name: "my-repo" },
			folders: {
				add: [
					{
						kind: "code",
						resourceRef: { kind: "code", repo: "/Users/ada/my-repo", branch: "main" },
						writeback: "none",
						connectionId: null,
					},
				],
			},
		});

		// 2. their owned assistant: the picked harness, no identity, one
		// subscription per object event and no prompt on any of them
		const assistantInput = editUserCalls.at(1)?.[1] as Record<string, unknown>;
		expect(assistantInput).toMatchObject({
			kind: "ai",
			name: "Ada's Assistant",
			role: "assistant",
			agentCategory: "individual",
			ownerUserId: "u-founder",
			runConfig: { harnessType: "claude-code" },
		});
		expect(assistantInput).not.toHaveProperty("identity");
		expect(assistantInput.subscriptions).toEqual({
			add: OBJECT_EVENTS.map((event) => ({ event })),
		});

		// Nothing after the assistant: no second agent.
		await new Promise((r) => setTimeout(r, 50));
		expect(callMock.mock.calls.filter(([name]) => name === "edit_user")).toHaveLength(2);
	});
});
