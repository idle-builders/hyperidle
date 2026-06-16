// AL1 — Review experience design exploration.
// Shared realistic fixture for the three /design variants (Verdict Brief,
// Examination Bench, Reasoning Ledger). ONE agent-produced Subject so the
// variants are compared on identical data (AQ-009: realistic content always).
//
// @lore AL1-design: these review-specific shapes (IntentItem, RationaleDecision,
// ReviewComment, NeedsAttentionItem, SubjectArtifact) are story-local design
// types, NOT production schemas. The production Subject/Intent/Rationale schemas
// are an /architecture deliverable. Renderer payloads (CodePreview/DataPreview/
// TextPreview/ImagePreview) and ArtifactCostFromSession ARE the real shared
// shapes — the variants render through the real DS renderers.

import type {
	ArtifactCostFromSession,
	CodePreview,
	DataPreview,
	TextPreview,
} from "@hyperidle/shared";

// ── Orientation ────────────────────────────────────────────────────────────

export type ReviewStanding = "awaiting" | "resolved";
export type PartyKind = "human" | "agent";

export interface ReviewParty {
	readonly id: string;
	readonly name: string;
	readonly kind: PartyKind;
	readonly initials: string;
}

export const ATLAS: ReviewParty = { id: "atlas", name: "Atlas", kind: "agent", initials: "AT" };
export const ROBIN: ReviewParty = { id: "robin", name: "Robin", kind: "human", initials: "RO" };

// ── Intent (the ask) ─────────────────────────────────────────────────────────

export interface IntentItem {
	readonly id: string;
	readonly text: string;
	readonly addressed: boolean;
	/** anchor into the Subject the fulfilment evidence lives at (artifact id). */
	readonly evidenceArtifactId?: string;
	readonly evidenceAnchor?: string;
}

// ── Rationale (the structured why) ───────────────────────────────────────────

export interface RationaleDecision {
	readonly id: string;
	readonly decision: string;
	readonly alternativesDiscarded: ReadonlyArray<string>;
	/** 0–100. Low confidence is the risk-routing signal. */
	readonly confidence: number;
	/** the artifact + spot this decision touches. */
	readonly artifactId: string;
	readonly anchor: string;
	/** the intent item this decision serves (or undermines, when it is the gap). */
	readonly intentItemId?: string;
	readonly risk?: boolean;
}

// ── Conversation ─────────────────────────────────────────────────────────────

export interface ReviewComment {
	readonly id: string;
	readonly author: ReviewParty;
	readonly body: string;
	readonly timestamp: string;
	/** undefined = general comment on the Subject; set = anchored to a spot. */
	readonly artifactId?: string;
	readonly anchor?: string;
	readonly blocking?: boolean;
	readonly resolved?: boolean;
	readonly replies?: ReadonlyArray<ReviewComment>;
}

// ── Subject (the set of artifacts) ───────────────────────────────────────────

export type ArtifactReviewedState = "unreviewed" | "reviewed" | "flagged";

export interface SubjectArtifact {
	readonly id: string;
	readonly path: string;
	readonly kind: "code" | "data" | "text" | "image" | "action";
	readonly resultSummary: string;
	readonly reviewed: ArtifactReviewedState;
	/** real DS-renderer payloads (code/data/text). action carries a description. */
	readonly code?: CodePreview;
	readonly data?: DataPreview;
	readonly text?: TextPreview;
	/** action/operation artifact: what it does + consequence + how to undo. */
	readonly action?: {
		readonly summary: string;
		readonly consequence: string;
		readonly undo: string;
	};
}

// ── Needs-attention (derived view) ───────────────────────────────────────────

export type NeedsAttentionKind = "gap" | "risk" | "blocking-comment";

export interface NeedsAttentionItem {
	readonly id: string;
	readonly kind: NeedsAttentionKind;
	readonly label: string;
	readonly detail: string;
	/** where acting on it takes you. */
	readonly artifactId?: string;
	readonly anchor?: string;
}

// ── The whole Review ─────────────────────────────────────────────────────────

