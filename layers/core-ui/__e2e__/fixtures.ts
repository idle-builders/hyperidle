/**
 * Shared Playwright test fixtures for HyperIdle e2e tests.
 *
 * @lore Every page load calls the API (`open_user`, `/api/settings`,
 * `search_threads` and more). In CI there is no backend server — only Vite serves the
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
 * @lore BC5 T9/T11: the user door — `POST /api/actions/{search_users,
 * open_user, edit_user}` — is the only user surface. `AppShell` calls
 * `open_user({})` (via `useCurrentUser`) on EVERY page load, so this file's
 * auto-use fixture answers it by default (a "self" row) the same way it
 * already defaults `open_task`;
 * without that default every spec in the suite, not only the ones that seed
 * a user, would hang on the shell's own bootstrap call. `GET /api/teams`
 * and `GET /api/agents` are gone with the `teams`/`users`/`agents` route
 * families — nothing production calls them any more — so their mocks are
 * deleted rather than kept as dead handlers.
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
	DocumentRow,
	DocumentView,
	Identity,
	Message,
	SessionRow,
	Task,
	TaskCardSummary,
	TaskNode,
	TaskView,
	Thread,
	ThreadListRow,
	ThreadView,
	UserRow,
	UserView,
} from "@hyperidle/domain-model";
import { test as base, expect } from "@playwright/test";
import type { AgentConfig } from "../src/settings/settings-types.js";

/** Default mock response for GET /api/settings */
const DEFAULT_SETTINGS = {
	profile: { name: "Test Founder", avatarUrl: null },
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

/**
 * Default mock response for POST /api/actions/open_user with no `id` — the
 * "self" row `useCurrentUser` (and therefore `AppShell`, on every page load)
 * resolves. Defined with `makeUserRow`
 * (declared further down — function declarations hoist) so this stays the
 * one row shape the whole file shares.
 */
const DEFAULT_USER_ROW: UserRow = makeUserRow("test-founder", {
	name: "Test Founder",
	role: "founder",
	// A team, not null — FirstRunRedirect's own "setup done" check
	// (`search_users({kind:"human"}).some(u => u.team !== null)`) reads this
	// default too (`fulfillDefaultSearchUsers` below), so a spec that never
	// seeds a team lands on the real app instead of /setup, matching every
	// other spec's assumption that setup is already done.
	team: { id: "test-team-1", name: "Test Team" },
});

/**
 * Answers `POST /api/actions/open_user` with no `id` (the caller's own row) —
 * shared by the auto-use fixture and `registerCoreMocks`. A call carrying an
 * `id` falls through (`route.fallback()`) so a per-test `mockUser()` /
 * `mockUser({ self: true })` registration — or a spec's own handler — wins.
 */
async function fulfillDefaultOpenUser(route: import("@playwright/test").Route): Promise<void> {
	if (route.request().method() !== "POST") {
		await route.continue();
		return;
	}
	const input = JSON.parse(route.request().postData() ?? "{}") as { id?: string };
	if (input.id !== undefined) {
		await route.fallback();
		return;
	}
	await route.fulfill({
		status: 200,
		contentType: "application/json",
		body: JSON.stringify({
			ok: true,
			data: makeUserView(DEFAULT_USER_ROW, {
				connections: { connections: [], inherited: [] },
				inbox: [],
			}),
		}),
	});
}

/**
 * Answers `POST /api/actions/search_users` with `[DEFAULT_USER_ROW]` —
 * shared by the auto-use fixture and `registerCoreMocks`. `FirstRunRedirect`
 * calls `search_users({kind:"human"})` on EVERY root ("/") visit to decide
 * /work vs /setup; without this default every spec that navigates to "/"
 * without its own `mockSearchUsers()` call would 404 the request and land on
 * /setup instead of the shell. A per-test `mockSearchUsers()` registration
 * wins over this one (LIFO); this file's own is a plain `page.route()`, not
 * `route.fallback()`, so it never conflicts with a test's own handler either
 * way.
 */
async function fulfillDefaultSearchUsers(route: import("@playwright/test").Route): Promise<void> {
	if (route.request().method() !== "POST") {
		await route.continue();
		return;
	}
	await route.fulfill({
		status: 200,
		contentType: "application/json",
		body: JSON.stringify({ ok: true, data: [DEFAULT_USER_ROW] }),
	});
}

/**
 * Answers `POST /api/actions/search_tasks` with an empty list — shared by
 * the auto-use fixture and `registerCoreMocks`. `useTeams`' 1-team
 * short-circuit (the sidebar's own instance AND `WorkOverview`'s) reads two
 * `search_tasks` calls per team AFTER `search_users` resolves; without this
 * default, any spec that navigates to "/" or "/work" and does not register
 * its own `mockSearchTasks()`/`mockTeamPage()` hangs waiting for a redirect
 * that never completes (the hook's `Promise.all` never settles, so it
 * neither shows an error nor a result — the earlier `fulfillDefaultSearchUsers`
 * default alone is not enough).
 */
async function fulfillDefaultSearchTasks(route: import("@playwright/test").Route): Promise<void> {
	if (route.request().method() !== "POST") {
		await route.continue();
		return;
	}
	await route.fulfill({
		status: 200,
		contentType: "application/json",
		body: JSON.stringify({ ok: true, data: [] }),
	});
}

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
			// page and every host-thread resolution.
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

			// POST /api/actions/open_user (no id) — the shell's own "who am I".
			await page.route("**/api/actions/open_user", fulfillDefaultOpenUser);

			// POST /api/actions/search_users — FirstRunRedirect's setup-done check.
			await page.route("**/api/actions/search_users", fulfillDefaultSearchUsers);

			// POST /api/actions/search_tasks — useTeams' 1-team short-circuit.
			await page.route("**/api/actions/search_tasks", fulfillDefaultSearchTasks);

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
	await page.route("**/api/actions/open_user", fulfillDefaultOpenUser);
	await page.route("**/api/actions/search_users", fulfillDefaultSearchUsers);
	await page.route("**/api/actions/search_tasks", fulfillDefaultSearchTasks);
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
		sourceDocumentId: null,
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

// ---------------------------------------------------------------------------
// User fixtures
//
// @lore BC5 T9/T11: the only user surface is `POST /api/actions/{search_users,
// open_user, edit_user}` — `{ok:true,data}` or `{ok:false,problems}`.
// There is no per-noun user REST route. These helpers build the row shapes
// (`UserRow`, `UserView`) and register per-test mocks, the same pattern as
// the thread/document fixtures above.
// ---------------------------------------------------------------------------

/** A complete user row — person or agent. Pass only the fields the assertion depends on. */
export function makeUserRow(id: string, overrides: Partial<UserRow> = {}): UserRow {
	return {
		id,
		kind: "human",
		name: `User ${id}`,
		role: "member",
		status: "active",
		avatarUrl: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		agentCategory: null,
		ownerUserId: null,
		health: null,
		team: null,
		edges: [],
		...overrides,
	};
}

/** `open_user`'s full payload for one row — every optional section defaults to "not fetched". */
export function makeUserView(row: UserRow | null, overrides: Partial<UserView> = {}): UserView {
	return {
		user: row,
		runsOn: [],
		runConfig: null,
		documentIds: [],
		folders: [],
		subscriptions: [],
		connections: null,
		inbox: null,
		reviewTrackRecord: null,
		...overrides,
	};
}

export interface MockUserOptions {
	/** The row `open_user`/`edit_user` answer for. */
	readonly row: UserRow;
	/**
	 * When true, `open_user({})` (no id — "myself") answers with this row too,
	 * alongside `open_user({ id: row.id })`. Set on the one row a spec is
	 * viewing/acting as.
	 */
	readonly self?: boolean;
	readonly runsOn?: UserView["runsOn"];
	readonly runConfig?: UserView["runConfig"];
	readonly documentIds?: UserView["documentIds"];
	readonly folders?: UserView["folders"];
	readonly subscriptions?: UserView["subscriptions"];
	readonly connections?: UserView["connections"];
	readonly inbox?: UserView["inbox"];
	readonly reviewTrackRecord?: UserView["reviewTrackRecord"];
	/** When set, `edit_user` replies with this HTTP status instead of 200. */
	readonly patchStatus?: number;
}

/**
 * Mock `open_user` (what `useCurrentUser`/`useAgentProfile`/every settings
 * page loads) and `edit_user` (what they write) for one user id — both
 * `POST /api/actions/<name>`. `edit_user` merges the row-level scalar fields
 * of the patch (name/role/status/avatarUrl/health) and echoes the view
 * back; a spec asserting a structural edit (subscriptions/edges/folders/
 * connections) registers its own narrower handler after calling this, which
 * wins by LIFO.
 *
 * Registered per-test, so it wins over the auto-use `open_user({})` default
 * (Playwright matches routes LIFO).
 */
export async function mockUser(
	page: import("@playwright/test").Page,
	opts: MockUserOptions,
): Promise<void> {
	let row = opts.row;
	const view = (): UserView =>
		makeUserView(row, {
			runsOn: opts.runsOn,
			runConfig: opts.runConfig,
			documentIds: opts.documentIds,
			folders: opts.folders,
			subscriptions: opts.subscriptions,
			connections: opts.connections,
			inbox: opts.inbox,
			reviewTrackRecord: opts.reviewTrackRecord,
		});

	await page.route("**/api/actions/open_user", async (route) => {
		const input = JSON.parse(route.request().postData() ?? "{}") as { id?: string };
		const matches = input.id === row.id || (opts.self === true && input.id === undefined);
		if (!matches) {
			// @lore see mockTaskTree's open_task handler above — fallback(), not
			// continue(), so a spec mocking more than one user id still works.
			await route.fallback();
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: view() }),
		});
	});

	await page.route("**/api/actions/edit_user", async (route) => {
		const patch = JSON.parse(route.request().postData() ?? "{}") as Partial<UserRow> & {
			id?: string;
		};
		if (patch.id !== row.id) {
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
		row = { ...row, ...patch };
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: view() }),
		});
	});
}

