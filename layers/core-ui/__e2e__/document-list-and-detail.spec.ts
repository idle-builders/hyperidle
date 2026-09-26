/**
 * Journeys: opening a document from the list, filtering by scope pill,
 * editing a document's body, changing its scope, and commenting on it from
 * the detail page.
 *
 * @lore BC3: `POST /api/actions/{search_threads,open_thread,send_message,
 * adjust_thread}` replaces `GET/POST /api/threads*`. Several seed helpers
 * below register `open_thread` for more than one thread id — since every
 * thread now shares the SAME url (`/api/actions/open_thread`), a single
 * dispatcher keyed by the posted `id` replaces the old per-id URL routes.
 */

import type { Thread, ThreadListRow, ThreadView } from "@hyperidle/domain-model";
import type { Page } from "@playwright/test";
import {
	expect,
	makeDocumentRow,
	makeMessage,
	makeThread,
	makeThreadListRow,
	makeUserRow,
	mockDocument,
	mockSearchDocuments,
	mockSearchThreads,
	mockUser,
	test,
} from "./fixtures";

async function mockOpenThreadDispatch(
	page: Page,
	threadsById: Record<string, ThreadView>,
): Promise<void> {
	await page.route("**/api/actions/open_thread", async (route) => {
		const input = JSON.parse(route.request().postData() ?? "{}") as { id?: string };
		const view = input.id ? threadsById[input.id] : undefined;
		if (!view) {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: false,
					problems: [{ code: "not_found", message: "Thread not found", path: "id" }],
				}),
			});
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: view }),
		});
	});
}

function toThreadView(thread: Thread, messages: ThreadView["messages"] = []): ThreadView {
	return { thread, members: [], messages, headMessageId: null, hostTitle: null };
}

function toRow(thread: Thread, hasUnresolvedReview = false): ThreadListRow {
	return makeThreadListRow(thread.id, { ...thread, hasUnresolvedReview });
}

const NOW = "2026-06-01T10:00:00.000Z";
const LATER = "2026-06-01T10:05:00.000Z";

// @lore BC3: no `task` host kind — a task's own thread is `team`-hosted.
const THREAD_1 = makeThread("thread-r9-1", {
	hostKind: "user",
	hostId: "test-founder",
	initiatorId: "test-founder",
	members: ["test-founder"],
	computedTitle: "User thread thread-r9-1",
	lastActiveAt: NOW,
	createdAt: NOW,
});

const THREAD_REVIEW = makeThread("thread-r9-review", {
	hostKind: "team",
	hostId: "task-r9-1",
	initiatorId: "a-aria",
	members: ["a-aria", "test-founder"].sort(),
	lastActiveAt: NOW,
	createdAt: NOW,
});

const THREAD_TASK = makeThread("thread-r9-task", {
	hostKind: "team",
	hostId: "task-r9-1",
	initiatorId: "test-founder",
	members: ["test-founder"],
	lastActiveAt: NOW,
	createdAt: NOW,
});

const REVIEW_MESSAGE = {
	id: "msg-r9-review-1",
	threadId: "thread-r9-review",
	senderId: "a-aria",
	clientKey: "ck-r9-review-001",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: NOW,
	type: "review",
	payload: {
		title: "Approve auth migration approach",
		reasoning: ["Security posture improves.", "JWT lifecycle is correct."],
		// @lore R9: ReviewPayload.artifactRef is required (non-optional) and ThreadShell
		// calls resolveArtifactSlot(payload.artifactRef) without null-guarding. Provide a
		// valid ref with kind="text_diff" so the ArtifactView renders without crashing.
		artifactRef: { id: "art-r9-1", kind: "text_diff" },
	},
};

const PLAIN_MESSAGE_1 = {
	id: "msg-r9-plain-1",
	threadId: "thread-r9-1",
	senderId: "test-founder",
	clientKey: "ck-r9-plain-001",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: NOW,
	type: "plain",
	payload: { text: "This is the first message." },
};

