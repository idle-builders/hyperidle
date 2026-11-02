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
		.frameLocator("iframe")
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
	await expect(
		page.getByRole("paragraph").filter({ hasText: "Or only the bill date." }),
	).toBeVisible();
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

test("opening a review stops the conversation asking; Approve shows the open count and works", async ({
	page,
}) => {
	await page.goto(ROUND_2);
	const row = page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("button", { name: /^Trial-end confusion, three tickets/ });
	await expect(row.getByRole("img", { name: "Needs review" })).toHaveCount(0);
	await expect(verdict(page)).toContainText("3 open");

	await verdict(page).getByRole("button", { name: "Approve" }).click();
	await expect(verdict(page)).toHaveText("Approved · 1 open");
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

	// Click the button inside the iframe — the click reaches the page. The page runs in its own
	// process, and until HyperIdle has drawn it Chrome hands a click there to the iframe element in
	// HyperIdle instead: wait for two drawn frames, as a person would see the button before clicking it.
	const iframe = page.frameLocator('iframe[title="Live preview"]');
	await iframe.locator("#b").waitFor();
	await page.evaluate(
		() => new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn))),
	);
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
	const comment = page.getByRole("textbox", { name: "Comment", exact: true });
	await expect(comment).toBeFocused();

	// HyperIdle cannot see inside this page, so the comment is on the whole page, pinned in its corner below the bar.
	await comment.fill("Whole page note");
	await comment.press("Enter");
	const pin = page.getByRole("button", { name: "Pin 1 on the page" });
	await expect(pin).toBeVisible();
	const bar = await page.getByRole("button", { name: "Comment", exact: true }).boundingBox();
	const at = await pin.boundingBox();
	expect(at && bar && at.y > bar.y + bar.height).toBe(true);

	// Escape returns to Use it and hides the overlay.
	await page.keyboard.press("Escape");
	await expect(page.getByRole("button", { name: "Use it" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(
		page.getByRole("button", { name: "Point at something on the page" }),
	).not.toBeVisible();

	// The pointer covers only the page, so Use it stays clickable in Comment mode.
	await page.getByRole("button", { name: "Comment" }).click();
	await page.getByRole("button", { name: "Use it" }).click();
	await expect(
		page.getByRole("button", { name: "Point at something on the page" }),
	).not.toBeVisible();
});

test("a preview of a page from HyperIdle's own address runs sealed off from HyperIdle", async ({
	page,
}) => {
	await page.route("**/review-probe.html", (route) =>
		route.fulfill({
			contentType: "text/html; charset=utf-8",
			body: `<body><script>
const t = (f) => { try { f(); return "reached"; } catch { return "blocked"; } };
document.body.textContent = "parent: " + t(() => parent.document.title) + " · storage: " + t(() => localStorage.length);
</script></body>`,
		}),
	);
	await page.goto(HAND_OFF);
	const id = await page.evaluate(async () => {
		const res = await fetch("/api/actions/send_message", {
			method: "POST",
			headers: { "X-API-Key": "hyperidle-dev-local", "Content-Type": "application/json" },
			body: JSON.stringify({
				threadId: "demo-thread-trial-end",
				review: {
					title: "Probe",
					reasoning: [],
					parts: [
						{
							id: "page",
							kind: "preview",
							label: "Live preview",
							title: "Probe",
							url: `${location.origin}/review-probe.html`,
						},
					],
				},
			}),
		}).then((r) => r.json());
		return res.data.message.id as string;
	});
	await page.goto(`${HAND_OFF}?review=${id}`);
	await expect(page.frameLocator('iframe[title="Live preview"]').locator("body")).toHaveText(
		"parent: blocked · storage: blocked",
	);
});

test("a whole-page preview runs its script sealed: no way to HyperIdle, its storage or the network", async ({
	page,
}) => {
	const probe = `<p id="out">waiting</p><script>
const t = (f) => { try { f(); return "reached"; } catch { return "blocked"; } };
const said = "parent: " + t(() => parent.parent.document.title) + " · storage: " + t(() => localStorage.length);
fetch("/api/actions/open_user", { method: "POST" })
	.then(() => "network: reached", () => "network: blocked")
	.then((net) => { document.getElementById("out").textContent = said + " · " + net; });
</script>`;
	await page.goto(HAND_OFF);
	const id = await page.evaluate(async (html) => {
		const res = await fetch("/api/actions/send_message", {
			method: "POST",
			headers: { "X-API-Key": "hyperidle-dev-local", "Content-Type": "application/json" },
			body: JSON.stringify({
				threadId: "demo-thread-trial-end",
				review: {
					title: "Whole-page probe",
					reasoning: [],
					parts: [
						{
							id: "page",
							kind: "preview",
							label: "Live preview",
							title: "Probe",
							url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
						},
					],
				},
			}),
		}).then((r) => r.json());
		return res.data.message.id as string;
	}, probe);
	await page.goto(`${HAND_OFF}?review=${id}`);
	await expect(
		page.frameLocator('iframe[title="Live preview"]').frameLocator("iframe").locator("#out"),
	).toHaveText("parent: blocked · storage: blocked · network: blocked");
});
