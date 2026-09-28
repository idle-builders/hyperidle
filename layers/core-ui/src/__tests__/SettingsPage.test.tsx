/**
 * SettingsPage section reachability.
 *
 * Tests that:
 * - settings-section-agents testid is present after mounting SettingsPage
 * - settings-section-worker testid is present after mounting SettingsPage
 * - Both new sections appear alongside existing sections (profile, models, etc.)
 * - The Agents section appears after Models in DOM order (design spec)
 * - The Worker section appears before Backend in DOM order (design spec)
 *
 * Also: no "Email digests" control in SettingsPage.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock useToast used by SettingsProfile, SettingsOrgChart, SettingsAgents, etc.
const mockShowToast = vi.fn();
vi.mock("../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: mockShowToast })),
	};
});

// Mock apiFetch — underlying fetch wrapper used by child components
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

beforeEach(async () => {
	mockShowToast.mockClear();

	// Set up apiFetch mock with sensible responses per URL
	const { apiFetch } = await import("../services/api-fetch.js");
	const apiFetchMock = vi.mocked(apiFetch);
	apiFetchMock.mockImplementation((url: string | URL | Request) => {
		const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
		if (urlStr.includes("/api/org")) {
			return Promise.resolve(
				new Response(JSON.stringify({ edges: [], users: [], teams: [] }), { status: 200 }),
			);
		}
		if (urlStr.includes("/api/harnesses")) {
			return Promise.resolve(
				new Response(
					// SettingsHarnesses now renders in SettingsPage and requires full descriptors.
					// Return a minimal but complete HarnessCapabilityDescriptor to avoid render errors.
					JSON.stringify([
						{
							type: "opencode",
							name: "OpenCode",
							kind: "local",
							accessMode: "api-gateway",
							authAction: { kind: "enter_api_key", label: "Enter API key" },
							discovery: { state: "ready" },
							models: [],
							runtime: {
								preCompactionTrigger: false,
								subAgents: false,
								mcpSupport: false,
								modelProviders: ["anthropic"],
								fileEditing: false,
								toolUse: false,
							},
							modelProviders: ["anthropic"],
						},
					]),
					{ status: 200 },
				),
			);
		}
		if (urlStr.includes("/api/agents")) {
			return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
		}
		if (urlStr.includes("/api/model-gateway")) {
			return Promise.resolve(
				new Response(
					JSON.stringify({
						reasoning: { provider: "anthropic", model: "claude-opus-4-5", hasApiKey: false },
						workhorse: {
							provider: "anthropic",
							model: "claude-3-5-sonnet-20241022",
							hasApiKey: false,
						},
						fast: {
							provider: "anthropic",
							model: "claude-3-5-haiku-20241022",
							hasApiKey: false,
						},
					}),
					{ status: 200 },
				),
			);
		}
		if (urlStr.includes("/api/settings")) {
			return Promise.resolve(
				new Response(
					JSON.stringify({
						profile: { name: "Test User", avatarUrl: "" },
						teams: [],
						users: [],
						notifications: {
							reviewAlerts: true,
							blockerAlerts: true,
							quietHoursEnabled: false,
							quietHoursStart: "22:00",
							quietHoursEnd: "08:00",
							mutedTeams: [],
						},
						appearance: { theme: "dark" },
					}),
					{ status: 200 },
				),
			);
		}
		if (urlStr.includes("/api/users/me")) {
			return Promise.resolve(
				new Response(
					JSON.stringify({
						id: "u-test",
						name: "Test User",
						role: "founder",
						kind: "human",
					}),
					{ status: 200 },
				),
			);
		}
		// Catch-all
		return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
	});

	// Also set global.fetch as some components may use it directly
	global.fetch = apiFetchMock as unknown as typeof fetch;

	// Clear bridge (web mode — no Electron)
	Object.defineProperty(window, "__HYPERIDLE__", {
		value: undefined,
		configurable: true,
		writable: true,
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	Object.defineProperty(window, "__HYPERIDLE__", {
		value: undefined,
		configurable: true,
		writable: true,
	});
});

describe("SettingsPage: new sections mounted", () => {
	it("renders settings-section-agents testid", async () => {
		const { SettingsPage } = await import("../pages/SettingsPage.js");
		render(
			<MemoryRouter>
				<SettingsPage />
			</MemoryRouter>,
		);
		await waitFor(() => {
			expect(screen.getByTestId("settings-section-agents")).toBeInTheDocument();
		});
	});

	// "worker" section removed (folded under Backend) — test deleted.
	// "models" section removed (folded into builtin harness detail) — test deleted.

	it("agents section co-exists with profile and backend sections", async () => {
		const { SettingsPage } = await import("../pages/SettingsPage.js");
		render(
			<MemoryRouter>
				<SettingsPage />
			</MemoryRouter>,
		);
		await waitFor(() => {
			expect(screen.getByTestId("settings-section-profile")).toBeInTheDocument();
			expect(screen.getByTestId("settings-section-agents")).toBeInTheDocument();
			expect(screen.getByTestId("settings-section-backend")).toBeInTheDocument();
			// worker and models sections removed
			expect(screen.queryByTestId("settings-section-worker")).toBeNull();
			expect(screen.queryByTestId("settings-section-models")).toBeNull();
		});
	});

	it("Agents section appears before Backend section in DOM order", async () => {
		const { SettingsPage } = await import("../pages/SettingsPage.js");
		render(
			<MemoryRouter>
				<SettingsPage />
			</MemoryRouter>,
		);
		await waitFor(() => {
			const agents = screen.getByTestId("settings-section-agents");
			const backend = screen.getByTestId("settings-section-backend");
			// agents should appear before backend in the DOM (models removed)
			expect(agents.compareDocumentPosition(backend) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
				Node.DOCUMENT_POSITION_FOLLOWING,
			);
		});
	});
});

describe("SettingsPage: no email digests control", () => {
	it("does not render any email digests control", async () => {
		const { SettingsPage } = await import("../pages/SettingsPage.js");
		render(
			<MemoryRouter>
				<SettingsPage />
			</MemoryRouter>,
		);
		await waitFor(() => {
			// Allow some content to render
			expect(screen.getByTestId("settings-page")).toBeInTheDocument();
		});
		// Email digests must not appear anywhere in the page
		expect(screen.queryByText(/email digest/i)).toBeNull();
		expect(screen.queryByText(/email digests/i)).toBeNull();
	});
});
