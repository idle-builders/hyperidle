/**
 * AX1 — demo world documents: a six-week corpus across scopes, kinds and
 * lifecycles — curated patterns, a triage queue, stale and archived items,
 * plausible read/session-use counters, and the provenance loop
 * (completed bet → retro item → promoted draft bet).
 */

import { documents, type HyperIdleDb } from "@hyperidle/db";
import {
	ART_PRICING_PAGE,
	ART_SEARCH_RANKING,
	ART_TRIAL_FLOW,
	ART_TRIAL_METRICS,
	BUILDER_ID,
	DESIGNER_ID,
	FACILITATOR_ID,
	FOUNDER_ID,
	GROWTH_ID,
	KI_CHURN_SIGNALS,
	KI_MOBILE_POSTMORTEM,
	KI_PRICING_TIERS,
	KI_TRIAL_RETRO,
	MAYA_ID,
	PM_ID,
	QA_ID,
	ROOT_TASK_MOBILE,
	ROOT_TASK_SEARCH,
	ROOT_TASK_TRIAL,
	TASK_PRICING_PAGE,
	TASK_SEARCH_RANKING,
	TASK_TRIAL_FLOW,
	TASK_TRIAL_MEASURE,
	TEAM_ID,
} from "./ids.js";
import type { DemoClock } from "./time.js";

/**
 * @lore nested-knowledge-items: the demo corpus is a real tree
 * (`parentKind`/`parentId`) under three grouping roots of its own —
 * Product, Practices (one folder per practice beneath it) and General. A
 * fresh install carries no folders at all (the migration-inserted roots of
 * the same names are gone), so the demo inserts its roots before anything
 * is filed under them.
 */
const PRODUCT_ROOT_ID = "demo-ki-root-product";
const PRACTICES_ROOT_ID = "demo-ki-root-practices";
const GENERAL_ROOT_ID = "demo-ki-root-general";

/** The demo's grouping roots: top-level factory folders, filed under nothing. */
const ROOTS: ReadonlyArray<{ readonly id: string; readonly title: string; readonly body: string }> =
	[
		{ id: PRODUCT_ROOT_ID, title: "Product", body: "Product knowledge." },
		{
			id: PRACTICES_ROOT_ID,
			title: "Practices",
			body: "Practice knowledge, one folder per practice.",
		},
		{ id: GENERAL_ROOT_ID, title: "General", body: "Knowledge with no more specific home." },
	];

interface DocumentSpec {
	readonly id: string;
	readonly scopeKind: "factory" | "team" | "user";
	readonly scopeId: string | null;
	readonly parentKind: "document" | "task";
	readonly parentId: string;
	readonly title: string;
	readonly body: string;
	readonly status: string;
	readonly updatedBy: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly version?: number;
}

/**
 * @lore BC4 §6.7: four documents whose usage predates the seed by more than
 * 90 days, active and ordinary-slotted, so the librarian's decay routine
 * (`unusedSince` + `sort:"least_used"`) has something to find in the desktop
 * walk. Picked from the "practice" corpus rather than anything `ids.ts`
 * exports — nothing else keys off these ids by identity.
 */
const LONG_UNUSED_IDS: ReadonlySet<string> = new Set([
	"demo-ki-rounding",
	"demo-ki-small-prs",
	"demo-ki-email-deliverability",
	"demo-ki-uptime-runbook",
]);

/** Deterministic [0, 2^31) hash of an id — same corpus on every seed run. */
function usageHash(id: string): number {
	let h = 0;
	for (let i = 0; i < id.length; i++) {
		h = (h * 31 + id.charCodeAt(i)) | 0;
	}
	return Math.abs(h);
}

interface UsageValues {
	readonly readCount: number;
	readonly lastReadAt: string | null;
	readonly sessionUseCount: number;
	readonly lastUsedAt: string | null;
}

/**
 * @lore BC4 §6.7: plausible `read_count`/`last_read_at`/`session_use_count`/
 * `last_used_at` for the demo corpus. Archived items were never re-opened
 * (all-zero, all-null — the schema default). `LONG_UNUSED_IDS` gets pushed
 * past the 90-day decay threshold; everything else reads as "used recently,
 * with varied counts" — an id-keyed hash, not a fixed table, so the spread
 * stays believable across ~35 items without hand-tuning each one.
 */
function usageFor(spec: DocumentSpec, clock: DemoClock): UsageValues {
	if (LONG_UNUSED_IDS.has(spec.id)) {
		const h = usageHash(spec.id);
		const lastReadDays = 95 + (h % 40); // 95-134 days ago
		const lastUsedDays = lastReadDays + 3 + (h % 10);
		return {
			readCount: 1 + (h % 4),
			lastReadAt: clock.daysAgo(lastReadDays),
			sessionUseCount: 1 + (h % 2),
			lastUsedAt: clock.daysAgo(lastUsedDays),
		};
	}
	if (spec.status === "archived") {
		return { readCount: 0, lastReadAt: null, sessionUseCount: 0, lastUsedAt: null };
	}
	const h = usageHash(spec.id);
	const sessionUseCount = h % 8;
	return {
		readCount: 1 + (h % 20),
		lastReadAt: clock.daysAgo(h % 21),
		sessionUseCount,
		lastUsedAt: sessionUseCount > 0 ? clock.daysAgo((h >> 3) % 25) : null,
	};
}

