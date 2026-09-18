/**
 * Shared Playwright test fixtures for HyperIdle e2e tests.
 *
 * @lore M3: M3 wired real API calls for /api/auth/me, /api/settings,
 * /api/actions/search_threads, and /api/teams. Every page load now makes
 * these requests. In CI there is no backend server — only Vite serves the
 * SPA bundle. Without mocks every test would get ECONNREFUSED on the
 * proxied /api/* calls.
 *
 * @lore BC3: the thread door is `POST /api/actions/{search_threads,
 * open_thread, send_message, adjust_thread}` — `{ok:true,data}` or
 * `{ok:false,problems}` — never `GET/POST /api/threads*`. Mock the action,
 * not the deleted REST route.
 *
 * @lore AD8a: /api/rail mock removed — the Rail API was deleted in U6 and the
 * route has been purged from the server. See packages/server/src/app.ts.
 *
 * This file extends Playwright's `test` with an auto-use fixture that intercepts
 * the core M3 endpoints before every test. Individual tests can register
 * their own page.route() calls to override specific endpoints — Playwright's LIFO
 * route matching means the last-registered handler wins for the same pattern.
 *
 * Usage:
 *   import { expect, test } from "./fixtures";
 *   // or for re-exports:
 *   export { expect } from "./fixtures";
 *
 * All spec files import from "./fixtures" instead of "@playwright/test".
 */

import type {
	Identity,
	Message,
	Task,
	TaskCardSummary,
	TaskNode,
	TaskView,
	TeamDetail,
	Thread,
	ThreadListRow,
	ThreadView,
} from "@hyperidle/domain-model";
import { test as base, expect } from "@playwright/test";

/** Default mock response for GET /api/auth/me */
const DEFAULT_AUTH_ME = {
	id: "test-founder",
	name: "Test Founder",
	email: "test@hyperidle.dev",
	role: "founder",
	avatarUrl: null,
};

/** Default mock response for GET /api/settings */
const DEFAULT_SETTINGS = {
	profile: { name: "Test Founder", email: "test@hyperidle.dev", avatarUrl: null },
	teams: [],
	users: [],
	notifications: {
		reviewAlerts: true,
		blockerAlerts: true,
		quietHoursEnabled: false,
		quietHoursStart: "22:00",
		quietHoursEnd: "08:00",
		mutedTeams: [],
	},
};

/** Default mock response for POST /api/actions/search_threads */
const DEFAULT_THREADS: never[] = [];

/** Default mock response for GET /api/teams */
const DEFAULT_TEAMS = {
	teams: [
		{
			id: "test-team-1",
			name: "Test Team",
			phase: "build",
			active: true,
		},
	],
};

type CoreApiFixtures = {
	/** Auto-use fixture: registers default M3 API mocks before every test. */
	_coreApiMocks: undefined;
};

/**
 * Extended test with auto-use core API mocks.
 *
 * Registers low-priority fallback handlers for the core M3 endpoints.
 * Individual tests may register their own page.route() calls — Playwright's
 * LIFO matching ensures test-specific routes win over these defaults.
 */
export const test = base.extend<CoreApiFixtures>({
	_coreApiMocks: [
		async ({ page }, use) => {
			// Register default handlers before the test body runs.
			// These are fallbacks — test-specific route registrations take precedence
			// because Playwright matches routes LIFO (last registered first matched).

			// GET /api/auth/me — identity for useCurrentUser hook
			await page.route("**/api/auth/me", async (route) => {
				if (route.request().method() === "GET") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(DEFAULT_AUTH_ME),
					});
				} else {
					await route.continue();
				}
			});

			// GET /api/settings — app-wide settings for useSettings hook
			await page.route("**/api/settings", async (route) => {
				const method = route.request().method();
				if (method === "GET") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(DEFAULT_SETTINGS),
					});
				} else if (method === "PATCH") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(DEFAULT_SETTINGS),
					});
				} else {
					await route.continue();
				}
			});

			// POST /api/actions/search_threads — thread list for the conversations
			// page and every host-thread resolution (BC3: replaces GET /api/threads).
			await page.route("**/api/actions/search_threads", async (route) => {
				if (route.request().method() !== "POST") {
					await route.continue();
					return;
				}
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ ok: true, data: DEFAULT_THREADS }),
				});
			});

			// GET /api/teams — team list for work portfolio
			await page.route("**/api/teams", async (route) => {
				if (route.request().method() === "GET") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(DEFAULT_TEAMS),
					});
				} else {
					await route.continue();
				}
			});

			// POST /api/actions/open_task — WorkTaskPage's only data source.
			//
			// @lore BB1: a fallback, exactly like the /api/teams one above. Many
			// specs open a task page purely as a vehicle (layout, scroll, nav,
			// dialogs) and do not care what the task says. Without a default they
			// would each need their own mock, and a spec that forgot one would hang
			// on the loading state rather than fail with something readable.
			// A spec that DOES care calls mockTaskTree(), which wins on LIFO.
			await page.route("**/api/actions/open_task", async (route) => {
				if (route.request().method() !== "POST") {
					await route.continue();
					return;
				}
				const input = JSON.parse(route.request().postData() ?? "{}") as { id?: string };
				const id = input.id ?? "task-default";
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						ok: true,
						data: {
							task: makeTask(id),
							ancestors: [],
							children: [],
							tokensActualRollup: null,
							threadId: null,
							attachments: [],
						},
					}),
				});
			});

			// Run the test.
			await use();
		},
		{ auto: true },
	],
});

