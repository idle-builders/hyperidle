import {
	artifacts,
	type HyperIdleDb,
	messages,
	operationOutcomes,
	stagedOperations,
} from "@hyperidle/db";
import { relativeLong } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";

/**
 * AL7 — Reviews route: GET /api/reviews/:reviewMessageId
 *
 * Returns a ComposedReviewSubject-shaped response with any staged operation
 * nested inside the matching artifact (action_operation kind) in the artifacts
 * array. The loader:
 * - Queries staged_operations LEFT JOIN operation_outcomes by reviewMessageId
 * - Humanizes executedAt at the response boundary (never raw ISO)
 * - Nests stagedOperation on the matching artifact (not at the top level)
 * - Field names match StagedOperationView: stagedOperationId (not id), receipt (not payload)
 * - Returns 404 if the review message doesn't exist
 * - Returns the stub fixture for "rev-1" (design/demo route)
 *
 * @lore AL7: The reviewed message ID is used as the dispatch key (C1 fix).
 * @lore AL7 CRITICAL-2: stagedOperation must be nested on the artifact the canvas
 * renders (artifact.stagedOperation), NOT at the top level of the response.
 * ReviewComposition.tsx:675 reads artifact.stagedOperation for action_operation kinds.
 * Field names must match StagedOperationView from review-composition.ts:
 *   stagedOperationId (string) — NOT id
 *   outcome.receipt (string?) — NOT outcome.payload (the tool return identity)
 * @lore AL7 CRITICAL-2b: FIXTURE_REVIEW is preserved (plan §7: "keep the stub data
 * until the broader reviews-loader wiring lands"). AL7 only adds the staged-op/outcome
 * branch to the response — it does not rewrite the whole fixture.
 */

const FIXTURE_REVIEW = {
	id: "review:AL3:fixture",
	title: "Fix expired-promo checkout — silent success → typed 422",
	betId: "bet-123",
	betTitle: "Billing reliability",
	taskId: "task-456",
	taskTitle: "Fix expired-promo checkout",
	prompt:
		"Expired promo codes at checkout show no error — users think the code applied and are confused when the total doesn't change. Fix it: surface a clear error, and tell the user why it failed.",
	authorName: "Atlas",
	reviewerName: "You",
	blocking: true,
	producedAgo: "9 min ago",
	costMoney: "$4.20",
	costTokens: "310k tok",
	tools: ["github", "linear", "vercel", "quickbooks", "stripe", "mailchimp", "figma", "zendesk"],
	outcome:
		"Root cause: an unhandled PromoExpiredError was swallowed by a catch-all, so expired codes silently 'succeeded'. Checkout now returns a typed 422 and shows an inline 'expired' message; tests pass. The prod deploy is staged and waiting on your approval.",
	resultKpis: [
		{ label: "Silent failures", value: "0", delta: "was 31 users / 24h", good: true },
		{ label: "Tests", value: "47 / 47", delta: "+0.4% cov", good: true },
		{ label: "Checkout error path", value: "now covered", good: true },
	],
	intent: [
		{ text: "Expired codes show the user an error", met: true },
		{ text: "API returns a typed 422 (not silent 200)", met: true },
		{ text: "Regression test covers the expired path", met: true },
		{ text: "Deployed to production", met: false },
	],
	needs: [
		{
			id: "n-1",
			kind: "unhandled-exception",
			label: "Prod deploy is staged, not done",
			detail: "Intent asked for prod; the deploy waits on your approve.",
			artifactId: "artifact:action:1",
		},
		{
			id: "n-2",
			kind: "blast-radius",
			label: "Touches the checkout payment path",
			detail: "The fix lives in the shared OrderService — revenue-adjacent, high-traffic.",
			artifactId: "artifact:code:1",
		},
	],
	artifacts: [] as unknown[],
	conversation: [],
};

/**
 * Derive the `receipt` string from the raw tool payload for the outcome band.
 * For `ok` outcomes, the receipt is the tool's return identity — a short string
 * like "re_3Qs… · refunded" that proves the action happened.
 *
 * For GitHub merge-pr: sha + "merged" gives the identity.
 * For fixture:staged-op: the echoed payload is shown as JSON.
 * For other tools: JSON.stringify the payload as a fallback.
 *
 * @lore AL7 CRITICAL-2: StagedOperationOutcomeView.receipt is a string
 * (ReviewActionOperation.tsx:371 renders it as text). The raw DB payload is JSON —
 * the loader must extract a human-readable receipt string here, not forward the
 * raw object. The component never JSON-parses — it displays the string as-is.
 */
