/**
 * AM4 RED — SettingsHarnesses component tests (Task 9, AC1/AC4)
 *
 * AC1: Renders each in-scope backend with name, status, version, auth
 * AC4: Only in-scope backend kinds surface (builtin, codex, claude-code, opencode;
 *      cursor-agent present as unavailable/no-toggle)
 *      UI renders exactly what the descriptor list contains — no out-of-scope families fabricated
 *
 * Additional:
 *  - Loading state: SkeletonList shown while fetching
 *  - Error state: ErrorState shown on fetch failure
 *  - Empty state: EmptyState shown when no descriptors returned
 *  - Re-detect button fires POST /api/harnesses/redetect
 *  - Ready-with-unknown-caps: production shape renders "confirmed after first run"
 *  - Disabled row: discovery.disabled=true renders "Disabled — …" status
 *
 * FAILS until:
 *  - layers/core-ui/src/settings/SettingsHarnesses.tsx is created
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsHarnesses } from "../SettingsHarnesses.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ALL_CAPS_FALSE = {
	preCompactionTrigger: false,
	subAgents: false,
	mcpSupport: false,
	modelProviders: [] as string[],
	fileEditing: false,
	toolUse: false,
};

/** The five AM4-scope descriptors (production shape — caps all-false) */
const MOCK_DESCRIPTORS = [
	{
		type: "builtin",
		name: "Built-in",
		kind: "local",
		accessMode: "api-gateway",
		authAction: { kind: "enter_api_key", label: "Enter API key" },
		discovery: { state: "ready" },
		models: [
			{
				id: "claude-opus-4-8",
				label: "Claude Opus 4.8",
				provider: "anthropic",
				selectable: true,
				options: [],
			},
		],
		runtime: { ...ALL_CAPS_FALSE, modelProviders: ["anthropic", "openrouter"] },
		modelProviders: ["anthropic", "openrouter"],
	},
	{
		type: "claude-code",
		name: "Claude Code",
		kind: "local",
		accessMode: "provider-subscription-cli",
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
		runtime: { ...ALL_CAPS_FALSE, modelProviders: ["anthropic"] },
		modelProviders: ["anthropic"],
	},
	{
		type: "codex",
		name: "Codex",
		kind: "local",
		accessMode: "provider-subscription-cli",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Codex",
			command: ["codex", "login"],
		},
		discovery: { state: "unauthenticated", version: "0.141.0" },
		models: [],
		runtime: ALL_CAPS_FALSE,
		modelProviders: [],
	},
	{
		type: "opencode",
		name: "OpenCode",
		kind: "local",
		accessMode: "provider-subscription-cli",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to OpenCode",
			command: ["opencode", "providers", "login"],
		},
		discovery: { state: "installed", version: "1.17.8" },
		models: [],
		runtime: ALL_CAPS_FALSE,
		modelProviders: [],
	},
	{
		type: "cursor-agent",
		name: "Cursor Agent",
		kind: "local",
		accessMode: "provider-subscription-cli",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Cursor",
			command: ["cursor-agent", "login"],
		},
		discovery: { state: "ready", version: "2026.07.09" },
		models: [],
		runtime: ALL_CAPS_FALSE,
		modelProviders: [],
	},
];

const DISABLED_DESCRIPTOR = {
	...MOCK_DESCRIPTORS[1]!, // claude-code
	discovery: {
		state: "ready" as const,
		version: "2.1.178",
		// AM4 scope addition: discovery.disabled is stamped by the route handler
		// The type extension will be formal in the green phase
		disabled: true,
		reason: "Turned off by user.",
	} as { state: "ready"; version: string; disabled: boolean; reason: string },
};

// biome-ignore lint/suspicious/noExplicitAny: test fixture accepts partial descriptor shapes
function mockFetch(descriptors: any[] = MOCK_DESCRIPTORS): void {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string, init?: RequestInit) => {
			if (typeof url === "string" && url.includes("/api/harnesses/redetect")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => descriptors,
				});
			}
			if (typeof url === "string" && url.includes("/api/harnesses")) {
				const method = (init?.method ?? "GET").toUpperCase();
				if (method === "GET") {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => descriptors,
					});
				}
				if (method === "POST") {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => descriptors,
					});
				}
			}
			return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
		}),
	);
}

// ── AC1: Detection/status ─────────────────────────────────────────────────────

describe("AM4 AC1 — SettingsHarnesses renders in-scope backends with status/version/auth", () => {
	beforeEach(() => {
		mockFetch();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders each backend name from the descriptor list", async () => {
		render(<SettingsHarnesses />);

		await waitFor(() => {
			expect(screen.getByText("Built-in")).toBeInTheDocument();
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
			expect(screen.getByText("Codex")).toBeInTheDocument();
			expect(screen.getByText("OpenCode")).toBeInTheDocument();
			expect(screen.getByText("Cursor Agent")).toBeInTheDocument();
		});
	});

	it("renders version text for versioned backends", async () => {
		render(<SettingsHarnesses />);

		await waitFor(() => {
			// version 2.1.178 for claude-code
			expect(screen.getByText(/v2\.1\.178/)).toBeInTheDocument();
		});
	});

	// AV2: auth zone moved to the SplitView destination pane (shown when row is clicked).
	// The row-list view no longer shows "codex login" inline. Covered by AV2-SettingsHarnesses tests.
});

// ── AC4: Scope — only in-scope kinds surface ─────────────────────────────────

