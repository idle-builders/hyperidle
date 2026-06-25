/**
 * AM5 — shared fixtures for the standardized artifact-view-family design stories.
 *
 * Real `Artifact` shapes across the four required kinds (text / code / image /
 * data) plus a `ReviewArtifact` (code_diff proof canvas) and a knowledge body
 * for the block-anchored open state. Design-story fixtures only — NOT production
 * data, NOT a regression baseline. Realistic content per AQ-009.
 */

import type { Artifact } from "@hyperidle/shared";
import type { CodeDiffPayload, ReviewArtifact } from "../../pages/review/review-artifact.js";

const NOW = "2026-06-25T14:38:00.000Z";

export const TEXT_ARTIFACT: Artifact = {
	id: "artifact_8f31",
	producingTaskId: "task_passkey_rollout",
	producingTaskTitle: "Draft passkey rollout comms",
	kind: "text",
	label: "comm_draft",
	preview: {
		kind: "text",
		format: "markdown",
		body: "## Passkey rollout — phase 1\n\nWe're moving the team to passkeys over the next two weeks. **No action needed today.** When prompted, choose *Set up a passkey* and follow your device prompt.\n\n- Phase 1 (this week): founders + design\n- Phase 2 (next week): everyone else\n- Fallback: your existing password keeps working through July 15\n\nQuestions land in #security — Atlas is watching the thread.",
	},
	cost: { money: null, tokens: null },
	threadCount: 3,
	createdAt: NOW,
};

export const CODE_ARTIFACT: Artifact = {
	id: "artifact_a04c",
	producingTaskId: "task_promo_fix",
	producingTaskTitle: "Fix expired-promo silent success",
	kind: "code",
	label: null,
	preview: {
		kind: "code",
		file: "src/billing/promo-webhook.ts",
		hunks: [
			{
				header: "@@ -116,9 +116,14 @@ export async function onPromoApplied(evt) {",
				lines: [
					{ kind: "ctx", text: "  if (!promo) return notFound(evt.code);" },
					{ kind: "del", text: "  if (promo.expiresAt < now()) return ack(evt);" },
					{ kind: "add", text: "  if (promo.expiresAt < now())" },
					{ kind: "add", text: '    return fail(evt, { status: 422, code: "promo_expired" });' },
					{ kind: "ctx", text: "  return applyDiscount(evt, promo);" },
				],
			},
		],
	},
	cost: { money: null, tokens: null },
	threadCount: 1,
	createdAt: NOW,
};

export const IMAGE_ARTIFACT: Artifact = {
	id: "artifact_c7d2",
	producingTaskId: "task_onboarding_redesign",
	producingTaskTitle: "Redesign first-run onboarding",
	kind: "image",
	label: "design",
	preview: {
		kind: "image",
		// Inline SVG data-URL so the story renders with no network.
		url:
			"data:image/svg+xml;utf8," +
			encodeURIComponent(
				`<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>
<rect width='640' height='360' fill='%23ede7db'/>
<rect x='24' y='24' width='592' height='56' rx='12' fill='%23ffffff'/>
<rect x='40' y='44' width='180' height='16' rx='4' fill='%232c241a' opacity='0.8'/>
<rect x='24' y='104' width='284' height='232' rx='12' fill='%23ffffff'/>
<rect x='332' y='104' width='284' height='232' rx='12' fill='%23ffffff'/>
<circle cx='80' cy='160' r='20' fill='%2316764f' opacity='0.18'/>
<rect x='40' y='196' width='200' height='12' rx='4' fill='%232c241a' opacity='0.55'/>
<rect x='40' y='220' width='150' height='12' rx='4' fill='%232c241a' opacity='0.3'/></svg>`,
			),
		width: 640,
		height: 360,
		alt: "Onboarding redesign — two-card welcome layout",
	},
	cost: { money: null, tokens: null },
	threadCount: 5,
	createdAt: NOW,
};

export const DATA_ARTIFACT: Artifact = {
	id: "artifact_5b19",
	producingTaskId: "task_q2_close",
	producingTaskTitle: "Reconcile Q2 revenue",
	kind: "data",
	label: "test-results",
	preview: {
		kind: "data",
		headlines: [
			{ label: "Net revenue", value: "$248,120" },
			{ label: "Refunds", value: "$4,310" },
			{ label: "Tie-out", value: "balanced" },
		],
		rows: [
			{ account: "Subscriptions", prior: "$201,400", current: "$219,800" },
			{ account: "One-time", prior: "$31,200", current: "$28,320" },
			{ account: "Refunds", prior: "$5,900", current: "$4,310" },
		],
	},
	cost: { money: null, tokens: null },
	threadCount: 2,
	createdAt: NOW,
};

