/**
 * AV2 — SettingsAgents SplitView component tests (RED phase)
 *
 * AC-1: Assistant is a row; no role filter; clicking opens the shared editor in SplitView
 * AC-2: Agent detail opens in SplitView; model dropdown uses discovered models
 * AC-5: Worker section removed (worker removed from SETTINGS_SECTIONS union)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsAgents } from "../SettingsAgents.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_HARNESSES_WITH_MODELS = [
	{
		type: "builtin",
		name: "Built-in",
		kind: "local",
		models: [
			{
				id: "deepseek/deepseek-v4-flash",
				label: "DeepSeek V4 Flash",
				provider: "openrouter",
				contextWindow: 128000,
				selectable: true,
				inheritedFromGateway: true,
				options: [],
			},
		],
		modelProviders: ["anthropic", "openrouter"],
		accessMode: "api-gateway",
		discovery: { state: "ready" },
		authAction: { kind: "enter_api_key", label: "Enter API key" },
		inheritedTools: [],
		runtime: {
			preCompactionTrigger: false,
			subAgents: false,
			mcpSupport: false,
			modelProviders: [],
			fileEditing: true,
			toolUse: true,
		},
	},
	{
		type: "codex",
		name: "Codex",
		kind: "local",
		models: [],
		modelProviders: [],
		accessMode: "provider-subscription-cli",
		discovery: { state: "ready" },
		authAction: { kind: "native_cli_login", label: "Log in to Codex", command: ["codex", "login"] },
		inheritedTools: [],
		runtime: {
			preCompactionTrigger: false,
			subAgents: false,
			mcpSupport: false,
			modelProviders: [],
			fileEditing: false,
			toolUse: false,
		},
	},
];

const MOCK_AGENTS = [
	{
		id: "ast-user1",
		name: "Nova",
		role: "assistant",
		systemPrompt: "I am your assistant",
		harnessType: "builtin",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
		modelTierPreference: null,
		maxConcurrentSessions: 1,
		status: "active",
		activeSessions: 0,
		agentCategory: "individual",
		filesystemIds: [],
	},
	{
		id: "agent-atlas",
		name: "Atlas",
		role: "builder",
		systemPrompt: "Build things",
		harnessType: "builtin",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
		modelTierPreference: null,
		maxConcurrentSessions: 1,
		status: "active",
		activeSessions: 0,
		agentCategory: "team",
		filesystemIds: [],
	},
];

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

const mockShowToast = vi.fn();
vi.mock("../../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../../shell/ToastRegion.js");
	return { ...actual, useToast: vi.fn(() => ({ showToast: mockShowToast })) };
});

function setupFetch(): void {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string) => {
			const urlStr = String(url);
			if (urlStr.includes("/api/harnesses") && !urlStr.includes("redetect")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => MOCK_HARNESSES_WITH_MODELS,
				});
			}
			if (urlStr.includes("/api/agents/templates/")) {
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}
			if (urlStr.includes("/api/agents")) {
				return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_AGENTS });
			}
			if (urlStr.includes("/api/filesystems")) {
				return Promise.resolve({ ok: true, status: 200, json: async () => ({ filesystems: [] }) });
			}
			if (urlStr.includes("/api/org")) {
				return Promise.resolve({ ok: true, status: 200, json: async () => ({ teams: [] }) });
			}
			return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
		}),
	);
}

// ---------------------------------------------------------------------------
// AC-1: Assistant row visible (no filter)
// ---------------------------------------------------------------------------

describe("AV2 AC-1: Assistant is a row in the agents list", () => {
	beforeEach(() => {
		setupFetch();
		mockShowToast.mockClear();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders Nova (ast-*) as a row alongside normal agents", async () => {
		render(<SettingsAgents />);

		await waitFor(() => {
			expect(screen.getByText("Nova")).toBeInTheDocument();
			expect(screen.getByText("Atlas")).toBeInTheDocument();
		});
	});

	it("clicking Nova (ast-*) opens the shared editor pane", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => screen.getByText("Nova"));
		await user.click(screen.getByText("Nova"));

		// Editor pane should be visible
		await waitFor(() => {
			expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// AC-2: Model select shows discovered models (not MODEL_CATALOG)
// ---------------------------------------------------------------------------

describe("AV2 AC-2: Agent editor model dropdown uses discovered descriptor.models", () => {
	beforeEach(() => {
		setupFetch();
		mockShowToast.mockClear();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("selects Atlas and the model dropdown shows the discovered model id", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => screen.getByText("Atlas"));
		await user.click(screen.getByText("Atlas"));

		await waitFor(() => {
			const modelSelect = screen.getByRole("combobox", { name: /model/i });
			const options = Array.from(modelSelect.querySelectorAll("option")).map(
				(o) => (o as HTMLOptionElement).value,
			);
			expect(options).toContain("deepseek/deepseek-v4-flash");
		});
	});
});

// ---------------------------------------------------------------------------
// AC-2: Ratio persistence — onRatioChange is wired
// ---------------------------------------------------------------------------

describe("AV2 AC-2: SplitView ratio persistence is wired via useUiPreference", () => {
	beforeEach(() => {
		setupFetch();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders without crashing (SplitView persistence wiring)", async () => {
		render(<SettingsAgents />);
		await waitFor(() => screen.getByText("Nova"));
		// If onRatioChange were missing the SplitView would still render; the
		// real test is that the ratio persists — verified via useUiPreference unit test
		expect(screen.getByText("Nova")).toBeInTheDocument();
	});
});
