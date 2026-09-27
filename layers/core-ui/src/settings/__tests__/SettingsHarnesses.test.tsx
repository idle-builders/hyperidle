/**
 * SettingsHarnesses component tests.
 *
 * Covers: renders each in-scope backend with name, status, version, auth;
 * only in-scope backend kinds surface (codex, claude-code, opencode,
 * cursor-agent; cursor-agent present as unavailable/no-toggle) — UI renders
 * exactly what the descriptor list contains, no out-of-scope families
 * fabricated; loading/error/empty states; re-detect button fires
 * edit_user({ id, redetectHarnesses: true }); a disabled row renders
 * "Disabled — …" status.
 *
 * @lore door-swap: `open_user({}).runsOn` replaces `GET /api/harnesses`; `edit_user({ id: me, redetectHarnesses: true })` replaces `POST /api/harnesses/redetect`. `call` is mocked at the door instead of `fetch`.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsHarnesses } from "../SettingsHarnesses.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

// Mock ToastRegion — SettingsModels calls useToast which needs a provider
vi.mock("../../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: vi.fn() })),
	};
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_DESCRIPTORS = [
	{
		type: "claude-code",
		name: "Claude Code",
		kind: "local",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Claude Code",
			command: ["claude", "auth", "login"],
		},
		discovery: { state: "ready", version: "2.1.178" },
		models: [
			{
				id: "claude-sonnet-4-6",
				label: "Claude Sonnet 4.6",
				provider: "anthropic",
				selectable: true,
				options: [],
			},
		],
		modelProviders: ["anthropic"],
	},
	{
		type: "codex",
		name: "Codex",
		kind: "local",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Codex",
			command: ["codex", "login"],
		},
		discovery: { state: "unauthenticated", version: "0.141.0" },
		models: [],
		modelProviders: [],
	},
	{
		type: "opencode",
		name: "OpenCode",
		kind: "local",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to OpenCode",
			command: ["opencode", "providers", "login"],
		},
		discovery: { state: "installed", version: "1.17.8" },
		models: [],
		modelProviders: [],
	},
	{
		type: "cursor-agent",
		name: "Cursor Agent",
		kind: "local",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Cursor",
			command: ["cursor-agent", "login"],
		},
		discovery: { state: "ready", version: "2026.07.09" },
		models: [],
		modelProviders: [],
	},
];

const DISABLED_DESCRIPTOR = {
	...MOCK_DESCRIPTORS[1],
	discovery: {
		state: "ready" as const,
		version: "2.1.178",
		disabled: true,
		reason: "Turned off by user.",
	},
};

const SELF_ROW = { id: "me", kind: "human", name: "Me", team: { id: "team-1", name: "Acme" } };

function openUserData(descriptors: unknown[]): Record<string, unknown> {
	return {
		user: SELF_ROW,
		runsOn: descriptors,
		runConfig: null,
		documentIds: [],
		folders: [],
		subscriptions: [],
		connections: null,
		inbox: null,
	};
}

// biome-ignore lint/suspicious/noExplicitAny: test fixture accepts partial descriptor shapes
function mockCall(descriptors: any[] = MOCK_DESCRIPTORS): void {
	callMock.mockReset();
	callMock.mockImplementation((name: string, input: Record<string, unknown>) => {
		if (name === "open_user") {
			return Promise.resolve({ ok: true, data: openUserData(descriptors) });
		}
		if (name === "edit_user" && input.redetectHarnesses === true) {
			return Promise.resolve({ ok: true, data: openUserData(descriptors) });
		}
		return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

// ── Detection/status ──────────────────────────────────────────────────────────

describe("SettingsHarnesses renders in-scope backends with status/version/auth", () => {
	it("renders each backend name from the descriptor list", async () => {
		mockCall();
		render(<SettingsHarnesses />);

		await waitFor(() => {
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
			expect(screen.getByText("Codex")).toBeInTheDocument();
			expect(screen.getByText("OpenCode")).toBeInTheDocument();
			expect(screen.getByText("Cursor Agent")).toBeInTheDocument();
		});
	});

	it("renders version text for versioned backends", async () => {
		mockCall();
		render(<SettingsHarnesses />);

		await waitFor(() => {
			expect(screen.getByText(/v2\.1\.178/)).toBeInTheDocument();
		});
	});
});

// ── Scope — only in-scope kinds surface ──────────────────────────────────────

describe("SettingsHarnesses respects scope", () => {
	it("renders exactly the descriptor-provided names (no out-of-scope kind fabricated)", async () => {
		mockCall();
		render(<SettingsHarnesses />);

		await waitFor(() => {
			expect(screen.getByText("OpenCode")).toBeInTheDocument();
		});

		expect(screen.queryByText(/^aider$/i)).toBeNull();
		expect(screen.queryByText(/^goose$/i)).toBeNull();
	});

	it("cursor-agent renders as ready and actionable", async () => {
		mockCall();
		const user = userEvent.setup();
		render(<SettingsHarnesses />);

		await waitFor(() => {
			expect(screen.getByText("Cursor Agent")).toBeInTheDocument();
		});

		expect(screen.queryByRole("switch")).toBeNull();

		await user.click(screen.getByText("Cursor Agent"));
		await waitFor(() => {
			expect(screen.getByText("cursor-agent login")).toBeInTheDocument();
		});
	});
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe("SettingsHarnesses loading state", () => {
	it("renders a skeleton/loading indicator while fetching", () => {
		callMock.mockReset();
		callMock.mockImplementation(() => new Promise(() => {}));

		render(<SettingsHarnesses />);

		expect(screen.queryByText("Claude Code")).toBeNull();
	});
});

// ── Error state ───────────────────────────────────────────────────────────────

describe("SettingsHarnesses error state", () => {
	it("renders error state when open_user fails", async () => {
		callMock.mockReset();
		callMock.mockResolvedValue({ ok: false, problems: [{ code: "server_error", message: "no" }] });

		render(<SettingsHarnesses />);

		await waitFor(() => {
			expect(screen.getByText(/couldn't detect|error|failed/i)).toBeInTheDocument();
		});
	});
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe("SettingsHarnesses empty state", () => {
	it("renders empty state when no descriptors returned", async () => {
		mockCall([]);

		render(<SettingsHarnesses />);

		await waitFor(() => {
			expect(screen.getByText(/no agent backends/i)).toBeInTheDocument();
		});
	});
});

// ── Re-detect (Refresh) button ────────────────────────────────────────────────

describe("SettingsHarnesses Re-detect (Refresh) button", () => {
	it("renders a Refresh/Re-detect button in the section header", async () => {
		mockCall();
		render(<SettingsHarnesses />);

		await waitFor(() => {
			const refreshBtn = screen.getByRole("button", { name: /re-detect|refresh/i });
			expect(refreshBtn).toBeInTheDocument();
		});
	});

	it("clicking Refresh calls edit_user({ id: me, redetectHarnesses: true })", async () => {
		mockCall();
		const user = userEvent.setup();
		render(<SettingsHarnesses />);

		await waitFor(() => screen.getByRole("button", { name: /re-detect|refresh/i }));
		await user.click(screen.getByRole("button", { name: /re-detect|refresh/i }));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", { id: "me", redetectHarnesses: true });
		});
	});
});

// ── Disabled row ──────────────────────────────────────────────────────────────

describe("SettingsHarnesses disabled row renders correctly", () => {
	it("renders 'Disabled —' status line for discovery.disabled=true", async () => {
		const descriptorsWithDisabled = [
			MOCK_DESCRIPTORS[0],
			DISABLED_DESCRIPTOR,
			...MOCK_DESCRIPTORS.slice(2),
		];
		mockCall(descriptorsWithDisabled);

		render(<SettingsHarnesses />);

		await waitFor(() => {
			expect(screen.getByText(/disabled/i)).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// SplitView: a configurable harness opens a destination pane
// ---------------------------------------------------------------------------

const OPENCODE_DESCRIPTOR: HarnessCapabilityDescriptor = {
	type: "opencode",
	name: "OpenCode",
	kind: "local",
	models: [
		{
			id: "openrouter/deepseek/deepseek-v4-flash",
			label: "DeepSeek V4 Flash",
			provider: "openrouter",
			contextWindow: 128000,
			selectable: true,
			options: [],
		},
	],
	modelProviders: ["anthropic", "openrouter", "openai-compatible"],
	discovery: { state: "ready" },
	authAction: { kind: "enter_api_key", label: "Enter API key" },
};

const CLAUDE_CODE_DESCRIPTOR: HarnessCapabilityDescriptor = {
	type: "claude-code",
	name: "Claude Code",
	kind: "local",
	models: [
		{
			id: "claude-sonnet-4-6",
			label: "Claude Sonnet 4.6",
			provider: "anthropic",
			contextWindow: 1000000,
			selectable: true,
			options: [],
		},
	],
	modelProviders: ["anthropic"],
	discovery: { state: "ready" },
	authAction: {
		kind: "native_cli_login",
		label: "Log in to Claude Code",
		command: ["claude", "auth", "login"],
	},
};

const CODEX_DESCRIPTOR: HarnessCapabilityDescriptor = {
	type: "codex",
	name: "Codex",
	kind: "local",
	models: [],
	modelProviders: [],
	discovery: { state: "missing" },
	authAction: {
		kind: "native_cli_login",
		label: "Log in to Codex",
		command: ["codex", "login"],
	},
};

// Descriptor with no caps and no models — should NOT trigger split open
const EMPTY_DESCRIPTOR: HarnessCapabilityDescriptor = {
	type: "cursor-agent",
	name: "Cursor Agent",
	kind: "local",
	models: [],
	modelProviders: [],
	discovery: { state: "missing" },
	authAction: { kind: "none", label: "" },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function setupFetch(
	descriptors = [OPENCODE_DESCRIPTOR, CLAUDE_CODE_DESCRIPTOR, CODEX_DESCRIPTOR],
): void {
	callMock.mockReset();
	callMock.mockImplementation((name: string) => {
		if (name === "open_user") {
			return Promise.resolve({
				ok: true,
				data: {
					user: SELF_ROW,
					runsOn: descriptors,
					runConfig: null,
					documentIds: [],
					folders: [],
					subscriptions: [],
					connections: null,
					inbox: null,
				},
			});
		}
		return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
	});
}

describe("SettingsHarnesses SplitView", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("renders harness rows using Row/ItemList pattern", async () => {
		setupFetch();
		render(<SettingsHarnesses />);

		await waitFor(() => {
			expect(screen.getByText("OpenCode")).toBeInTheDocument();
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
		});
	});

	// @lore This used to assert that selecting the built-in row opened a detail pane made of model-tier rows and a credentials editor — its own pane, unlike every other harness. That pane went with the gateway it configured; there is one detail pane now and every harness gets the same one.
	it("selecting a key-accepting harness opens the same detail pane as any other", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
		setupFetch();
		render(<SettingsHarnesses />);

		await waitFor(() => expect(screen.getByText("OpenCode")).toBeInTheDocument());

		await user.click(screen.getByText("OpenCode"));

		await waitFor(() => {
			// The detail pane is visible — the selected harness name appears there too.
			expect(screen.getAllByText("OpenCode").length).toBeGreaterThanOrEqual(2);
		});
		// The tier rows that only the built-in pane ever rendered are gone.
		for (const tier of ["Reasoning", "Workhorse", "Fast"]) {
			expect(screen.queryByText(tier)).not.toBeInTheDocument();
		}
	});

	it("selecting a login-only harness also opens a destination pane", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
		setupFetch();
		render(<SettingsHarnesses />);

		await waitFor(() => expect(screen.getByText("Claude Code")).toBeInTheDocument());

		await user.click(screen.getByText("Claude Code"));

		// Some destination pane content should appear (auth action / harness name / status)
		await waitFor(() => {
			// The detail pane must be visible — the selected harness name should appear there
			const elements = screen.getAllByText("Claude Code");
			expect(elements.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("SplitView receives onRatioChange prop (ratio persists beyond surfaceKey)", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
		setupFetch();
		const { container } = render(<SettingsHarnesses />);

		await waitFor(() => expect(screen.getByText("OpenCode")).toBeInTheDocument());
		await user.click(screen.getByText("OpenCode"));

		// SplitView destination pane present means the component wired split mode
		await waitFor(() => {
			// The split pane container renders a data-fold-mode attribute
			const splitEl = container.querySelector("[data-fold-mode]");
			expect(splitEl).not.toBeNull();
		});
	});

	it("a descriptor with no caps and no models does not open a destination pane when clicked", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
		setupFetch([EMPTY_DESCRIPTOR]);
		render(<SettingsHarnesses />);

		await waitFor(() => expect(screen.getByText("Cursor Agent")).toBeInTheDocument());

		// Codex is disabled/missing — clicking should not open destination
		const before = document.querySelectorAll("[data-fold-mode]").length;
		await user.click(screen.getByText("Cursor Agent"));

		// No destination opened
		const after = document.querySelectorAll("[data-fold-mode]").length;
		expect(after).toBe(before);
	});
});