export interface MockSearchUsersOptions {
	readonly rows: readonly UserRow[];
}

/**
 * Mock `search_users` — the roster, the agent list, the recipient picker,
 * the org chart and the team pages (`useTeams`/`useTeam` build their team
 * list/detail from this one call, client-side). Applies the same filters the
 * real action does (ids/kind/teamId/name-contains/ownerUserId/status) over
 * the rows given, so a spec seeding more than one team or kind gets the
 * right slice for each call. Registered per-test; there is no auto-use
 * fallback for this route (unlike `open_user`), so a spec that mounts a
 * user-search surface without calling this hangs on loading.
 */
export async function mockSearchUsers(
	page: import("@playwright/test").Page,
	opts: MockSearchUsersOptions,
): Promise<void> {
	await page.route("**/api/actions/search_users", async (route) => {
		if (route.request().method() !== "POST") {
			await route.continue();
			return;
		}
		const input = JSON.parse(route.request().postData() ?? "{}") as {
			ids?: readonly string[];
			kind?: string;
			teamId?: string;
			name?: string;
			ownerUserId?: string;
			status?: string;
		};
		let rows = [...opts.rows];
		if (input.ids) rows = rows.filter((r) => input.ids?.includes(r.id));
		if (input.kind) rows = rows.filter((r) => r.kind === input.kind);
		if (input.teamId) rows = rows.filter((r) => r.team?.id === input.teamId);
		if (input.name) {
			const needle = input.name.toLowerCase();
			rows = rows.filter((r) => r.name.toLowerCase().includes(needle));
		}
		if (input.ownerUserId) rows = rows.filter((r) => r.ownerUserId === input.ownerUserId);
		if (input.status) rows = rows.filter((r) => r.status === input.status);
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: rows }),
		});
	});
}

