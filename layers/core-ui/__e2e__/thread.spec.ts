/** A conversation on the demo world: the hand-off, answering a question, writing, and starting one. */
import { expect, test } from "@playwright/test";

test("the hand-off opens at its newest message, with its reviews and the work item that opens its task", async ({
	page,
}) => {
	await page.goto("/conversations/demo-thread-trial-end");
	await expect(
		page.getByRole("heading", { name: "Trial-end confusion, three tickets" }),
	).toBeVisible();
	await expect(page.getByText(/^Moved the warning into the email, as you asked/)).toBeInViewport();
	await expect(page.getByText("Maya Chen · told")).toBeVisible();

	const yours = page.getByRole("button", { name: "Look at it" }).last();
	await yours.click();
	await expect(page).toHaveURL(
		/\/conversations\/demo-thread-trial-end\?review=demo-msg-explainer-review-2$/,
	);
	await page.goBack();

	const strip = page.getByRole("button", { name: /^Explain what happens when a trial ends/ });
	await expect(strip).toContainText("Builder owns this");
	await expect(strip).toContainText("Needs review · 2 reviews");
	await strip.click();
	await expect(page).toHaveURL(/\/work\/demo-task-explain-trial-end$/);
});

test("picking an option answers Maya's question in place, and the thread stops asking", async ({
	page,
}) => {
	await page.goto("/conversations/demo-thread-rollout-rule");
	const row = page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("button", { name: /^Rollout rule, written down/ });
	await expect(row).toContainText("Needs input");

	const own = page.getByRole("button", { name: /^I will own it/ });
	await own.click();
	await expect(own).toHaveAttribute("aria-pressed", "true");
	await expect(own).toContainText("chosen by you");
	await expect(own).toBeDisabled();
	await expect(page.getByText("You went with I will own it")).toBeVisible();
	await expect(row).not.toContainText("Needs input");
});

test("a message is written with the mention picker and appears once sent", async ({ page }) => {
	await page.goto("/conversations/demo-thread-rollout-rule");
	const box = page.getByRole("textbox", { name: "Reply" });
	const picker = page.getByRole("listbox", { name: "Hand to" });

	await box.click();
	await box.pressSequentially("Thanks @");
	await expect(picker).toBeVisible();
	await box.press("Escape");
	await expect(picker).toBeHidden();
	await box.pressSequentially("Ma");
	await expect(picker).toBeHidden();

	await box.press("Backspace");
	await box.press("Backspace");
	await box.press("Backspace");
	await box.pressSequentially("@Ma");
	await expect(picker).toBeVisible();
	await expect(
		picker.getByRole("option", { name: /^MC Maya Chen Person · Support/ }),
	).toBeVisible();
	await box.press("Enter");
	await expect(box).toHaveValue("Thanks @Maya Chen ");
	await box.pressSequentially("I will read it today.");
	await box.press("Enter");

	await expect(box).toHaveValue("");
	const thread = page.getByRole("log", { name: "Messages" });
	await expect(thread.getByText("I will read it today.")).toBeInViewport();
	await expect(thread.locator("strong", { hasText: "@Maya Chen" })).toBeVisible();
});

test("a new conversation starts with the picker, and its first message makes it a thread", async ({
	page,
}) => {
	await page.goto("/conversations/demo-thread-rollout-rule");
	await page.getByRole("button", { name: "New conversation" }).click();
	await expect(page).toHaveURL(/\/conversations\/new$/);
	await expect(page.getByRole("listbox", { name: "Bring in" })).toBeVisible();

	const box = page.getByRole("textbox", { name: "Message" });
	await box.pressSequentially("Can we answer refund questions from the help centre? @Ma");
	await box.press("Enter");
	await box.press("Enter");

	const title = "Can we answer refund questions from the help centre?";
	await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/);
	await expect(page.getByRole("heading", { name: title })).toBeVisible();
	await expect(
		page.getByRole("navigation", { name: "Sidebar" }).getByRole("button", { name: title }),
	).toBeVisible();
});
