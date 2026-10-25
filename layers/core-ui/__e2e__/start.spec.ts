/** First start on a fresh install: the programs found here, your names, and your first conversation. */
import { expect, type Page, test } from "@playwright/test";

function act(page: Page, name: string, body: unknown): Promise<unknown> {
	return page.evaluate(
		async ([n, b]) =>
			fetch(`/api/actions/${n}`, {
				method: "POST",
				headers: { "X-API-Key": "hyperidle-dev-local", "Content-Type": "application/json" },
				body: JSON.stringify(b),
			}).then((r) => r.json()),
		[name, body] as const,
	);
}

test("a fresh install starts at first start, and Start talking lands in the first conversation", async ({
	page,
}) => {
	await page.goto("/conversations");
	await expect(page).toHaveURL(/\/start$/);
	const found = page.getByRole("region", { name: "Found on this computer" });
	await expect(found.getByText("Claude Code")).toBeVisible();
	await expect(found.getByText("signed in").first()).toBeVisible();

	await page.getByRole("button", { name: "Join a team on a server instead" }).click();
	await expect(page.getByText(/Joining happens in the HyperIdle desktop app/)).toBeVisible();
	await page.getByRole("button", { name: "Start a new team on this computer instead" }).click();

	await page.getByRole("textbox", { name: "Your name" }).fill("Ada Lovelace");
	await page.getByRole("textbox", { name: "Team name" }).fill("Product");
	await page.getByRole("button", { name: "Start talking" }).click();

	await expect(page).toHaveURL(/\/conversations\/[^/?]+\?first=1$/);
	await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();
	const thread = page.getByRole("log", { name: "Messages" });
	await expect(thread.getByText("Builder", { exact: true })).toBeVisible();
	await expect(thread.getByText(/^Hi\. I run on .+ on this computer/)).toBeVisible();

	// Without a reload, the new conversation stays live: the first start made you, and the page now
	// listens as you, so a message written elsewhere lands here as it is written.
	const threadId = new URL(page.url()).pathname.split("/").pop() ?? "";
	await act(page, "send_message", { threadId, text: "Written from elsewhere." });
	await expect(thread.getByText("Written from elsewhere.")).toBeVisible();
	// The offer stays under Builder's hello, above what is said after it.
	const offerFirst = await thread
		.getByRole("button", { name: "Connect a folder" })
		.evaluate(
			(offer, later) =>
				Boolean(offer.compareDocumentPosition(later as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
			await thread.getByText("Written from elsewhere.").elementHandle(),
		);
	expect(offerFirst).toBe(true);

	// "Not now" puts the offer away; "Connect a folder" opens the folder dialog on your page.
	const first = page.url();
	await thread.getByRole("button", { name: "Not now" }).click();
	await expect(thread.getByRole("button", { name: "Connect a folder" })).toHaveCount(0);
	await page.goto(first);
	await thread.getByRole("button", { name: "Connect a folder" }).click();
	await expect(page).toHaveURL(/\/people\/me/);
	await expect(page.getByRole("dialog", { name: "Where you and your agents work" })).toBeVisible();

	// Started once: first start sends you on.
	await page.goto("/start");
	await expect(page).toHaveURL(/\/conversations$/);
});