export interface MockTeamPageOptions {
	readonly teamId: string;
	readonly teamName?: string;
	/** Agent members of the team (kind "ai") — the roster `useTeam` renders. */
	readonly roster?: readonly UserRow[];
	/** True ⇒ `useTeam`'s status computes "blocked" (one blocked task exists). */
	readonly blocked?: boolean;
	/** Root (`parentTaskId: null`), `in_progress` tasks — the active-task cards. */
	readonly tasksInProgress?: readonly Task[];
	/** Each in-progress task's subtree, keyed by task id — for its progress rollup. */
	readonly taskChildren?: Readonly<Record<string, readonly TaskNode[]>>;
}

/**
 * Mock the three calls `useTeam(teamId)` composes a team page from —
 * `search_users({ teamId })`, `search_tasks({ teamId, state })` (blocked +
 * in_progress), and `open_task` per in-progress task — replacing the single
 * `GET /api/teams/:id` the page used to make. `capacity`/`phase`/
 * `leadAgentId`/routines have no equivalent: the columns and the routines
 * table that carried them are gone with the team columns they read.
 */
export async function mockTeamPage(
	page: import("@playwright/test").Page,
	opts: MockTeamPageOptions,
): Promise<void> {
	const team = { id: opts.teamId, name: opts.teamName ?? "Test Team" };
	const roster = [...(opts.roster ?? [])].map((r) => ({ ...r, team }));
	// useTeam reads teamName off the first member row — a roster-less team
	// still needs one row carrying `team` so the name resolves.
	const members = roster.length > 0 ? roster : [makeUserRow(`${opts.teamId}-member`, { team })];

	await page.route("**/api/actions/search_users", async (route) => {
		const input = JSON.parse(route.request().postData() ?? "{}") as { teamId?: string };
		if (input.teamId !== opts.teamId) {
			await route.fallback();
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: members }),
		});
	});

	await page.route("**/api/actions/search_tasks", async (route) => {
		const input = JSON.parse(route.request().postData() ?? "{}") as {
			teamId?: string;
			state?: string;
			parentTaskId?: string | null;
		};
		if (input.teamId !== opts.teamId) {
			await route.fallback();
			return;
		}
		const data =
			input.state === "blocked"
				? opts.blocked
					? [makeTask(`${opts.teamId}-blocked`, { teamId: opts.teamId, state: "blocked" })]
					: []
				: [...(opts.tasksInProgress ?? [])];
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data }),
		});
	});

	await page.route("**/api/actions/open_task", async (route) => {
		const input = JSON.parse(route.request().postData() ?? "{}") as { id?: string };
		const task = (opts.tasksInProgress ?? []).find((t) => t.id === input.id);
		if (!task) {
			await route.fallback();
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				ok: true,
				data: {
					task,
					ancestors: [],
					children: opts.taskChildren?.[task.id] ?? [],
					tokensActualRollup: null,
					threadId: null,
					attachments: [],
				},
			}),
		});
	});
}