export { expect };

/**
 * Register core API mocks on a manually-created page (browser.newContext/newPage).
 * The auto-use fixture only covers the default `page` — tests that create their
 * own contexts must call this to get the same /api/* fallbacks.
 */
export async function registerCoreMocks(page: import("@playwright/test").Page): Promise<void> {
	await page.route("**/api/auth/me", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(DEFAULT_AUTH_ME),
			});
		} else {
			await route.continue();
		}
	});
	await page.route("**/api/settings", async (route) => {
		const m = route.request().method();
		if (m === "GET" || m === "PATCH") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(DEFAULT_SETTINGS),
			});
		} else {
			await route.continue();
		}
	});
	await page.route("**/api/actions/search_threads", async (route) => {
		if (route.request().method() !== "POST") {
			await route.continue();
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: DEFAULT_THREADS }),
		});
	});
	await page.route("**/api/teams", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(DEFAULT_TEAMS),
			});
		} else {
			await route.continue();
		}
	});
}

// ---------------------------------------------------------------------------
// BB1 task fixtures
//
// @lore BB1: bets and tasks became ONE recursive task, and `/work/bet/:id` +
// `GET /api/bets/:id` were deleted. Every spec that drove a bet had hand-rolled
// its own bet-shaped JSON, so the merge left ~35 files mocking an endpoint the
// app no longer calls — they hung waiting for a page that never rendered.
//
// These helpers exist so the shape lives in ONE place. A spec says what it
// cares about (state, title, children) and inherits a complete, valid task for
// everything else. `TaskTreeResponse` is deliberately imported from the real
// production type: if the contract moves again, these fixtures stop compiling
// instead of silently mocking a shape the page cannot read.
// ---------------------------------------------------------------------------

/**
 * A complete task row. Pass only the fields the assertion depends on.
 * `title` defaults to something identifiable so a failure names the fixture.
 */
export function makeTask(id: string, overrides: Partial<Task> = {}): Task {
	return {
		id,
		parentTaskId: null,
		teamId: "test-team-1",
		ownerAgentId: null,
		title: `Task ${id}`,
		description: null,
		doneCondition: null,
		state: "in_progress",
		position: 0,
		needsReview: false,
		dependencies: null,
		threadId: null,
		notes: null,
		outcomeVerdict: null,
		outcomeSummary: null,
		outcomeRecordedAt: null,
		outcomeRecordedBy: null,
		tokensActualJson: null,
		sourceKnowledgeItemId: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		completedAt: null,
		...overrides,
	};
}

/** A task plus its nested children — the shape `children[]` holds in a tree response. */
export function makeTaskNode(
	id: string,
	overrides: Partial<Task> = {},
	children: TaskNode[] = [],
): TaskNode {
	return { ...makeTask(id, overrides), children };
}

export interface MockTaskTreeOptions {
	/** The task the page is opened on. */
	readonly task: Task;
	/** Root-first ancestors, for the breadcrumb. Defaults to none (a root task). */
	readonly ancestors?: readonly Task[];
	/** Nested subtree. Defaults to no children. */
	readonly children?: readonly TaskNode[];
	readonly tokensActualRollup?: number | null;
	/**
	 * When set, `edit_task` replies with this HTTP status instead of 200. Use
	 * it to drive the save-error path.
	 */
	readonly patchStatus?: number;
}