const DOCUMENT_1 = makeDocumentRow("ki-r9-1", {
	title: "JWT Best Practices",
	body: "# JWT\n\nUse short-lived tokens.\n",
	status: "active",
	updatedBy: "test-founder",
	scopeKind: "factory",
	createdAt: NOW,
	updatedAt: NOW,
});

const DOCUMENT_2 = makeDocumentRow("ki-r9-2", {
	title: "Rate Limiting Strategy",
	body: "# Rate Limiting\n\nUse token buckets.\n",
	status: "proposed",
	updatedBy: "test-founder",
	scopeKind: "factory",
	createdAt: NOW,
	updatedAt: NOW,
});

const DOCUMENT_3 = makeDocumentRow("ki-r9-3", {
	title: "Testing Philosophy",
	body: "# Testing\n\nWrite tests first.\n",
	status: "proposed",
	updatedBy: "test-founder",
	scopeKind: "user",
	scopeId: "test-founder",
	createdAt: NOW,
	updatedAt: NOW,
});

/**
 * seedActiveWork: 3 threads (1 blocking with review message).
 */
async function seedActiveWork(page: Page): Promise<void> {
	await mockSearchThreads(page, {
		rows: [toRow(THREAD_REVIEW, true), toRow(THREAD_TASK), toRow(THREAD_1)],
	});

	await mockOpenThreadDispatch(page, {
		[THREAD_REVIEW.id]: {
			...toThreadView(THREAD_REVIEW, [REVIEW_MESSAGE]),
			headMessageId: REVIEW_MESSAGE.id,
		},
		[THREAD_TASK.id]: toThreadView(THREAD_TASK, [
			{
				id: "msg-r9-task-1",
				threadId: THREAD_TASK.id,
				senderId: "test-founder",
				clientKey: "ck-r9-task-001",
				blockId: null,
				deletedAt: null,
				redactedAt: null,
				resolvedAt: null,
				createdAt: NOW,
				type: "plain",
				payload: { text: "Let us discuss the task." },
			},
		]),
		[THREAD_1.id]: toThreadView(THREAD_1, [PLAIN_MESSAGE_1]),
	});
}

/**
 * seedDocumentsActive: extends seedActiveWork + 5 documents (3 draft, 2 active).
 */
async function seedDocumentsActive(page: Page): Promise<void> {
	await seedActiveWork(page);

	const documentItems = [
		DOCUMENT_1,
		DOCUMENT_2,
		DOCUMENT_3,
		makeDocumentRow("ki-r9-4", {
			...DOCUMENT_1,
			id: "ki-r9-4",
			title: "Error Handling Patterns",
			status: "proposed",
		}),
		makeDocumentRow("ki-r9-5", {
			...DOCUMENT_1,
			id: "ki-r9-5",
			title: "Observability Setup",
			status: "active",
		}),
	];

	await mockSearchDocuments(page, { rows: documentItems });
	await mockDocument(page, { row: DOCUMENT_1 });
}

test.describe("R9 — Document list page", () => {
	test.beforeEach(async ({ page }) => {
		await seedDocumentsActive(page);
	});

	// document-open-item: Click a document row → URL matches /documents/:id
	// @lore R9: The document list defaults to the "Triage" tab when proposed items exist.
	// DOCUMENT_1 has status "active" so it appears in the Curated tab.
	// Switch to the Curated tab first before looking for the item.
	test("document-open-item: clicking a document row navigates to detail page", async ({ page }) => {
		await page.goto("/documents");
		await page.waitForSelector("[data-testid='document-list-page']");

		// @lore R9: Document view tabs (Triage/Curated) use role="tab", not role="button".
		const curatedTab = page.getByRole("tab", { name: /curated/i });
		if (await curatedTab.isVisible()) {
			await curatedTab.click();
		}

		// Scoped to the curated tree list: the sidebar's own document fast-nav
		// (AppShell/Sidebar) also renders every title, so an unscoped
		// getByText resolves to both and is ambiguous.
		await page.getByTestId("document-tree-list").getByText("JWT Best Practices").click();

		await expect(page).toHaveURL(new RegExp(`/documents/${DOCUMENT_1.id}`), {
			timeout: 5_000,
		});
	});

	// document-filter-scope: Click scope pill → filter applied
	test("document-filter-scope: clicking scope pill activates the filter", async ({ page }) => {
		await page.goto("/documents");
		await page.waitForSelector("[data-testid='document-list-page']");

		// @lore AE1/AD6: Pills are the static All/Shared/Team/Private set (a
		// `role="radiogroup"` of `role="radio"` pills, `data-testid="scope-pill-<id>"`,
		// active state via `data-active`, not a DaisyUI `.btn-primary` toggle).
		const scopePills = page.getByTestId("document-scope-pills");
		const sharedPill = scopePills.getByTestId("scope-pill-shared");

		await sharedPill.click();
		await expect(sharedPill).toHaveAttribute("data-active", "true", { timeout: 3_000 });
	});
});

