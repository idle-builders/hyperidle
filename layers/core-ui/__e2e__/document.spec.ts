/** A document on the demo world: comments in the margin, a proposed change, editing, publishing, the tree. */
import { expect, type Page, test } from "@playwright/test";

const TEN_DAYS = "/knowledge/demo-doc-ten-days";
const tree = (page: Page) => page.getByRole("region", { name: "All documents" });
const text = (page: Page) => page.getByRole("region", { name: "The document's text" });

/** Select `words` in the page's text the way a person drags across them. */
async function pick(page: Page, words: string) {
	await page.waitForLoadState("networkidle");
	const box = await page.getByText(words, { exact: false }).first().boundingBox();
	if (!box) throw new Error(`"${words}" is not on the page`);
	await page.evaluate((w) => {
		const walker = document.createTreeWalker(document.querySelector(".tiptap") as Node, 4);
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			const at = n.textContent?.indexOf(w) ?? -1;
			if (at < 0) continue;
			const r = document.createRange();
			r.setStart(n, at);
			r.setEnd(n, at + w.length);
			getSelection()?.removeAllRanges();
			getSelection()?.addRange(r);
			return;
		}
	}, words);
	await page.mouse.move(box.x + 4, box.y + box.height / 2);
	await page.mouse.up();
}

test("the comments wait in the margin; one opens as a card, takes a reply, and is also in Conversations", async ({
	page,
}) => {
	await page.goto(TEN_DAYS);
	const waiting = page.getByRole("button", { name: / comments (Growth|You): / });
	await expect(waiting).toBeVisible();

	await waiting.click();
	await expect(
		page.getByText("if trials end on day 10, how many people who pay would we lose?"),
	).toBeVisible();
	await expect(page.getByText("Proposed change")).toBeVisible();
	const reply = page.getByRole("textbox", { name: "Reply…" });
	await reply.fill("Then we should know before Friday.");
	await page.getByRole("button", { name: "Reply", exact: true }).click();
	await expect(reply).toHaveValue("");
	await expect(page.getByText("Then we should know before Friday.")).toBeVisible();

	await page.getByRole("button", { name: "Also in Conversations" }).click();
	await expect(page).toHaveURL(/\/conversations\/demo-thread-ten-days$/);
	await expect(page.getByText("Then we should know before Friday.")).toBeVisible();
});

test("picked words become a comment that covers exactly them; its ends can be dragged", async ({
	page,
}) => {
	await page.goto("/knowledge/demo-doc-trials");
	await pick(page, "We do not extend trials by hand.");
	await page.getByRole("button", { name: "Comment", exact: true }).click();
	await page.getByRole("button", { name: "± Propose a change" }).click();
	await expect(page.getByText("−We do not extend trials by hand.")).toBeVisible();
	await page.getByRole("button", { name: "Remove" }).click();

	const end = page.getByRole("button", { name: "Drag to change where the comment ends" });
	const target = await page.getByText("We do not extend trials by hand.").boundingBox();
	const grip = await end.boundingBox();
	if (!(target && grip)) throw new Error("the highlight is not on the page");
	await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
	await page.mouse.down();
	await page.mouse.move(target.x + target.width * 0.3, target.y + target.height / 2, { steps: 5 });
	await page.mouse.up();
	await page.getByRole("button", { name: "± Propose a change" }).click();
	await expect(page.getByText(/^−We do not\b/)).toBeVisible();
	await expect(page.getByText("−We do not extend trials by hand.")).toHaveCount(0);
	await page.getByRole("button", { name: "Remove" }).click();

	await page
		.getByRole("textbox", { name: "Comment, or @mention someone" })
		.fill("Is this still true?");
	await page.getByRole("button", { name: "Comment", exact: true }).click();
	await expect(page.getByRole("textbox", { name: "Reply…" })).toBeVisible();
	await expect(page.getByText("Is this still true?")).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole("button", { name: /comments? You: Is this still true\?/ }),
	).toBeVisible();
});

test("applying a proposed change puts it into the text, says who, and stays after reload", async ({
	page,
}) => {
	const after =
		"Most cancellations happen on day 13, and 1 in 5 people who pay decide on days 11–14.";
	await page.goto(TEN_DAYS);
	await page.getByRole("button", { name: / comments (Growth|You): / }).click();
	await page.getByRole("button", { name: "Apply" }).click();
	await expect(page.getByText("✓ Applied by You")).toBeVisible();
	await expect(text(page).getByText(after, { exact: true })).toBeVisible();
	await page.reload();
	await expect(text(page).getByText(after, { exact: true })).toBeVisible();
});

