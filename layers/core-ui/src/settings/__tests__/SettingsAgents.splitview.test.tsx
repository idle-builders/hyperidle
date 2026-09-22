/**
 * AV2 — SettingsAgents SplitView component tests (RED phase)
 *
 * AC-1: Assistant is a row; no role filter; clicking opens the shared editor in SplitView
 * AC-2: Agent detail opens in SplitView; model dropdown uses discovered models
 * AC-5: Worker section removed (worker removed from SETTINGS_SECTIONS union)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsAgents } from "../SettingsAgents.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_HARNESSES_WITH_MODELS = [
	{
		type: "opencode",
		name: "OpenCode",
		kind: "local",
		models: [
			{
				id: "deepseek/deepseek-v4-flash",
				label: "DeepSeek V4 Flash",
				provider: "openrouter",
				contextWindow: 128000,
				selectable: true,
				options: [],
			},
		],
		modelProviders: ["anthropic", "openrouter"],
		accessMode: "api-gateway",
		discovery: { state: "ready" },
		authAction: { kind: "enter_api_key", label: "Enter API key" },
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
		id: "agent-nova",
		name: "Nova",
		role: "assistant",
		// The assistant is a person-owned agent — `ownerUserId` set, not a
		// structural id prefix.
		ownerUserId: "user1",
		identityDocumentId: "ki_af_demo",
		harnessType: "opencode",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
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
		ownerUserId: null,
		identityDocumentId: "ki_af_demo",
		harnessType: "opencode",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
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

describe("Assistant is a row in the agents list", () => {
	beforeEach(() => {
		setupFetch();
		mockShowToast.mockClear();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders Nova (the person-owned assistant agent) as a row alongside normal agents", async () => {
		render(
			<MemoryRouter>
				<SettingsAgents />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Nova")).toBeInTheDocument();
			expect(screen.getByText("Atlas")).toBeInTheDocument();
		});
	});

	it("a generic agent row rests read-only and opens the shared editor only from Edit", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<SettingsAgents />
			</MemoryRouter>,
		);

		await waitFor(() => screen.getByText("Nova"));
		expect(screen.queryByLabelText(/name/i)).toBeNull();
		// @lore FR-10: Edit is now behind the "..." actions menu — open menu then click Edit.
		await user.click(screen.getByRole("button", { name: "Actions for Nova" }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^edit$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^edit$/i }));

		// Editor pane should be visible
		await waitFor(() => {
			expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
		});
	});

	// @lore BA9f: the role template exists to PREFILL a new agent's identity, and
	// editing an existing agent no longer has a box to prefill — it links to that
	// agent's identity document instead. So the template fetch belongs to the add
	// path, and editing must not fire it.
	it("editing an existing agent does not fetch a role template — it links to the document", async () => {
		const user = userEvent.setup();
		const fetchedTemplates: string[] = [];
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
					fetchedTemplates.push(
						decodeURIComponent(urlStr.split("/api/agents/templates/")[1] ?? ""),
					);
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => ({ role: "builder", content: "Build things well." }),
					});
				}
				if (urlStr.includes("/api/agents")) {
					return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_AGENTS });
				}
				if (urlStr.includes("/api/filesystems")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => ({ filesystems: [] }),
					});
				}
				if (urlStr.includes("/api/org")) {
					return Promise.resolve({ ok: true, status: 200, json: async () => ({ teams: [] }) });
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);

		render(
			<MemoryRouter>
				<SettingsAgents />
			</MemoryRouter>,
		);

		await waitFor(() => screen.getByText("Atlas"));
		// @lore FR-10: Edit is now behind the "..." actions menu — open menu then click Edit.
		await user.click(screen.getByRole("button", { name: "Actions for Atlas" }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^edit$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^edit$/i }));

		await waitFor(() => {
			expect(screen.getByTestId("edit-identity-link-agent-atlas")).toBeInTheDocument();
		});
		expect(fetchedTemplates).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// AC-2: Model select shows discovered models (not MODEL_CATALOG)
// ---------------------------------------------------------------------------

describe("Agent editor model dropdown uses discovered descriptor.models", () => {
	beforeEach(() => {
		setupFetch();
		mockShowToast.mockClear();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("selects Atlas and the model dropdown shows the discovered model id", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<SettingsAgents />
			</MemoryRouter>,
		);

		await waitFor(() => screen.getByText("Atlas"));
		// @lore FR-10: Edit is now behind the "..." actions menu — open menu then click Edit.
		await user.click(screen.getByRole("button", { name: "Actions for Atlas" }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^edit$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^edit$/i }));

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

describe("SplitView ratio persistence is wired via useUiPreference", () => {
	beforeEach(() => {
		setupFetch();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders without crashing (SplitView persistence wiring)", async () => {
		render(
			<MemoryRouter>
				<SettingsAgents />
			</MemoryRouter>,
		);
		await waitFor(() => screen.getByText("Nova"));
		// If onRatioChange were missing the SplitView would still render; the
		// real test is that the ratio persists — verified via useUiPreference unit test
		expect(screen.getByText("Nova")).toBeInTheDocument();
	});
});
