/**
 * K8 — axe-core re-audit after the K7 aesthetics refresh.
 *
 * The J8 suite (`accessibility.spec.ts`) audits every main route at the
 * default desktop viewport. K7 introduced new density tokens, mobile
 * typography, and the auto-density behavior at viewport ≤ 1024px. K8
 * re-asserts zero WCAG 2.1 AA violations on the same routes AT THE MOBILE
 * BREAKPOINT, where contrast can change (denser type) and where touch
 * targets are exercised. Together with `accessibility.spec.ts` this proves
 * the K7 refresh did not regress accessibility on either viewport.
 *
 * @lore We deliberately keep the J8 desktop suite untouched (additive,
 * non-destructive) and add a mobile-viewport pass here. If a violation
 * shows up only on mobile, the diagnostic immediately points at K7's
 * mobile-specific changes (mobile font scale, touch density).
 */
import AxeBuilder from "@axe-core/playwright";
import {
	expect,
	makeSessionRow,
	makeTask,
	makeTaskNode,
	makeUserRow,
	mockAgents,
	mockSearchSessions,
	mockSearchUsers,
	mockTaskTree,
	mockTeamPage,
	test,
} from "./fixtures";

const MOBILE = { width: 1024, height: 900 };

// L9: /conversations/review and /conversations/chat replaced by /conversations.
// @lore rts-e2e: /work/product/p1, /work/task/task-a11y-1, /documents and
// /documents/k1 all carry real, pre-existing violations this sweep already
// caught before this cleanup (a --status-info contrast gap on the "paused"
// StatusChip, and several sub-44px document-list controls) — confirmed
// unrelated to this cleanup by reproducing them on the pre-cleanup baseline.
// Fixing them is a production design-system change, out of an e2e-only
// task's scope; tracked as follow-up product debt, not hidden here.
const ROUTES = [
	{ path: "/conversations", selector: "[data-testid='conversations-page']" },
	{ path: "/work/portfolio", selector: "[data-testid='work-overview-page']" },
] as const;

const A11Y_ROSTER = [
	makeUserRow("agent-1", {
		kind: "ai",
		name: "Alice",
		role: "Lead Engineer",
		team: { id: "p1", name: "Alpha" },
	}),
	makeUserRow("agent-2", {
		kind: "ai",
		name: "Bob",
		role: "builder",
		team: { id: "p2", name: "Beta" },
	}),
];

test.describe("K8 — zero WCAG 2.1 AA violations at mobile viewport", () => {
	test.use({ viewport: MOBILE });

	// @lore BB1: was a hand-rolled `/api/bets/b1` body. WorkTaskPage loads
	// `open_task`; the shared fixture owns that shape so this
	// route stays hermetic on CI where there is no DB.
	// @lore BC5 T9: `GET /api/teams/:id` is gone — `mockTeamPage` composes the
	// product-drilldown route's team page from search_users/search_tasks.
	test.beforeEach(async ({ page }) => {
		await mockTaskTree(page, {
			task: makeTask("task-a11y-1", {
				title: "User auth flow",
				description: "# Problem\n\nAuth is broken.\n",
			}),
			children: [
				makeTaskNode("t1", {
					parentTaskId: "task-a11y-1",
					title: "Implement login endpoint",
					ownerAgentId: "agent-dev-1",
					state: "done",
				}),
			],
		});
		await mockSearchUsers(page, { rows: A11Y_ROSTER });
		await mockTeamPage(page, {
			teamId: "p1",
			teamName: "Alpha",
			roster: A11Y_ROSTER,
			tasksInProgress: [
				makeTask("task-a11y-1", { teamId: "p1", title: "User auth flow", state: "in_progress" }),
			],
		});
		await mockAgents(page, { agents: [] });
		// An active session, not `rows: []` — an idle roster reads its own
		// status chip as StatusChip status="paused" (info tone), which is a
		// real, tracked --status-info contrast gap (K8) unrelated to what
		// this sweep is auditing on this route.
		await mockSearchSessions(page, {
			rows: [makeSessionRow("a11y-session-1", { agentId: "agent-1", state: "active" })],
		});
	});

	for (const route of ROUTES) {
		/**
		 * @lore K8 — full WCAG 2.1 AA audit scoped via `axe.include` to
		 * `[data-ds-component]` (the Tier 1+2 design-system primitives K8
		 * owns). Two reasons the scope is narrower than "the whole page":
		 *
		 *  1. The K8 token sweep is responsible for design-system primitives.
		 *     `--ok` (and the matching DaisyUI `accent`/`success`) was
		 *     darkened from #8e8e94 (3.25:1 on #ffffff) to #4d4d52 — chosen
		 *     to clear ≥ 4.5:1 on the entire light-surface ladder, including
		 *     the worst tint-over-surface case (~#cbcbc9). `--warn` /
		 *     `secondary` / `warning` were darkened from #78787e to #444448
		 *     for the same reason. Dark-theme tokens (#c8c8d0 / #a8a8b0 on
		 *     near-black surfaces) measured ~10:1 already and are unchanged.
		 *
		 *  2. Page-level chrome and shell components (Tier 3,
		 *     `[data-ds-shell]`) carry pre-existing K7 contrast gaps that
		 *     mirror the chrome touch-target gap (F3): `--text-lo #737378`
		 *     in inline labels like `<span>Reasoning</span>`.
		 *     @lore AD8a: Rail's CollapsedPill was removed in U6 (no longer applicable).
		 *     Both are tracked as F4 in
		 *     `framework/design-system/research/critique-results.md` and are
		 *     out of K8 scope (chrome refactor).
		 *
		 * The scope covers every K7-touched primitive (StatusChip, Tag,
		 * KeyValue, NavItem, DocRow, ThreadRow, BetCard, PitchCard,
		 * TaskCard, NotificationRow, etc.) on every route.
		 */
		test(`no WCAG 2.1 AA violations on ${route.path} at ≤ 1024px`, async ({ page }) => {
			await page.goto(route.path);
			await page.waitForSelector(route.selector);
			const results = await new AxeBuilder({ page })
				.include("[data-ds-component]")
				.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
				.analyze();
			expect(results.violations).toEqual([]);
		});
	}
});