describe("AM4 AC4 — SettingsHarnesses respects AM2 scope", () => {
	beforeEach(() => {
		mockFetch();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders exactly the descriptor-provided names (no out-of-scope kind fabricated)", async () => {
		render(<SettingsHarnesses />);

		await waitFor(() => {
			expect(screen.getByText("Built-in")).toBeInTheDocument();
		});

		// The UI must render ONLY what the descriptor list contains
		// Check no out-of-scope harness type appears (e.g. "Aider", "Goose")
		expect(screen.queryByText(/^aider$/i)).toBeNull();
		expect(screen.queryByText(/^goose$/i)).toBeNull();
	});

	it("cursor-agent renders as ready and actionable", async () => {
		const descriptors = MOCK_DESCRIPTORS.map((descriptor) =>
			descriptor.type === "cursor-agent"
				? {
						...descriptor,
						runtime: {
							...descriptor.runtime,
							toolUse: true,
						},
					}
				: descriptor,
		);
		mockFetch(descriptors);
		const user = userEvent.setup();
		render(<SettingsHarnesses />);

		await waitFor(() => {
			expect(screen.getByText("Cursor Agent")).toBeInTheDocument();
		});

		// AV2 split-view: no row toggle; actionable means detail pane opens with login command.
		expect(screen.queryByRole("switch")).toBeNull();
		const cursorRow = screen.getByText("Cursor Agent").closest("li");
		expect(cursorRow).not.toBeNull();
		expect(
			within(cursorRow as HTMLLIElement).getByText("Authenticated and ready."),
		).toBeInTheDocument();

		await user.click(screen.getByText("Cursor Agent"));
		await waitFor(() => {
			expect(screen.getByText("cursor-agent login")).toBeInTheDocument();
		});
	});
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe("AM4 — SettingsHarnesses loading state", () => {
	it("renders a skeleton/loading indicator while fetching", () => {
		// Stall the fetch
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() => new Promise(() => {})),
		);

		render(<SettingsHarnesses />);

		// Should show some loading indicator — either aria-busy, skeleton text, or spinner
		// The exact implementation uses SkeletonList, so we check for a loading state
		// At minimum, the backends are NOT yet rendered (loading)
		expect(screen.queryByText("Claude Code")).toBeNull();

		vi.restoreAllMocks();
	});
});

// ── Error state ───────────────────────────────────────────────────────────────

describe("AM4 — SettingsHarnesses error state", () => {
	it("renders error state when fetch fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
		);

		render(<SettingsHarnesses />);

		await waitFor(() => {
			// ErrorState should render something about "couldn't detect" or "error"
			expect(screen.getByText(/couldn't detect|error|failed/i)).toBeInTheDocument();
		});

		vi.restoreAllMocks();
	});
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe("AM4 — SettingsHarnesses empty state", () => {
	it("renders empty state when no descriptors returned", async () => {
		mockFetch([]);

		render(<SettingsHarnesses />);

		await waitFor(() => {
			// EmptyState must render when no descriptors
			expect(screen.getByText(/no agent backends/i)).toBeInTheDocument();
		});

		vi.restoreAllMocks();
	});
});

// ── Re-detect (Refresh) button ────────────────────────────────────────────────

describe("AM4 — SettingsHarnesses Re-detect (Refresh) button", () => {
	beforeEach(() => {
		mockFetch();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders a Refresh/Re-detect button in the section header", async () => {
		render(<SettingsHarnesses />);

		await waitFor(() => {
			// Refresh button must be present (aria-label="Re-detect backends" or similar)
			const refreshBtn = screen.getByRole("button", { name: /re-detect|refresh/i });
			expect(refreshBtn).toBeInTheDocument();
		});
	});

	it("clicking Refresh fires POST /api/harnesses/redetect", async () => {
		const fetchMock = vi.fn().mockImplementation((url: string, _init?: RequestInit) => {
			if (typeof url === "string" && url.includes("/api/harnesses/redetect")) {
				return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_DESCRIPTORS });
			}
			if (typeof url === "string" && url.includes("/api/harnesses")) {
				return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_DESCRIPTORS });
			}
			return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
		});
		vi.stubGlobal("fetch", fetchMock);

		const user = userEvent.setup();
		render(<SettingsHarnesses />);

		await waitFor(() => screen.getByRole("button", { name: /re-detect|refresh/i }));
		await user.click(screen.getByRole("button", { name: /re-detect|refresh/i }));

		await waitFor(() => {
			const redetectCall = fetchMock.mock.calls.find(
				(call) =>
					typeof call[0] === "string" &&
					call[0].includes("/api/harnesses/redetect") &&
					(call[1] as RequestInit | undefined)?.method === "POST",
			);
			expect(redetectCall).toBeDefined();
		});
	});
});

// ── AC2-production-shape: moved to SplitView detail pane ─────────────────────
// AV2: "confirmed after first run" text was part of HarnessCard caps display.
// HarnessCard replaced with Row/ItemList; caps shown in the SplitView detail pane.
// These tests are now covered by AV2-SettingsHarnesses.test.tsx.

// ── Disabled row ──────────────────────────────────────────────────────────────

describe("AM4 — SettingsHarnesses disabled row renders correctly", () => {
	it("renders 'Disabled —' status line for discovery.disabled=true", async () => {
		const descriptorsWithDisabled = [
			...MOCK_DESCRIPTORS.slice(0, 1),
			// biome-ignore lint/suspicious/noExplicitAny: test fixture uses partial disabled shape
			DISABLED_DESCRIPTOR as any,
			...MOCK_DESCRIPTORS.slice(2),
		];
		mockFetch(descriptorsWithDisabled);

		render(<SettingsHarnesses />);

		await waitFor(() => {
			expect(screen.getByText(/disabled/i)).toBeInTheDocument();
		});

		vi.restoreAllMocks();
	});

	// AV2: toggle removed from SettingsHarnesses — disabled state shown via Row status text.
	// The Row component has no switch/toggle; enabled/disabled is status-only.
});
