import { artifacts, type HyperIdleDb, operationOutcomes, proposedCalls } from "@hyperidle/db";
import { relativeLong } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import { getMessageById } from "@hyperidle/core-app";

/**
 * AL7 trust-first — Reviews route: GET /api/reviews/:reviewMessageId
 *
 * Returns a ComposedReviewSubject-shaped response with any proposed call
 * nested inside the matching artifact (action_operation kind) in the artifacts array.
 *
 * The loader:
 * - Queries proposed_calls LEFT JOIN operation_outcomes by reviewMessageId
 * - Nests proposedCall (with verbatim args) on the matching action_operation artifact (AC10b)
 * - Humanizes executedAt at the response boundary (never raw ISO)
 * - Returns 404 if the review message doesn't exist
 * - Returns the stub fixture for "rev-1" (design/demo route)
 *
 * @lore AL7 WARNING-2: args are returned verbatim (not a summary string) so the
 * human sees the real call before approving. This is User Sovereignty (ETHOS §3),
 * not exact-match enforcement.
 *
 * @lore AL7 Task 10: renamed from staged-operation loader. proposedCall replaces
 * stagedOperation on the artifact shape; proposed_call_executed replaces
 * operation_executed in the event subscriber.
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

export function createReviewRoutes(db: HyperIdleDb): Hono {
	const app = new Hono();

	app.get("/:reviewMessageId", requireBoundary({ kind: "public-data" }), async (c) => {
		const reviewMessageId = c.req.param("reviewMessageId");

		// Stub fixture path for design/demo (plan §7: keep the stub data).
		if (reviewMessageId === "rev-1") {
			return c.json(FIXTURE_REVIEW);
		}

		// Load the review message to confirm it exists.
		const reviewMsg = await getMessageById(db, reviewMessageId);

		if (!reviewMsg) {
			return c.json({ error: "review_not_found" }, 404);
		}

		// AL7 trust-first: load proposed call + outcome (if any) anchored to this review message.
		// WARNING-2: args are returned verbatim (not a summary) so the human approves the real call.
		const [opRow] = await db
			.select({
				// proposed call fields
				pcId: proposedCalls.id,
				pcStatus: proposedCalls.status,
				toolId: proposedCalls.toolId,
				args: proposedCalls.args,
				artifactId: proposedCalls.artifactId,
				// outcome fields (null when no outcome yet)
				outcomeStatus: operationOutcomes.status,
				outcomeReceipt: operationOutcomes.receipt,
				outcomeError: operationOutcomes.error,
				outcomeExecutedAt: operationOutcomes.executedAt,
			})
			.from(proposedCalls)
			.leftJoin(operationOutcomes, eq(operationOutcomes.proposedCallId, proposedCalls.id))
			.where(eq(proposedCalls.reviewMessageId, reviewMessageId))
			.limit(1);

		// Build the response payload from the review message.
		const reviewPayload = JSON.parse(reviewMsg.payload) as Record<string, unknown>;

		if (!opRow) {
			// No proposed call — descriptive review (no action_operation outcome to show).
			return c.json({ ...reviewPayload });
		}

		// Build the ProposedCallView to nest on the artifact.
		// AC10b (WARNING-2): args are the verbatim captured object, not a summary string.
		// The human sees the real call before approving.
		const outcome =
			opRow.outcomeStatus !== null && opRow.outcomeExecutedAt !== null
				? {
						status: opRow.outcomeStatus,
						receipt: opRow.outcomeReceipt ?? undefined,
						error: opRow.outcomeError ?? undefined,
						// @lore AL7: executedAt is humanized here (never raw ISO in the response).
						executedAt: relativeLong(opRow.outcomeExecutedAt),
					}
				: undefined;

		const proposedCallView = {
			proposedCallId: opRow.pcId,
			toolId: opRow.toolId,
			// WARNING-2: verbatim captured args (deep-equal to what the agent called)
			args: JSON.parse(opRow.args) as Record<string, unknown>,
			status: opRow.pcStatus,
			...(outcome !== undefined ? { outcome } : {}),
		};

		// Load the artifact to embed proposedCall on it.
		const [artifactRow] = await db
			.select()
			.from(artifacts)
			.where(eq(artifacts.id, opRow.artifactId))
			.limit(1);

		// Build the artifacts array: one artifact with proposedCall attached.
		const existingArtifacts = Array.isArray(reviewPayload.artifacts)
			? (reviewPayload.artifacts as Array<Record<string, unknown>>)
			: [];

		const artifactsWithOp = existingArtifacts.map((a) => {
			if (a.id === opRow.artifactId) {
				return { ...a, proposedCall: proposedCallView };
			}
			return a;
		});

		// If the artifact wasn't in the existing list, append it.
		if (!existingArtifacts.some((a) => a.id === opRow.artifactId)) {
			artifactsWithOp.push({
				id: opRow.artifactId,
				kind: artifactRow?.kind ?? "action_operation",
				tool: opRow.toolId,
				app: opRow.toolId,
				sourceHref: "",
				title: opRow.toolId,
				payload: {},
				proposedCall: proposedCallView,
			});
		}

		return c.json({
			...reviewPayload,
			artifacts: artifactsWithOp,
		});
	});

	return app;
}
