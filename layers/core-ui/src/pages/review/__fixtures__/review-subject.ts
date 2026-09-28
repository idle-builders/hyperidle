import type {
	ActionOperationPayload,
	BatchPayload,
	BrowserPreviewPayload,
	CodeDiffPayload,
	FieldChangeSetPayload,
	MetricsMovedPayload,
	OutcomeSummaryPayload,
	RenderedInContextPayload,
	ReviewArtifact,
	ReviewSubject,
	VisualDiffPayload,
} from "../review-artifact.js";

const outcomeArtifact: ReviewArtifact<OutcomeSummaryPayload> = {
	id: "artifact:outcome:1",
	tool: "hyperidle",
	app: "HyperIdle",
	sourceHref: "https://hyperidle.com/reviews/rev-1",
	title: "May close — revenue reconciliation",
	kind: "outcome_summary",
	payload: {
		agentName: "Ops Agent",
		agentInitials: "OA",
		reviewerName: "Jordan Lee",
		achieved:
			"Closed the May books: revenue reconciled to Stripe, A/R aged, and 3 exceptions surfaced for your call.",
		tools: ["quickbooks", "stripe"],
		tokens: 4100,
		standing: "Blocking",
		doneConditions: [
			{ label: "Revenue ties to Stripe MRR export", met: true, jumpLabel: "metrics" },
			{ label: "A/R aging reviewed", met: true, jumpLabel: "metrics" },
			{
				label: "Exceptions routed to human",
				met: false,
				note: "2 anomalies need approval",
				jumpLabel: "metrics",
			},
		],
		needsYou: [
			{
				category: "unverified-claim",
				severity: "error",
				detail: "$9,840 wire lacks source documentation",
				jumpLabel: "metrics",
			},
		],
	},
};

const fieldChangeArtifact: ReviewArtifact<FieldChangeSetPayload> = {
	id: "artifact:field-change:1",
	tool: "salesforce",
	app: "Salesforce",
	sourceHref: "https://salesforce.com/opportunity/0067000000qwerty",
	title: "Opportunity · Northwind Logistics",
	kind: "field_change_set",
	payload: {
		recordLabel: "Opportunity · Northwind Logistics",
		fields: [
			{ label: "Amount", old: "$0", new: "$78,400", provenance: "signed quote" },
			{ label: "Stage", old: "Discovery", new: "Proposal", provenance: "BANT confirmed" },
		],
		unchangedCount: 12,
	},
};

const actionArtifact: ReviewArtifact<ActionOperationPayload> = {
	id: "artifact:action:1",
	tool: "stripe",
	app: "Stripe",
	sourceHref: "https://dashboard.stripe.com/payments/ch_3QspeeJ2a7kLmN0p",
	title: "Refund payment · ch_3Qspee…",
	kind: "action_operation",
	payload: {
		verb: "Refund payment",
		amountWire: { currency: "USD", units: 1240, formatted: "$1,240.00" },
		irreversible: true,
		reversible: false,
		blastRadius: ["Affects 1 customer, 1 charge.", "Reverses May close revenue."],
		receiptFields: [
			{ label: "Charge", value: "ch_3QspeeJ2a7kLmN0p" },
			{ label: "Customer", value: "Northwind Logistics" },
			{ label: "Reason", value: "duplicate" },
		],
	},
};

const renderedArtifact: ReviewArtifact<RenderedInContextPayload> = {
	id: "artifact:rendered:1",
	tool: "mailchimp",
	app: "Mailchimp",
	sourceHref: "https://admin.mailchimp.com/campaigns/edit/c123",
	title: "Solo plan launch — $19/mo",
	kind: "rendered_in_context",
	payload: {
		inboxRow: {
			sender: "HyperIdle",
			subject: "Your team, minus the busywork — now $19",
			preview: "Founder pricing ends Sunday.",
		},
		body: "Run a team of agents. Keep the final say.",
		renderMode: "email",
		flags: ["Set up in under 5 minutes"],
	},
};

