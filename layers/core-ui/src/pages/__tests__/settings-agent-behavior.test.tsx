import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_SECTIONS } from "../../settings/settings-types.js";
import { SettingsPage } from "../SettingsPage.js";

vi.mock("../../hooks/useCurrentUser", () => ({
	useCurrentUser: () => ({
		user: { id: "u-founder", name: "Test Founder", email: "test@example.com", avatarUrl: null },
		status: "ready",
		error: null,
	}),
}));

vi.mock("../../hooks/useTeams", () => ({
	useTeams: () => ({
		data: {
			teams: [{ id: "team-product", name: "Product" }],
			users: [{ id: "u-founder", name: "Test Founder", kind: "human", role: "founder" }],
			edges: [],
		},
		loading: false,
		error: null,
	}),
}));

vi.mock("../../hooks/useTheme", () => ({
	useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

vi.mock("../../shell/ToastRegion", () => ({
	useToast: () => ({ showToast: vi.fn() }),
	ToastContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));

const AGENT_BEHAVIOR_ITEMS = [
	{
		id: "trigger:trigger.daily-product-scan",
		kind: "trigger",
		name: "Daily product scan",
		description: "This rule matches one routine-fired event.",
		origin: { type: "plugin", label: "Product OS plugin", state: "enabled" },
		valueSource: "user_override",
		active: true,
		activeSummary: "Product Manager · prompt from user override",
		defaultSummary: "Product Manager · prompt from Product OS plugin",
		statusLabel: "User override active",
		editableFields: [
			{
				id: "agentId",
				label: "Agent",
				kind: "select",
				value: "agent-product-manager",
				options: [
					{ value: "agent-product-manager", label: "Product Manager" },
					{ value: "agent-ops-lead", label: "Ops Lead" },
				],
			},
			{
				id: "prompt",
				label: "Prompt source",
				kind: "textarea",
				value: "Summarize customer signals and propose tasks.",
				maxLength: 12_000,
			},
		],
		links: [{ target: "trigger-history", label: "View history", href: "#trigger-history" }],
		trigger: {
			occasionKind: "routine.fire",
			sourceId: "daily-product-scan",
			selectedAgentLabel: "Product Manager",
			promptSource: "trigger",
			ownershipLabel: "User override active",
		},
	},
	{
		id: "trigger:trigger.growth-digest",
		kind: "trigger",
		name: "Growth digest",
		origin: { type: "plugin", label: "Growth plugin", state: "disabled" },
		valueSource: "default",
		active: false,
		activeSummary: "Not matching: plugin disabled and no user override.",
		statusLabel: "Inactive: plugin disabled",
		editableFields: [],
		trigger: {
			occasionKind: "routine.fire",
			sourceId: "growth-digest",
			selectedAgentLabel: "Growth",
			promptSource: "trigger",
			ownershipLabel: "Plugin default",
		},
	},
	{
		id: "trigger:fallback.default",
		kind: "trigger",
		name: "No matching trigger",
		description: "When no trigger rule matches, HyperIdle uses the default eligible agent.",
		origin: { type: "builtin", label: "Built-in HyperIdle", state: "enabled" },
		valueSource: "fallback",
		active: true,
		activeSummary: "Default eligible agent · no event-specific prompt",
		statusLabel: "Fallback",
		editableFields: [],
		trigger: {
			occasionKind: "fallback.no_match",
			selectedAgentLabel: "Default eligible agent",
			promptSource: "none",
			ownershipLabel: "Fallback",
		},
	},
	{
		id: "tool:tool.legacy_report",
		kind: "tool",
		name: "Legacy report",
		origin: { type: "plugin", label: "Legacy Ops plugin", state: "removed" },
		valueSource: "default",
		active: false,
		activeSummary: "Default no longer applies.",
		statusLabel: "Needs attention: origin removed",
		editableFields: [],
	},
	{
		id: "agent:agent.ast-founder",
		kind: "agent",
		name: "Assistant",
		origin: { type: "builtin", label: "Built-in HyperIdle", state: "enabled" },
		valueSource: "default",
		active: true,
		activeSummary: "assistant · builtin harness",
		statusLabel: "Default",
		editableFields: [{ id: "name", label: "Name", kind: "text", value: "Assistant" }],
		links: [{ target: "settings-agents", label: "Open Agents", href: "#settings-section-agents" }],
	},
	{
		id: "skill:skill.ast-founder.create-bet",
		kind: "skill",
		name: "Create bet",
		origin: { type: "builtin", label: "Built-in HyperIdle", state: "enabled" },
		valueSource: "default",
		active: true,
		activeSummary: "autonomy level 3",
		statusLabel: "Built-in",
		editableFields: [],
	},
	{
		id: "routine:routine.daily-product-scan",
		kind: "routine",
		name: "Daily product scan",
		origin: { type: "builtin", label: "Built-in HyperIdle", state: "enabled" },
		valueSource: "default",
		active: true,
		activeSummary: "calendar · Product Manager",
		statusLabel: "Default",
		editableFields: [],
		links: [
			{
				target: "routine-detail",
				label: "Open routine",
				href: "/work/routines/daily-product-scan",
			},
		],
	},
	{
		id: "mcp:mcp_server.figma",
		kind: "mcp",
		name: "Figma",
		origin: { type: "builtin", label: "Built-in HyperIdle", state: "enabled" },
		valueSource: "default",
		active: true,
		activeSummary: "https://mcp.figma.example/sse",
		statusLabel: "Default",
		editableFields: [],
		links: [
			{
				target: "settings-connections",
				label: "Open Connections",
				href: "#settings-section-connections",
			},
		],
	},
];

function setupFetch(): void {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string, init?: RequestInit) => {
			const urlStr = String(url);
			if (urlStr.includes("/api/settings/agent-behavior/config")) {
				if (init?.method === "PATCH") {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => ({
							item: {
								...AGENT_BEHAVIOR_ITEMS[0],
								valueSource: "user_override",
								activeSummary: "Ops Lead · prompt from user override",
							},
						}),
					});
				}
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => ({ items: AGENT_BEHAVIOR_ITEMS }),
				});
			}
			if (urlStr.includes("/api/agents")) {
				return Promise.resolve({ ok: true, status: 200, json: async () => [] });
			}
			if (urlStr.includes("/api/harnesses")) {
				return Promise.resolve({ ok: true, status: 200, json: async () => [] });
			}
			if (urlStr.includes("/api/org")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => ({
						edges: [],
						users: [{ id: "u-founder", name: "Test Founder", kind: "human", role: "founder" }],
						teams: [],
					}),
				});
			}
			if (urlStr.includes("/api/filesystems")) {
				return Promise.resolve({ ok: true, status: 200, json: async () => ({ filesystems: [] }) });
			}
			if (urlStr.includes("/api/connections")) {
				return Promise.resolve({ ok: true, status: 200, json: async () => [] });
			}
			if (urlStr.includes("/api/notifications")) {
				return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
			}
			if (urlStr.includes("/api/settings") || urlStr.includes("/api/credentials")) {
				return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
			}
			return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
		}),
	);
}

function renderSettingsPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<SettingsPage />
		</MemoryRouter>,
	);
}

describe("Settings Agent behavior surface", () => {
	beforeEach(() => setupFetch());
	afterEach(() => vi.restoreAllMocks());

	it("renders one Settings area for agents, skills, routines, triggers, tools, and MCP without Fabric/Strategy labels", async () => {
		renderSettingsPage();

		const section = await screen.findByTestId("settings-section-agent-behavior");
		expect(within(section).getByText("Agent behavior")).toBeInTheDocument();
		expect(SETTINGS_SECTIONS).toContainEqual({ id: "agent-behavior", label: "Agent behavior" });
		expect(within(section).getByTestId("settings-agent-behavior")).toHaveAttribute(
			"data-testid",
			"settings-agent-behavior",
		);
		expect(section.querySelector('[data-ds-component="split-view"]')).toBeInTheDocument();
		for (const label of ["Agents", "Skills", "Routines", "Triggers", "Tools", "MCP"]) {
			expect(within(section).getByText(label)).toBeInTheDocument();
		}
		expect(section.textContent ?? "").not.toMatch(/Fabric|Strategy/i);
	});

	it("shows trigger event, attached agent, prompt source, origin, active value, and disabled/removed origin states", async () => {
		const user = userEvent.setup();
		renderSettingsPage();

		const section = await screen.findByTestId("settings-section-agent-behavior");
		expect(await within(section).findByText("Routine fired")).toBeInTheDocument();
		expect(within(section).getByText("Daily product scan")).toBeInTheDocument();
		const initialText = section.textContent ?? "";
		expect(initialText).toContain("Product Manager · prompt from user override");
		expect(initialText).toContain("User override active");
		expect(initialText).toContain("Inactive: plugin disabled");
		expect(initialText).toContain("Needs attention: origin removed");
		expect(within(section).getAllByText("No matching trigger").length).toBeGreaterThan(0);
		expect(initialText).toContain("Default eligible agent · no event-specific prompt");
		await user.click(within(section).getByText("Daily product scan"));
		expect(within(section).getByText("Product OS plugin")).toBeInTheDocument();
	});

	it("saves a supported trigger edit, keeps existing Settings links reachable, and reloads active override state", async () => {
		const user = userEvent.setup();
		renderSettingsPage();

		const section = await screen.findByTestId("settings-section-agent-behavior");
		await user.click(within(section).getByText("Daily product scan"));
		expect(within(section).queryByLabelText("Agent")).toBeNull();
		await user.click(within(section).getByRole("button", { name: "Edit agent behavior" }));
		await user.selectOptions(within(section).getByLabelText("Agent"), "agent-ops-lead");
		await user.clear(within(section).getByLabelText("Prompt source"));
		await user.type(within(section).getByLabelText("Prompt source"), "Escalate blockers.");
		await user.click(within(section).getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(
				within(section).getAllByText("Ops Lead · prompt from user override").length,
			).toBeGreaterThan(0);
		});
		expect(screen.getByTestId("settings-section-agents")).toBeInTheDocument();
		expect(screen.getByTestId("settings-section-agent-backends")).toBeInTheDocument();
		expect(screen.getByTestId("settings-section-connections")).toBeInTheDocument();
	});

	it("Cancel restores the selected behavior snapshot without saving", async () => {
		const user = userEvent.setup();
		renderSettingsPage();
		const section = await screen.findByTestId("settings-section-agent-behavior");
		await user.click(within(section).getByText("Daily product scan"));
		await user.click(within(section).getByRole("button", { name: "Edit agent behavior" }));
		await user.selectOptions(within(section).getByLabelText("Agent"), "agent-ops-lead");
		await user.click(
			within(section).getByRole("button", { name: "Cancel agent behavior editing" }),
		);
		expect(within(section).queryByLabelText("Agent")).toBeNull();
		expect(within(section).getAllByText(/Product Manager/).length).toBeGreaterThan(0);
	});

	it("keeps MCP URL changes read-only in Agent behavior and routes to Connections", async () => {
		const user = userEvent.setup();
		renderSettingsPage();

		const section = await screen.findByTestId("settings-section-agent-behavior");
		await user.click(within(section).getByText("Figma"));

		expect(within(section).getAllByText("https://mcp.figma.example/sse").length).toBeGreaterThan(0);
		expect(within(section).queryByLabelText("Server URL")).toBeNull();
		expect(within(section).getByText("Open Connections")).toBeInTheDocument();
	});
});
