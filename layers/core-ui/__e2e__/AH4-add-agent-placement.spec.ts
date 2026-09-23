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
 *
 * @lore BC5 T9: `GET /api/agents`, `GET /api/harnesses` and `GET /api/org` are
 * gone — the Settings Agents section reads `open_user({})` + `search_users({
 * kind:"ai"})` + `open_user({id})` per row, and writes through `edit_user`.
 * `GET /api/teams/:id` is gone too — `mockTeamPage` composes the team page.
 * `teamName` in `AgentAddDialog` is a plain prop from the team page's own
 * data (`data.team.name`), not a separate fetch.
 */

import * as path from "node:path";
import {
	expect,
	makeUserRow,
	mockAgents,
	mockSearchSessions,
	mockSearchUsers,
	mockTeamPage,
	mockUser,
	test,
} from "./fixtures";

const TEAM_ID = "team-ah4-agents";
const TEAM_NAME = "Placement Test Team";
const FOUNDER_ROW = makeUserRow("test-founder", { name: "Test Founder", role: "founder" });
const EXISTING_AGENT = makeUserRow("agent-existing", {
	kind: "ai",
	name: "Existing Agent",
	role: "builder",
	agentCategory: "team",
});

test.describe("AH4 AC6 — Settings Agents add form shows team placement", () => {
	test("Team Select is visible and populated in the Settings Agents add form", async ({ page }) => {
		await mockUser(page, { row: FOUNDER_ROW, self: true });
		await mockSearchUsers(page, {
			rows: [EXISTING_AGENT, { ...FOUNDER_ROW, team: { id: TEAM_ID, name: TEAM_NAME } }],
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
		const screenshotDir = "test-results";
		await page.screenshot({
			path: path.join(screenshotDir, "AH4-settings-agents-team-select.png"),
			fullPage: false,
		});
	});

	test("After agent creation in Settings, agent appears in the agents list", async ({ page }) => {
		const newAgentRow = makeUserRow("agent-new-ah4", {
			kind: "ai",
			name: "AH4 New Agent",
			role: "builder",
			agentCategory: "team",
		});

		await mockUser(page, { row: FOUNDER_ROW, self: true });

		let created = false;
		await page.route("**/api/actions/search_users", async (route) => {
			if (route.request().method() !== "POST") {
				await route.continue();
				return;
			}
			const input = JSON.parse(route.request().postData() ?? "{}") as { kind?: string };
			if (input.kind !== "ai") {
				await route.fallback();
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: created ? [EXISTING_AGENT, newAgentRow] : [EXISTING_AGENT],
				}),
			});
		});
		await page.route("**/api/actions/edit_user", async (route) => {
			const input = JSON.parse(route.request().postData() ?? "{}") as { id?: string };
			if (input.id !== undefined) {
				await route.fallback();
				return;
			}
			created = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						user: newAgentRow,
						runsOn: [],
						runConfig: null,
						documentIds: [],
						folders: [],
						subscriptions: [],
						connections: null,
						behaviour: null,
						inbox: null,
						reviewTrackRecord: null,
					},
				}),
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
		await mockSearchUsers(page, { rows: [] });
		await mockTeamPage(page, { teamId: TEAM_ID, teamName: TEAM_NAME, roster: [] });
		await mockAgents(page, { agents: [] });
		await mockSearchSessions(page, { rows: [] });

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
		const screenshotDir = "test-results";
		await page.screenshot({
			path: path.join(screenshotDir, "AH4-workteam-agent-add-placement.png"),
			fullPage: false,
		});
	});
});