const metricsArtifact: ReviewArtifact<MetricsMovedPayload> = {
	id: "artifact:metrics:1",
	tool: "quickbooks",
	app: "QuickBooks",
	sourceHref: "https://qbo.intuit.com/app/report?id=may-close",
	title: "May 2026 close",
	kind: "metrics_moved",
	payload: {
		period: "May 2026",
		headlines: [{ label: "Recognized revenue", prior: 588_000, current: 612_400 }],
		rows: [],
		tieOut: { opening: 1_051_990, activity: 232_312, closing: 1_284_302, ties: true },
		exceptions: [
			{ amount: 9_840, title: "Unidentified wire", detail: "No source", needsYou: true },
		],
	},
};

const visualArtifact: ReviewArtifact<VisualDiffPayload> = {
	id: "artifact:visual:1",
	tool: "figma",
	app: "Figma",
	sourceHref: "https://figma.com/file/xyz/onboarding-v4",
	title: "Onboarding · Create account",
	kind: "visual_diff",
	payload: {
		before: { label: "Onboarding-v4 frame" },
		after: { label: "SignupScreen.tsx" },
		diffRegions: [{ id: "email", label: "Email field missing in build" }],
		overlayMode: "side",
	},
};

const codeArtifact: ReviewArtifact<CodeDiffPayload> = {
	id: "artifact:code:1",
	tool: "github",
	app: "GitHub",
	sourceHref: "https://github.com/acme/storefront/pull/1428",
	title: "Fix expired-promo checkout returns silent success → typed 422",
	kind: "code_diff",
	payload: {
		prTitle: "Fix expired-promo checkout returns silent success → typed 422",
		description:
			"Root cause: an unhandled PromoExpiredError was swallowed by a catch-all, so expired codes silently “succeeded.” Now returns a typed 422 and checkout renders an inline “This code expired on Apr 3” message. Regression test added.",
		checks: ["tests", "lint", "build", "typecheck"],
		files: [
			{
				path: "src/billing/promo-webhook.ts",
				band: "logic",
				rationale:
					"The fix — rethrows the typed error instead of swallowing it (the behavior change).",
				added: 28,
				removed: 6,
				hunks: [
					{
						header: "@@ -116,9 +116,18 @@ export async function onPromoApplied(evt: PromoEvent) {",
						lines: [
							{
								kind: "ctx",
								oldNo: 116,
								newNo: 116,
								text: "  const promo = await promos.find(evt.code);",
							},
							{
								kind: "ctx",
								oldNo: 117,
								newNo: 117,
								text: "  if (!promo) return notFound(evt.code);",
							},
							{ kind: "del", oldNo: 118, newNo: null, text: "  if (promo.expiresAt < now()) {" },
							{
								kind: "del",
								oldNo: 119,
								newNo: null,
								text: "    // expired — nothing to apply, ack the webhook",
							},
							{ kind: "del", oldNo: 120, newNo: null, text: "    return ack(evt);" },
							{ kind: "del", oldNo: 121, newNo: null, text: "  }" },
							{ kind: "add", oldNo: null, newNo: 118, text: "  if (promo.expiresAt < now()) {" },
							{ kind: "add", oldNo: null, newNo: 119, text: "    return fail(evt, {" },
							{ kind: "add", oldNo: null, newNo: 120, text: "      status: 422," },
							{ kind: "add", oldNo: null, newNo: 121, text: '      code: "promo_expired",' },
							{ kind: "add", oldNo: null, newNo: 122, text: "      expiredAt: promo.expiresAt," },
							{ kind: "add", oldNo: null, newNo: 123, text: "    });" },
							{ kind: "add", oldNo: null, newNo: 124, text: "  }" },
							{ kind: "ctx", oldNo: 122, newNo: 125, text: "  return applyDiscount(evt, promo);" },
							{ kind: "ctx", oldNo: 123, newNo: 126, text: "}" },
						],
					},
				],
			},
			{
				path: "src/checkout/PromoField.tsx",
				band: "logic",
				rationale: "Renders the new user-facing “expired” message.",
				added: 19,
				removed: 2,
				hunks: [
					{
						header: "@@ -41,5 +41,9 @@ function PromoField({ onApply }: PromoFieldProps) {",
						lines: [
							{ kind: "ctx", oldNo: 41, newNo: 41, text: "  const res = await applyPromo(code);" },
							{
								kind: "del",
								oldNo: 42,
								newNo: null,
								text: '  if (res.ok) toast.success("Promo applied");',
							},
							{
								kind: "add",
								oldNo: null,
								newNo: 42,
								text: '  if (res.ok) { toast.success("Promo applied"); return; }',
							},
							{
								kind: "add",
								oldNo: null,
								newNo: 43,
								text: '  if (res.code === "promo_expired")',
							},
							{
								kind: "add",
								oldNo: null,
								newNo: 44,
								text: "    setError(`This promo expired on ${fmt(res.expiredAt)}.`);",
							},
							{
								kind: "ctx",
								oldNo: 43,
								newNo: 45,
								text: '  else setError("Couldn’t apply that code.");',
							},
						],
					},
				],
			},
			{
				path: "src/billing/__tests__/promo.expired.test.ts",
				band: "test",
				added: 44,
				removed: 0,
				hunks: [
					{
						header: "@@ -0,0 +1,44 @@ // new file",
						lines: [
							{
								kind: "add",
								oldNo: null,
								newNo: 1,
								text: 'test("expired promo returns typed 422, not silent ack", async () => {',
							},
							{
								kind: "add",
								oldNo: null,
								newNo: 2,
								text: "  const promo = seedPromo({ expiresAt: yesterday });",
							},
							{
								kind: "add",
								oldNo: null,
								newNo: 3,
								text: "  const res = await onPromoApplied(eventFor(promo));",
							},
							{ kind: "add", oldNo: null, newNo: 4, text: "  expect(res.status).toBe(422);" },
							{
								kind: "add",
								oldNo: null,
								newNo: 5,
								text: '  expect(res.code).toBe("promo_expired");',
							},
							{ kind: "add", oldNo: null, newNo: 6, text: "});" },
						],
					},
				],
			},
		],
		triviaSummary: "OpenAPI regen + lockfile + formatting",
		trivia: { count: 3, summary: "OpenAPI regen + lockfile + formatting", added: 49, removed: 23 },
	},
};

