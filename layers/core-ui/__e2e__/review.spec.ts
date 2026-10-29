/**
 * A review on the demo world: round 2 from the hand-off, round 1 as it was, more space, a pin by
 * pointing at the page, a reply, and both verdicts. Runs after the other specs, which read the
 * reviews still open.
 */
import { expect, type Page, test } from "@playwright/test";

const HAND_OFF = "/conversations/demo-thread-trial-end";
const ROUND_2 = `${HAND_OFF}?review=demo-msg-explainer-review-2`;
const LAYOUT = "/conversations/thr-demo-task-trials-layout?review=demo-msg-layout-review";

const questions = (page: Page) => page.getByRole("region", { name: "Questions on this review" });
const verdict = (page: Page) => page.getByRole("region", { name: "Verdict" });

test("Look at it opens round 2 with its flags; round 1 opens as it was, with its reason", async ({
	page,
}) => {
	await page.goto(HAND_OFF);
	await page.getByRole("button", { name: "Look at it" }).last().click();
	await expect(page).toHaveURL(/\?review=demo-msg-explainer-review-2$/);
	await expect(page.getByText("Review · Final · round 2")).toBeVisible();
	await expect(page.getByRole("button", { name: "Pin C on the warning email" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Pin D on the trial-end page" })).toBeVisible();
	await expect(page.getByText("Changed since round 1")).toBeVisible();
	await expect(questions(page)).toContainText("Builder flagged · on the warning email");

	const back = page.getByRole("button", { name: /^Round 1 · rejected by you/ });
	await expect(back).toContainText("1 question still open there");
	await back.click();
	await expect(page).toHaveURL(/\?review=demo-msg-explainer-review-1$/);
	await expect(page.getByText("Review · Final · round 1")).toBeVisible();
	await expect(verdict(page)).toHaveText("Rejected · sent to Builder");
	await expect(
		page.getByText(/^Wrong direction\. Customers need the warning in the email/),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Pin A on the amount" })).toBeVisible();
	await expect(questions(page)).toContainText("1 open");
	await expect(questions(page)).toContainText("2 answered");
});

test("More space opens the page full width at a device size, and Done comes back", async ({
	page,
}) => {
	await page.goto(ROUND_2);
	await page.getByRole("button", { name: "More space" }).click();
	const phone = page.getByRole("button", { name: "Phone" });
	await phone.click();
	await expect(phone).toHaveAttribute("aria-pressed", "true");
	await expect
		.poll(async () => (await page.getByTitle("Live preview").boundingBox())?.width)
		.toBe(390);
	await expect(page.getByRole("button", { name: "Pin D on the trial-end page" })).toBeVisible();

	await page.getByRole("button", { name: "Done", exact: true }).click();
	await expect(questions(page)).toBeVisible();
});

test("pointing at the page's heading makes a pin and a row; a reply lands in the pin", async ({
	page,
}) => {
	await page.goto(ROUND_2);
	// Comment mode exposes the pointer layer; Use it (the default) passes clicks to the page.
	await page.getByRole("button", { name: "Comment" }).click();
	await page
		.getByRole("button", { name: "Point at something on the page" })
		.scrollIntoViewIfNeeded();
	// The page is covered by the pointer layer, so the click lands on it, over the heading.
	await page
		.frameLocator('iframe[title="Live preview"]')
		.locator("h1")
		.click({ force: true, position: { x: 20, y: 10 } });

	const comment = page.getByRole("textbox", { name: "Comment", exact: true });
	await expect(comment).toBeFocused();
	await comment.fill("Should the heading say both dates?");
	await comment.press("Enter");

	const label = "“Your first bill: 2 September”";
	await expect(page.getByRole("button", { name: `Pin 1 on ${label}` })).toBeVisible();
	await expect(questions(page)).toContainText(`You asked · on ${label}`);
	await expect(questions(page)).toContainText("Should the heading say both dates?");

	const reply = page.getByRole("textbox", { name: "Reply" });
	await reply.fill("Or only the bill date.");
	await reply.press("Enter");
	await expect(reply).toHaveValue("");
	await expect(page.getByText("Or only the bill date.")).toBeVisible();
	await expect(questions(page)).toContainText("3 open");
});

test("a reject needs a reason, and goes back with it", async ({ page }) => {
	await page.goto(LAYOUT);
	await page.getByRole("button", { name: "Reject" }).click();
	const dialog = page.getByRole("dialog", { name: "Reject this review" });
	const send = dialog.getByRole("button", { name: "Reject and send" });
	await expect(send).toBeDisabled();
	await dialog.getByRole("textbox").fill("   ");
	await expect(send).toBeDisabled();

	await dialog.getByRole("textbox").fill("Price under the plan name, not above it.");
	await send.click();
	await expect(dialog).toBeHidden();
	await expect(verdict(page)).toHaveText("Rejected · sent to Designer");
	await expect(
		page.getByText("Price under the plan name, not above it.", { exact: true }),
	).toBeVisible();
});

test("Approve shows the open count beside it and works; the conversation stops asking", async ({
	page,
}) => {
	await page.goto(ROUND_2);
	const row = page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("button", { name: /^Trial-end confusion, three tickets/ });
	await expect(row).toContainText("Needs review");
	await expect(verdict(page)).toContainText("3 open");

	await verdict(page).getByRole("button", { name: "Approve" }).click();
	await expect(verdict(page)).toHaveText("Approved · 1 open");
	await expect(row).not.toContainText("Needs review");
	await expect(page.getByRole("button", { name: "Pin C on the warning email" })).toBeVisible();

	await page.goto(HAND_OFF);
	await expect(
		page.getByRole("button", { name: /^Explain what happens when a trial ends/ }),
	).toContainText("Needs review · 1 review");
});

test("Use it lets clicks reach the page; Comment intercepts them as pins; Escape returns to Use it", async ({
	page,
}) => {
	// Serve an interactive page with a button whose text changes on click.
	await page.route("**/review-switch-test.html", (route) =>
		route.fulfill({
			contentType: "text/html; charset=utf-8",
			body: `<!doctype html><html><head><meta charset="utf-8"></head><body>
<button id="b" onclick="this.textContent='Clicked!'">Click me</button>
</body></html>`,
		}),
	);

	// Create a review with that page and navigate to it.
	await page.goto(HAND_OFF);
	const id = await page.evaluate(async () => {
		const res = await fetch("/api/actions/send_message", {
			method: "POST",
			headers: { "X-API-Key": "hyperidle-dev-local", "Content-Type": "application/json" },
			body: JSON.stringify({
				threadId: "demo-thread-trial-end",
				review: {
					title: "Switch test",
					reasoning: [],
					parts: [
						{
							id: "page",
							kind: "preview",
							label: "Live preview",
							title: "Switch test page",
							url: `${location.origin}/review-switch-test.html`,
						},
					],
				},
			}),
		}).then((r) => r.json());
		return res.data.message.id as string;
	});
	await page.goto(`${HAND_OFF}?review=${id}`);

	// Default mode is Use it: the overlay is absent and the switch shows it as active.
	await expect(page.getByRole("button", { name: "Use it" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(
		page.getByRole("button", { name: "Point at something on the page" }),
	).not.toBeVisible();

	// Click the button inside the iframe — the click reaches the page.
	const iframe = page.frameLocator('iframe[title="Live preview"]');
	await iframe.locator("#b").click();
	await expect(iframe.locator("#b")).toHaveText("Clicked!");
	// No pin was created.
	await expect(page.getByRole("region", { name: "Questions on this review" })).not.toBeVisible();

	// Switch to Comment mode — the pointer layer appears.
	await page.getByRole("button", { name: "Comment" }).click();
	await expect(page.getByRole("button", { name: "Comment" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(page.getByRole("button", { name: "Point at something on the page" })).toBeVisible();

	// Click the page — the pointer layer intercepts and opens a comment box.
	await iframe.locator("#b").click({ force: true });
	await expect(page.getByRole("textbox", { name: "Comment", exact: true })).toBeFocused();

	// Escape returns to Use it and hides the overlay.
	await page.keyboard.press("Escape");
	await expect(page.getByRole("button", { name: "Use it" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(
		page.getByRole("button", { name: "Point at something on the page" }),
	).not.toBeVisible();
});
