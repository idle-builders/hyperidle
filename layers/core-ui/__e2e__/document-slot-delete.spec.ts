/**
 * E2E for Settings → Skills & Rules delete (the one-click Delete button on
 * a DocumentSlotList row).
 *
 *
 */
import { expect, makeDocumentRow, test } from "./fixtures";

const ITEM = makeDocumentRow("ki-skill-1", { title: "write-tests", slot: "skill" });

test.describe("Settings → Skills & rules: delete", () => {
	test.beforeEach(async ({ page }) => {
		let archived = false;

		await page.route("**/api/actions/search_documents", async (route) => {
			if (route.request().method() !== "POST") {
				await route.continue();
				return;
			}
			const input = JSON.parse(route.request().postData() ?? "{}") as { slot?: string };
			const rows = input.slot === "skill" && !archived ? [ITEM] : [];
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: rows }),
			});
		});

		await page.route("**/api/actions/edit_document", async (route) => {
			const input = JSON.parse(route.request().postData() ?? "{}") as {
				id?: string;
				status?: string;
			};
			if (input.id !== ITEM.id || input.status !== "archived") {
				await route.fallback();
				return;
			}
			archived = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						document: { ...ITEM, status: "archived" },
						ancestors: [],
						children: [],
						siblings: [],
						scopeName: "Factory",
					},
				}),
			});
		});
	});

	test("one real mouse click on Delete: archives immediately, never navigates", async ({
		page,
	}) => {
		await page.goto("/settings");
		await page.waitForSelector("[data-testid='settings-page']");

		const row = page.getByTestId("document-slot-row").filter({ hasText: "write-tests" });
		await expect(row).toBeVisible();

		const archiveRequest = page.waitForRequest(
			(req) =>
				req.url().includes("/api/actions/edit_document") &&
				req.method() === "POST" &&
				(JSON.parse(req.postData() ?? "{}") as { id?: string }).id === ITEM.id,
			{ timeout: 5_000 },
		);

		// Real click — Playwright scrolls the button into view first, exactly
		// like a user reaching a section partway down the stacked Settings
		// page, then dispatches real mousedown/mouseup/click. No menu, no
		// confirm step: this single click is the whole delete flow.
		await row.getByRole("button", { name: /delete write-tests/i }).click();

		// A timeout here (no matching request) fails the test on its own.
		await archiveRequest;
		await expect(page).toHaveURL(/\/settings$/);
		await expect(page.getByText("write-tests")).not.toBeVisible();
	});
});
