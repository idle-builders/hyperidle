/**
 * L10 — First-Run Flow. Playwright E2E.
 *
 * Walks the full guided onboarding from a wiped DB:
 *   factory bootstrap → API key (real provider ping is mocked at the route
 *   layer) → North Star (3 docs) → first-team (skipped) → done →
 *   verdict-grammar coach mark on first thread open.
 *
 * @lore L10 DoD: status responses are mocked via page.route so the spec
 * does not depend on a freshly-seeded dev database. Each step transitions
 * the next status response in flight.
 */
import { expect, type Page, test } from "@playwright/test";

interface FirstRunStatus {
	factoryReady: boolean;
	apiKeyReady: boolean;
	apiKeyLast4: string | null;
	northStarReady: boolean;
	teamScaffoldHandled: boolean;
	complete: boolean;
}

const FRESH: FirstRunStatus = {
	factoryReady: false,
	apiKeyReady: false,
	apiKeyLast4: null,
	northStarReady: false,
	teamScaffoldHandled: false,
	complete: false,
};

async function installApiMocks(page: Page, state: { status: FirstRunStatus }): Promise<void> {
	await page.route("**/api/first-run/status", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(state.status),
		});
	});
	await page.route("**/api/first-run/factory", async (route) => {
		state.status = { ...state.status, factoryReady: true };
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, actorId: "actor:ceo" }),
		});
	});
	await page.route("**/api/first-run/api-key", async (route) => {
		const req = route.request().postDataJSON() as { key: string } | null;
		const key = req?.key ?? "";
		if (key === "sk-ant-validkey1234") {
			state.status = { ...state.status, apiKeyReady: true, apiKeyLast4: "1234" };
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, status: 200, last4: "1234" }),
			});
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				ok: false,
				status: 401,
				message: "authentication_error: invalid",
			}),
		});
	});
	await page.route("**/api/first-run/north-star", async (route) => {
		state.status = { ...state.status, northStarReady: true };
		await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
	});
	await page.route("**/api/first-run/team-scaffold", async (route) => {
		state.status = { ...state.status, teamScaffoldHandled: true };
		await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
	});
	await page.route("**/api/first-run/complete", async (route) => {
		state.status = { ...state.status, complete: true };
		await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
	});
	// Mock other surface APIs the populated UI will call after redirect.
	await page.route("**/api/me", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ id: "actor:ceo", role: "CEO", domain_tags: [] }),
		});
	});
	await page.route("**/api/conversations**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				threads: [
					{
						id: "thr:1",
						kind: "review",
						pinned: 0,
						participants: [],
						routedToActorId: "actor:ceo",
						routedToActorRole: "CEO",
						domainTag: null,
						createdAt: "2026-04-26T12:00:00Z",
						lastActivityAt: "2026-04-26T12:00:00Z",
						blocking: false,
						resolvedAt: null,
					},
				],
				pagination: { page: 1, limit: 200, total: 1 },
			}),
		});
	});
}

test.describe("L10 — First-Run Flow", () => {
	test("redirect → bootstrap → api-key → north-star → skip team → done → review surface + coach", async ({
		page,
	}) => {
		const state = { status: { ...FRESH } };
		await installApiMocks(page, state);

		// Land on / — gate redirects us to /first-run.
		await page.goto("/");
		await expect(page.getByTestId("first-run-flow")).toBeVisible();

		// Step 1: factory.
		await expect(page.getByTestId("first-run-step-factory")).toBeVisible();
		await page.getByTestId("first-run-factory-name").fill("Acme Factory");
		await page.getByTestId("first-run-factory-submit").click();

		// Step 2: api-key. Bad key first.
		await expect(page.getByTestId("first-run-step-api-key")).toBeVisible();
		await page.getByTestId("first-run-api-key-input").fill("sk-ant-bogus");
		await page.getByTestId("first-run-api-key-test").click();
		await expect(page.getByTestId("first-run-api-key-error")).toContainText(/test failed/i);
		// Still on the api-key step.
		await expect(page.getByTestId("first-run-step-api-key")).toBeVisible();

		// Good key.
		await page.getByTestId("first-run-api-key-input").fill("sk-ant-validkey1234");
		await page.getByTestId("first-run-api-key-test").click();

		// Step 3: north-star.
		await expect(page.getByTestId("first-run-step-north-star")).toBeVisible();
		await page.getByTestId("first-run-principles").fill("Boil the lake.");
		await page.getByTestId("first-run-focus").fill("Ship 1 product to PMF.");
		await page.getByTestId("first-run-portfolio").fill("Two bets max.");
		await page.getByTestId("first-run-north-star-submit").click();

		// Step 4: team — skip.
		await expect(page.getByTestId("first-run-step-team")).toBeVisible();
		await page.getByTestId("first-run-team-skip").click();

		// Step 5: done — finish.
		await expect(page.getByTestId("first-run-step-done")).toBeVisible();
		await page.getByTestId("first-run-finish").click();

		// Lands on the populated UI (redirected to /conversations/review).
		await page.waitForURL(/\/conversations\/review/);
		await expect(page.getByTestId("main-content")).toBeVisible();
	});

	test("populated UI is unreachable until first-run completes", async ({ page }) => {
		const state = { status: { ...FRESH } };
		await installApiMocks(page, state);
		await page.goto("/conversations/review");
		// Gate redirects to /first-run.
		await page.waitForURL(/\/first-run/);
		await expect(page.getByTestId("first-run-flow")).toBeVisible();
	});

	test("verdict-grammar coach opens on first thread URL and ? reopens it", async ({ page }) => {
		// Simulate a completed factory: no first-run redirect.
		const state = {
			status: {
				factoryReady: true,
				apiKeyReady: true,
				apiKeyLast4: "1234",
				northStarReady: true,
				teamScaffoldHandled: true,
				complete: true,
			},
		};
		await installApiMocks(page, state);
		await page.goto("/conversations/review?thread=thr:1");
		await expect(page.getByTestId("verdict-grammar-coach")).toBeVisible();
		await page.getByTestId("verdict-grammar-coach-dismiss").click();
		await expect(page.getByTestId("verdict-grammar-coach")).toHaveCount(0);
		// `?` shortcut reopens.
		await page.keyboard.press("?");
		await expect(page.getByTestId("verdict-grammar-coach")).toBeVisible();
	});
});
