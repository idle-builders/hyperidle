/**
 * AB1 — Agent Profile page E2E tests (RED phase)
 *
 * AC coverage:
 * AC-1: Profile page accessible from team page (agent card name links to /agents/:agentId)
 * AC-2: Profile page shows identity, configuration, skills, activity, and performance
 * AC-3: Profile links to Settings for editing — profile itself is read-only
 *
 * Top 3 user actions on the agent profile page:
 * 1. Navigate to agent profile from team page
 * 2. View agent profile sections (identity, config, activity, performance)
 * 3. Navigate to Settings via "Edit in Settings" button
 *
 * These tests FAIL until:
 * - layers/core-ui/src/pages/AgentProfile.tsx is created
 * - layers/core-ui/src/router.tsx registers /agents/:agentId route
 * - layers/core-ui/src/pages/WorkTeam.tsx AgentCard name links to /agents/:agentId
 *
 * @lore AB1: E2E tests mock /api/agents/:id/profile to avoid needing a seeded backend.
 */

import { expect, test } from "./fixtures";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_AGENT_ID = "e2e-agent-builder";

const MOCK_AGENT_PROFILE = {
	id: MOCK_AGENT_ID,
	name: "E2E Builder Bot",
	role: "builder",
	agentCategory: "team",
	teamName: "E2E Test Team",
	createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
	systemPrompt: "You are a builder agent that implements features.",
	harnessType: "claude-code",
	maxConcurrentSessions: 2,
	mcpSetup: null,
	activeSession: null,
	recentSessions: [
		{
			sessionId: "e2e-session-1",
			taskId: "e2e-task-1",
			taskTitle: "Implement login feature",
			outcome: "completed",
			startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
			endedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
		},
		{
			sessionId: "e2e-session-2",
			taskId: "e2e-task-2",
			taskTitle: "Fix auth bug",
			outcome: "crashed",
			startedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
			endedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
		},
	],
	performance: {
		totalSessions: 2,
		successCount: 1,
		successRate: 0.5,
	},
	healthSignals: {
		failureRate7d: 0.5,
		lastSessionCrashed: false,
		harnessAvailable: true,
		idleDurationMs: 3600000,
		degraded: false,
	},
	harnessCapabilities: {
		toolUse: true,
		mcpSupport: true,
		fileEditing: true,
		subAgents: true,
	},
	reviewTrackRecord: {
		approvalRate: 0.9,
		totalVerdicts: 10,
		recentVerdicts: [
			{
				decision: "approve",
				threadId: "t-1",
				createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
			},
		],
		windowDays: 30,
	},
};

const MOCK_AGENT_PROFILE_WITH_ACTIVE_SESSION = {
	...MOCK_AGENT_PROFILE,
	activeSession: {
		sessionId: "e2e-session-active",
		taskId: "e2e-task-active",
		startedAt: new Date().toISOString(),
	},
};

const MOCK_AGENT_PROFILE_DEGRADED = {
	...MOCK_AGENT_PROFILE,
	healthSignals: {
		failureRate7d: 0.8,
		lastSessionCrashed: true,
		harnessAvailable: true,
		idleDurationMs: null,
		degraded: true,
	},
};

const MOCK_AGENTS_LIST = [
	{
		id: MOCK_AGENT_ID,
		name: "E2E Builder Bot",
		role: "builder",
		agentCategory: "team",
		systemPrompt: null,
		harnessType: "claude-code",
		maxConcurrentSessions: 2,
		status: "active",
		activeSessions: 0,
	},
];

const MOCK_TEAM_DATA = {
	id: "e2e-team-1",
	name: "E2E Test Team",
	phase: "build",
	roster: MOCK_AGENTS_LIST,
	bets: [],
};

// ---------------------------------------------------------------------------
// AC-1: Profile page accessible from team page (agent name links to /agents/:id)
// ---------------------------------------------------------------------------

test.describe("AB1 AC-1: Navigate to agent profile from team page", () => {
	test.beforeEach(async ({ page }) => {
		// Mock the team detail endpoint
		await page.route("**/api/teams/e2e-team-1", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(MOCK_TEAM_DATA),
				});
			} else {
				await route.continue();
			}
		});

		// Mock the agent profile endpoint
		await page.route(`**/api/agents/${MOCK_AGENT_ID}/profile`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(MOCK_AGENT_PROFILE),
				});
			} else {
				await route.continue();
			}
		});
	});

	test("clicking agent name on team page navigates to agent profile", async ({ page }) => {
		await page.goto("/work/teams/e2e-team-1");
		await page.waitForSelector("[data-testid='main-content']");

		// Find the agent card name link and click it
		await page.getByRole("link", { name: /E2E Builder Bot/i }).click();

		// Should navigate to the agent profile page
		await expect(page).toHaveURL(/\/agents\/e2e-agent-builder/);
		await expect(page.getByTestId("agent-profile-page")).toBeVisible();
	});

	test("agent profile page URL is /agents/:agentId", async ({ page }) => {
		await page.goto(`/agents/${MOCK_AGENT_ID}`);
		await page.waitForSelector("[data-testid='main-content']");

		await expect(page).toHaveURL(`/agents/${MOCK_AGENT_ID}`);
	});
});

