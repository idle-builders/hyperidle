import type {
	CaptureProposedCallRequest,
	ConsumeTailoredGrantRequest,
	ProposedCallOutcomeResult,
} from "@hyperidle/api-contract";
import { findMessage } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import { findProposedCall, recordProposedCall, transitionProposedCall } from "@hyperidle/review";
import * as work from "@hyperidle/work";
import { Hono } from "hono";

/**
 * AL7 trust-first — Reviews route: GET /api/reviews/:reviewMessageId
 *
 * Returns a ComposedReviewSubject-shaped response with any proposed call
 * nested inside the matching artifact (action_operation kind) in the artifacts array.
 *
 * The loader:
 * - Queries proposed_calls LEFT JOIN operation_outcomes by reviewMessageId
 * - Nests proposedCall (with verbatim args) on the matching action_operation artifact (AC10b)
 * - Returns executedAt as raw ISO (client formats with relativeShort)
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
	// `ComposedReviewSubject.threadId` is a required string — `ReviewPage`
	// fetches and posts to it directly (never guessing via a host lookup).
	// The fixture needs its own value so this loader's contract stays total
	// even on the demo path: without it the client's verdict guard (which
	// checks `reviewSubject`, not `threadId`) would let a POST reach
	// `/api/threads/undefined/messages`.
	threadId: "thread:AL3:fixture",
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

	app.get("/:reviewMessageId", async (c) => {
		const reviewMessageId = c.req.param("reviewMessageId");

		// Stub fixture path for design/demo (plan §7: keep the stub data).
		if (reviewMessageId === "rev-1") {
			return c.json(FIXTURE_REVIEW);
		}

		// Load the review message to confirm it exists.
		const reviewMsg = await findMessage(db, { id: reviewMessageId });

		if (!reviewMsg) {
			return c.json({ error: "review_not_found" }, 404);
		}

		// AL7 trust-first: load proposed call + outcome (if any) anchored to this review message.
		// WARNING-2: args are returned verbatim (not a summary) so the human approves the real call.
		const pcView = await findProposedCall(db, {
			by: { reviewMessageId },
			include: { outcome: true },
		});

		// Build the response payload from the review message.
		const reviewPayload = JSON.parse(reviewMsg.payload) as Record<string, unknown>;

		if (!pcView) {
			// No proposed call — descriptive review (no action_operation outcome
			// to show). The review's OWN threadId is always composed (never read
			// from the payload) so the client fetches the thread directly by id
			// instead of guessing it from a by-host lookup.
			//
			// @lore layer, never replace: a resolved `artifactRef` is APPENDED to
			// whatever `artifacts` the payload already carries (never to an empty
			// list, and never in place of it).
			const artifactRef = reviewPayload.artifactRef as { readonly id?: unknown } | undefined;
			const artifactRefId = typeof artifactRef?.id === "string" ? artifactRef.id : undefined;
			const referencedArtifact = artifactRefId
				? await work.get(db, "artifact", artifactRefId)
				: undefined;

			if (!referencedArtifact) {
				return c.json({ ...reviewPayload, threadId: reviewMsg.threadId });
			}

			// `ReviewArtifact` (the shape the review UI renders every entry as,
			// `layers/core-ui/src/pages/review/review-artifact.ts`) requires
			// `tool`/`app`/`title`/`payload` — every entry is rendered through
			// `ToolLogo`/`KindBadge`/a canvas component with no per-field
			// optionality, so leaving any of them out crashes the page, not just
			// looks incomplete. A bare stored artifact has no per-tool
			// provenance (no SaaS connector produced it), so `tool`/`app` use
			// the same self-attributed sentinel the fixtures already use for
			// HyperIdle-native evidence (`"hyperidle"`/`"HyperIdle"`, see
			// `review-subject.ts`'s `outcomeArtifact`) rather than fabricating a
			// false external identity. `title` falls back to the artifact's own
			// id when it has no `label` — never blank. `sourceHref` is a real,
			// derivable value — the artifact's own permalink. `payload` is
			// intentionally opaque (`{}`), matching the proposed-call branch's
			// own convention below for an artifact with no per-kind payload.
			const resolved: Record<string, unknown> = {
				id: referencedArtifact.id,
				tool: "hyperidle",
				app: "HyperIdle",
				kind: referencedArtifact.kind,
				sourceHref: `/artifacts/${referencedArtifact.id}`,
				title: referencedArtifact.label ?? referencedArtifact.id,
				payload: {},
			};
			const existingArtifacts = Array.isArray(reviewPayload.artifacts)
				? (reviewPayload.artifacts as Array<Record<string, unknown>>)
				: [];
			return c.json({
				...reviewPayload,
				threadId: reviewMsg.threadId,
				artifacts: [...existingArtifacts, resolved],
			});
		}

		// Build the ProposedCallView to nest on the artifact.
		// AC10b (WARNING-2): args are the verbatim captured object, not a summary string.
		// The human sees the real call before approving.
		const outcome =
			pcView.outcome != null
				? {
						status: pcView.outcome.status,
						receipt: pcView.outcome.receipt ?? undefined,
						error: pcView.outcome.error ?? undefined,
						// @lore AL7: executedAt returned as raw ISO; client formats with relativeShort.
						executedAt: pcView.outcome.executedAt ?? undefined,
					}
				: undefined;

		const proposedCallView = {
			proposedCallId: pcView.call.id,
			toolId: pcView.call.toolId,
			// WARNING-2: verbatim captured args (deep-equal to what the agent called)
			args: JSON.parse(pcView.call.args) as Record<string, unknown>,
			status: pcView.call.status,
			...(outcome !== undefined ? { outcome } : {}),
		};

		// Load the artifact to embed proposedCall on it.
		const artifactRow = await work.get(db, "artifact", pcView.call.artifactId);

		// Build the artifacts array: one artifact with proposedCall attached.
		const existingArtifacts = Array.isArray(reviewPayload.artifacts)
			? (reviewPayload.artifacts as Array<Record<string, unknown>>)
			: [];

		const artifactsWithOp = existingArtifacts.map((a) => {
			if (a.id === pcView.call.artifactId) {
				return { ...a, proposedCall: proposedCallView };
			}
			return a;
		});

		// If the artifact wasn't in the existing list, append it.
		if (!existingArtifacts.some((a) => a.id === pcView.call.artifactId)) {
			artifactsWithOp.push({
				id: pcView.call.artifactId,
				kind: artifactRow?.kind ?? "action_operation",
				tool: pcView.call.toolId,
				app: pcView.call.toolId,
				sourceHref: "",
				title: pcView.call.toolId,
				payload: {},
				proposedCall: proposedCallView,
			});
		}

		return c.json({
			...reviewPayload,
			threadId: reviewMsg.threadId,
			artifacts: artifactsWithOp,
		});
	});

	// -------------------------------------------------------------------------
	// AU31 §2.5 — the AL7 trust-first workflow's three write ops, crossing the
	// seam as `CoreApiPort.review`. The moved tool dispatch
	// (`@hyperidle/tool-handlers`'s relocated `buildToolRegistry`, now
	// agent-orchestration's own Service) reaches `review`'s owned tables
	// through this one door instead of importing `@hyperidle/review` directly
	// (which would be an orchestration → core-api service import after the
	// move). Reachable by any authenticated caller like every other mounted
	// route (``) — a consistency gate's
	// placement, not a security boundary (ETHOS: no preemptive wall), same
	// reasoning as `routes/filesystems.ts`'s injection-persist route.
	// -------------------------------------------------------------------------

	app.post("/proposed-calls", async (c) => {
		const input = (await c.req.json()) as CaptureProposedCallRequest;
		const result = await recordProposedCall(db, input);
		return c.json(result);
	});

	app.post("/proposed-calls/consume", async (c) => {
		const input = (await c.req.json()) as ConsumeTailoredGrantRequest;
		const result = await transitionProposedCall(db, {
			to: "consumed",
			taskId: input.taskId,
			agentId: input.agentId,
			toolId: input.toolId,
		});
		return c.json(result);
	});

	app.post("/proposed-calls/:id/outcome", async (c) => {
		const id = c.req.param("id");
		const { result } = (await c.req.json()) as { readonly result: ProposedCallOutcomeResult };
		await transitionProposedCall(db, { to: "outcome-recorded", id, result });
		return c.json({ ok: true });
	});

	return app;
}
