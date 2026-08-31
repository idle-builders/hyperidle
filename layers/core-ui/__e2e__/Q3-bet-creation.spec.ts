/**
 * Q3 — Playwright E2E: Human-created bets.
 *
 * Covers:
 *   T7: Navigate to /work/portfolio, create pitch, verify BetCard appears.
 *
 * AC covered: AC1, AC4, AC5, AC9, AC10
 *
 * Strategy: page.route() mocks — no DB seeding required (dev server serves SPA).
 * LIFO Playwright route matching: test-specific routes take precedence over
 * fixture defaults (registered in fixtures.ts auto-use fixture).
 */

import { expect, test } from "./fixtures";

// Canvas mock data
const MOCK_CANVAS_EMPTY = {
	shaped: [],
	committed: [],
	capacity: { used: 0, max: 2 },
};

const MOCK_CANVAS_WITH_BET = {
	shaped: [
		{
			id: "new-bet-id",
			title: "My New Feature",
			team: "Test Team",
			teamId: "test-team-1",
			status: "shaped",
			appetite: "—",
		},
	],
	committed: [],
	capacity: { used: 0, max: 2 },
};

const MOCK_CANVAS_WITH_BOLD_BET = {
	shaped: [
		{
			id: "bold-bet-id",
			title: "Bold Feature",
			team: "Test Team",
			teamId: "test-team-1",
			status: "shaped",
			appetite: "—",
		},
	],
	committed: [],
	capacity: { used: 0, max: 2 },
};

const MOCK_BET_DETAIL = {
	id: "bold-bet-id",
	title: "Bold Feature",
	team: "Test Team",
	status: "shaped",
	tokensActual: null,
	progress: { done: 0, total: 0 },
	description: "**Bold text** in pitch",
	tasks: [],
};

const MOCK_CREATE_RESPONSE = {
	id: "new-bet-id",
	teamId: "test-team-1",
	description: "My New Feature",
	status: "shaped",
	createdAt: new Date().toISOString(),
};

test.describe("Q3 — Bet creation flow", () => {
	test.beforeEach(async ({ page }) => {
		// Mock GET /api/bets/canvas — starts empty

		// Mock GET /api/artifacts — empty
		await page.route("**/api/artifacts**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ artifacts: [], nextCursor: null }),
			});
		});

		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");
	});

	// AC1: "New pitch" button visible in Canvas Shaped column header
	test("AC1 — 'New pitch' (+) button is visible in Canvas shaped column", async ({ page }) => {
		const newPitchBtn = page.getByRole("button", { name: /new pitch/i });
		await expect(newPitchBtn).toBeVisible();
	});

	// AC4: New bet appears as BetCard in shaped column
	test("AC4 — Creating a pitch shows BetCard in shaped column", async ({ page }) => {
		// Override POST /api/bets

		// After creation, canvas returns a bet

		// Click new pitch button
		await page.getByRole("button", { name: /new pitch/i }).click();

		// Dialog opens — fill team and pitch
		await expect(page.getByRole("dialog")).toBeVisible();
		const productSelect = page.getByLabel(/team/i);
		await productSelect.selectOption({ index: 1 }); // select first real team

		const pitchTextarea = page.getByLabel(/pitch/i);
		await pitchTextarea.fill("My New Feature");

		// Submit
		await page.getByRole("button", { name: /create/i }).click();

		// Bet appears in shaped column
		const shapedZone = page.locator("[data-droppable='shaped']");
		await expect(shapedZone).toContainText("My New Feature");
	});

	// AC5: Pitch renders as markdown in bet detail
	test("AC5 — Pitch with **bold** renders as <strong> in bet detail", async ({ page }) => {
		// Canvas with a bet that has markdown pitch

		// Mock the bet detail

		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		// Navigate to bet detail
		await page.goto("/work/task/bold-bet-id");
		await page.waitForSelector("[data-testid='bet-pitch']");

		// **bold** should render as <strong>
		const pitchSection = page.locator("[data-testid='bet-pitch']");
		const strongEl = pitchSection.locator("strong");
		await expect(strongEl).toBeVisible();
		await expect(strongEl).toContainText("Bold text");
	});

	// AC9: No appetite → card shows "—"
	test("AC9 — BetCard shows '—' when no appetite is set", async ({ page }) => {
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		// The shaped column should show "—" for appetite
		const shapedZone = page.locator("[data-droppable='shaped']");
		await expect(shapedZone).toContainText("—");
	});

	// AC10: Empty pitch → validation error in dialog
	test("AC10 — Empty pitch prevents form submission", async ({ page }) => {
		await page.getByRole("button", { name: /new pitch/i }).click();
		await expect(page.getByRole("dialog")).toBeVisible();

		// Select a team but leave pitch empty
		const productSelect = page.getByLabel(/team/i);
		await productSelect.selectOption({ index: 1 });

		// Create button should be disabled
		const createBtn = page.getByRole("button", { name: /create/i });
		await expect(createBtn).toBeDisabled();
	});

	// AC10: No team selected → Create disabled
	test("AC10 — No team selected prevents form submission", async ({ page }) => {
		await page.getByRole("button", { name: /new pitch/i }).click();
		await expect(page.getByRole("dialog")).toBeVisible();

		// Fill pitch but don't select team
		await page.getByLabel(/pitch/i).fill("A pitch without a team");

		const createBtn = page.getByRole("button", { name: /create/i });
		await expect(createBtn).toBeDisabled();
	});
});