function extractReceipt(rawPayload: unknown): string | undefined {
	if (rawPayload === null || rawPayload === undefined) return undefined;
	if (typeof rawPayload === "string") {
		try {
			const parsed = JSON.parse(rawPayload) as unknown;
			return extractReceipt(parsed);
		} catch {
			return rawPayload;
		}
	}
	if (typeof rawPayload === "object") {
		const p = rawPayload as Record<string, unknown>;
		// GitHub merge-pr: { sha, merged, message }
		if (typeof p.sha === "string" && p.merged === true) {
			return `${p.sha.slice(0, 8)}… · merged`;
		}
		// fixture:staged-op: { echoed: ... }
		if (p.echoed !== undefined) {
			return `echo · ${JSON.stringify(p.echoed)}`;
		}
		// Generic fallback
		return JSON.stringify(p);
	}
	return String(rawPayload);
}

export function createReviewRoutes(db: HyperIdleDb): Hono {
	const app = new Hono();

	app.get("/:reviewMessageId", requireBoundary({ kind: "public-data" }), async (c) => {
		const reviewMessageId = c.req.param("reviewMessageId");

		// Stub fixture path for design/demo (plan §7: keep the stub data).
		if (reviewMessageId === "rev-1") {
			return c.json(FIXTURE_REVIEW);
		}

		// Load the review message to confirm it exists.
		const [reviewMsg] = await db
			.select()
			.from(messages)
			.where(eq(messages.id, reviewMessageId))
			.limit(1);

		if (!reviewMsg) {
			return c.json({ error: "review_not_found" }, 404);
		}

		// Load staged op + outcome (if any) anchored to this review message.
		const [opRow] = await db
			.select({
				// staged op fields
				opId: stagedOperations.id,
				opStatus: stagedOperations.status,
				capabilityTool: stagedOperations.capabilityTool,
				operation: stagedOperations.operation,
				reversibility: stagedOperations.reversibility,
				artifactId: stagedOperations.artifactId,
				// outcome fields (null when no outcome yet)
				outcomeStatus: operationOutcomes.status,
				outcomePayload: operationOutcomes.payload,
				outcomeError: operationOutcomes.error,
				outcomeExecutedAt: operationOutcomes.executedAt,
			})
			.from(stagedOperations)
			.leftJoin(operationOutcomes, eq(operationOutcomes.stagedOperationId, stagedOperations.id))
			.where(eq(stagedOperations.reviewMessageId, reviewMessageId))
			.limit(1);

		// Build the response payload from the review message.
		const reviewPayload = JSON.parse(reviewMsg.payload) as Record<string, unknown>;

		if (!opRow) {
			// No staged op — descriptive review (no action_operation outcome to show).
			// Return the review payload as-is (no artifacts array mutation needed).
			return c.json({ ...reviewPayload });
		}

		// Build the StagedOperationView to nest on the artifact.
		// CRITICAL-2: field names must match StagedOperationView from review-composition.ts.
		//   stagedOperationId (not id), outcome.receipt (not outcome.payload).
		const outcome =
			opRow.outcomeStatus !== null && opRow.outcomeExecutedAt !== null
				? {
						status: opRow.outcomeStatus,
						// receipt: extracted tool-identity string (not the raw payload object)
						receipt: extractReceipt(opRow.outcomePayload),
						error: opRow.outcomeError ?? undefined,
						// @lore AL7: executedAt is humanized here (never raw ISO in the response).
						executedAt: relativeLong(opRow.outcomeExecutedAt),
					}
				: undefined;

		const stagedOperationView = {
			stagedOperationId: opRow.opId, // CRITICAL-2: stagedOperationId, not id
			status: opRow.opStatus,
			...(outcome !== undefined ? { outcome } : {}),
		};

		// Load the artifact to embed stagedOperation on it.
		// The artifact shapes vary by kind — we spread the existing artifact row
		// (which has id, kind, tool, etc.) and add the stagedOperation field.
		const [artifactRow] = await db
			.select()
			.from(artifacts)
			.where(eq(artifacts.id, opRow.artifactId))
			.limit(1);

		// Build the artifacts array: one artifact with the stagedOperation attached.
		// Other artifacts from reviewPayload.artifacts (if any) are preserved.
		const existingArtifacts = Array.isArray(reviewPayload.artifacts)
			? (reviewPayload.artifacts as Array<Record<string, unknown>>)
			: [];

		const artifactsWithOp = existingArtifacts.map((a) => {
			if (a.id === opRow.artifactId) {
				return { ...a, stagedOperation: stagedOperationView };
			}
			return a;
		});

		// If the artifact wasn't in the existing list, append it.
		if (!existingArtifacts.some((a) => a.id === opRow.artifactId)) {
			artifactsWithOp.push({
				id: opRow.artifactId,
				kind: artifactRow?.kind ?? "action_operation",
				tool: opRow.capabilityTool,
				app: opRow.capabilityTool,
				sourceHref: "",
				title: opRow.operation,
				payload: {},
				stagedOperation: stagedOperationView,
			});
		}

		return c.json({
			...reviewPayload,
			artifacts: artifactsWithOp,
		});
	});

	return app;
}
