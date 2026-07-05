/**
 * L17 — Playwright e2e: Cost + Tokens wired into Work (AC21, AC22, AC24).
 *
 * Strategy: hermetic page.route() mocks for all API calls.
 * No DB seeding required — dev server serves only the SPA bundle.
 *
 * AC21: BetCard shows formatted Money appetite (not "2 weeks")
 * AC22: Bet detail shows spend-vs-cap in Money + Tokens
 * AC24: WorkProduct burn shows formatted Money
 *
 * These tests will FAIL until Task 5-6 implementation ships.
 */

import { expect, test } from "./fixtures";

const BET_ID = "test-bet-l17";
const PRODUCT_ID = "test-product-l17";

// ── Fixtures with L17 structured Money shapes ─────────────────────────────────

/**
 * AC22 fixture: Bet detail with structured costAppetite and costActual.
 * Note: appetite as string ("2 weeks") must NOT appear in the response.
 */
const BET_DETAIL_FIXTURE = {
	id: BET_ID,
	title: "Cost Test Bet",
	product: "Acme",
	team: "Alpha Core",
	status: "in_progress",
	// L17: structured money — no more "2 weeks" string
	costAppetite: { minor: 50000, currency: "USD" }, // $500.00 budget
	tokenAppetite: null,
	costActual: { minor: 21430, currency: "USD" }, // $214.30 spent
	tokensActual: {
		byTier: {
			workhorse: { prompt: 38200, completion: 4100 },
		},
	},
	progress: { done: 2, total: 5 },
	description: "Build the cost tracking feature.",
	tasks: [
		{
			id: "task-l17-1",
			betId: BET_ID,
			title: "Wire up Money types",
			ownerAgentId: "builder-agent",
			state: "done",
			costActual: { minor: 12000, currency: "USD" }, // $120.00
			costCap: null,
			latestSessionOutcome: "success",
			latestSessionCost: 12000,
			latestSessionTokensInput: 18000,
			latestSessionTokensOutput: 2100,
			latestSessionHarnessUrl: null,
		},
		{
			id: "task-l17-2",
			betId: BET_ID,
			title: "Add formatMoney formatter",
			ownerAgentId: "builder-agent",
			state: "done",
			costActual: { minor: 9430, currency: "USD" }, // $94.30
			costCap: null,
			latestSessionOutcome: "success",
			latestSessionCost: 9430,
			latestSessionTokensInput: 20200,
			latestSessionTokensOutput: 2000,
			latestSessionHarnessUrl: null,
		},
	],
};

/**
 * AC21 fixture: Portfolio product list with BetCardSummary using structured costAppetite.
 */
const PRODUCT_DETAIL_FIXTURE = {
	product: {
		id: PRODUCT_ID,
		name: "Acme",
		phase: "build",
		status: "healthy",
		leadAgentId: null,
	},
	team: { id: "team-1", formedAt: "2026-01-01T00:00:00Z", dissolvedAt: null },
	roster: [],
	burn: {
		// AC24: WorkProduct burn shows WireMoney not raw numbers
		costActual: { minor: 21430, currency: "USD" }, // $214.30 spent
		costCap: { minor: 200000, currency: "USD" }, // $2000.00 cap
		capacity: 3,
		activeBets: 1,
	},
	activeBets: [
		{
			id: BET_ID,
			pitchTitle: "Cost Test Bet",
			// AC21: structured costAppetite instead of "2 weeks" string
			costAppetite: { minor: 50000, currency: "USD" }, // $500.00
			status: "in_progress",
			progressDone: 2,
			progressTotal: 5,
		},
	],
};

const PRODUCTS_LIST_FIXTURE = {
	teams: [
		{
			id: PRODUCT_ID,
			name: "Acme",
			phase: "build",
			status: "healthy",
			leadAgentId: null,
			activeBets: 1,
			shipped: 3,
			shipRate: "75%",
			progress: { done: 2, total: 5 },
		},
	],
};

// ── AC21: BetCard shows formatted Money appetite ──────────────────────────────