/** The review-context member of the family — the code-diff proof canvas. */
export const REVIEW_ARTIFACT: ReviewArtifact<CodeDiffPayload> = {
	id: "artifact_a04c",
	tool: "github",
	app: "GitHub",
	sourceHref: "https://github.com/acme/app/pull/482",
	title: "Fix expired-promo checkout returns silent success → typed 422",
	kind: "code_diff",
	payload: {
		prTitle: "Fix expired-promo checkout returns silent success → typed 422",
		description:
			"Root cause: an unhandled PromoExpiredError was swallowed by a catch-all, so expired codes silently “succeeded.” Now returns a typed 422 and checkout renders an inline “This code expired on Apr 3” message. Regression test added.",
		checks: ["tests", "lint", "build", "typecheck"],
		triviaSummary: "OpenAPI regen + lockfile + formatting",
		files: [
			{
				path: "src/billing/promo-webhook.ts",
				band: "logic",
				added: 28,
				removed: 6,
				rationale: "The fix — rethrows the typed error instead of swallowing it.",
				hunks: [
					{
						header: "@@ -116,9 +116,18 @@ onPromoApplied(evt)",
						lines: [
							{ kind: "ctx", oldNo: 117, newNo: 117, text: "  if (!promo) return notFound(evt.code);" },
							{ kind: "del", oldNo: 118, newNo: null, text: "  if (promo.expiresAt < now()) return ack(evt);" },
							{ kind: "add", oldNo: null, newNo: 118, text: "  if (promo.expiresAt < now())" },
							{ kind: "add", oldNo: null, newNo: 119, text: '    return fail(evt, { status: 422, code: "promo_expired" });' },
							{ kind: "ctx", oldNo: 119, newNo: 120, text: "  return applyDiscount(evt, promo);" },
						],
					},
				],
			},
		],
		trivia: { count: 3, summary: "OpenAPI regen + lockfile + formatting", added: 49, removed: 23 },
	},
};

/** Knowledge body for the block-anchored open state (H2). */
export const KNOWLEDGE_BODY = `# Security posture

Our authentication baseline and the rollout plan for hardware-backed credentials.

## Passkey rollout plan — phase 1 scope

Phase 1 covers founders and the design team. We gate on device support and keep
password fallback live through July 15. The agent (Atlas) watches #security for
setup friction and files a bet if the drop-off exceeds 10%.

## Session policy

Idle sessions expire after 12 hours. Privileged actions re-prompt regardless of
session age.`;

/** The block within KNOWLEDGE_BODY a block reference resolves to (block-anchored open). */
export const TARGET_BLOCK_HEADING = "Passkey rollout plan — phase 1 scope";

/**
 * The reach: the openable references as they appear inline (the entry strip).
 * Each maps 1:1 to an `OpenTarget` the one open contract resolves — the story
 * binds `onOpen` to a state setter, never a hand-rolled navigate.
 */
export interface OpenableRef {
	readonly id: string;
	readonly chipKind: "artifact" | "block" | "knowledge";
	readonly label: string;
	readonly meta?: string;
	/** which fixture/state this reference opens (story-local routing key). */
	readonly opens:
		| { readonly kind: "artifact"; readonly artifact: Artifact }
		| { readonly kind: "review"; readonly review: ReviewArtifact }
		| { readonly kind: "block"; readonly heading: string };
}

export const OPENABLE_REFS: readonly OpenableRef[] = [
	{ id: "r-text", chipKind: "artifact", label: "Passkey rollout comms", meta: "TEXT", opens: { kind: "artifact", artifact: TEXT_ARTIFACT } },
	{ id: "r-code", chipKind: "artifact", label: "promo-webhook.ts", meta: "CODE", opens: { kind: "artifact", artifact: CODE_ARTIFACT } },
	{ id: "r-image", chipKind: "artifact", label: "Onboarding redesign", meta: "IMAGE", opens: { kind: "artifact", artifact: IMAGE_ARTIFACT } },
	{ id: "r-data", chipKind: "artifact", label: "Q2 reconciliation", meta: "DATA", opens: { kind: "artifact", artifact: DATA_ARTIFACT } },
	{ id: "r-review", chipKind: "artifact", label: "PR #482 — expired-promo fix", meta: "REVIEW", opens: { kind: "review", review: REVIEW_ARTIFACT } },
	{ id: "r-block", chipKind: "block", label: "Passkey rollout plan — phase 1 scope", opens: { kind: "block", heading: TARGET_BLOCK_HEADING } },
];
