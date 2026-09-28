import type { Page, Route } from "@playwright/test";
import { REVIEW_COMPOSITION_SUBJECT } from "../src/pages/review/__fixtures__/review-composition.fixture.js";
import {
	expect,
	makeDocumentRow,
	makeIdentity,
	makeMessage,
	makeTask,
	makeThread,
	makeThreadListRow,
	makeUserRow,
	makeUserView,
	test,
} from "./fixtures";

const THREAD = makeThread("t-az16", {
	title: "Design tokens review",
	computedTitle: "Design tokens review",
	hostKind: "team",
	hostId: "az16-proof",
	initiatorId: "test-founder",
	members: ["test-founder", "agent-az16"],
	lastActiveAt: "2026-08-14T09:00:00.000Z",
	createdAt: "2026-08-14T08:00:00.000Z",
});

const THREAD_MEMBERS = [
	makeIdentity("test-founder", { name: "Test Founder" }),
	makeIdentity("agent-az16", { name: "Atlas", isAgent: true }),
];

const REVIEW_MESSAGE = makeMessage("review-az16", THREAD.id, {
	senderId: "agent-az16",
	type: "review",
	payload: { title: REVIEW_COMPOSITION_SUBJECT.title, reasoning: [] },
	createdAt: "2026-08-14T09:00:00.000Z",
});

const TASK_VIEW = {
	task: makeTask("task-az16", {
		title: "Semantic design profiles",
		teamId: "team-az16",
		description: "Make every authored value consume one complete, named profile.",
	}),
	ancestors: [],
	children: [],
	tokensActualRollup: null,
	threadId: null,
	attachments: [],
};

const TEAM_ID = "team-az16";

const FOUNDER_ROW = makeUserRow("test-founder", {
	name: "Test Founder",
	role: "founder",
	team: { id: TEAM_ID, name: "Hearth" },
});

const AGENT_ROW = makeUserRow("agent-az16", {
	kind: "ai",
	name: "Atlas",
	role: "builder",
	agentCategory: "team",
	team: { id: TEAM_ID, name: "Hearth" },
});

const TEAM_TASK = makeTask("bet-az16", {
	teamId: TEAM_ID,
	title: "Semantic design profiles",
	state: "in_progress",
});

const KNOWLEDGE = makeDocumentRow("k-az16", {
	title: "Semantic profile contract",
	body: "# Semantic profile contract\n\n## Typography\n\n### Complete definitions\n\n#### Labels\n\n##### Motion\n\n###### Borders\n\nUse `TYPE_STYLE` for generated content.",
	updatedBy: "agent-az16",
	createdAt: "2026-08-14T08:00:00.000Z",
	updatedAt: "2026-08-14T09:00:00.000Z",
});

