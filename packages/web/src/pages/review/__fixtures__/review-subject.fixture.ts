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
} from "../review-artifact";

const outcomeArtifact: ReviewArtifact<OutcomeSummaryPayload> = {
	id: "artifact:outcome:1",
	tool: "hyperidle",
	app: "HyperIdle",
	sourceHref: "https://hyperidle.com/work/bet/bet-123/review/rev-1",
	title: "May close — revenue reconciliation",
	kind: "outcome_summary",
	payload: {
		agentName: "Ops Agent",
		agentInitials: "OA",
		reviewerName: "Jordan Lee",
		achieved:
			"Closed the May books: revenue reconciled to Stripe, A/R aged, and 3 exceptions surfaced for your call.",
		tools: ["quickbooks", "stripe"],
		costUsd: 0.23,
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
			"Root cause: an unhandled PromoExpiredError was swallowed by a catch-all. Now returns a typed 422.",
		checks: ["tests", "lint", "build", "typecheck"],
		files: [
			{ path: "src/billing/promo-webhook.ts", band: "logic", rationale: "The fix" },
			{ path: "src/checkout/PromoField.tsx", band: "logic", rationale: "Renders the message" },
			{ path: "src/billing/__tests__/promo.expired.test.ts", band: "test" },
		],
		triviaSummary: "OpenAPI regen + lockfile + formatting",
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
		approveAllExcept: ["f1"],
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

export const MOCK_REVIEW_SUBJECT: ReviewSubject = {
	id: "review:AL2:fixture",
	title: "AL2 review composition fixture",
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