test("writing in edit mode saves on Done; the format bar and / add a table and a checklist", async ({
	page,
}) => {
	await page.goto("/knowledge/demo-doc-clean-feature");
	await page.getByRole("button", { name: "✎ Edit" }).click();
	await expect(page.getByText("✎ Editing")).toBeVisible();
	await text(page)
		.getByText(/^A clean feature does one thing/)
		.click();
	await page.keyboard.press("End");
	await page.keyboard.type(" It has a name people use.");
	await page.keyboard.press("Enter");
	await page
		.getByRole("toolbar", { name: "Add formatting" })
		.getByRole("button", { name: "Table" })
		.click();
	await expect(page.getByRole("table")).toBeVisible();
	await page.keyboard.type("Owner");
	await page.getByRole("button", { name: "Type / for a block, @ to ask someone" }).click();
	await page.keyboard.type("/check");
	await page
		.getByRole("listbox", { name: "Add a block" })
		.getByRole("option", { name: "Checklist" })
		.click();
	await page.keyboard.type("Write the release note");
	await page.getByRole("button", { name: "Done" }).click();
	await expect(page.getByRole("button", { name: "✎ Edit" })).toBeVisible();

	await page.reload();
	await expect(page.getByText(/It has a name people use\.$/)).toBeVisible();
	await expect(page.getByRole("table").getByText("Owner")).toBeVisible();
	await expect(page.getByRole("checkbox", { name: /Write the release note/ })).toBeVisible();
});

test("@Builder in a comment hands it off: the task it takes shows in the comment and opens", async ({
	page,
}) => {
	await page.goto("/knowledge/demo-doc-tiers");
	await page.getByText(/^A usage-based tier is being built/).hover();
	await page.getByRole("button", { name: "Comment on this block" }).click();
	const box = page.getByRole("textbox", { name: "Comment, or @mention someone" });
	await box.pressSequentially("@Buil");
	await page
		.getByRole("listbox", { name: "Mention" })
		.getByRole("option", { name: /^BU Builder/ })
		.click();
	await box.pressSequentially("meter seats per team, not per person.");
	await page.getByRole("button", { name: "Comment", exact: true }).click();
	await expect(page.locator("strong", { hasText: "@Builder" })).toBeVisible();

	// No agent runs in this world; the task Builder would make from the comment is made the same way.
	const handed = await page.evaluate(async () => {
		const act = (name: string, body: unknown) =>
			fetch(`/api/actions/${name}`, {
				method: "POST",
				headers: { "X-API-Key": "hyperidle-dev-local", "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}).then((r) => r.json());
		const found = await act("search_threads", { host: { kind: "document", id: "demo-doc-tiers" } });
		const made = await act("edit_task", {
			title: "Meter seats per team",
			teamId: "demo-team-product",
			ownerAgentId: "demo-agent-builder",
			threadId: found.data[0].id,
		});
		return made.data.task.id as string;
	});
	const card = page.getByRole("button", { name: /^Task Meter seats per team Builder/ });
	await expect(card).toBeVisible();
	await card.click();
	await expect(page).toHaveURL(new RegExp(`/work/${handed}$`));
});

test("publishing tells the followers, and the tree stops saying draft", async ({ page }) => {
	await page.goto(TEN_DAYS);
	const row = tree(page).getByRole("button", { name: "Should trials be 10 days?" }).locator("..");
	await expect(row).toContainText("draft");
	await page.getByRole("button", { name: "Publish", exact: true }).click();
	await expect(page.getByText("Published · 1 follower told")).toBeVisible();
	await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
	await expect(row).not.toContainText("draft");
	await expect(page.getByRole("heading", { name: "🤔 Should trials be 10 days?" })).toBeVisible();
});

test("who a document is for is picked from the disciplines in use, and stays after reload", async ({
	page,
}) => {
	await page.goto(TEN_DAYS);
	await page.getByRole("button", { name: /^For / }).click();
	const menu = page.getByRole("menu", { name: "Who this document is for" });
	await expect(menu.getByRole("menuitem", { name: /^Everyone/ })).toBeVisible();
	await menu.getByRole("menuitem", { name: /^Engineering/ }).click();
	await expect(page.getByRole("button", { name: "For Engineering" })).toBeVisible();
	await page.reload();
	await expect(page.getByRole("button", { name: "For Engineering" })).toBeVisible();
});

test("+ on a space makes an untitled draft there, open in edit mode at its own address", async ({
	page,
}) => {
	await page.goto(TEN_DAYS);
	await tree(page).getByRole("button", { name: "New document in Product" }).click();
	await expect(page).toHaveURL(/\/knowledge\/[0-9a-f-]{36}$/);
	await expect(page.getByText("✎ Editing")).toBeVisible();
	await expect(page.getByText("Draft", { exact: true })).toBeVisible();
	const title = page.getByRole("textbox", { name: "Title" });
	await expect(title).toBeFocused();
	await expect(title).toHaveAttribute("placeholder", "Untitled");
	await expect(tree(page).getByRole("button", { name: "Untitled", exact: true })).toBeVisible();
});

test("a document's icon is changed from the tree and shows before its title", async ({ page }) => {
	await page.goto("/knowledge/demo-doc-july-themes");
	const row = tree(page).getByRole("button", { name: "July support themes" }).locator("..");
	await row.getByRole("button", { name: "Change icon" }).click();
	await page
		.getByRole("dialog", { name: "Pick an icon" })
		.getByRole("button", { name: "📣" })
		.click();
	await expect(row).toContainText("📣");
	await page.reload();
	await expect(page.getByRole("heading", { name: "📣 July support themes" })).toBeVisible();
});
