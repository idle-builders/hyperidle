/**
 * SetupFlow harness picker — component tests.
 *
 * Covers: the harness picker renders all descriptors, with choosability
 * gated on discovery.state; the person is created before navigating, and
 * the picked harness reaches the assistant's edit_user call with no
 * credential written; a graceful degrade — discovery failing must not
 * block setup.
 *
 * @lore The always-present built-in gateway row this file was written around is gone. It used to be the default selection, the fallback when discovery failed, and the reason primaryHarness could be omitted from the team POST. All three are now answered by the discovered harnesses themselves.
 *
 * @lore door-swap: `open_user({}).runsOn` replaces `GET /api/harnesses`; the `edit_user` calls replace `POST /api/users` → `POST /api/teams` → `POST /api/filesystems`. `call` is mocked at the door; `apiFetch` stays mocked for the plumbing `POST /api/filesystems/inspect-path` route.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../pages/SetupFlow";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock("../services/api-fetch.js", () => ({ apiFetch: apiFetchMock }));

// ── Stub descriptors ──────────────────────────────────────────────────────────

function makeDescriptor(
	type: string,
	name: string,
	state: HarnessCapabilityDescriptor["discovery"]["state"],
	models: HarnessCapabilityDescriptor["models"] = [],
): HarnessCapabilityDescriptor {
	return {
		type,
		name,
		kind: "local",
		authAction: { kind: "native_cli_login", label: "Sign in", command: [`${type}`, "login"] },
		discovery: { state, version: undefined },
		models,
		modelProviders: [],
	};
}

/** A second ready harness, so "the first choosable row" is a real choice. */
const OPENCODE_READY: HarnessCapabilityDescriptor = makeDescriptor(
	"opencode",
	"OpenCode",
	"ready",
	[
		{
			id: "openrouter/z-ai/glm-4.7-flash",
			label: "GLM 4.7 Flash",
			provider: "openrouter",
			selectable: true,
			options: [],
		},
	],
);

const CLAUDE_CODE_READY: HarnessCapabilityDescriptor = makeDescriptor(
	"claude-code",
	"Claude Code",
	"ready",
	[
		{
			id: "claude-haiku",
			label: "Haiku",
			provider: "anthropic",
			selectable: true,
			options: [],
		},
	],
);

const CODEX_MISSING: HarnessCapabilityDescriptor = makeDescriptor("codex", "Codex", "missing");

// ── Route stub ────────────────────────────────────────────────────────────────

function WorkOverviewStub(): React.JSX.Element {
	const location = useLocation();
	return (
		<div data-testid="work-page">
			work
			<span data-testid="current-search">{location.search}</span>
		</div>
	);
}

// ── Mock helpers ──────────────────────────────────────────────────────────────

interface MockOptions {
	/** Harness descriptors returned by open_user({}).runsOn */
	descriptors?: HarnessCapabilityDescriptor[];
	/** If true, open_user({}) resolves { ok: false } */
	discoveryFails?: boolean;
}

function openUserData(descriptors: HarnessCapabilityDescriptor[]): Record<string, unknown> {
	return {
		user: null,
		runsOn: descriptors,
		runConfig: null,
		documentIds: [],
		folders: [],
		subscriptions: [],
		connections: null,
		inbox: null,
	};
}

/** edit_user calls made during a submit, in order, with their input. */
function setupCallMock(opts: MockOptions = {}): {
	editUserCalls: () => Array<Record<string, unknown>>;
} {
	const editUserCalls: Array<Record<string, unknown>> = [];
	callMock.mockReset();
	callMock.mockImplementation((name: string, input: Record<string, unknown>) => {
		if (name === "open_user") {
			if (opts.discoveryFails) {
				return Promise.resolve({ ok: false, problems: [{ code: "server_error", message: "no" }] });
			}
			return Promise.resolve({
				ok: true,
				data: openUserData(opts.descriptors ?? [OPENCODE_READY]),
			});
		}
		if (name === "edit_user") {
			editUserCalls.push(input);
			if (input.kind === "human") {
				return Promise.resolve({
					ok: true,
					data: { ...openUserData([]), user: { id: "u-1", kind: "human", name: input.name } },
				});
			}
			return Promise.resolve({
				ok: true,
				data: { ...openUserData([]), user: { id: "u-agent", kind: "ai", name: input.name } },
			});
		}
		return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
	});
	return { editUserCalls: () => editUserCalls };
}