const batchArtifact: ReviewArtifact<BatchPayload> = {
	id: "artifact:batch:1",
	tool: "zendesk",
	app: "Zendesk",
	sourceHref: "https://zendesk.com/agent/tickets/update/20418",
	title: "Overnight support triage",
	kind: "batch",
	payload: {
		rollup: { total: 41, needYou: 4, autoResolved: 18, drafted: 19 },
		flagged: [{ id: "f1", ref: "#20418", reason: "Churn threat on $48k renewal" }],
		auto: [{ id: "g-auto", label: "Auto-resolved", count: 18 }],
		drafted: [{ id: "g-draft", label: "Drafted", count: 19 }],
	},
};

const browserArtifact: ReviewArtifact<BrowserPreviewPayload> = {
	id: "artifact:browser:1",
	tool: "vercel",
	app: "Vercel",
	sourceHref: "https://hyperidle-preview.vercel.app/pricing",
	title: "Preview deploy · pricing-v2",
	kind: "browser_preview",
	payload: {
		url: "https://hyperidle-preview.vercel.app/pricing",
		title: "Run a team of agents. Keep the final say.",
		previewBody: "Solo $19/mo · Team $49/seat",
	},
};

/**
 * AL2 — canonical review Subject used by the integration scaffold page.
 *
 */
export const AL2_REVIEW_SUBJECT: ReviewSubject = {
	id: "review:subject:fixture",
	title: "review composition fixture",
	artifacts: [
		outcomeArtifact,
		fieldChangeArtifact,
		actionArtifact,
		renderedArtifact,
		metricsArtifact,
		visualArtifact,
		codeArtifact,
		batchArtifact,
		browserArtifact,
	],
};