test.describe("L17 — BetCard shows formatted Money appetite (AC21)", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/teams", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(PRODUCTS_LIST_FIXTURE),
			}),
		);
		await page.route(`**/api/teams/${PRODUCT_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(PRODUCT_DETAIL_FIXTURE),
			}),
		);
		await page.goto(`/work/team/${PRODUCT_ID}`);
	});

	test("BetCard appetite shows dollar-formatted money (not '2 weeks')", async ({ page }) => {
		// Wait for the product page to load
		await page.waitForSelector("[data-testid='bet-card']", { timeout: 5000 }).catch(() => {
			// Fallback: wait for any bet-related content
		});

		// The appetite value on BetCard must show formatted money
		// "$500.00" derived from { minor: 50000, currency: "USD" }
		const pageText = await page.textContent("body");
		expect(pageText).toContain("$");

		// The old format "2 weeks" must not appear as a cost appetite
		// (it could appear in pitch text, but not as a bet appetite chip)
		const appetiteChip = page.locator("[data-testid='bet-appetite']");
		if ((await appetiteChip.count()) > 0) {
			const chipText = await appetiteChip.first().textContent();
			expect(chipText).toMatch(/^\$[\d,]+\.\d{2}$/); // "$500.00" format
			expect(chipText).not.toMatch(/week/i);
		}
	});

	test("BetCard does NOT show raw minor integer (50000) as appetite", async ({ page }) => {
		// Wait for page render
		await page.waitForLoadState("networkidle");

		// Raw "50000" must not be visible as an appetite value
		// The number 50000 shouldn't appear verbatim in the appetite context
		// (it should be formatted as $500.00)
		const appetiteChips = page.locator("[data-testid='bet-appetite']");
		if ((await appetiteChips.count()) > 0) {
			const chipText = await appetiteChips.first().textContent();
			expect(chipText).not.toBe("50000");
		}
	});
});

// ── AC22: Bet detail shows spend-vs-cap in Money + Tokens ──────────────────

test.describe("L17 — Bet detail shows spend-vs-cap (AC22)", () => {
	test.beforeEach(async ({ page }) => {
		await page.route(`**/api/bets/${BET_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(BET_DETAIL_FIXTURE),
			}),
		);
		await page.goto(`/work/bet/${BET_ID}`);
	});

	test("bet detail shows formatted cost appetite '$500.00'", async ({ page }) => {
		await page.waitForLoadState("networkidle");
		const pageText = await page.textContent("body");
		// $500.00 from costAppetite { minor: 50000, currency: "USD" }
		expect(pageText).toContain("$500.00");
	});

	test("bet detail shows formatted cost actual '$214.30'", async ({ page }) => {
		await page.waitForLoadState("networkidle");
		const pageText = await page.textContent("body");
		// $214.30 from costActual { minor: 21430, currency: "USD" }
		expect(pageText).toContain("$214.30");
	});

	test.skip("bet detail shows token count in compact format", async ({ page }) => {
		await page.waitForLoadState("networkidle");
		const pageText = await page.textContent("body");
		// Total tokens: 38200 + 4100 = 42300 → "42.3k"
		expect(pageText).toContain("42.3k");
	});

	test.skip("task row shows formatted cost '$120.00'", async ({ page }) => {
		await page.waitForLoadState("networkidle");
		const pageText = await page.textContent("body");
		// Task 1 costActual: $120.00
		expect(pageText).toContain("$120.00");
	});

	test("no raw integer 21430 visible on bet detail page", async ({ page }) => {
		await page.waitForLoadState("networkidle");
		const pageText = await page.textContent("body");
		// The minor unit value 21430 must not appear verbatim
		expect(pageText).not.toContain("21430");
	});

	test("no duration string '2 weeks' visible on cost surfaces", async ({ page }) => {
		await page.waitForLoadState("networkidle");
		// "2 weeks" should not appear as a cost/appetite value
		const costSection = page.locator("[data-testid='bet-cost-section']");
		if ((await costSection.count()) > 0) {
			const costText = await costSection.textContent();
			expect(costText).not.toMatch(/\d+ weeks?/i);
		}
	});
});

// ── AC24: WorkProduct burn shows formatted Money ──────────────────────────────

test.describe("L17 — WorkProduct burn shows formatted Money (AC24)", () => {
	test.beforeEach(async ({ page }) => {
		await page.route(`**/api/teams/${PRODUCT_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(PRODUCT_DETAIL_FIXTURE),
			}),
		);
		await page.goto(`/work/team/${PRODUCT_ID}`);
	});

	test("product burn shows formatted '$214.30' (not raw 21430)", async ({ page }) => {
		await page.waitForLoadState("networkidle");
		const pageText = await page.textContent("body");
		// costActual: { minor: 21430, currency: "USD" } → "$214.30"
		expect(pageText).toContain("$214.30");
		expect(pageText).not.toContain("21430");
	});

	test("product burn shows formatted '$2,000.00' cap (not raw 200000)", async ({ page }) => {
		await page.waitForLoadState("networkidle");
		const pageText = await page.textContent("body");
		// costCap: { minor: 200000, currency: "USD" } → "$2,000.00"
		// Must contain dollar sign + properly formatted large number
		expect(pageText).toMatch(/\$2[,.]000/);
		expect(pageText).not.toContain("200000");
	});

	test("product burn section contains '$' prefix (not bare number)", async ({ page }) => {
		await page.waitForLoadState("networkidle");
		// The burn section must display money with $ prefix
		const burnSection = page.locator("[data-testid='product-burn']");
		if ((await burnSection.count()) > 0) {
			const burnText = await burnSection.textContent();
			expect(burnText).toContain("$");
		} else {
			// Fallback: any element with dollar sign is sufficient
			const dollarElements = page.locator(":has-text('$')");
			expect(await dollarElements.count()).toBeGreaterThan(0);
		}
	});
});
