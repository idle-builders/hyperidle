/**
 * L6 — Request-Changes Composer E2E (red phase).
 *
 * Validation scenario from TRACK-L.md L6:
 *   "Given the composer is open with summary 'tighten the wording' and 2
 *    anchored comments, when Cmd+Enter is pressed, then the verdict commits
 *    and the toast confirms 'Changes requested with 2 inline comments.'"
 *
 * Also verifies the POST body shape via request interception per AC:
 *   "Submit posts a `request_changes` verdict with `summary` and
 *    `inline_comments[]`."
 *
 * MUST fail today: composer doesn't exist; clicking Request changes commits
 * silently with no body, no toast, no POST.
 */
import { expect, test } from "@playwright/test";

test.describe("L6 — Request Changes composer", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-testid='conversations-review-page']");
	});

	test("R opens composer; anchor 2 comments; Cmd+Enter submits with correct payload + toast", async ({
		page,
	}) => {
		// Intercept the verdict POST so we can assert the payload shape without
		// requiring the dev server to have a real backend wired.
		const requestPromise = page.waitForRequest(
			(req) =>
				req.url().includes("/api/conversations/responses") && req.method() === "POST",
		);

		// Press R on the page (not on an input) to open the composer.
		await page.keyboard.press("KeyR");

		// Composer dialog visible with summary input focused.
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		const summary = dialog.getByRole("textbox", { name: /summary/i });
		await expect(summary).toBeFocused();

		// Click two diff-gutter "+ Comment" affordances (per .plan-L6.md the
		// composer-open state still allows gutter clicks; if not, we close +
		// click + reopen — but the spec contract is concurrent).
		// Close composer first to access the underlying diff in case modal
		// blocks pointer events:
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();

		const addButtons = page.getByRole("button", { name: /add comment to line/i });
		await addButtons.nth(0).click();
		await addButtons.nth(1).click();

		// Composer should reopen with 2 draft rows pre-populated.
		await expect(page.getByRole("dialog")).toBeVisible();
		const rows = page.getByTestId(/^inline-comment-row-/);
		await expect(rows).toHaveCount(2);

		// Type bodies into each draft.
		await rows.nth(0).getByRole("textbox", { name: /comment/i }).fill("rename this var");
		await rows.nth(1).getByRole("textbox", { name: /comment/i }).fill("missing null check");

		// Type summary and submit via Cmd+Enter.
		await summary.fill("tighten the wording");
		await summary.press("Meta+Enter");

		// Verify intercepted request body shape.
		const request = await requestPromise;
		const body = JSON.parse(request.postData() ?? "{}") as {
			decision: string;
			summary: string;
			inline_comments: Array<{ line_index: number; body: string }>;
		};
		expect(body.decision).toBe("request-changes");
		expect(body.summary).toBe("tighten the wording");
		expect(body.inline_comments).toHaveLength(2);
		expect(body.inline_comments[0].body).toBe("rename this var");
		expect(body.inline_comments[1].body).toBe("missing null check");

		// Toast confirmation copy per L6 validation scenario.
		await expect(page.getByText(/Changes requested with 2 inline comments/i)).toBeVisible();
	});

	test("Cancel discards composer state and makes no API call", async ({ page }) => {
		let postCount = 0;
		page.on("request", (req) => {
			if (req.url().includes("/api/conversations/responses") && req.method() === "POST") {
				postCount++;
			}
		});
		await page.getByRole("button", { name: "Request changes" }).click();
		await page.getByRole("textbox", { name: /summary/i }).fill("draft");
		await page.getByRole("button", { name: /cancel/i }).click();
		await expect(page.getByRole("dialog")).toBeHidden();
		expect(postCount).toBe(0);
	});
});