/**
 * Mock `open_task` (what WorkTaskPage loads) and `edit_task` (what its edit
 * panel writes) — both `POST /api/actions/<name>`. `edit_task` echoes the
 * merged task back as an `ActionResult<TaskView>`, so a spec can assert the
 * page re-renders from the response.
 *
 * Registered per-test, so it wins over the auto-use fallbacks (Playwright
 * matches routes LIFO).
 */
export async function mockTaskTree(
	page: import("@playwright/test").Page,
	opts: MockTaskTreeOptions,
): Promise<void> {
	const body: TaskView = {
		task: opts.task,
		ancestors: [...(opts.ancestors ?? [])],
		children: [...(opts.children ?? [])],
		tokensActualRollup: opts.tokensActualRollup ?? null,
		threadId: null,
		attachments: [],
	};

	await page.route("**/api/actions/open_task", async (route) => {
		const input = JSON.parse(route.request().postData() ?? "{}") as { id?: string };
		if (input.id !== opts.task.id) {
			// @lore route.continue() sends straight to the network, skipping every
			// OTHER registered handler for this same glob — wrong here, since a
			// spec that calls mockTaskTree() more than once (one task's action
			// door is the same URL for every task, unlike the old per-id
			// `/api/tasks/:id/tree` path) needs this non-matching call to fall
			// through to the NEXT-registered mockTaskTree handler, not the network.
			await route.fallback();
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: body }),
		});
	});

	await page.route("**/api/actions/edit_task", async (route) => {
		const patch = JSON.parse(route.request().postData() ?? "{}") as Partial<Task> & { id?: string };
		if (patch.id !== opts.task.id) {
			// @lore see the open_task handler above — fallback(), not continue(),
			// so a second mockTaskTree() call's handler gets a turn.
			await route.fallback();
			return;
		}
		const status = opts.patchStatus ?? 200;
		if (status !== 200) {
			await route.fulfill({
				status,
				contentType: "application/json",
				body: JSON.stringify({
					ok: false,
					problems: [{ code: "validation_error", message: "Edit rejected" }],
				}),
			});
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: { ...body, task: { ...opts.task, ...patch } } }),
		});
	});
}

/**
 * One row of a team's "Active tasks" list.
 *
 * @lore BB1: was `BetCardSummary` under `activeBets`. Specs that still mock
 * `activeBets` render an EMPTY task list, because the key the page reads
 * (`tasksInProgress`) is simply absent — a silent empty state, not an error.
 */
export function makeTaskCardSummary(
	id: string,
	overrides: Partial<TaskCardSummary> = {},
): TaskCardSummary {
	return {
		id,
		title: `Task ${id}`,
		state: "in_progress",
		progressDone: 0,
		progressTotal: 0,
		...overrides,
	};
}

export interface MockTeamDetailOptions {
	readonly teamId: string;
	readonly name?: string;
	readonly capacity?: number;
	readonly tasksInProgress?: readonly TaskCardSummary[];
	readonly routines?: TeamDetail["routines"];
	readonly roster?: TeamDetail["roster"];
}

/** Mock `GET /api/teams/:id` — the team detail page's only data source. */
export async function mockTeamDetail(
	page: import("@playwright/test").Page,
	opts: MockTeamDetailOptions,
): Promise<void> {
	const body: TeamDetail = {
		team: {
			id: opts.teamId,
			name: opts.name ?? "Test Team",
			phase: "build",
			status: "healthy",
			leadAgentId: null,
		},
		teamMembers: { id: opts.teamId, formedAt: "2026-01-01T00:00:00.000Z", dissolvedAt: null },
		roster: [...(opts.roster ?? [])],
		burn: { capacity: opts.capacity ?? 3 },
		tasksInProgress: [...(opts.tasksInProgress ?? [])],
		routines: [...(opts.routines ?? [])],
	};
	await page.route(`**/api/teams/${opts.teamId}`, async (route) => {
		if (route.request().method() !== "GET") {
			await route.continue();
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(body),
		});
	});
}

// ---------------------------------------------------------------------------
// BC3 thread fixtures
//
// @lore BC3: the only thread surface is `POST /api/actions/{search_threads,
// open_thread, send_message, adjust_thread}` — `{ok:true,data}` or
// `{ok:false,problems}`. `GET/POST /api/threads*` and `/api/conversations*`
// are deleted. These helpers build the row shapes (`Thread`, `ThreadView`,
// `Identity`, `Message`) and register per-test mocks, the same pattern as
// the BB1 task fixtures above. `Thread.members` replaced the old
// `participants` column name; there is no `task` host kind — a task's own
// thread is `team`-hosted and the task page already knows its id via
// `open_task(id).threadId` (HostThreadSection's `threadId` prop), never
// resolved through `search_threads`/`host`.
// ---------------------------------------------------------------------------

