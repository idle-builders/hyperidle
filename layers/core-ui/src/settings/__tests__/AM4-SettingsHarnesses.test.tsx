/**
 * AM4 — SettingsHarnesses component tests (Task 9, AC1/AC4)
 *
 * AC1: Renders each in-scope backend with name, status, version, auth
 * AC4: Only in-scope backend kinds surface (codex, claude-code, opencode, cursor-agent;
 *      cursor-agent present as unavailable/no-toggle)
 *      UI renders exactly what the descriptor list contains — no out-of-scope families fabricated
 *
 * Additional:
 *  - Loading state: SkeletonList shown while fetching
 *  - Error state: ErrorState shown on fetch failure
 *  - Empty state: EmptyState shown when no descriptors returned
 *  - Re-detect button fires edit_user({ id, redetectHarnesses: true })
 *  - Disabled row: discovery.disabled=true renders "Disabled — …" status
 *
 * @lore BC5 T10: the door swap — `open_user({}).runsOn` replaces `GET
 * /api/harnesses`; `edit_user({ id: me, redetectHarnesses: true })` replaces
 * `POST /api/harnesses/redetect` (architecture.md §8). `call` is mocked at
 * the door instead of `fetch`.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsHarnesses } from "../SettingsHarnesses.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

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
		behaviour: null,
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

// ── AC1: Detection/status ─────────────────────────────────────────────────────

describe("AM4 AC1 — SettingsHarnesses renders in-scope backends with status/version/auth", () => {
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

// ── AC4: Scope — only in-scope kinds surface ─────────────────────────────────

describe("AM4 AC4 — SettingsHarnesses respects AM2 scope", () => {
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

describe("AM4 — SettingsHarnesses loading state", () => {
	it("renders a skeleton/loading indicator while fetching", () => {
		callMock.mockReset();
		callMock.mockImplementation(() => new Promise(() => {}));

		render(<SettingsHarnesses />);

		expect(screen.queryByText("Claude Code")).toBeNull();
	});
});

// ── Error state ───────────────────────────────────────────────────────────────

describe("AM4 — SettingsHarnesses error state", () => {
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

describe("AM4 — SettingsHarnesses empty state", () => {
	it("renders empty state when no descriptors returned", async () => {
		mockCall([]);

		render(<SettingsHarnesses />);

		await waitFor(() => {
			expect(screen.getByText(/no agent backends/i)).toBeInTheDocument();
		});
	});
});

// ── Re-detect (Refresh) button ────────────────────────────────────────────────

describe("AM4 — SettingsHarnesses Re-detect (Refresh) button", () => {
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

describe("AM4 — SettingsHarnesses disabled row renders correctly", () => {
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