async function json(route: Route, body: unknown): Promise<void> {
	await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function installAz16Mocks(page: Page): Promise<void> {
	await page.route("**/api/**", async (route) => {
		const { pathname } = new URL(route.request().url());
		if (pathname === "/api/settings") {
			return json(route, {
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
			});
		}
		if (pathname === "/api/actions/open_thread") {
			return json(route, {
				ok: true,
				data: {
					thread: THREAD,
					members: THREAD_MEMBERS,
					messages: [REVIEW_MESSAGE],
					headMessageId: null,
					hostTitle: null,
				},
			});
		}
		if (pathname === "/api/actions/search_threads") {
			return json(route, {
				ok: true,
				data: [makeThreadListRow(THREAD.id, { ...THREAD, hasUnresolvedReview: false })],
			});
		}
		if (pathname === "/api/actions/send_message") {
			return json(route, { ok: true, data: { message: REVIEW_MESSAGE, thread: THREAD } });
		}
		if (pathname === "/api/actions/open_task") return json(route, { ok: true, data: TASK_VIEW });
		if (pathname === "/api/actions/open_document") {
			return json(route, {
				ok: true,
				data: {
					document: KNOWLEDGE,
					ancestors: [],
					children: [],
					siblings: [],
					scopeName: "Factory",
				},
			});
		}
		if (pathname === "/api/actions/search_documents") {
			return json(route, { ok: true, data: [KNOWLEDGE] });
		}
		if (pathname === "/api/actions/search_users") {
			return json(route, { ok: true, data: [FOUNDER_ROW, AGENT_ROW] });
		}
		if (pathname === "/api/actions/open_user") {
			const body = route.request().postDataJSON() as { id?: string } | null;
			const row = body?.id === AGENT_ROW.id ? AGENT_ROW : FOUNDER_ROW;
			const self = body?.id === undefined;
			return json(route, {
				ok: true,
				data: makeUserView(row, {
					connections: self ? { connections: [], inherited: [] } : null,
					inbox: self ? [] : null,
					runsOn: row.kind === "ai" ? [] : [],
				}),
			});
		}
		if (pathname === "/api/actions/edit_user") {
			const body = (route.request().postDataJSON() as { id?: string } | null) ?? {};
			const row = body.id === AGENT_ROW.id ? AGENT_ROW : FOUNDER_ROW;
			return json(route, { ok: true, data: makeUserView(row) });
		}
		if (pathname === "/api/actions/search_tasks") {
			const body = route.request().postDataJSON() as { state?: string } | null;
			const data = body?.state === "blocked" ? [] : [TEAM_TASK];
			return json(route, { ok: true, data });
		}
		if (pathname === "/api/actions/search_sessions") return json(route, { ok: true, data: [] });
		if (pathname === "/api/artifacts") return json(route, { items: [], nextCursor: null });
		return json(route, {});
	});
}

async function addMotionProbes(page: Page): Promise<void> {
	await page.evaluate(() => {
		const panel = document.createElement("section");
		panel.id = "motion-probe-panel";
		panel.setAttribute("aria-label", "motion probe panel");
		for (const profile of ["feedback", "move", "spring", "busy"]) {
			const node = document.createElement("div");
			node.className = `motion-${profile}`;
			node.dataset.az16Profile = profile;
			node.textContent = profile;
			panel.append(node);
		}
		document.querySelector("main")?.prepend(panel);
	});
}

const ROUTE_MATRIX = [
	{ name: "conversations", url: "/conversations/t-az16", testId: "conversations-page" },
	{ name: "team", url: "/work/team/team-az16", testId: "work-team-page" },
	{ name: "task", url: "/work/task/task-az16", testId: "task-detail-page" },
	{ name: "document", url: "/documents/k-az16", testId: "document-detail-page" },
	{ name: "settings", url: "/settings", testId: "settings-page" },
] as const;

// One test per route, each on its own fresh Playwright-provided page — a
// shared page navigated through all 6 routes in sequence accumulated
// per-navigation state (timers, the app's own WS-reconnect attempts) that
// made the LAST route in the sequence (settings, the heaviest page at 11
// stacked sections) slow enough to flake under full-suite parallel load;
// isolating each route removes that accumulation instead of budgeting more
// time for it.
for (const route of ROUTE_MATRIX) {
	test(`${route.name} route paints its loaded state`, async ({ page }) => {
		await installAz16Mocks(page);
		await page.goto(route.url);
		await expect(page.getByTestId(route.testId).first()).toBeVisible();
	});
}

test("review route paints its loaded state", async ({ page }) => {
	await installAz16Mocks(page);
	await page.goto(`/reviews/review-az16?threadId=${THREAD.id}`);
	await expect(page.getByText(REVIEW_COMPOSITION_SUBJECT.title).first()).toBeVisible();
});

test("settings input font-size stays at 16px on a mobile viewport", async ({ page }) => {
	await installAz16Mocks(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/settings");
	const input = page.locator('[data-az16-profile~="input"]').first();
	await expect(input).toHaveCSS("font-size", "16px");
});

test("prefers-reduced-motion disables authored and foreign motion globally", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await installAz16Mocks(page);
	await page.goto("/settings");
	await addMotionProbes(page);
	await page.evaluate(() => {
		const foreign = document.createElement("div");
		foreign.dataset.tokenSubject = "foreign";
		foreign.dataset.az16Profile = "foreign-motion";
		foreign.className = "motion-busy";
		foreign.style.scrollBehavior = "smooth";
		foreign.innerHTML = '<span class="motion-feedback">foreign preview</span>';
		document.body.append(foreign);
	});
	await expect
		.poll(() =>
			page.locator("body *").evaluateAll((nodes) =>
				nodes.flatMap((node) => {
					const base = getComputedStyle(node);
					const before = getComputedStyle(node, "::before");
					const after = getComputedStyle(node, "::after");
					return [base, before, after].some(
						(style) =>
							style.animationName !== "none" ||
							style.transitionProperty !== "none" ||
							style.scrollBehavior !== "auto",
					)
						? [node.outerHTML.slice(0, 160)]
						: [];
				}),
			),
		)
		.toEqual([]);
});