// ---------------------------------------------------------------------------
// AC-2: Profile page shows all required sections
// ---------------------------------------------------------------------------

test.describe("AB1 AC-2: Profile page shows identity, config, skills, activity, and performance", () => {
	test.beforeEach(async ({ page }) => {
		await page.route(`**/api/agents/${MOCK_AGENT_ID}/profile`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(MOCK_AGENT_PROFILE),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto(`/agents/${MOCK_AGENT_ID}`);
		await page.waitForSelector("[data-testid='agent-profile-page']");
	});

	test("shows agent name in page header", async ({ page }) => {
		await expect(page.getByTestId("agent-profile-page")).toContainText("E2E Builder Bot");
	});

	test("shows agent role label", async ({ page }) => {
		await expect(page.getByTestId("agent-profile-page")).toContainText(/builder/i);
	});

	test("shows Configuration section with harness type", async ({ page }) => {
		await expect(page.getByTestId("agent-config-section")).toBeVisible();
		await expect(page.getByTestId("agent-config-section")).toContainText(/claude-code/i);
	});

	test("shows Harness Capabilities section", async ({ page }) => {
		await expect(page.getByTestId("agent-capabilities-section")).toBeVisible();
	});

	test("shows Review Track Record section (AD4: replaces skills)", async ({ page }) => {
		await expect(page.getByTestId("agent-track-record-section")).toBeVisible();
	});

	test("shows Recent Activity section with sessions table", async ({ page }) => {
		await expect(page.getByTestId("agent-activity-section")).toBeVisible();
		// Sessions are shown in the activity table
		await expect(page.getByTestId("agent-activity-section")).toContainText(
			"Implement login feature",
		);
	});

	test("shows Performance section with stats", async ({ page }) => {
		await expect(page.getByTestId("agent-performance-section")).toBeVisible();
	});

	test("does not show health banner when agent is healthy", async ({ page }) => {
		// MOCK_AGENT_PROFILE has degraded: false
		await expect(page.getByRole("alert")).not.toBeVisible();
	});

	test("shows health banner when agent is degraded", async ({ page }) => {
		// Override with degraded profile
		await page.route(`**/api/agents/${MOCK_AGENT_ID}/profile`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(MOCK_AGENT_PROFILE_DEGRADED),
				});
			} else {
				await route.continue();
			}
		});

		// Re-navigate to trigger the new mock
		await page.goto(`/agents/${MOCK_AGENT_ID}`);
		await page.waitForSelector("[data-testid='agent-profile-page']");

		// Health banner should be visible with role="alert"
		await expect(page.getByRole("alert")).toBeVisible();
	});

	test("shows active session link when agent has running session", async ({ page }) => {
		await page.route(`**/api/agents/${MOCK_AGENT_ID}/profile`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(MOCK_AGENT_PROFILE_WITH_ACTIVE_SESSION),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto(`/agents/${MOCK_AGENT_ID}`);
		await page.waitForSelector("[data-testid='agent-profile-page']");

		// Should show active session indicator
		await expect(page.getByTestId("agent-active-session")).toBeVisible();
	});

	test("recent activity table has accessible aria-label", async ({ page }) => {
		const activityTable = page.getByTestId("agent-activity-section").getByRole("table");
		await expect(activityTable).toHaveAttribute("aria-label", /.+/);
	});

	test("review track record section has visible content when verdicts exist (AD4)", async ({
		page,
	}) => {
		// Track record section shows approval rate when totalVerdicts > 0
		await expect(page.getByTestId("agent-track-record-section")).toContainText("90%");
	});
});

// ---------------------------------------------------------------------------
// AC-3: Profile links to Settings for editing — read-only itself
// ---------------------------------------------------------------------------

test.describe("AB1 AC-3: Profile links to Settings for editing", () => {
	test.beforeEach(async ({ page }) => {
		await page.route(`**/api/agents/${MOCK_AGENT_ID}/profile`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(MOCK_AGENT_PROFILE),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto(`/agents/${MOCK_AGENT_ID}`);
		await page.waitForSelector("[data-testid='agent-profile-page']");
	});

	test("shows 'Edit in Settings' button", async ({ page }) => {
		await expect(page.getByRole("link", { name: /edit in settings/i })).toBeVisible();
	});

	test("'Edit in Settings' button links to settings URL", async ({ page }) => {
		const editLink = page.getByRole("link", { name: /edit in settings/i });
		const href = await editLink.getAttribute("href");
		// F1 fix: Settings deep-link goes to /conversations?settings=open
		expect(href).toContain("settings");
	});

	test("profile page has no inline edit forms (read-only)", async ({ page }) => {
		// No inputs on the profile page (it's read-only)
		const inputs = page
			.getByTestId("agent-profile-page")
			.locator("input:not([type='search']):not([type='hidden'])");
		await expect(inputs).toHaveCount(0);
	});
});
