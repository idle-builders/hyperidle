/**
 * Journey: first run — a fresh install with no human user redirects to
 * /setup; filling in a name and starting creates the founder (and their
 * assistant) and lands on /work.
 *
 * @lore AW1: setup collects no credential at all — a harness arrives already
 * logged in, or it is not choosable. There is no API-key field any more.
 * @lore BC5 T10: `FirstRunRedirect` reads `search_users({kind:"human"})` (a
 * human row with a team means setup is done); the welcome screen writes
 * through `edit_user` twice (new person + team name, then new agent).
 */
import { expect, makeUserRow, mockSearchUsers, mockUser, test } from "./fixtures";

test.describe("SetupFlow", () => {
	test.beforeEach(async ({ page }) => {
		// No human user with a team yet — fresh install.
		await mockSearchUsers(page, { rows: [] });
		await page.route("**/api/actions/edit_user", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						user: makeUserRow("u-new-founder", {
							name: "Alice",
							role: "founder",
							team: { id: "p-new-product", name: "My Product" },
						}),
					},
				}),
			});
		});
	});

	test("redirects to /setup on fresh install (no human user)", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveURL(/\/setup/);
	});

	test("Start button enables once a name is entered, and completing setup lands on /work", async ({
		page,
	}) => {
		await mockUser(page, {
			row: makeUserRow("u-new-founder", {
				name: "Alice",
				team: { id: "p-new-product", name: "My Product" },
			}),
			self: true,
		});

		await page.goto("/setup");

		const startBtn = page.getByRole("button", { name: /start hyperidle/i });
		await expect(startBtn).toBeDisabled();

		await page.getByLabel(/your name/i).fill("Alice Founder");
		await expect(startBtn).toBeEnabled();

		await startBtn.click();

		await expect(page).toHaveURL(/\/work(?:\?onboarding=true)?$/, { timeout: 10_000 });
	});
});
