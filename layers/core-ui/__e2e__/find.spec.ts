/** Find or ask on the demo world: one overlay, Tab between the two, the asked thread answering live. */
import { expect, type Page, test } from "@playwright/test";

/** Run an action as the person signed in — the only one the API key speaks for. */
function act(page: Page, name: string, body: unknown): Promise<{ data: unknown }> {
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

test("⌘K finds trial in knowledge, conversations and work, and ↵ opens the one picked", async ({
	page,
}) => {
	await page.goto("/conversations");
	await expect(page.getByRole("button", { name: /^Trial-end confusion/ })).toBeVisible();
	await page.keyboard.press("ControlOrMeta+k");
	const overlay = page.getByRole("dialog", { name: "Find or ask" });
	await overlay.getByRole("textbox", { name: "Find" }).fill("trial");

	const found = overlay.getByRole("listbox", { name: "Found" });
	for (const group of ["Knowledge", "Conversations", "Work"])
		await expect(found.getByText(group, { exact: true })).toBeVisible();
	await expect(
		found.getByRole("option", { name: /^Trial-end confusion, three tickets/ }),
	).toBeVisible();
	await expect(
		found.getByRole("option", { name: /^Trials that convert without a call/ }),
	).toBeVisible();
	// The preview marks where it matched.
	await expect(overlay.locator("mark").first()).toHaveText(/trial/i);

	// ↑↓ move the pick; a hovered row is picked too; ↵ opens the one picked.
	const options = found.getByRole("option");
	await expect(options.first()).toHaveAttribute("aria-selected", "true");
	await page.keyboard.press("ArrowDown");
	await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
	await expect(options.first()).toHaveAttribute("aria-selected", "false");
	await found.getByRole("option", { name: /^Trial-end confusion, three tickets/ }).hover();
	await page.keyboard.press("Enter");
	await expect(overlay).toHaveCount(0);
	await expect(page).toHaveURL(/\/conversations\/demo-thread-trial-end$/);
	await expect(
		page.getByRole("heading", { name: "Trial-end confusion, three tickets" }),
	).toBeVisible();

	// Esc and a click outside both close it.
	await page.getByRole("button", { name: /Find or ask/ }).click();
	await page.keyboard.press("Escape");
	await expect(overlay).toHaveCount(0);
	await page.getByRole("button", { name: /Find or ask/ }).click();
	await page.mouse.click(8, 600);
	await expect(overlay).toHaveCount(0);
});

test("Tab asks instead, keeping the text; the question becomes a thread that answers live", async ({
	page,
}) => {
	await page.goto("/conversations");
	await page.getByRole("button", { name: /Find or ask/ }).click();
	const overlay = page.getByRole("dialog", { name: "Find or ask" });
	await overlay.getByRole("textbox", { name: "Find" }).fill("trial");
	await expect(overlay.getByRole("button", { name: /Ask Builder about “trial”/ })).toBeVisible();
	await page.keyboard.press("Tab");

	const ask = overlay.getByRole("textbox", { name: "Ask" });
	await expect(ask).toHaveValue("trial");
	await expect(overlay.getByRole("combobox", { name: "Who answers" })).toHaveValue(
		"demo-agent-builder",
	);
	await ask.fill("How long do trials run?");
	await ask.press("Enter");
	await expect(overlay.getByText("Builder is answering")).toBeVisible();
	await expect(overlay.getByText("Saved as a thread in Conversations")).toBeVisible();
	const row = page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("button", { name: /^How long do trials run\?/ });
	await expect(row).toBeVisible();

	// No agent runs here; a message written into that thread shows in the overlay as it lands.
	const threads = (await act(page, "search_threads", { text: "How long do trials run?" })) as {
		data: { id: string }[];
	};
	const threadId = threads.data[0]?.id ?? "";
	await act(page, "send_message", { threadId, text: "Fourteen days, card up front." });
	await expect(overlay.getByText("Fourteen days, card up front.")).toBeVisible();

	await ask.press("ControlOrMeta+Enter");
	await expect(overlay).toHaveCount(0);
	await expect(page).toHaveURL(new RegExp(`/conversations/${threadId}$`));
	await expect(page.getByRole("heading", { name: "How long do trials run?" })).toBeVisible();
});
