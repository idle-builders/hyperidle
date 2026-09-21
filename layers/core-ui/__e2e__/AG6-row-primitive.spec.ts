/**
 * AG6 — Shared Row/ItemList primitive: Playwright capture spec (AC-6).
 *
 * Drives the app and captures screenshots of two list surfaces rendered through
 * the shared Row primitive:
 *   1. WorkTeam agents + routines list (Row via ItemList)
 *   2. KnowledgeList triage view (Row as="li" via ItemList)
 *
 * Assertions: rows carry data-ds-component="Row", min-height 44px (AC-3 touch
 * target), and screenshots are captured for the visual record.
 *
 * Strategy: hermetic page.route() mocks — no real DB. Follows AG1 patterns.
 *
 * @lore AG6 C2: This spec is the AC-6 deliverable — the builder must commit a
 * *.spec.ts that captures ≥2 migrated list surfaces. The reviewer's manual
 * proof screenshots are not a substitute.
 *
 * @lore AG6 C2: page.route() LIFO applies — test-specific routes registered
 * here win over the auto-use fixture defaults in ./fixtures.ts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, makeDocumentRow, mockSearchDocuments, test } from "./fixtures";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAM_ID = "ag6-team";
const TEAM_URL = `/work/team/${TEAM_ID}`;
const KNOWLEDGE_URL = "/documents";

const SpecDir = path.dirname(fileURLToPath(import.meta.url));
const PROOF_DIR = path.resolve(SpecDir, "../../../test-results");

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function makeTeamFixture() {
	return {
		team: {
			id: TEAM_ID,
			name: "AG6 Core Team",
			phase: "build",
			status: "healthy",
			leadAgentId: "agent-lead",
		},
		teamMembers: {
			id: TEAM_ID,
			formedAt: "2026-01-01T00:00:00.000Z",
			dissolvedAt: null,
		},
		roster: [
			{
				agentId: "agent-lead",
				name: "Builder Agent",
				role: "builder",
				isLead: true,
				agentCategory: "team",
				operationalStatus: "active",
				healthLevel: "healthy",
				healthDetail: "Healthy",
				activeTaskTitle: "Implement row primitive",
				activeTaskId: "task-ag6",
				activeBetId: "bet-ag6",
			},
			{
				agentId: "agent-2",
				name: "Scout Agent",
				role: "scout",
				isLead: false,
				// @lore BA9d: "strategy" category deleted; individual now covers non-team agents.
				agentCategory: "individual",
				operationalStatus: "idle",
				healthLevel: "warning",
				healthDetail: "1 of 3 sessions degraded",
				activeTaskTitle: null,
				activeTaskId: null,
				activeBetId: null,
			},
		],
		burn: {
			capacity: 5,
		},
		tasksInProgress: [
			{
				id: "bet-ag6",
				title: "AG6 primitive",
				status: "active",
				progressDone: 1,
				progressTotal: 2,
			},
		],
		routines: [
			{
				id: "routine-ag6",
				name: "Daily sync",
				state: "active",
				scheduleLabel: "Every day at 09:00",
				agentName: "Builder Agent",
				agentInitials: "BA",
				lastRunAt: "2026-06-12T09:00:00.000Z",
				lastRunOutcome: "success",
				nextRunAt: "2026-06-13T09:00:00.000Z",
			},
		],
	};
}

// @lore BC4: the document rows below carry `status:"proposed"` — the
// DocumentList triage tab filters on exactly that value (was "draft", never
// a valid status even under the pre-BC4 vocabulary).
const KNOWLEDGE_DOCUMENTS = [
	makeDocumentRow("ki-ag6-1", {
		title: "Row primitive consolidation",
		body: "All list rows go through the shared Row/ItemList primitive.",
		status: "proposed",
		createdAt: "2026-06-12T00:00:00.000Z",
		updatedAt: "2026-06-12T00:00:00.000Z",
	}),
	makeDocumentRow("ki-ag6-2", {
		title: "Hover/focus via clickableProps",
		body: "clickableProps is the single source of hover+focus+motion for all rows.",
		status: "proposed",
		createdAt: "2026-06-11T00:00:00.000Z",
		updatedAt: "2026-06-11T00:00:00.000Z",
	}),
];

// ---------------------------------------------------------------------------
// Shared route helpers (mirrors AG1 pattern)
// ---------------------------------------------------------------------------

async function mockTeamRoutes(page: import("@playwright/test").Page): Promise<void> {
	await page.route(`**/api/teams/${TEAM_ID}`, async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeTeamFixture()),
			});
		} else {
			await route.continue();
		}
	});

	await page.route("**/api/agents*", async (route) => {
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

	await page.route("**/api/artifacts*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ items: [], nextCursor: null }),
		});
	});
}

async function mockKnowledgeRoutes(page: import("@playwright/test").Page): Promise<void> {
	await mockSearchDocuments(page, { rows: KNOWLEDGE_DOCUMENTS });
}

// ---------------------------------------------------------------------------
// AC-6 Surface 1: WorkTeam agents + routines (Row via ItemList, default wrapper)
// ---------------------------------------------------------------------------

test.describe("AG6 AC-6 — Surface 1: WorkTeam agents + routines via Row primitive", () => {
	test("agent rows carry data-ds-component=Row and meet 44px min-height", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await mockTeamRoutes(page);

		await page.goto(TEAM_URL);
		await page.waitForSelector("[data-testid='work-team-page']");
		await page.waitForLoadState("networkidle");

		// Rows carry data-ds-component="Row" — the testid and ds-component are
		// on the same element (Row primitive sets both data-testid and data-ds-component
		// on its wrapper). Assert via combined selector.
		const agentRows = page.locator("[data-testid='agent-row'][data-ds-component='Row']");
		await expect(agentRows.first()).toBeVisible();

		const count = await agentRows.count();
		expect(count).toBeGreaterThan(0);

		// Touch target: each Row element must have min-height >= 44px (AC-3)
		for (let i = 0; i < count; i++) {
			const box = await agentRows.nth(i).boundingBox();
			if (box) {
				expect(box.height).toBeGreaterThanOrEqual(44);
			}
		}

		// Capture proof screenshot
		fs.mkdirSync(PROOF_DIR, { recursive: true });
		await page.screenshot({
			path: path.join(PROOF_DIR, "AG6-surface1-workteam-agents-routines.png"),
			fullPage: false,
		});
	});

	test("routine rows carry data-ds-component=Row marker", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await mockTeamRoutes(page);

		await page.goto(TEAM_URL);
		await page.waitForSelector("[data-testid='work-team-page']");
		await page.waitForLoadState("networkidle");

		// routine-row and data-ds-component=Row are on the same element
		const routineRows = page.locator("[data-testid='routine-row'][data-ds-component='Row']");
		await expect(routineRows.first()).toBeVisible();

		const count = await routineRows.count();
		expect(count).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// AC-6 Surface 2: Knowledge triage list (Row as="li" via ItemList flush/ul)
// ---------------------------------------------------------------------------

test.describe("AG6 AC-6 — Surface 2: Knowledge triage rows via Row primitive", () => {
	test("knowledge triage rows carry data-ds-component=Row and meet 44px min-height", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await mockKnowledgeRoutes(page);

		await page.goto(KNOWLEDGE_URL);
		await page.waitForSelector("[data-testid='knowledge-list-page']");
		await page.waitForLoadState("networkidle");

		// Triage tab should be active (items are drafts → needs attention)
		const triageView = page.locator("[data-testid='knowledge-triage-view']");
		await expect(triageView).toBeVisible();

		// knowledge-row testids must be present; as="li" path → <li data-ds-component="Row" data-testid="knowledge-row">
		const knowledgeRows = page.locator("li[data-ds-component='Row'][data-testid='knowledge-row']");
		await expect(knowledgeRows.first()).toBeVisible();

		const count = await knowledgeRows.count();
		expect(count).toBeGreaterThan(0);

		// Touch target: each li[data-ds-component=Row] >= 44px (AC-3)
		for (let i = 0; i < count; i++) {
			const box = await knowledgeRows.nth(i).boundingBox();
			if (box) {
				expect(box.height).toBeGreaterThanOrEqual(44);
			}
		}

		// Capture proof screenshot
		fs.mkdirSync(PROOF_DIR, { recursive: true });
		await page.screenshot({
			path: path.join(PROOF_DIR, "AG6-surface2-knowledge-triage.png"),
			fullPage: false,
		});
	});
});
