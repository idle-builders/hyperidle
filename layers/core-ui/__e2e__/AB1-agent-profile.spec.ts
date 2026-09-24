/**
 * AB1 — Agent Profile page E2E tests.
 *
 * AC coverage:
 * AC-1: Profile page accessible from team page (agent card name links to /agents/:agentId)
 * AC-2: Profile page shows identity, configuration, skills, activity, and performance
 * AC-3: Profile links to Settings for editing — profile itself is read-only
 *
 * @lore BC5 T9/T11: the door swap — the agent profile is `open_user({ id })`
 * now (`useAgentProfile`), not `GET /api/agents/:id/profile`; run state
 * (active session, recent runs, success rate, health) is `search_sessions` +
 * `search_tasks` (`useAgentRunState`, untouched by BC5 — AU26 J4 moved it
 * client-side earlier). Two section testids moved with the T11 restore:
 * `agent-capabilities-section` → `agent-harness-capabilities-section`,
 * `agent-track-record-section` → `agent-review-track-record-section`. The
 * team page route is `/work/team/:teamId` (singular) — the original spec's
 * `/work/teams/...` typo predates this change and is fixed here rather than
 * carried forward.
 */

import {
	expect,
	makeSessionRow,
	makeTask,
	makeUserRow,
	mockSearchSessions,
	mockSearchTasks,
	mockTeamPage,
	mockUser,
	test,
} from "./fixtures";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_AGENT_ID = "e2e-agent-builder";
const MOCK_TEAM_ID = "e2e-team-1";

const AGENT_ROW = makeUserRow(MOCK_AGENT_ID, {
	kind: "ai",
	name: "E2E Builder Bot",
	role: "builder",
	agentCategory: "team",
	team: { id: MOCK_TEAM_ID, name: "E2E Test Team" },
	createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
});

const RUNS_ON = [
	{
		type: "claude-code",
		name: "Claude Code",
		kind: "local" as const,
		authAction: { kind: "none" as const, label: "None" },
		discovery: { state: "ready" as const },
		models: [
			{ id: "sonnet", label: "Sonnet", selectable: true, options: [] },
			{ id: "opus", label: "Opus", selectable: true, options: [] },
		],
		modelProviders: ["anthropic"],
	},
];

const REVIEW_TRACK_RECORD = {
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
};

/** A completed session and an older crashed one — failureRate7d 0.5, latest run succeeded (not degraded). */
function healthySessions() {
	return [
		makeSessionRow("e2e-session-1", {
			agentId: MOCK_AGENT_ID,
			taskId: "e2e-task-1",
			state: "done",
			outcome: "completed",
			startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
			endedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
		}),
		makeSessionRow("e2e-session-2", {
			agentId: MOCK_AGENT_ID,
			taskId: "e2e-task-2",
			state: "crashed",
			outcome: "crashed",
			startedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
			endedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
		}),
	];
}

/** Same two sessions, reordered so the crash is the MOST recent outcome — lastSessionCrashed true. */
function degradedSessions() {
	return [
		makeSessionRow("e2e-session-1", {
			agentId: MOCK_AGENT_ID,
			taskId: "e2e-task-1",
			state: "crashed",
			outcome: "crashed",
			startedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
			endedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
		}),
		makeSessionRow("e2e-session-2", {
			agentId: MOCK_AGENT_ID,
			taskId: "e2e-task-2",
			state: "done",
			outcome: "completed",
			startedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
			endedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
		}),
	];
}

const TASK_REFS = [
	makeTask("e2e-task-1", { teamId: MOCK_TEAM_ID, title: "Implement login feature" }),
	makeTask("e2e-task-2", { teamId: MOCK_TEAM_ID, title: "Fix auth bug" }),
	makeTask("e2e-task-active", { teamId: MOCK_TEAM_ID, title: "Ship the active run" }),
];

async function mockAgentProfile(
	page: import("@playwright/test").Page,
	opts: { readonly sessions: readonly ReturnType<typeof makeSessionRow>[] },
): Promise<void> {
	await mockUser(page, {
		row: AGENT_ROW,
		runsOn: RUNS_ON,
		runConfig: {
			harnessType: "claude-code",
			modelId: null,
			modelProvider: null,
			maxConcurrentSessions: 2,
			modelOptions: null,
		},
		documentIds: [],
		subscriptions: [],
		reviewTrackRecord: REVIEW_TRACK_RECORD,
	});
	await mockSearchSessions(page, { rows: opts.sessions });
	await mockSearchTasks(page, { rows: TASK_REFS });
}

// ---------------------------------------------------------------------------
// AC-1: Profile page accessible from team page (agent name links to /agents/:id)
// ---------------------------------------------------------------------------

test.describe("AB1 AC-1: Navigate to agent profile from team page", () => {
	test.beforeEach(async ({ page }) => {
		await mockTeamPage(page, {
			teamId: MOCK_TEAM_ID,
			teamName: "E2E Test Team",
			roster: [AGENT_ROW],
		});
		await mockAgentProfile(page, { sessions: healthySessions() });
	});

	test("clicking agent name on team page navigates to agent profile", async ({ page }) => {
		await page.goto(`/work/team/${MOCK_TEAM_ID}`);
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
		await mockAgentProfile(page, { sessions: healthySessions() });
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
		// `harnessLabel` renders the space-separated form ("Claude Code"), not the raw id.
		await expect(page.getByTestId("agent-config-section")).toContainText(/claude code/i);
	});

	test("shows Harness Capabilities section", async ({ page }) => {
		await expect(page.getByTestId("agent-harness-capabilities-section")).toBeVisible();
	});

	test("shows Review Track Record section (AD4: replaces skills)", async ({ page }) => {
		await expect(page.getByTestId("agent-review-track-record-section")).toBeVisible();
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
		await expect(page.getByRole("alert")).not.toBeVisible();
	});

	test("shows health banner when agent is degraded", async ({ page }) => {
		await mockAgentProfile(page, { sessions: degradedSessions() });

		// Re-navigate to trigger the new mock
		await page.goto(`/agents/${MOCK_AGENT_ID}`);
		await page.waitForSelector("[data-testid='agent-profile-page']");

		// Health banner should be visible with role="alert"
		await expect(page.getByRole("alert")).toBeVisible();
	});

	test("shows active session link when agent has running session", async ({ page }) => {
		const sessions = [
			...healthySessions(),
			makeSessionRow("e2e-session-active", {
				agentId: MOCK_AGENT_ID,
				taskId: "e2e-task-active",
				state: "active",
				outcome: null,
				startedAt: new Date().toISOString(),
				endedAt: null,
			}),
		];
		await mockAgentProfile(page, { sessions });

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
		await expect(page.getByTestId("agent-review-track-record-section")).toContainText("90%");
	});
});

// ---------------------------------------------------------------------------
// AC-3: Profile links to Settings for editing — read-only itself
// ---------------------------------------------------------------------------

test.describe("AB1 AC-3: Profile links to Settings for editing", () => {
	test.beforeEach(async ({ page }) => {
		await mockAgentProfile(page, { sessions: healthySessions() });
		await page.goto(`/agents/${MOCK_AGENT_ID}`);
		await page.waitForSelector("[data-testid='agent-profile-page']");
	});

	test("shows 'Edit in Settings' button", async ({ page }) => {
		await expect(page.getByRole("link", { name: /edit in settings/i })).toBeVisible();
	});

	test("'Edit in Settings' button links to settings URL", async ({ page }) => {
		const editLink = page.getByRole("link", { name: /edit in settings/i });
		const href = await editLink.getAttribute("href");
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