function renderSetupFlow(initialPath = "/setup"): void {
	render(
		<MemoryRouter initialEntries={[initialPath]}>
			<Routes>
				<Route path="/setup" element={<SetupFlow />} />
				<Route path="/work" element={<WorkOverviewStub />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ── All harnesses render; choosability gated on state ────────────────────────

describe("harness picker renders all descriptors", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders two choosable ready rows + a greyed missing row", async () => {
		setupCallMock({ descriptors: [OPENCODE_READY, CLAUDE_CODE_READY, CODEX_MISSING] });
		renderSetupFlow();

		await waitFor(() => {
			expect(screen.getByText("OpenCode")).toBeInTheDocument();
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
			expect(screen.getByText("Codex")).toBeInTheDocument();
		});
	});

	it("greyed missing row is NOT selectable (codex)", async () => {
		setupCallMock({ descriptors: [OPENCODE_READY, CLAUDE_CODE_READY, CODEX_MISSING] });
		renderSetupFlow();

		await waitFor(() => {
			expect(screen.getByText("Codex")).toBeInTheDocument();
		});

		const codexRow = screen.getByTestId("harness-row-codex");
		expect(codexRow).toHaveAttribute("aria-disabled", "true");
	});

	it("greyed missing row shows install hint", async () => {
		setupCallMock({ descriptors: [OPENCODE_READY, CODEX_MISSING] });
		renderSetupFlow();

		await waitFor(() => {
			expect(screen.getByText("Codex")).toBeInTheDocument();
		});

		expect(screen.getByTestId("harness-row-codex")).toHaveTextContent(/install/i);
	});

	// @lore The default used to be the built-in gateway — the one row guaranteed to be there. Discovery now decides: the form opens on the first harness this machine can actually run, so it never opens on a name that is not here.
	it("the first choosable row is default-selected (radio)", async () => {
		setupCallMock({ descriptors: [OPENCODE_READY, CLAUDE_CODE_READY] });
		renderSetupFlow();

		await waitFor(() => {
			expect(screen.getByText("OpenCode")).toBeInTheDocument();
		});

		expect(screen.getByTestId("harness-radio-opencode")).toBeChecked();
	});

	it("clicking a choosable row selects it as primary", async () => {
		const user = userEvent.setup();
		setupCallMock({ descriptors: [OPENCODE_READY, CLAUDE_CODE_READY] });
		renderSetupFlow();

		await waitFor(() => {
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
		});

		await user.click(screen.getByTestId("harness-radio-claude-code"));
		expect(screen.getByTestId("harness-radio-claude-code")).toBeChecked();
		expect(screen.getByTestId("harness-radio-opencode")).not.toBeChecked();
	});

	it("clicking a greyed row does NOT select it", async () => {
		const user = userEvent.setup();
		setupCallMock({ descriptors: [OPENCODE_READY, CODEX_MISSING] });
		renderSetupFlow();

		await waitFor(() => {
			expect(screen.getByText("Codex")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Codex"));
		expect(screen.getByTestId("harness-radio-opencode")).toBeChecked();
	});
});

// ── Graceful degrade when discovery fails ─────────────────────────────────────

describe("harness picker graceful degrade", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// @lore A failed probe is not the same fact as "no harness is installed", and setup must not treat it as one. There is no row to fall back to any more, so the degrade is: render no rows, block nothing, and let the person continue — the alternative would strand someone over a probe error. The genuine "nothing can run here" case is a populated list with nothing choosable in it, covered in setup-blocks-with-no-harness.test.tsx.
	it("renders no harness rows when open_user({}) fails", async () => {
		setupCallMock({ discoveryFails: true });
		renderSetupFlow();

		await waitFor(() => {
			expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
		});
		expect(screen.queryByTestId("harness-radio-opencode")).not.toBeInTheDocument();
		expect(screen.queryByTestId("no-harness-available")).not.toBeInTheDocument();
	});

	it("Start button still enables on a name alone when discovery fails", async () => {
		const user = userEvent.setup();
		setupCallMock({ discoveryFails: true });
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		const startBtn = screen.getByRole("button", { name: /start hyperidle/i });
		expect(startBtn).not.toBeDisabled();
	});
});

// ── person created first + picked harness reaches the agents ─────────────────

describe("setup submit ordering — person before their assistant, no credential", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// @lore This asserted a PUT /api/credentials landed before the navigate, back when setup collected an API key and stored it for a harness to run on. Setup asks for no credential now — the harness holds its own — so the ordering guarantee is that the person is created before the assistant that needs their id, and no credential write ever happens.
	it("creates the person before their assistant, and writes no credential", async () => {
		const user = userEvent.setup();
		const { editUserCalls } = setupCallMock({ descriptors: [OPENCODE_READY] });
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await user.click(screen.getByRole("button", { name: /start hyperidle/i }));

		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		const searchEl = screen.getByTestId("current-search");
		expect(searchEl.textContent).toContain("onboarding=true");

		const calls = editUserCalls();
		expect(calls).toHaveLength(2);
		expect(calls[0]?.kind).toBe("human");
		expect(calls[1]?.kind).toBe("ai");
		// No credential write: the only door calls are open_user + two edit_user.
		const names = callMock.mock.calls.map(([name]) => name);
		expect(names.every((name) => name === "open_user" || name === "edit_user")).toBe(true);
	});

	it("primaryHarness reaches the assistant's edit_user call when a ready harness is selected", async () => {
		const user = userEvent.setup();
		const { editUserCalls } = setupCallMock({ descriptors: [OPENCODE_READY, CLAUDE_CODE_READY] });
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		await waitFor(() => {
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
		});
		await user.click(screen.getByTestId("harness-radio-claude-code"));

		await user.click(screen.getByRole("button", { name: /start hyperidle/i }));

		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		const calls = editUserCalls();
		const assistantCall = calls[1] as { runConfig?: { harnessType?: string } };
		expect(assistantCall.runConfig?.harnessType).toBe("claude-code");
	});

	// @lore This used to assert the opposite: builtin was the server-side default, so choosing it meant sending nothing and letting the server fill it in. There is no default harness to fall back to now, so the chosen one is always named.
	it("primaryHarness names the chosen harness even when it is the only one", async () => {
		const user = userEvent.setup();
		const { editUserCalls } = setupCallMock({ descriptors: [OPENCODE_READY] });
		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");

		await waitFor(() => {
			expect(screen.getByTestId("harness-row-opencode")).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /start hyperidle/i }));

		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		const calls = editUserCalls();
		const assistantCall = calls[1] as { runConfig?: { harnessType?: string } };
		expect(assistantCall.runConfig?.harnessType).toBe("opencode");
	});
});