/** A complete thread row. Pass only the fields the assertion depends on. */
export function makeThread(id: string, overrides: Partial<Thread> = {}): Thread {
	return {
		id,
		hostKind: "user",
		hostId: "u-founder",
		initiatorId: "u-founder",
		members: ["u-founder"],
		title: null,
		computedTitle: `Thread ${id}`,
		pinned: false,
		resolvedAt: null,
		deletedAt: null,
		lastActiveAt: "2026-01-01T00:00:00.000Z",
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

/** A thread member — what `open_thread`'s `members` array holds. */
export function makeIdentity(id: string, overrides: Partial<Identity> = {}): Identity {
	return { id, name: id, role: "user", isAgent: false, ...overrides };
}

/** One message row. `payload` defaults to an empty plain body. */
export function makeMessage(
	id: string,
	threadId: string,
	overrides: Partial<Message> = {},
): Message {
	return {
		id,
		threadId,
		senderId: "u-founder",
		type: "plain",
		payload: { text: "" },
		clientKey: `ck-${id}`,
		blockId: null,
		resolvedAt: null,
		deletedAt: null,
		redactedAt: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

/** One row of `search_threads`'s output — the conversations list. */
export function makeThreadListRow(id: string, overrides: Partial<ThreadListRow> = {}): ThreadListRow {
	return {
		...makeThread(id),
		hasUnresolvedReview: false,
		lastMessagePreview: null,
		...overrides,
	};
}

export interface MockThreadOptions {
	/** The thread the page opens — from `useThread(threadId)`. */
	readonly thread: Thread;
	readonly members?: readonly Identity[];
	/** DESC (newest-first) — the order `open_thread` returns, unchanged. */
	readonly messages?: readonly Message[];
	readonly headMessageId?: string | null;
	readonly hostTitle?: string | null;
}

/**
 * Mock `open_thread` (what `useThread` loads) and `send_message` (what the
 * composer posts) for one thread id — both `POST /api/actions/<name>`. A
 * successful `send_message` call prepends the sent text as a new plain
 * message, so a spec can post and then assert the reply renders.
 *
 * Registered per-test. `open_thread` has no fallback default to win over
 * (unlike `open_task`/`search_threads`), so this is the ONLY handler most
 * specs need for a thread detail surface.
 */
export async function mockThread(
	page: import("@playwright/test").Page,
	opts: MockThreadOptions,
): Promise<void> {
	const messages: Message[] = [...(opts.messages ?? [])];
	const view = (): ThreadView => ({
		thread: opts.thread,
		members: [...(opts.members ?? [])],
		messages: [...messages],
		headMessageId: opts.headMessageId ?? null,
		hostTitle: opts.hostTitle ?? null,
	});

	await page.route("**/api/actions/open_thread", async (route) => {
		const input = JSON.parse(route.request().postData() ?? "{}") as { id?: string };
		if (input.id !== opts.thread.id) {
			// @lore see mockTaskTree's open_task handler above — fallback(), not
			// continue(), so a spec mocking more than one thread id still works.
			await route.fallback();
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: view() }),
		});
	});

	await page.route("**/api/actions/send_message", async (route) => {
		const input = JSON.parse(route.request().postData() ?? "{}") as {
			threadId?: string;
			text?: string;
			clientKey?: string;
		};
		if (input.threadId !== opts.thread.id) {
			await route.fallback();
			return;
		}
		const message = makeMessage(`msg-${messages.length + 1}`, opts.thread.id, {
			senderId: opts.thread.members[0] ?? "u-founder",
			payload: { text: input.text ?? "" },
			clientKey: input.clientKey ?? `ck-${messages.length + 1}`,
			createdAt: new Date().toISOString(),
		});
		messages.unshift(message);
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: { message, thread: opts.thread } }),
		});
	});
}

export interface MockSearchThreadsOptions {
	readonly rows: readonly ThreadListRow[];
}

/**
 * Mock `search_threads` — the conversations list and every host-thread
 * resolution (`HostThreadSection`'s `host` prop path). Registered per-test;
 * wins over the auto-use empty-list fallback via LIFO.
 */
export async function mockSearchThreads(
	page: import("@playwright/test").Page,
	opts: MockSearchThreadsOptions,
): Promise<void> {
	await page.route("**/api/actions/search_threads", async (route) => {
		if (route.request().method() !== "POST") {
			await route.continue();
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: opts.rows }),
		});
	});
}
