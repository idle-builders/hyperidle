import { type HyperIdleDb, messages, operationOutcomes, stagedOperations } from "@hyperidle/db";
import { relativeLong } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";

/**
 * AL7 — Reviews route: GET /api/reviews/:reviewMessageId
 *
 * Returns the review message plus any staged operation (+ executed outcome)
 * anchored to that review message. The loader:
 * - Queries staged_operations LEFT JOIN operation_outcomes by reviewMessageId
 * - Humanizes executedAt at the response boundary (never raw ISO)
 * - Returns 404 if the review message doesn't exist
 * - Returns 200 with no `stagedOperation` field if there's no staged op
 *
 * @lore AL7: The reviewed message ID is used as the dispatch key (C1 fix).
 * The loader returns the stagedOperation directly embedded in the review
 * response so the UI can show execution status without a separate request.
 */
export function createReviewRoutes(db: HyperIdleDb): Hono {
	const app = new Hono();

	app.get("/:reviewMessageId", requireBoundary({ kind: "public-data" }), async (c) => {
		const reviewMessageId = c.req.param("reviewMessageId");

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

		// Build the response payload.
		const reviewPayload = JSON.parse(reviewMsg.payload) as Record<string, unknown>;

		if (!opRow) {
			// No staged op — descriptive review (no action_operation).
			return c.json({ ...reviewPayload });
		}

		// Humanize executedAt at the response boundary.
		const outcome =
			opRow.outcomeStatus !== null && opRow.outcomeExecutedAt !== null
				? {
						status: opRow.outcomeStatus,
						payload: opRow.outcomePayload ? JSON.parse(opRow.outcomePayload) : null,
						error: opRow.outcomeError ?? null,
						// @lore AL7: executedAt is humanized here (never raw ISO in the response).
						// The component never parses time — it displays the string as-is.
						executedAt: relativeLong(opRow.outcomeExecutedAt),
					}
				: undefined;

		return c.json({
			...reviewPayload,
			stagedOperation: {
				id: opRow.opId,
				status: opRow.opStatus,
				capabilityTool: opRow.capabilityTool,
				operation: opRow.operation,
				reversibility: opRow.reversibility,
				...(outcome !== undefined ? { outcome } : {}),
			},
		});
	});

	return app;
}