/** One document folder under Practices per practice, keyed by the old practice scopeId. */
const PRACTICE_FOLDER_ID: Readonly<Record<string, string>> = {
	builder: "demo-ki-practice-builder",
	product_manager: "demo-ki-practice-product-manager",
	designer: "demo-ki-practice-designer",
	growth: "demo-ki-practice-growth",
	qa_engineer: "demo-ki-practice-qa-engineer",
	facilitator: "demo-ki-practice-facilitator",
	support: "demo-ki-practice-support",
	ops: "demo-ki-practice-ops",
};

/** Looks up a practice's folder id, or throws — every practiceId used below is a known key. */
function practiceFolderId(practiceId: string): string {
	const id = PRACTICE_FOLDER_ID[practiceId];
	if (!id) throw new Error(`demo-world/documents: unknown practice id "${practiceId}"`);
	return id;
}

export async function seedDocuments(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	for (const [position, root] of ROOTS.entries()) {
		await db
			.insert(documents)
			.values({
				id: root.id,
				scopeKind: "factory",
				scopeId: null,
				title: root.title,
				body: root.body,
				format: "markdown",
				status: "active",
				version: 1,
				position,
				updatedBy: "demo-seed",
				createdAt: clock.daysAgo(45),
				updatedAt: clock.daysAgo(45),
			})
			.onConflictDoNothing();
	}
	for (const [practiceId, folderId] of Object.entries(PRACTICE_FOLDER_ID)) {
		await db
			.insert(documents)
			.values({
				id: folderId,
				scopeKind: "factory",
				scopeId: null,
				title: `${practiceId.replace(/_/g, " ")} practice`,
				body: `Knowledge for the ${practiceId.replace(/_/g, " ")} practice.`,
				format: "markdown",
				status: "active",
				version: 1,
				parentKind: "document",
				parentId: PRACTICES_ROOT_ID,
				updatedBy: "demo-seed",
				createdAt: clock.daysAgo(44),
				updatedAt: clock.daysAgo(44),
			})
			.onConflictDoNothing();
	}

	const specs: readonly DocumentSpec[] = [
		// ── Product scope (L2): what Pulse is and the decisions that shape it ──
		{
			id: "demo-ki-pulse-brief",
			scopeKind: "team",
			scopeId: TEAM_ID,
			parentKind: "document",
			parentId: PRODUCT_ROOT_ID,
			title: "Pulse — product brief",
			body: '# Pulse\n\nCustomer-feedback analytics for small product teams. Connect a source, get dashboards that answer "what are users telling us", and share the answer without a meeting.\n\n**One-liner:** feedback in, decisions out.\n\n**Not for:** enterprise SSO buyers, teams over 50 seats, anyone needing on-prem.',
			status: "active",
			updatedBy: FOUNDER_ID,
			createdAt: clock.daysAgo(43),
			updatedAt: clock.daysAgo(12),
			version: 3,
		},
		{
			id: "demo-ki-render-boundary",
			scopeKind: "team",
			scopeId: TEAM_ID,
			parentKind: "document",
			parentId: PRODUCT_ROOT_ID,
			title: "Decision: client-side rendering boundary",
			body: "Dashboards render client-side; exports render server-side. The boundary exists because export templates are shared with the email pipeline and must never ship to browsers.\n\n**Consequence:** no export logic in the web bundle, ever.",
			status: "active",
			updatedBy: BUILDER_ID,
			createdAt: clock.daysAgo(38),
			updatedAt: clock.daysAgo(38),
		},
		{
			id: "demo-ki-brand-voice",
			scopeKind: "team",
			scopeId: TEAM_ID,
			parentKind: "document",
			parentId: PRODUCT_ROOT_ID,
			title: "Brand voice: plain, warm, precise",
			body: 'Pulse sounds like a smart teammate, not a product tour.\n\n- Plain words over jargon ("answers", not "insights").\n- Warm but never cute.\n- Every claim carries a number or is cut.\n\nApplies to the site, the emails, and the empty states.',
			status: "active",
			updatedBy: GROWTH_ID,
			createdAt: clock.daysAgo(36),
			updatedAt: clock.daysAgo(9),
		},
		{
			id: KI_PRICING_TIERS,
			scopeKind: "team",
			scopeId: TEAM_ID,
			parentKind: "document",
			parentId: PRODUCT_ROOT_ID,
			title: "Decision: two-tier pricing structure",
			body: "Starter and Team, nothing between.\n\n- **Starter** — 5 dashboards, 3 seats, weekly exports.\n- **Team** — unlimited dashboards and seats, continuous exports, priority support.\n\nThe comparison table answers the four questions support actually gets. Anything else stays out of the page.",
			status: "active",
			updatedBy: PM_ID,
			createdAt: clock.daysAgo(13),
			updatedAt: clock.daysAgo(11),
			version: 3,
		},
		{
			id: "demo-ki-annual-discount",
			scopeKind: "team",
			scopeId: TEAM_ID,
			parentKind: "document",
			parentId: PRODUCT_ROOT_ID,
			title: "Annual discount policy — needs founder sign-off",
			body: "Annual billing needs a discount percentage. Margin analysis says 10%, trial-bet conversion data says users respond to visible savings (15-20%).\n\n**Open question posted to the founder** — this item updates with the decision.",
			status: "archived",
			updatedBy: BUILDER_ID,
			createdAt: clock.daysAgo(2),
			updatedAt: clock.hoursAgo(26),
		},
		{
			id: "demo-ki-rounding",
			scopeKind: "team",
			scopeId: TEAM_ID,
			parentKind: "document",
			parentId: PRODUCT_ROOT_ID,
			title: "Decision: trial-day rounding rule",
			body: "Trial extensions round UP to whole days in UTC. A trial that expires mid-day never expires mid-day after extension — users experience days, not timestamps.",
			status: "active",
			updatedBy: BUILDER_ID,
			createdAt: clock.daysAgo(135),
			updatedAt: clock.daysAgo(29),
		},
		// ── Practice scope (L3): patterns the team lives by ─────────────────
		{
			id: "demo-ki-review-before-deploy",
			scopeKind: "factory",
			scopeId: "builder",
			parentKind: "document",
			parentId: practiceFolderId("builder"),
			title: "Every deploy goes through a review thread",
			body: "No production deploy without a review thread and a verdict. The two times we skipped this (search hotfix, June; email template, July) both needed a follow-up fix within 24 hours.",
			status: "active",
			updatedBy: BUILDER_ID,
			createdAt: clock.daysAgo(34),
			updatedAt: clock.daysAgo(34),
		},
		{
			id: "demo-ki-small-prs",
			scopeKind: "factory",
			scopeId: "builder",
			parentKind: "document",
			parentId: practiceFolderId("builder"),
			title: "Small changes, reviewed same day",
			body: "Changes under ~200 lines get reviewed the same day. Larger changes get split. Review latency is the biggest hidden tax on a small team — the diff itself is rarely the problem.",
			status: "active",
			updatedBy: BUILDER_ID,
			createdAt: clock.daysAgo(115),
			updatedAt: clock.daysAgo(31),
		},
		{
			id: "demo-ki-metric-before-build",
			scopeKind: "factory",
			scopeId: "product_manager",
			parentKind: "document",
			parentId: practiceFolderId("product_manager"),
			title: "Instrument the metric before building the feature",
			body: "The trial bet worked because the funnel was measured BEFORE the flow shipped — the done-condition was provable on day one. Search almost failed this; the eval loop got built mid-bet and cost a week.",
			status: "active",
			updatedBy: PM_ID,
			createdAt: clock.daysAgo(22),
			updatedAt: clock.daysAgo(13),
		},
		{
			id: "demo-ki-empty-state-first",
			scopeKind: "factory",
			scopeId: "designer",
			parentKind: "document",
			parentId: practiceFolderId("designer"),
			title: "Design the empty state first",
			body: "Every new screen gets its empty state designed before its full state. Users meet the product empty — the full-state mockup is the exception, not the default.",
			status: "active",
			updatedBy: DESIGNER_ID,
			createdAt: clock.daysAgo(27),
			updatedAt: clock.daysAgo(27),
		},
		{
			id: "demo-ki-feature-flag-rollout",
			scopeKind: "factory",
			scopeId: "builder",
			parentKind: "document",
			parentId: practiceFolderId("builder"),
			title: "Flag-gated rollouts for anything user-visible",
			body: "User-visible changes ship behind a flag, enabled per-account first. Draft: needs the flag-cleanup rule written before this is treated as settled practice.",
			status: "proposed",
			updatedBy: BUILDER_ID,
			createdAt: clock.daysAgo(5),
			updatedAt: clock.daysAgo(5),
		},
		{
			id: "demo-ki-email-deliverability",
			scopeKind: "factory",
			scopeId: "growth",
			parentKind: "document",
			parentId: practiceFolderId("growth"),
			title: "Deliverability checklist before any new email",
			body: "1. DKIM/SPF verified on the sending domain.\n2. Plain-text part present.\n3. One link max per email.\n4. Suppression list checked against the send list.\n\nSkipped step 3 once — the welcome email landed in promotions for a week.",
			status: "active",
			updatedBy: GROWTH_ID,
			createdAt: clock.daysAgo(140),
			updatedAt: clock.daysAgo(24),
		},
		{
			id: "demo-ki-subject-line-ab",
			scopeKind: "factory",
			scopeId: "growth",
			parentKind: "document",
			parentId: practiceFolderId("growth"),
			title: "Subject lines: behavior-referencing beats clever",
			body: "Early A/B results: subject lines that reference what the user did ('your data connected') out-open generic ones ('welcome to Pulse') by ~2x. Sample is still small — keep provisional.",
			status: "proposed",
			updatedBy: GROWTH_ID,
			createdAt: clock.daysAgo(18),
			updatedAt: clock.hoursAgo(2),
		},
		{
			id: KI_CHURN_SIGNALS,
			scopeKind: "factory",
			scopeId: "product_manager",
			parentKind: "document",
			parentId: practiceFolderId("product_manager"),
			title: "Churn early signals: the three that repeat",
			body: "Churned accounts show the same three signals in their final two weeks:\n\n1. Dashboard usage drops below half its norm.\n2. Exports stop entirely.\n3. The admin stops inviting teammates.\n\nAll three live in the event stream. Validated against last quarter's churns — 9 of 11 showed at least two signals.",
			status: "active",
			updatedBy: MAYA_ID,
			createdAt: clock.daysAgo(26),
			updatedAt: clock.daysAgo(6),
		},
		{
			id: "demo-ki-search-eval-loop",
			scopeKind: "factory",
			scopeId: "qa_engineer",
			parentKind: "document",
			parentId: practiceFolderId("qa_engineer"),
			title: "The 50-query search eval loop",
			body: "Real queries, expected results, top-3 hit rate — runnable before every search change. Baseline 54%, post-re-rank 71%. The loop outlived the bet that built it; every future ranking change gets measured here first.",
			status: "active",
			updatedBy: QA_ID,
			createdAt: clock.daysAgo(21),
			updatedAt: clock.daysAgo(20),
		},
		{
			id: "demo-ki-staging-data",
			scopeKind: "factory",
			scopeId: "qa_engineer",
			parentKind: "document",
			parentId: practiceFolderId("qa_engineer"),
			title: "Anti-pattern: seeding staging with production exports",
			body: "We tried seeding staging from a production export once. PII in test accounts, skewed metrics, and a support ticket from a customer who recognized their own data. Synthetic cohorts only.",
			status: "active",
			updatedBy: QA_ID,
			createdAt: clock.daysAgo(26),
			updatedAt: clock.daysAgo(26),
		},
		{
			id: KI_MOBILE_POSTMORTEM,
			scopeKind: "factory",
			scopeId: ROOT_TASK_MOBILE,
			parentKind: "task",
			parentId: ROOT_TASK_MOBILE,
			title: "Postmortem: the mobile spike we killed",
			body: "Hypothesis: meaningful Pulse usage happens away from a desk. Reality: mobile is 6% of sessions, mostly read-only, and the responsive app covers it.\n\n**What we keep:** the competitor teardown (they churn mobile users too), the usage numbers, and the discipline of research-before-prototype.\n\n**Cost of the lesson:** three agent-weeks. Worth it once, never again for this question.",
			status: "active",
			updatedBy: PM_ID,
			createdAt: clock.daysAgo(28),
			updatedAt: clock.daysAgo(8),
		},
		{
			id: "demo-ki-discount-panic",
			scopeKind: "factory",
			scopeId: "growth",
			parentKind: "document",
			parentId: practiceFolderId("growth"),
			title: "Anti-pattern: discounting in response to a single loud request",
			body: "A loud enterprise prospect asked for 40% off; we almost said yes before the pricing bet ran. The research showed our real problem was clarity, not price. Provisional until the annual-discount decision lands.",
			status: "proposed",
			updatedBy: GROWTH_ID,
			createdAt: clock.daysAgo(6),
			updatedAt: clock.daysAgo(6),
		},
		{
			id: "demo-ki-onboarding-dropoff",
			scopeKind: "factory",
			scopeId: "growth",
			parentKind: "document",
			parentId: practiceFolderId("growth"),
			title: "The onboarding cliff is source-connection, not signup",
			body: "Funnel audit: signup→login keeps 91%, but login→connect-a-source keeps 58%. The connect screen assumes a data source exists. The value moment is the first saved dashboard — everything before it is friction budget.",
			status: "active",
			updatedBy: PM_ID,
			createdAt: clock.daysAgo(6),
			updatedAt: clock.daysAgo(6),
		},
		{
			id: "demo-ki-session-notes",
			scopeKind: "factory",
			scopeId: "builder",
			parentKind: "document",
			parentId: practiceFolderId("builder"),
			title: "Session notes are the handoff contract",
			body: "Every agent session that touches a task writes notes before it ends — what was done, what remains, what surprised. The two tasks that stalled this month both followed sessions with empty notes.",
			status: "active",
			updatedBy: BUILDER_ID,
			createdAt: clock.daysAgo(22),
			updatedAt: clock.daysAgo(22),
		},
		{
			id: "demo-ki-retro-format",
			scopeKind: "factory",
			scopeId: "product_manager",
			parentKind: "document",
			parentId: practiceFolderId("product_manager"),
			title: "Retro format: hypothesis vs reality, one keeper, one drop",
			body: "Every bet retro answers three questions: what did the hypothesis say, what did reality deliver, and what is the one thing we keep plus the one thing we drop. Two paragraphs max — longer retros never get read.",
			status: "active",
			updatedBy: PM_ID,
			createdAt: clock.daysAgo(13),
			updatedAt: clock.daysAgo(13),
		},
		{
			id: "demo-ki-support-triage",
			scopeKind: "factory",
			scopeId: "support",
			parentKind: "document",
			parentId: practiceFolderId("support"),
			title: "Support tickets that repeat three times become knowledge",
			body: "Rule of three: when the same question arrives three times, it becomes a document and (if it is a product problem) a candidate bet. Pricing confusion hit the rule — the pricing bet exists because of it.",
			status: "proposed",
			updatedBy: MAYA_ID,
			createdAt: clock.daysAgo(20),
			updatedAt: clock.daysAgo(4),
		},
		{
			id: "demo-ki-copy-review-checklist",
			scopeKind: "factory",
			scopeId: "growth",
			parentKind: "document",
			parentId: practiceFolderId("growth"),
			title: "Copy review checklist",
			body: "Before any user-visible copy ships: plain words check, one number per claim, brand-voice pass, and a read-aloud test. The read-aloud test catches 80% of the problems.",
			status: "active",
			updatedBy: GROWTH_ID,
			createdAt: clock.daysAgo(18),
			updatedAt: clock.daysAgo(18),
		},
		{
			id: "demo-ki-search-weights",
			scopeKind: "factory",
			scopeId: "builder",
			parentKind: "document",
			parentId: practiceFolderId("builder"),
			title: "Decision: search weights live in config",
			body: "Ranking weights (recency 0.45, title 0.35, body 0.2) live in config, not code — founder verdict on the ranking review. We tune weekly; a code change for a weight tweak is a smell.",
			status: "active",
			updatedBy: BUILDER_ID,
			createdAt: clock.daysAgo(23),
			updatedAt: clock.daysAgo(23),
		},
		// ── Bet scope: retros attached to their bets ────────────────────────
		{
			id: KI_TRIAL_RETRO,
			scopeKind: "factory",
			scopeId: ROOT_TASK_TRIAL,
			parentKind: "task",
			parentId: ROOT_TASK_TRIAL,
			title: "Retro: trial extension — validated, and the hidden labor",
			body: "Hypothesis said 20% of expiring trials; reality delivered 27% taking the extension, 31% of those converting.\n\n**Keeper:** the one-time limit — it kept the offer honest and support load near zero.\n**Drop:** the reason dropdown — nobody used it; it added a step to a one-click flow.\n\nSurprise: support-granted extensions dropped 92%. We built back real hidden labor.",
			status: "active",
			updatedBy: PM_ID,
			createdAt: clock.daysAgo(13),
			updatedAt: clock.daysAgo(13),
		},
		{
			id: "demo-ki-retro-search",
			scopeKind: "factory",
			scopeId: ROOT_TASK_SEARCH,
			parentKind: "task",
			parentId: ROOT_TASK_SEARCH,
			title: "Retro: search relevance — partial, and the eval loop wins",
			body: "Top-3 hit rate moved 54% → 71%: real, short of the 80% target. Recency mattered more than expected; personalization was killed mid-bet.\n\n**Keeper:** the eval loop — it outlives the bet and measures every future change.\n**Drop:** chasing the last 9 points without new signal; that is diminishing returns.",
			status: "active",
			updatedBy: PM_ID,
			createdAt: clock.daysAgo(19),
			updatedAt: clock.daysAgo(19),
		},
		// ── Task scope: writeback from the work itself ─────────────────────
		{
			id: "demo-ki-trial-date-math",
			scopeKind: "factory",
			scopeId: TASK_TRIAL_FLOW,
			parentKind: "task",
			parentId: TASK_TRIAL_FLOW,
			title: "Trial entitlement date math is UTC end-to-end",
			body: "The entitlement edge was timezone-sensitive: extending a trial that expires at 23:00 local could grant 6 or 8 days depending on the server's zone. All trial date math now runs in UTC and rounds up to whole days.",
			status: "proposed",
			updatedBy: BUILDER_ID,
			createdAt: clock.daysAgo(28),
			updatedAt: clock.daysAgo(28),
		},
		// ── User scope: private items ──────────────────────────────────────
		{
			id: "demo-ki-founder-focus",
			scopeKind: "user",
			scopeId: FOUNDER_ID,
			parentKind: "document",
			parentId: GENERAL_ROOT_ID,
			title: "This quarter's focus",
			body: "Activation first; pricing only where acquisition spend is leaking.\n\nThe pricing bet is the exception that proves the rule — it plugs a leak, it does not chase expansion.",
			status: "active",
			updatedBy: FOUNDER_ID,
			createdAt: clock.daysAgo(12),
			updatedAt: clock.daysAgo(11),
		},
		{
			id: "demo-ki-founder-notes",
			scopeKind: "user",
			scopeId: FOUNDER_ID,
			parentKind: "document",
			parentId: GENERAL_ROOT_ID,
			title: "Hiring notes — when does ops get an agent?",
			body: "Maya reviews every ops item by hand. If support volume keeps falling (onboarding bet) there is room; if it does not, the roster needs an ops agent by next quarter. Decide at the portfolio retro.",
			status: "proposed",
			updatedBy: FOUNDER_ID,
			createdAt: clock.daysAgo(7),
			updatedAt: clock.daysAgo(7),
		},
		// ── Stale and archived: a corpus that ages ─────────────────────────
		{
			id: "demo-ki-old-pricing",
			scopeKind: "team",
			scopeId: TEAM_ID,
			parentKind: "document",
			parentId: PRODUCT_ROOT_ID,
			title: "Three-tier pricing structure (superseded)",
			body: "Launch-era three-tier structure: Free, Pro, Scale. Superseded by the two-tier decision — kept for the record of why the middle tier confused everyone.",
			status: "stale",
			updatedBy: PM_ID,
			createdAt: clock.daysAgo(42),
			updatedAt: clock.daysAgo(13),
		},
		{
			id: "demo-ki-old-onboarding",
			scopeKind: "factory",
			scopeId: "growth",
			parentKind: "document",
			parentId: practiceFolderId("growth"),
			title: "Fixed-day onboarding emails (superseded)",
			body: "The original plan sent emails on fixed days after signup. The funnel audit killed it — behavior triggers reach users where they actually are. Superseded by the onboarding-emails bet.",
			status: "stale",
			updatedBy: GROWTH_ID,
			createdAt: clock.daysAgo(40),
			updatedAt: clock.daysAgo(6),
		},
		{
			id: "demo-ki-legacy-slack",
			scopeKind: "factory",
			scopeId: "builder",
			parentKind: "document",
			parentId: practiceFolderId("builder"),
			title: "Archived: the Slack-webhook experiment",
			body: "Early experiment piping bet events to Slack. Retired when threads became the conversation surface — notifications now live in-app.",
			status: "archived",
			updatedBy: BUILDER_ID,
			createdAt: clock.daysAgo(43),
			updatedAt: clock.daysAgo(25),
		},
		{
			id: "demo-ki-legacy-roadmap",
			scopeKind: "team",
			scopeId: TEAM_ID,
			parentKind: "document",
			parentId: PRODUCT_ROOT_ID,
			title: "Archived: launch-quarter roadmap",
			body: "The launch-quarter roadmap, archived when bets replaced roadmaps. Interesting mostly as archaeology.",
			status: "archived",
			updatedBy: FOUNDER_ID,
			createdAt: clock.daysAgo(44),
			updatedAt: clock.daysAgo(30),
		},
		// ── More practice: breadth across roles ────────────────────────────
		{
			id: "demo-ki-regression-suite",
			scopeKind: "factory",
			scopeId: "qa_engineer",
			parentKind: "document",
			parentId: practiceFolderId("qa_engineer"),
			title: "The regression suite runs on every review verdict",
			body: "Approve a review and the regression suite runs against the change before merge. It caught the timezone bug the trial flow originally had — the suite is cheaper than a postmortem.",
			status: "active",
			updatedBy: QA_ID,
			createdAt: clock.daysAgo(25),
			updatedAt: clock.daysAgo(25),
		},
		{
			id: "demo-ki-design-tokens",
			scopeKind: "factory",
			scopeId: "designer",
			parentKind: "document",
			parentId: practiceFolderId("designer"),
			title: "New screens compose from tokens, never raw values",
			body: "Every screen the pricing bet shipped composed from design tokens; the one dialog that used raw hex values got caught in review. Tokens are the contract between design and build.",
			status: "active",
			updatedBy: DESIGNER_ID,
			createdAt: clock.daysAgo(17),
			updatedAt: clock.daysAgo(17),
		},
		{
			id: "demo-ki-weekly-planning",
			scopeKind: "factory",
			scopeId: "product_manager",
			parentKind: "document",
			parentId: practiceFolderId("product_manager"),
			title: "Weekly planning: activate what is ready, kill what is stale",
			body: "Fifteen minutes, once a week: look at drafts, activate the ones with a clear shape, kill or reshape the stale ones. Drafts should not age past two weeks without a decision.",
			status: "active",
			updatedBy: PM_ID,
			createdAt: clock.daysAgo(20),
			updatedAt: clock.daysAgo(20),
		},
		{
			id: "demo-ki-knowledge-hygiene",
			scopeKind: "factory",
			scopeId: "facilitator",
			parentKind: "document",
			parentId: practiceFolderId("facilitator"),
			title: "Knowledge hygiene: triage weekly, archive without guilt",
			body: "The triage queue should stay under five items; archived is a respectable destination. A knowledge base that only grows is a landfill — the decay sweep exists for a reason.",
			status: "active",
			updatedBy: FACILITATOR_ID,
			createdAt: clock.daysAgo(16),
			updatedAt: clock.daysAgo(15),
		},
		{
			id: "demo-ki-competitor-watch",
			scopeKind: "factory",
			scopeId: "growth",
			parentKind: "document",
			parentId: practiceFolderId("growth"),
			title: "Competitor teardowns: one page, kept current",
			body: "One living page per competitor, updated when we notice something, not on a schedule. The mobile-spike teardown proved its worth — the kill decision took an afternoon because the research existed.",
			status: "proposed",
			updatedBy: GROWTH_ID,
			createdAt: clock.daysAgo(8),
			updatedAt: clock.daysAgo(8),
		},
		{
			id: "demo-ki-uptime-runbook",
			scopeKind: "factory",
			scopeId: "ops",
			parentKind: "document",
			parentId: practiceFolderId("ops"),
			title: "Incident runbook: the four first checks",
			body: "When an alert fires: 1) is it the database or the app, 2) when did it start, 3) what changed last, 4) who is affected. Answer those four before touching anything.",
			status: "active",
			updatedBy: MAYA_ID,
			createdAt: clock.daysAgo(145),
			updatedAt: clock.daysAgo(15),
		},
		// ── Produced documents (formerly artifacts) ───────────────────
		// @lore artifacts-become-knowledge: produced content (pages, code, dashboards)
		// is a document parented to the task that produced it. The body carries
		// the actual content; kind is derived at render from the blocks. An item whose
		// body is a single fenced html block renders live in the sandbox frame.
		//
		// @lore nested-knowledge-items: scope is `team`/`TEAM_ID`, not the
		// `task`-scope-kind + free-text `topic` these rows carried when #547
		// wrote them — `SCOPE_KINDS` is reduced to factory|team|user (§2) and
		// `topic`/`kind`/`layer` are deleted from the schema entirely. Task
		// parentage (`parentKind: "task"`) is unaffected: architecture §3 says
		// scope is never enforced against a task parent, so which of the three
		// surviving kinds these carry doesn't change tree behavior.
		{
			id: ART_PRICING_PAGE,
			scopeKind: "team",
			scopeId: TEAM_ID,
			title: "Pricing page — two-tier rebuild",
			body: '```html\n<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>Pulse Pricing</title>\n<style>\n*{box-sizing:border-box;margin:0;padding:0}\nbody{font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;background:#fafafa;color:#111;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:40px 20px}\nh1{font-size:2rem;font-weight:800;letter-spacing:-0.03em;margin-bottom:8px}\n.sub{color:#555;font-size:1rem;margin-bottom:40px}\n.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;width:100%;max-width:700px}\n.plan{background:#fff;border:3px solid #111;padding:28px 24px;display:flex;flex-direction:column;gap:12px}\n.plan.featured{background:#111;color:#fff}\n.plan-name{font-size:0.75rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase}\n.plan-price{font-size:2.5rem;font-weight:800;letter-spacing:-0.04em}\n.plan-price span{font-size:1rem;font-weight:400;opacity:0.6}\n.plan-desc{font-size:0.875rem;opacity:0.7;line-height:1.5}\n.divider{border:none;border-top:1px solid currentColor;opacity:0.15}\n.features{list-style:none;display:flex;flex-direction:column;gap:8px;font-size:0.875rem}\n.features li::before{content:\'+ \';font-weight:700}\n.cta{margin-top:auto;padding-top:20px}\n.btn{display:block;text-align:center;padding:12px 20px;font-weight:700;font-size:0.875rem;text-transform:uppercase;letter-spacing:0.05em;text-decoration:none;border:3px solid currentColor;cursor:pointer;transition:background 0.1s,color 0.1s}\n.plan:not(.featured) .btn:hover{background:#111;color:#fff}\n.plan.featured .btn{background:#fff;color:#111}\n.plan.featured .btn:hover{background:#f0f0f0}\n.table-wrap{margin-top:48px;width:100%;max-width:700px;overflow-x:auto}\ntable{width:100%;border-collapse:collapse;font-size:0.875rem}\nth,td{padding:10px 14px;text-align:left;border-bottom:1px solid #e5e5e5}\nth{font-weight:700;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;color:#555}\ntd:not(:first-child){text-align:center}\n.check{font-weight:700;color:#111}\n.dash{color:#bbb}\n</style>\n</head>\n<body>\n<h1>Simple pricing. No surprises.</h1>\n<p class="sub">Start free. Upgrade when your team needs more.</p>\n<div class="plans">\n  <div class="plan">\n    <div class="plan-name">Starter</div>\n    <div class="plan-price">$29<span>/mo</span></div>\n    <p class="plan-desc">For solo founders and small teams exploring customer feedback.</p>\n    <hr class="divider">\n    <ul class="features">\n      <li>5 dashboards</li>\n      <li>3 team seats</li>\n      <li>Weekly exports</li>\n      <li>Email support</li>\n    </ul>\n    <div class="cta"><a class="btn" href="#">Start free trial</a></div>\n  </div>\n  <div class="plan featured">\n    <div class="plan-name">Team</div>\n    <div class="plan-price">$99<span>/mo</span></div>\n    <p class="plan-desc">For growing teams that need unlimited access and faster exports.</p>\n    <hr class="divider">\n    <ul class="features">\n      <li>Unlimited dashboards</li>\n      <li>Unlimited seats</li>\n      <li>Continuous exports</li>\n      <li>Priority support</li>\n    </ul>\n    <div class="cta"><a class="btn" href="#">Start free trial</a></div>\n  </div>\n</div>\n<div class="table-wrap">\n  <table>\n    <thead>\n      <tr><th>Feature</th><th>Starter</th><th>Team</th></tr>\n    </thead>\n    <tbody>\n      <tr><td>Dashboards</td><td class="dash">5</td><td class="check">Unlimited</td></tr>\n      <tr><td>Team seats</td><td class="dash">3</td><td class="check">Unlimited</td></tr>\n      <tr><td>Export frequency</td><td class="dash">Weekly</td><td class="check">Continuous</td></tr>\n      <tr><td>Priority support</td><td class="dash">—</td><td class="check">✓</td></tr>\n      <tr><td>Annual billing discount</td><td class="check">✓</td><td class="check">✓</td></tr>\n    </tbody>\n  </table>\n</div>\n</body>\n</html>\n```',
			status: "active",
			updatedBy: DESIGNER_ID,
			createdAt: clock.daysAgo(5),
			updatedAt: clock.daysAgo(5),
			parentKind: "task",
			parentId: TASK_PRICING_PAGE,
		},
		{
			id: ART_TRIAL_FLOW,
			scopeKind: "team",
			scopeId: TEAM_ID,
			title: "Trial extension flow — implementation",
			body: "```typescript\n// Trial extension entitlement — UTC end-to-end.\n// One-click, one-time, exactly seven calendar days.\n\nexport async function grantTrialExtension(\n  accountId: string,\n  db: Db,\n): Promise<{ granted: boolean; expiresAt: Date }> {\n  const account = await db.query.accounts.findFirst({\n    where: eq(accounts.id, accountId),\n  });\n  if (!account) throw new Error(`account not found: ${accountId}`);\n  if (account.trialExtendedAt !== null) {\n    // One-time only — second attempt declines gracefully.\n    return { granted: false, expiresAt: new Date(account.trialExpiresAt) };\n  }\n  // Round UP to whole UTC days so users experience days, not timestamps.\n  const base = new Date(account.trialExpiresAt);\n  const extended = new Date(\n    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + 7),\n  );\n  await db\n    .update(accounts)\n    .set({ trialExpiresAt: extended.toISOString(), trialExtendedAt: new Date().toISOString() })\n    .where(eq(accounts.id, accountId));\n  return { granted: true, expiresAt: extended };\n}\n```",
			status: "active",
			updatedBy: BUILDER_ID,
			createdAt: clock.daysAgo(30),
			updatedAt: clock.daysAgo(30),
			parentKind: "task",
			parentId: TASK_TRIAL_FLOW,
		},
		{
			id: ART_TRIAL_METRICS,
			scopeKind: "team",
			scopeId: TEAM_ID,
			title: "Trial extension metrics dashboard",
			body: "# Trial extension metrics — week 2\n\n**Extensions taken:** 27% of expiring trials (hypothesis: 20%).\n\n**Of those, converting:** 31%.\n\n**Support-granted extensions:** −92% vs the same period before the flow shipped.\n\n## Daily trend\n\nExtension grants are still climbing. No plateau visible at day 14.\n\n## What this means\n\nThe one-time limit kept the offer honest — support load stayed near zero while voluntary conversions grew. The reason-dropdown had zero completions: cut in the next iteration.",
			status: "active",
			updatedBy: QA_ID,
			createdAt: clock.daysAgo(15),
			updatedAt: clock.daysAgo(13),
			parentKind: "task",
			parentId: TASK_TRIAL_MEASURE,
		},
		{
			id: ART_SEARCH_RANKING,
			scopeKind: "team",
			scopeId: TEAM_ID,
			title: "Search re-ranking — implementation",
			body: "```typescript\n// Search re-ranking weights — live in config, not code.\n// Tune weekly via the weights config; no deploy needed.\n\nexport interface RankWeights {\n  recency: number;   // default: 0.45\n  titleMatch: number; // default: 0.35\n  bodyMatch: number; // default: 0.20\n}\n\nexport function scoreDocument(\n  doc: { title: string; body: string; updatedAt: Date },\n  query: string,\n  weights: RankWeights,\n): number {\n  const recencyScore = Math.exp(\n    -((Date.now() - doc.updatedAt.getTime()) / (7 * 24 * 60 * 60 * 1000)),\n  );\n  const titleScore = titleMatchScore(doc.title, query);\n  const bodyScore = bodyMatchScore(doc.body, query);\n  return (\n    weights.recency * recencyScore +\n    weights.titleMatch * titleScore +\n    weights.bodyMatch * bodyScore\n  );\n}\n```",
			status: "active",
			updatedBy: BUILDER_ID,
			createdAt: clock.daysAgo(25),
			updatedAt: clock.daysAgo(25),
			parentKind: "task",
			parentId: TASK_SEARCH_RANKING,
		},
	];

	for (const spec of specs) {
		const usage = usageFor(spec, clock);
		await db
			.insert(documents)
			.values({
				id: spec.id,
				scopeKind: spec.scopeKind,
				scopeId: spec.scopeId,
				title: spec.title,
				body: spec.body,
				format: "markdown",
				status: spec.status,
				version: spec.version ?? 1,
				parentKind: spec.parentKind ?? null,
				parentId: spec.parentId ?? null,
				confidence: spec.status === "active" ? "0.9" : "0.6",
				updatedBy: spec.updatedBy,
				createdAt: spec.createdAt,
				updatedAt: spec.updatedAt,
				readCount: usage.readCount,
				lastReadAt: usage.lastReadAt,
				sessionUseCount: usage.sessionUseCount,
				lastUsedAt: usage.lastUsedAt,
			})
			.onConflictDoNothing();
	}
}
