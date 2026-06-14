/**
 * AH4 — Component tests: SettingsAgents team placement picker.
 *
 * AC2: The SettingsAgents add form renders a Team Select populated from
 *      GET /api/org; the POST body includes the selected teamId.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsAgents } from "../settings/SettingsAgents";
import { ToastRegion } from "../shell/ToastRegion";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const TEAM_ID = "tm-alpha";
const TEAM_NAME = "Alpha Team";

function mockFetch(
	teams: { id: string; name: string }[] = [{ id: TEAM_ID, name: TEAM_NAME }],
): ReturnType<typeof vi.fn> {
	return vi.fn().mockImplementation((url: string) => {
		const urlStr = String(url);
		if (urlStr.includes("/api/agents")) {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: async () => [],
			});
		}
		if (urlStr.includes("/api/harnesses")) {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: async () => [{ type: "builtin", name: "Built-in", modelProviders: ["anthropic"] }],
			});
		}
		if (urlStr.includes("/api/org")) {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: async () => ({ edges: [], users: [], teams }),
			});
		}
		return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
	});
}

function renderSettingsAgents(): ReturnType<typeof render> {
	return render(
		<ToastRegion>
			<SettingsAgents />
		</ToastRegion>,
	);
}

describe("AH4 AC2 — SettingsAgents team placement picker", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = mockFetch();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders Add Agent button after loading", async () => {
		renderSettingsAgents();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /add agent/i })).toBeInTheDocument();
		});
	});

	it("shows Team select in add form when Add Agent clicked", async () => {
		const user = userEvent.setup();
		renderSettingsAgents();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /add agent/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /add agent/i }));

		// Team select must appear
		await waitFor(() => {
			expect(screen.getByRole("combobox", { name: /team/i })).toBeInTheDocument();
		});
	});

	it("populates Team select with teams from GET /api/org", async () => {
		const user = userEvent.setup();
		renderSettingsAgents();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /add agent/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /add agent/i }));

		await waitFor(() => {
			const teamSelect = screen.getByRole("combobox", { name: /team/i });
			expect(teamSelect).toBeInTheDocument();
			// The team name appears as an option
			expect(screen.getByRole("option", { name: TEAM_NAME })).toBeInTheDocument();
		});
	});

	it("shows disabled 'No teams' option when org has no teams", async () => {
		fetchMock = mockFetch([]); // zero teams
		vi.stubGlobal("fetch", fetchMock);

		const user = userEvent.setup();
		renderSettingsAgents();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /add agent/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /add agent/i }));

		await waitFor(() => {
			const teamSelect = screen.getByRole("combobox", { name: /team/i });
			expect(teamSelect).toBeInTheDocument();
			// Zero-teams state shows a disabled placeholder
			expect(screen.getByText(/no teams/i)).toBeInTheDocument();
		});
	});

	it("includes teamId in POST body when Save is clicked with a valid team selected", async () => {
		const postMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => ({
				id: "new-agent-1",
				name: "Test Builder",
				role: "builder",
				agentCategory: "team",
				harnessType: "builtin",
				modelTierPreference: null,
				modelId: "claude-sonnet-4-6",
				modelProvider: "anthropic",
				maxConcurrentSessions: 1,
				status: "active",
				activeSessions: 0,
			}),
		});

		const capturedRequests: { url: string; body: unknown }[] = [];

		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string, init?: RequestInit) => {
				const urlStr = String(url);
				if (urlStr.includes("/api/agents") && init?.method === "POST") {
					const body = JSON.parse(init.body as string) as unknown;
					capturedRequests.push({ url: urlStr, body });
					return postMock();
				}
				return mockFetch()([url, init].join(""), init);
			}),
		);

		const user = userEvent.setup();
		renderSettingsAgents();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /add agent/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /add agent/i }));

		// Fill required name field
		await waitFor(() => {
			expect(screen.getByRole("textbox", { name: /name/i })).toBeInTheDocument();
		});
		await user.type(screen.getByRole("textbox", { name: /name/i }), "Test Builder");

		// Click Save
		const saveBtn = screen.getByRole("button", { name: /save/i });
		await user.click(saveBtn);

		await waitFor(() => {
			expect(capturedRequests.length).toBeGreaterThan(0);
		});

		const postBody = capturedRequests[0]?.body as Record<string, unknown>;
		expect(postBody).toHaveProperty("teamId");
		// teamId must be the teamMembers.id from GET /api/org
		expect(postBody.teamId).toBe(TEAM_ID);
	});
});
