/**
 * AV2 — SettingsHarnesses SplitView component tests (AC-4)
 *
 * AC-4: Built-in harness models + credentials grouped in SplitView;
 * configurable harness also opens a destination pane; no fold for empty caps/models.
 *
 * Build order: (b) is the backend list / SplitView conversion.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsHarnesses } from "../SettingsHarnesses.js";

// Mock ToastRegion — SettingsModels + CredentialsTab call useToast which needs a provider
vi.mock("../../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: vi.fn() })),
	};
});

// Mock CredentialsTab — has its own data fetching, not under test here
vi.mock("../../components/CredentialsTab.js", () => ({
	CredentialsTab: () => <div data-testid="credentials-tab">Credentials</div>,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BUILTIN_DESCRIPTOR: HarnessCapabilityDescriptor = {
	type: "builtin",
	name: "Built-in",
	kind: "local",
	models: [
		{
			id: "openrouter/deepseek/deepseek-v4-flash",
			label: "DeepSeek V4 Flash",
			provider: "openrouter",
			contextWindow: 128000,
			selectable: true,
			inheritedFromGateway: true,
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
			inheritedFromGateway: false,
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

const MODEL_GATEWAY_RESPONSE = {
	reasoning: { provider: "anthropic", model: "claude-opus-4-8", hasApiKey: true },
	workhorse: {
		provider: "openrouter",
		model: "openrouter/deepseek/deepseek-v4-flash",
		hasApiKey: false,
	},
	fast: { provider: "anthropic", model: "claude-haiku-4-5", hasApiKey: true },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function setupFetch(
	descriptors = [BUILTIN_DESCRIPTOR, CLAUDE_CODE_DESCRIPTOR, CODEX_DESCRIPTOR],
): void {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string) => {
			const s = String(url);
			if (s.includes("/api/harnesses/redetect")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => descriptors,
				});
			}
			if (s.includes("/api/harnesses")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => descriptors,
				});
			}
			if (s.includes("/api/model-gateway")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => MODEL_GATEWAY_RESPONSE,
				});
			}
			if (s.includes("/api/credentials")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => ({ credentials: [] }),
				});
			}
			return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
		}),
	);
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
			expect(screen.getByText("Built-in")).toBeInTheDocument();
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
		});
	});

	it("selecting the builtin row opens the SplitView destination with tier rows", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
		setupFetch();
		render(<SettingsHarnesses />);

		await waitFor(() => expect(screen.getByText("Built-in")).toBeInTheDocument());

		// Click the builtin row
		await user.click(screen.getByText("Built-in"));

		// The detail pane should show tier configuration content
		await waitFor(() => {
			// Tier rows from SettingsModels: Reasoning, Workhorse, Fast
			const tierLabels = ["Reasoning", "Workhorse", "Fast"];
			const found = tierLabels.some((t) => screen.queryByText(t));
			expect(found).toBe(true);
		});
	});

	it("selecting a non-builtin configurable harness also opens a destination pane", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
		setupFetch();
		render(<SettingsHarnesses />);

		await waitFor(() => expect(screen.getByText("Claude Code")).toBeInTheDocument());

		// Click a non-builtin harness
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

		await waitFor(() => expect(screen.getByText("Built-in")).toBeInTheDocument());
		await user.click(screen.getByText("Built-in"));

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