export interface ReviewFixture {
	readonly id: string;
	readonly workIdentity: string;
	readonly betName: string;
	readonly origin: "task" | "bet";
	readonly author: ReviewParty;
	readonly reviewer: ReviewParty;
	readonly standing: ReviewStanding;
	readonly blocking: boolean;
	readonly autonomyContext: string;
	readonly producedAgo: string;
	readonly cost: ArtifactCostFromSession;
	readonly resultHeadline: string;
	readonly intentStatement: string;
	readonly intentItems: ReadonlyArray<IntentItem>;
	readonly rationale: ReadonlyArray<RationaleDecision>;
	readonly artifacts: ReadonlyArray<SubjectArtifact>;
	readonly conversation: ReadonlyArray<ReviewComment>;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE FIXTURE — Atlas completed "Handle Stripe refund webhooks"
// ─────────────────────────────────────────────────────────────────────────────

const refundCode: CodePreview = {
	kind: "code",
	file: "packages/billing/src/refund-webhook.ts",
	hunks: [
		{
			header: "@@ -1,8 +1,24 @@ handleStripeWebhook",
			lines: [
				{ kind: "ctx", text: "import { ledger } from './ledger'" },
				{ kind: "ctx", text: "import { stripe } from './stripe'" },
				{ kind: "add", text: "import { seenEvent, markSeen } from './idempotency'" },
				{ kind: "ctx", text: "" },
				{ kind: "add", text: "// charge.refunded → reverse the ledger entry" },
				{ kind: "add", text: "export async function onRefund(evt: Stripe.Event) {" },
				{ kind: "add", text: "  if (await seenEvent(evt.id)) return ack()" },
				{ kind: "add", text: "  const charge = evt.data.object as Stripe.Charge" },
				{ kind: "add", text: "  await ledger.reverse(charge.id, charge.amount_refunded)" },
				{ kind: "add", text: "  await markSeen(evt.id)" },
				{ kind: "del", text: "  // TODO: handle refunds" },
				{ kind: "ctx", text: "}" },
			],
		},
		{
			header: "@@ -41,6 +52,9 @@ onRefund",
			lines: [
				{ kind: "ctx", text: "  const charge = evt.data.object as Stripe.Charge" },
				{ kind: "add", text: "  // NOTE: partial refunds (amount_refunded < amount)" },
				{ kind: "add", text: "  // are not reversed proportionally this round — see Rationale #2" },
				{ kind: "add", text: "  await ledger.reverse(charge.id, charge.amount_refunded)" },
				{ kind: "ctx", text: "  return ack()" },
			],
		},
	],
};

const testData: DataPreview = {
	kind: "data",
	headlines: [
		{ label: "Tests", value: "47 / 47" },
		{ label: "Coverage", value: "91%" },
		{ label: "Duration", value: "3.2s" },
	],
	rows: [
		{ suite: "refund-webhook · idempotency", result: "12 passed" },
		{ suite: "refund-webhook · ledger reversal", result: "9 passed" },
		{ suite: "refund-webhook · partial refunds", result: "0 — none written" },
	],
	charts: [{ label: "coverage trend", values: [78, 82, 85, 88, 91] }],
};

const migrationNote: TextPreview = {
	kind: "text",
	format: "plain",
	body: `Refund reversal uses a COMPENSATING ledger entry, not a row delete.

Deleting the original debit would break the append-only audit invariant the
finance team relies on for monthly reconciliation. Instead onRefund writes a
new credit row referencing the original charge, so the running balance nets to
zero while both events stay on the books.

Idempotency is enforced by a seen_events table keyed on the Stripe event id,
not a unique constraint on ledger_entries — the latter would need a migration
on a hot table (see Rationale #1).`,
};

export const REVIEW_FIXTURE: ReviewFixture = {
	id: "rev_refund_webhook",
	workIdentity: "Handle Stripe refund webhooks",
	betName: "Billing reliability",
	origin: "task",
	author: ATLAS,
	reviewer: ROBIN,
	standing: "awaiting",
	blocking: true,
	autonomyContext: "L2 · money-mutating action — reversal touches the ledger",
	producedAgo: "14 min ago",
	cost: {
		money: { minor: 214, currency: "USD" },
		tokens: { byTier: { workhorse: { prompt: 268000, completion: 44000 } } },
	},
	resultHeadline:
		"Stripe charge.refunded events now reverse the ledger idempotently — partial refunds and the RefundProcessed event are left for a follow-up.",
	intentStatement:
		"When Stripe sends a refund webhook, reverse the corresponding ledger entry, emit a RefundProcessed event, and make the handler safe to retry.",
	intentItems: [
		{
			id: "i1",
			text: "Parse charge.refunded webhook events",
			addressed: true,
			evidenceArtifactId: "a_code",
			evidenceAnchor: "refund-webhook.ts:6",
		},
		{
			id: "i2",
			text: "Reverse the ledger entry on refund",
			addressed: true,
			evidenceArtifactId: "a_code",
			evidenceAnchor: "refund-webhook.ts:9",
		},
		{
			id: "i3",
			text: "Emit a RefundProcessed domain event",
			addressed: false,
		},
		{
			id: "i4",
			text: "Idempotent across webhook retries",
			addressed: true,
			evidenceArtifactId: "a_code",
			evidenceAnchor: "refund-webhook.ts:7",
		},
	],
	rationale: [
		{
			id: "r1",
			decision: "Idempotency via a seen_events dedupe table keyed on Stripe event id",
			alternativesDiscarded: [
				"Unique constraint on ledger_entries — rejected: needs a migration on a hot table",
			],
			confidence: 70,
			artifactId: "a_code",
			anchor: "refund-webhook.ts:7",
			intentItemId: "i4",
		},
		{
			id: "r2",
			decision: "Treat partial refunds as out-of-scope this round (reverse full amount_refunded only)",
			alternativesDiscarded: [
				"Proportional reversal of split charges — deferred: needs product sign-off on rounding",
			],
			confidence: 45,
			artifactId: "a_code",
			anchor: "refund-webhook.ts:54",
			risk: true,
		},
		{
			id: "r3",
			decision: "Reverse via a compensating credit entry, never a row delete",
			alternativesDiscarded: ["Delete the original debit — rejected: breaks append-only audit"],
			confidence: 90,
			artifactId: "a_text",
			anchor: "migration-note",
			intentItemId: "i2",
		},
		{
			id: "r4",
			decision: "Ack the webhook in <5s and process the reversal asynchronously",
			alternativesDiscarded: ["Synchronous reversal inside the ack — rejected: Stripe 5s timeout"],
			confidence: 80,
			artifactId: "a_code",
			anchor: "refund-webhook.ts:9",
		},
		{
			id: "r5",
			decision: "Skip emitting RefundProcessed — the event-bus contract isn't finalized",
			alternativesDiscarded: ["Emit a provisional event now — rejected: would lock an unstable schema"],
			confidence: 60,
			artifactId: "a_code",
			anchor: "refund-webhook.ts:10",
			intentItemId: "i3",
		},
	],
	artifacts: [
		{
			id: "a_code",
			path: "packages/billing/src/refund-webhook.ts",
			kind: "code",
			resultSummary: "Refund handler: idempotent ledger reversal (+82 −14)",
			reviewed: "unreviewed",
			code: refundCode,
		},
		{
			id: "a_data",
			path: "Test results · refund-webhook",
			kind: "data",
			resultSummary: "47/47 passing, 91% coverage — no partial-refund tests",
			reviewed: "unreviewed",
			data: testData,
		},
		{
			id: "a_text",
			path: "Migration note · compensating reversal",
			kind: "text",
			resultSummary: "Why reversal is a compensating entry, not a delete",
			reviewed: "reviewed",
			text: migrationNote,
		},
		{
			id: "a_action",
			path: "Deploy refund webhook endpoint",
			kind: "action",
			resultSummary: "Register /webhooks/stripe/refund on the prod gateway",
			reviewed: "unreviewed",
			action: {
				summary: "Register the refund webhook URL on the production Stripe gateway.",
				consequence: "Live refund events begin hitting the ledger immediately on approve.",
				undo: "Delete the webhook endpoint in Stripe; the handler stays dormant.",
			},
		},
	],
	conversation: [
		{
			id: "c1",
			author: ROBIN,
			body: "What happens on a $40 partial refund of a $100 charge today — silent full reversal, or dropped?",
			timestamp: "4 min ago",
			artifactId: "a_code",
			anchor: "refund-webhook.ts:54",
			blocking: true,
			resolved: false,
			replies: [
				{
					id: "c1r1",
					author: ATLAS,
					body: "Full amount_refunded is reversed, so a partial refund over-credits today. Flagged as Rationale #2 (confidence 45%). I can gate partials behind a 422 until the proportional path lands — your call.",
					timestamp: "2 min ago",
					artifactId: "a_code",
					anchor: "refund-webhook.ts:54",
				},
			],
		},
		{
			id: "c2",
			author: ROBIN,
			body: "Compensating-entry approach is right — finance will be happy the audit trail stays intact.",
			timestamp: "3 min ago",
			artifactId: "a_text",
			anchor: "migration-note",
			resolved: true,
		},
	],
};

// Derived needs-attention set (union of gaps + risk flags + open blocking comments).
export const NEEDS_ATTENTION: ReadonlyArray<NeedsAttentionItem> = [
	{
		id: "n1",
		kind: "gap",
		label: "RefundProcessed event not emitted",
		detail: "Intent asked for a RefundProcessed domain event — not addressed (Rationale #5).",
		artifactId: "a_code",
		anchor: "refund-webhook.ts:10",
	},
	{
		id: "n2",
		kind: "risk",
		label: "Partial refunds over-credit the ledger",
		detail: "Decision #2, confidence 45% — full amount_refunded is reversed even on partials.",
		artifactId: "a_code",
		anchor: "refund-webhook.ts:54",
	},
	{
		id: "n3",
		kind: "blocking-comment",
		label: "Robin: partial-refund behaviour unresolved",
		detail: "Open blocking question on refund-webhook.ts:54.",
		artifactId: "a_code",
		anchor: "refund-webhook.ts:54",
	},
];

// Review progress across the Subject.
export const REVIEW_PROGRESS = { reviewed: 1, total: REVIEW_FIXTURE.artifacts.length };