// ---------------------------------------------------------------------------
// Document Detail (2 tests) — seedDocumentsActive
//
// @lore BC4: `knowledge-scope`'s free `<select>` + PATCH-to-`/scope` scenario
// is rewritten (not just re-pointed) against the real `ScopeChangeDialog` — a
// `ScopePicker` pill control plus a labeled "Scope ID" input, saved through
// `call("edit_document", …)` — mirroring `document-q2-create.spec.ts`'s
// AC-12. `knowledge-edit`'s PATCH interception moves to `edit_document` via
// `mockDocument`.
// ---------------------------------------------------------------------------

test.describe("R9 — Document detail page", () => {
	test.beforeEach(async ({ page }) => {
		await seedDocumentsActive(page);
	});

	// document-edit: Click Edit → type in BodyEditor → edit_document intercepted
	//
	// @lore R9: Same React 18 StrictMode fix applies here: useAutoSave now resets
	// unmountedRef.current=false in setup, and useBodyEditor uses onChangeRef to
	// avoid stale closures. Both fixes allow the debounced save to fire.
	test("document-edit: editing a document fires edit_document", async ({ page }) => {
		// @lore R9: DocumentDetail hides the Edit button for factory-scoped items
		// (isFactory = true → button not rendered). Use a team-scoped item so the
		// Edit button is visible. edit_document is intercepted at the network level.
		const editableItem = makeDocumentRow(DOCUMENT_1.id, {
			...DOCUMENT_1,
			scopeKind: "team",
		});

		// @lore R9: Intercept the thread action doors to prevent 500 errors —
		// this test doesn't exercise HostThreadSection, so an empty host-thread
		// search and a not-found open are enough (overrides seedDocumentsActive
		// via LIFO).
		await page.route("**/api/actions/search_threads", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: [] }),
			});
		});
		await page.route("**/api/actions/open_thread", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: false,
					problems: [{ code: "not_found", message: "Thread not found", path: "id" }],
				}),
			});
		});

		await mockDocument(page, { row: editableItem });

		await page.goto(`/documents/${editableItem.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		// Click Edit button
		const editBtn = page.getByRole("button", { name: /edit/i });
		await expect(editBtn).toBeVisible();
		await editBtn.click();

		// BodyEditor edit panel must appear
		const editPanel = page.getByTestId("document-edit-panel");
		await expect(editPanel).toBeVisible({ timeout: 5_000 });

		// @lore R9: Use pressSequentially() on [contenteditable="true"] for TipTap.
		// Start waitForRequest() BEFORE typing so the debounced save is captured.
		const contentEditable = editPanel.locator('[contenteditable="true"]').first();
		await contentEditable.click();

		// Start listening for the save BEFORE typing (debounce 1500ms, budget 10s)
		const savePromise = page.waitForRequest(
			(req) => req.url().includes("/api/actions/edit_document") && req.method() === "POST",
			{ timeout: 10_000 },
		);

		await contentEditable.pressSequentially("Updated");

		// Wait for the debounced save to arrive
		await savePromise;

		// Click Done to exit edit mode
		await page.getByRole("button", { name: /done/i }).click();
		await expect(editPanel).not.toBeVisible({ timeout: 3_000 });
	});

	// document-scope: overflow menu → Change scope → pick a pill → Save → edit_document intercepted
	test("document-scope: changing scope fires edit_document", async ({ page }) => {
		// ScopeChangeDialog disables the "Team" pill unless the current user has
		// a teamId (`hasTeam = user?.teamId !== undefined`) — override open_user
		// so this test can exercise the Team pill + Scope ID input.
		await mockUser(page, {
			row: makeUserRow("test-founder", {
				name: "Test Founder",
				role: "founder",
				team: { id: "test-team-1", name: "Test Team" },
			}),
			self: true,
		});

		let scopeChangeCalled = false;
		await page.route("**/api/actions/edit_document", async (route) => {
			const input = JSON.parse(route.request().postData() ?? "{}") as {
				id?: string;
				scopeKind?: string;
			};
			if (input.id !== DOCUMENT_1.id || input.scopeKind === undefined) {
				await route.fallback();
				return;
			}
			scopeChangeCalled = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						document: {
							...DOCUMENT_1,
							scopeKind: "team",
							scopeId: "team-alpha",
							version: DOCUMENT_1.version + 1,
						},
						ancestors: [],
						children: [],
						siblings: [],
						scopeName: "Alpha",
					},
				}),
			});
		});

		await page.goto(`/documents/${DOCUMENT_1.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		// Overflow menu → "Change scope"
		await page.getByRole("button", { name: /more options/i }).click();
		const changeScopeItem = page.getByTestId("document-change-scope");
		await expect(changeScopeItem).toBeVisible();
		await changeScopeItem.click();

		// Dialog opens with the real ScopePicker (pill buttons), not a <select>
		const dialog = page.getByRole("dialog", { name: "Change scope" });
		await expect(dialog).toBeVisible();

		// "Team" is the only scope kind requiring a Scope ID
		// (SCOPES_REQUIRING_ID = {"team"}) — matches document-q2-create.spec.ts's
		// AC-12 pattern.
		await dialog.getByTestId("scope-pill-change-team").click();
		await dialog.getByLabel("Scope ID").fill("team-alpha");

		await dialog.getByRole("button", { name: "Save" }).click();

		await expect.poll(() => scopeChangeCalled, { timeout: 5_000 }).toBe(true);
	});

	// document-comment-block: composer is visible; POST message works
	test("document-comment-block: host thread composer is visible and POST works", async ({
		page,
	}) => {
		let postCalled = false;

		// @lore BC3: HostThreadSection's `host` path calls `search_threads({host,
		// mine:false})` and adopts the FIRST returned row. seedActiveWork
		// registered search_threads returning [THREAD_REVIEW, THREAD_TASK,
		// THREAD_1] (a dumb stub, ignoring the filter) — this override (LIFO)
		// returns only THREAD_1 for the document host, or the message would be
		// posted to the wrong thread.
		await mockSearchThreads(page, {
			rows: [makeThreadListRow(THREAD_1.id, { ...THREAD_1, hasUnresolvedReview: false })],
		});

		await page.route("**/api/actions/send_message", async (route) => {
			const input = JSON.parse(route.request().postData() ?? "{}") as { threadId?: string };
			if (input.threadId !== THREAD_1.id) {
				await route.fallback();
				return;
			}
			postCalled = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						message: makeMessage("msg-r9-document", THREAD_1.id, {
							senderId: "test-founder",
							clientKey: "ck-r9-document",
							payload: { text: "Document comment" },
							createdAt: LATER,
						}),
						thread: THREAD_1,
					},
				}),
			});
		});

		await page.goto(`/documents/${DOCUMENT_1.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		// @lore R9: Composer's real default placeholder is "Reply to thread…"
		// (ds/Composer.tsx) — HostThreadSection passes no override. This regex
		// matches the same pattern already used for the Conversations thread
		// page test above.
		const composer = page.getByPlaceholder(/reply to thread|write a message/i).first();
		await expect(composer).toBeVisible({ timeout: 5_000 });

		await composer.fill("Document comment");
		await page.getByRole("button", { name: /^send$/i }).click();

		await expect.poll(() => postCalled, { timeout: 5_000 }).toBe(true);
	});
});