export interface MockSearchTasksOptions {
	readonly rows: readonly Task[];
}

/**
 * Mock `search_tasks` — `useAgentRunState`/`useRosterRunState`'s task-title
 * batch lookup (`ids`) and every other client-side task filter. Applies the
 * same `ids`/`teamId`/`state`/`parentTaskId` filters the real action does.
 * Registered per-test; there is no auto-use fallback for this route.
 */
export async function mockSearchTasks(
	page: import("@playwright/test").Page,
	opts: MockSearchTasksOptions,
): Promise<void> {
	await page.route("**/api/actions/search_tasks", async (route) => {
		if (route.request().method() !== "POST") {
			await route.continue();
			return;
		}
		const input = JSON.parse(route.request().postData() ?? "{}") as {
			ids?: readonly string[];
			teamId?: string;
			state?: string;
			parentTaskId?: string | null;
		};
		let rows = [...opts.rows];
		if (input.ids) rows = rows.filter((t) => input.ids?.includes(t.id));
		if (input.teamId) rows = rows.filter((t) => t.teamId === input.teamId);
		if (input.state) rows = rows.filter((t) => t.state === input.state);
		if (input.parentTaskId !== undefined) {
			rows = rows.filter((t) => t.parentTaskId === input.parentTaskId);
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: rows }),
		});
	});
}

