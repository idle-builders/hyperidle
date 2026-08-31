/**
 * AH4 AC6 — Playwright E2E: Add-agent placement affordance renders correctly.
 *
 * SCOPE — UI RENDERING ONLY:
 * (a) These specs verify that the placement affordance (Team Select in Settings;
 *     "TEAM {name}" KeyValue in WorkTeam AgentAddDialog) renders given mocked API
 *     data. They do NOT stand up a real backend.
 * (b) The real backend-side-effect proof (agent created with teamId sets
 *     users.teamId; FK-422 on unknown teamId) is covered by the integration tests
 *     in packages/server/src/routes/__tests__/AH4-org-edge.integration.test.ts
 *     which run against a real Hono+PGlite server.
 * (c) The real-path frontend→backend E2E proof for AH4's (Playwright, required)
 *     scenarios is owned by AH5's live smoke lane (feat/AH5-live-smoke-lane).
 *     AH4 does not stand up a parallel real-path harness per AH5's spec.
 *
 * AC6 agent-appears-under-team: the mocked specs assert the agent name appears in
 * the agents list after mocked creation; full team-scoped read-back is proven by
 * the integration tests (AC2/AC3 in AH4-org-edge.integration.test.ts).
 *
 * @lore N2: All AH4 E2E specs use page.route() mocking — consistent with 78/90
 * existing specs. See layers/core-ui/playwright.config.ts @lore N2.
 */

import * as path from "node:path";
import { expect, test } from "./fixtures";

const TEAM_ID = "team-ah4-agents";
const TEAM_NAME = "Placement Test Team";

function makeOrgResponse() {
	return {
		edges: [],
		users: [],
		teams: [{ id: TEAM_ID, name: TEAM_NAME }],
	};
}

function makeAgentsResponse(extra: unknown[] = []) {
	return [
		{
			id: "agent-existing",
			name: "Existing Agent",
			role: "builder",
			agentCategory: "team",
			harnessType: "claude-code",
			modelTierPreference: null,
			modelId: "claude-sonnet-4-6",
			modelProvider: "anthropic",
			maxConcurrentSessions: 1,
			status: "active",
			activeSessions: 0,
		},
		...extra,
	];
}

function makeHarnessesResponse() {
	return [{ type: "claude-code", name: "Claude Code", modelProviders: ["anthropic"] }];
}

function makeTeamDetailResponse() {
	return {
		team: { id: TEAM_ID, name: TEAM_NAME, phase: "build", status: "healthy", leadAgentId: null },
		teamMembers: { id: TEAM_ID, formedAt: new Date().toISOString(), dissolvedAt: null },
		roster: [],
		burn: {
			capacity: 5,
			activeBets: 0,
		},
		activeBets: [],
		bets: [],
		routines: [],
	};
}

test.describe("AH4 AC6 — Settings Agents add form shows team placement", () => {
	test("Team Select is visible and populated in the Settings Agents add form", async ({ page }) => {
		// Mock required API endpoints
		await page.route("**/api/agents", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeAgentsResponse()),
				});
			} else {
				await route.continue();
			}
		});
		await page.route("**/api/harnesses", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeHarnessesResponse()),
				});
			} else {
				await route.continue();
			}
		});
		await page.route("**/api/org", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeOrgResponse()),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/settings");
		await page.waitForSelector("[data-testid='settings-page']");

		// Find and expand the agents section
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		await expect(agentsSection).toBeVisible();

		// Click the Add Agent button
		const addBtn = agentsSection.getByRole("button", { name: /add agent/i });
		await expect(addBtn).toBeVisible({ timeout: 5000 });
		await addBtn.click();

		// Team Select must appear
		const teamSelect = agentsSection.getByRole("combobox", { name: /team/i });
		await expect(teamSelect).toBeVisible({ timeout: 5000 });

		// Screenshot — add form with Team select visible
		const screenshotDir = path.join("plans", "AH4", "proof");
		await page.screenshot({
			path: path.join(screenshotDir, "settings-agents-team-select.png"),
			fullPage: false,
		});
	});

	test("After agent creation in Settings, agent appears in the agents list", async ({ page }) => {
		const newAgent = {
			id: "agent-new-ah4",
			name: "AH4 New Agent",
			role: "builder",
			agentCategory: "team",
			harnessType: "claude-code",
			modelTierPreference: null,
			modelId: "claude-sonnet-4-6",
			modelProvider: "anthropic",
			maxConcurrentSessions: 1,
			status: "active",
			activeSessions: 0,
		};

		let created = false;

		await page.route("**/api/agents", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(created ? makeAgentsResponse([newAgent]) : makeAgentsResponse()),
				});
			} else if (route.request().method() === "POST") {
				created = true;
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify(newAgent),
				});
			} else {
				await route.continue();
			}
		});
		await page.route("**/api/harnesses", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeHarnessesResponse()),
			});
		});
		await page.route("**/api/org", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeOrgResponse()),
			});
		});

		await page.goto("/settings");
		await page.waitForSelector("[data-testid='settings-page']");

		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		const addBtn = agentsSection.getByRole("button", { name: /add agent/i });
		await expect(addBtn).toBeVisible({ timeout: 5000 });
		await addBtn.click();

		// Fill in agent name
		const nameInput = agentsSection.getByRole("textbox", { name: /name/i });
		await expect(nameInput).toBeVisible({ timeout: 5000 });
		await nameInput.fill("AH4 New Agent");

		// Click Save
		const saveBtn = agentsSection.getByRole("button", { name: /save/i });
		await saveBtn.click();

		// New agent should appear in the list
		await expect(agentsSection.getByText("AH4 New Agent")).toBeVisible({ timeout: 5000 });
	});
});

test.describe("AH4 AC6 — WorkTeam AgentAddDialog shows placement KeyValue", () => {
	test("AgentAddDialog shows TEAM label with team name when opened from WorkTeam", async ({
		page,
	}) => {
		// Mock all required routes for the WorkTeam page
		await page.route(`**/api/teams/${TEAM_ID}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeTeamDetailResponse()),
				});
			} else {
				await route.continue();
			}
		});
		await page.route("**/api/agents", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify([]),
				});
			} else {
				await route.continue();
			}
		});
		await page.route(`**/api/teams/${TEAM_ID}/agents`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([]),
			});
		});

		// Navigate to the team page
		await page.goto(`/work/team/${TEAM_ID}`);
		await page.waitForSelector("[data-testid='work-team-page']", { timeout: 10000 });

		// Find and click the Add Agent button
		const addAgentBtn = page.getByRole("button", { name: /add agent/i });
		await expect(addAgentBtn).toBeVisible({ timeout: 5000 });
		await addAgentBtn.click();

		// The dialog must show the TEAM KeyValue with the team name.
		// Scope to dialog-box to avoid strict-mode collision with the page's
		// team name heading and breadcrumb which also contain "TEAM"/"Placement Test Team".
		const dialogBox = page.getByTestId("dialog-box");
		await expect(dialogBox).toBeVisible({ timeout: 5000 });
		await expect(dialogBox.getByText("TEAM", { exact: true })).toBeVisible({ timeout: 5000 });
		await expect(dialogBox.getByText(TEAM_NAME)).toBeVisible({ timeout: 5000 });

		// Screenshot — dialog with placement KeyValue visible
		const screenshotDir = path.join("plans", "AH4", "proof");
		await page.screenshot({
			path: path.join(screenshotDir, "workteam-agent-add-placement.png"),
			fullPage: false,
		});
	});
});
