/**
 * L18 — Document thread Playwright e2e tests.
 *
 * AC coverage:
 *  - open a document → thread renders (replacing observation log) → post → reload → persists
 *
 * @lore BC3: repointed at the thread action door — never `GET/POST
 * /api/threads*`. `document` is still a valid `HostKind`; the
 * document page resolves its thread lazily via `search_threads` (the
 * `host` prop path), unlike a task page's known `threadId`.
 */

import {
	expect,
	makeThread,
	makeThreadListRow,
	mockSearchThreads,
	mockThread,
	test,
} from "./fixtures";

const NOW = "2026-05-05T09:00:00.000Z";
const FOUNDER_ID = "u-founder";
const THREAD_ID = "t-knowledge-001";
const DOCUMENT_ID = "k3"; // known fixture id with content

test.describe("L18 — Document thread surface", () => {
	test("thread renders (replacing observation log); post; reload; persists", async ({ page }) => {
		const composedText = "Insight from reviewing this document.";

		const thread = makeThread(THREAD_ID, {
			hostKind: "document",
			hostId: DOCUMENT_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		await mockSearchThreads(page, {
			rows: [makeThreadListRow(THREAD_ID, { ...thread, hasUnresolvedReview: false })],
		});
		await mockThread(page, { thread, messages: [] });

		await page.goto(`/documents/${DOCUMENT_ID}`);

		// Document page should be visible
		await expect(page.getByTestId("document-detail-page")).toBeVisible();

		// Thread section replaces observation log
		await expect(page.getByTestId("host-thread-section")).toBeVisible();
		await expect(page.getByTestId("knowledge-observation-log")).not.toBeVisible();

		// Post a comment
		const composer = page.getByPlaceholder(/reply to thread|write a message|start a discussion/i);
		await composer.fill(composedText);
		await page.getByRole("button", { name: /^send$/i }).click();

		await expect(page.getByText(composedText)).toBeVisible();

		// Reload and verify persistence
		await page.reload();
		await expect(page.getByText(composedText)).toBeVisible();
	});
});