// ---------------------------------------------------------------------------
// Thread fixtures
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
export function makeThreadListRow(
	id: string,
	overrides: Partial<ThreadListRow> = {},
): ThreadListRow {
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

/**
 * An `AgentConfig` — the shape `useAgents`' `toAgentConfig` produces from a
 * `search_users` row. Pass only the fields the assertion depends on —
 * `ownerUserId` is the one the assistant overlay reads to find "the viewer's
 * own agent". `mockAgents` below is the one place that still needs this
 * shape; every other caller reads a `UserRow` directly now.
 */
export function makeAgentConfig(id: string, overrides: Partial<AgentConfig> = {}): AgentConfig {
	return {
		id,
		name: id,
		role: "assistant",
		ownerUserId: null,
		identityDocumentId: null,
		harnessType: null,
		modelId: null,
		modelProvider: null,
		maxConcurrentSessions: 1,
		status: "active",
		agentCategory: null,
		...overrides,
	};
}

export interface MockAgentsOptions {
	readonly agents: readonly AgentConfig[];
}

/**
 * Mock `search_users({ kind: "ai" })` — `useAgents`' one fetch, the source
 * for every agent picker and the assistant overlay's `myAgentId` lookup.
 *
 * @lore BC5 T9: replaces `GET /api/agents`, deleted with the `agents` route.
 * `useAgents.toAgentConfig` only ever reads `id`/`name`/`role`/`ownerUserId`/
 * `status`/`agentCategory` off the row — the rest of `AgentConfig`
 * (harness/model/identity document) has no `search_users` equivalent and
 * comes back `null`/default, exactly as production does. Registered
 * per-test; falls through (not `continue()`) on a non-`kind:"ai"` query so
 * it composes with a `mockSearchUsers`/`mockTeamPage` call for the same
 * page.
 */
export async function mockAgents(
	page: import("@playwright/test").Page,
	opts: MockAgentsOptions,
): Promise<void> {
	const rows: UserRow[] = opts.agents.map((a) =>
		makeUserRow(a.id, {
			kind: "ai",
			name: a.name,
			role: a.role,
			ownerUserId: a.ownerUserId,
			status: a.status,
			agentCategory: a.agentCategory,
		}),
	);
	await page.route("**/api/actions/search_users", async (route) => {
		if (route.request().method() !== "POST") {
			await route.continue();
			return;
		}
		const input = JSON.parse(route.request().postData() ?? "{}") as { kind?: string };
		if (input.kind !== "ai") {
			await route.fallback();
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: rows }),
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

/** A complete session row. Pass only the fields the assertion depends on. */
export function makeSessionRow(id: string, overrides: Partial<SessionRow> = {}): SessionRow {
	return {
		id,
		agentId: "agent-1",
		taskId: null,
		startedAt: "2026-01-01T00:00:00.000Z",
		endedAt: null,
		state: "active",
		outcome: null,
		routineId: null,
		notes: null,
		modelTier: "workhorse",
		sourceKind: null,
		...overrides,
	};
}

export interface MockSearchSessionsOptions {
	readonly rows: readonly SessionRow[];
}

/**
 * Mock `search_sessions` — every session read (task detail, agent profile,
 * the recipient picker's live dot, Settings → Agents' active-session counts).
 *
 * @lore `GET /api/sessions*` and `GET /api/agent-orchestration/runs*`
 * are deleted along with the rest of the run-read routes — `search_sessions`
 * is the one door now, `POST /api/actions/search_sessions`.
 */
export async function mockSearchSessions(
	page: import("@playwright/test").Page,
	opts: MockSearchSessionsOptions,
): Promise<void> {
	await page.route("**/api/actions/search_sessions", async (route) => {
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

// ---------------------------------------------------------------------------
// Document fixtures
//
// @lore BC4: the only document surface is `POST /api/actions/{search_documents,
// open_document, edit_document}` — `{ok:true,data}` or `{ok:false,problems}`.
// `GET/POST/PATCH /api/knowledge*` is deleted. These helpers build the row
// shapes (`DocumentRow`, `DocumentView`) and register per-test mocks, the
// same pattern as the thread fixtures above.
// ---------------------------------------------------------------------------

/** A complete document row. Pass only the fields the assertion depends on. */
export function makeDocumentRow(id: string, overrides: Partial<DocumentRow> = {}): DocumentRow {
	return {
		id,
		title: `Document ${id}`,
		body: "",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		scopeKind: "factory",
		scopeId: null,
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "u-founder",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
		...overrides,
	};
}

/** `open_document`'s full payload for one row — ancestors/children/siblings default empty. */
export function makeDocumentView(
	row: DocumentRow,
	overrides: Partial<DocumentView> = {},
): DocumentView {
	return {
		document: row,
		ancestors: [],
		children: [],
		siblings: [],
		scopeName: "Factory",
		...overrides,
	};
}

export interface MockDocumentOptions {
	/** The document the page opens — from `useDocument(id)`. */
	readonly row: DocumentRow;
	readonly ancestors?: readonly DocumentRow[];
	readonly children?: readonly DocumentRow[];
	readonly siblings?: readonly DocumentRow[];
	readonly scopeName?: string;
	/** When set, `edit_document` replies with this HTTP status instead of 200. */
	readonly patchStatus?: number;
}

/**
 * Mock `open_document` (what `useDocument` loads) and `edit_document` (what
 * the detail/create pages write) for one document id — both
 * `POST /api/actions/<name>`. `edit_document` echoes the merged row back as
 * an `ActionResult<DocumentView>`.
 *
 * Registered per-test. `open_document` has no fallback default to win over
 * (unlike `open_task`/`search_threads`), so this is the ONLY handler most
 * specs need for a document detail surface.
 */
export async function mockDocument(
	page: import("@playwright/test").Page,
	opts: MockDocumentOptions,
): Promise<void> {
	let row = opts.row;
	const view = (): DocumentView => ({
		document: row,
		ancestors: [...(opts.ancestors ?? [])],
		children: [...(opts.children ?? [])],
		siblings: [...(opts.siblings ?? [])],
		scopeName: opts.scopeName ?? "Factory",
	});

	await page.route("**/api/actions/open_document", async (route) => {
		const input = JSON.parse(route.request().postData() ?? "{}") as { id?: string };
		if (input.id !== row.id) {
			// @lore see mockTaskTree's open_task handler above — fallback(), not
			// continue(), so a spec mocking more than one document id still works.
			await route.fallback();
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: view() }),
		});
	});

	await page.route("**/api/actions/edit_document", async (route) => {
		const patch = JSON.parse(route.request().postData() ?? "{}") as Partial<DocumentRow> & {
			id?: string;
		};
		if (patch.id !== row.id) {
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
		row = { ...row, ...patch, version: row.version + 1 };
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ ok: true, data: view() }),
		});
	});
}

export interface MockSearchDocumentsOptions {
	readonly rows: readonly DocumentRow[];
}

/**
 * Mock `search_documents` — the document list, parent picker, artifacts
 * section, and settings skill/rule list. Registered per-test; there is no
 * auto-use fallback for this route (unlike `search_threads`), so a spec that
 * mounts a document-reading surface without calling this hangs on loading.
 */
export async function mockSearchDocuments(
	page: import("@playwright/test").Page,
	opts: MockSearchDocumentsOptions,
): Promise<void> {
	await page.route("**/api/actions/search_documents", async (route) => {
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