// ── W1: isCode client-side decision — code vs doc_set based on inspect-path result ──

describe("SetupFlow filesystem kind decision (isCode client logic)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function setupApiFetchWithInspect(inspectResult: {
		exists: boolean;
		isGitRepo: boolean;
		branch: string | null;
	}): void {
		apiFetchMock.mockReset();
		apiFetchMock.mockImplementation((url: string) => {
			if (typeof url === "string" && url.includes("/api/filesystems/inspect-path")) {
				return Promise.resolve({ ok: true, json: async () => inspectResult });
			}
			return Promise.resolve({ ok: false, json: async () => ({}) });
		});
	}

	it("git repo with resolvable branch → the person's folders.add has kind:'code' with branch", async () => {
		const user = userEvent.setup();
		const { editUserCalls } = setupCallMock({ descriptors: [OPENCODE_READY] });
		setupApiFetchWithInspect({ exists: true, isGitRepo: true, branch: "main" });

		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await user.type(screen.getByRole("textbox", { name: /folder/i }), "/home/alice/myrepo");

		await user.click(screen.getByRole("button", { name: /start hyperidle/i }));

		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		const personCall = editUserCalls()[0] as {
			folders?: { add?: Array<Record<string, unknown>> };
		};
		const folder = personCall.folders?.add?.[0];
		expect(folder).toBeDefined();
		expect(folder?.["kind"]).toBe("code");
		const ref = folder?.["resourceRef"] as Record<string, unknown> | undefined;
		expect(ref?.["branch"]).toBe("main");
		expect(folder?.["writeback"]).toBe("none");
	});

	it("git repo with no resolvable branch (null) → folders.add has kind:'doc_set', not code", async () => {
		const user = userEvent.setup();
		const { editUserCalls } = setupCallMock({ descriptors: [OPENCODE_READY] });
		// Empty-branch case: isGitRepo=true but branch=null (no commits yet)
		setupApiFetchWithInspect({ exists: true, isGitRepo: true, branch: null });

		renderSetupFlow();

		await user.type(screen.getByLabelText(/your name/i), "Alice");
		await user.type(screen.getByRole("textbox", { name: /folder/i }), "/home/alice/empty-repo");

		await user.click(screen.getByRole("button", { name: /start hyperidle/i }));

		await waitFor(() => {
			expect(screen.getByTestId("work-page")).toBeInTheDocument();
		});

		const personCall = editUserCalls()[0] as {
			folders?: { add?: Array<Record<string, unknown>> };
		};
		const folder = personCall.folders?.add?.[0];
		expect(folder).toBeDefined();
		expect(folder?.["kind"]).toBe("doc_set");
		const ref = folder?.["resourceRef"] as Record<string, unknown> | undefined;
		expect(ref?.["branch"]).toBeUndefined();
		expect(folder?.["writeback"]).toBe("none");
	});
});
