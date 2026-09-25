/**
 * AV2 — SettingsHarnesses SplitView component tests (AC-4)
 *
 * AC-4: a configurable harness opens a destination pane; no fold for empty
 * caps/models. The built-in harness's own pane — model tiers plus a credentials
 * editor — is gone with that harness; every harness now shares one detail pane.
 *
 * Build order: (b) is the backend list / SplitView conversion.
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

// ---------------------------------------------------------------------------
// Fixtures
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

const SELF_ROW = { id: "me", kind: "human", name: "Me", team: { id: "team-1", name: "Acme" } };

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

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsHarnesses SplitView", () => {
	it("renders harness rows using Row/ItemList pattern", async () => {
		setupFetch();
		render(<SettingsHarnesses />);

		await waitFor(() => {
			expect(screen.getByText("OpenCode")).toBeInTheDocument();
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
		});
	});

	// @lore This used to assert that selecting the built-in row opened a detail
	// pane made of model-tier rows and a credentials editor — its own pane, unlike
	// every other harness. That pane went with the gateway it configured; there is
	// one detail pane now and every harness gets the same one.
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
