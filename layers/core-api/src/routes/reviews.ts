import { findMessage, findThread, listMessages } from "@hyperidle/thread";
import type { HyperIdleDb } from "@hyperidle/db";
import * as work from "@hyperidle/task";
import { findUser } from "@hyperidle/users";
import { Hono } from "hono";

/**
 * Reviews route: GET /api/reviews/:reviewMessageId
 *
 * Returns the review the surface at `/reviews/:id` renders, composed from real
 * rows: the review message, the task its thread hangs off, that task's parent,
 * the agent that filed it and the human who has to answer.
 *
 * @lore BA2: this used to return `{...payload, threadId}` and nothing else. The
 * page's subject type requires `artifacts`, `conversation`, `intent`, `needs`
 * and `resultKpis` — it calls `.find`/`.filter`/`.map` on them unconditionally —
 * so a real agent review, which carries only a title and reasoning, crashed the
 * page with "Something went wrong". Nothing caught it because the only reviews
 * that ever reached this route in tests came from fixtures that were already
 * whole. A human could file nothing and answer nothing; the loop was open at the
 * step it exists for.
 *
 * Where the truth is "we have none of that", the answer is an empty list, never
 * an invented one: no artifacts, no measured KPIs, no acceptance conditions we
 * track, no findings. `tokens`/`tools` are likewise left blank rather than
 * guessed — the surface renders nothing for an empty string, which is the honest
 * outcome. The agent's reasoning becomes the outcome text because that is the
 * only place the surface shows it, and a review whose reasoning is invisible is
 * a review a human cannot judge.
 *
 * @lore artifacts-become-knowledge: `artifacts` is now exactly the canvas list
 * the payload carries. The route used to ALSO resolve an `artifactRef` against
 * the `artifacts` table and append the row it found; that table is gone, and a
 * `producedItemId` names a knowledge item, which is not a review canvas and has
 * no canvas kind to render as. It travels through on the payload for a caller
 * that wants to link to it, rather than being dressed up as evidence here.
 */

interface VerdictMessagePayload {
	readonly decision?: unknown;
	readonly resolvesMessageId?: unknown;
}

export function createReviewRoutes(db: HyperIdleDb): Hono {
	const app = new Hono();

	app.get("/:reviewMessageId", async (c) => {
		const reviewMessageId = c.req.param("reviewMessageId");

		const reviewMsg = await findMessage(db, { id: reviewMessageId });
		if (!reviewMsg) {
			return c.json({ error: "review_not_found" }, 404);
		}

		const reviewPayload = JSON.parse(reviewMsg.payload) as Record<string, unknown>;
		const title = typeof reviewPayload.title === "string" ? reviewPayload.title : "Review";
		const reasoning = Array.isArray(reviewPayload.reasoning)
			? (reviewPayload.reasoning as ReadonlyArray<unknown>).filter(
					(r): r is string => typeof r === "string",
				)
			: [];

		// The thread the review lives in hangs off the task the agent was working
		// on (`submit_review` anchors it there), which is where the task, its
		// parent and the human who has to answer all come from.
		const thread = await findThread(db, { id: reviewMsg.threadId });
		const task =
			thread?.hostKind === "task" ? await work.get(db, "task", thread.hostId) : undefined;
		const parentTaskId = task?.parentTaskId ?? null;
		const parentTask = parentTaskId ? await work.get(db, "task", parentTaskId) : undefined;

		const author = await findUser(db, { id: reviewMsg.senderId });
		const participants = thread ? (JSON.parse(thread.participants) as ReadonlyArray<string>) : [];
		let reviewerName = "";
		for (const participantId of participants) {
			if (participantId === reviewMsg.senderId) continue;
			const candidate = await findUser(db, { id: participantId });
			if (candidate?.kind === "human") {
				reviewerName = candidate.name;
				break;
			}
		}

		// A verdict already given is what makes the surface read-only. Find the
		// one that resolved THIS review — a thread may hold several reviews.
		const threadMessages = await listMessages(db, { threadId: reviewMsg.threadId });
		let verdict: { decision: string; resolvedAt: string } | undefined;
		for (const m of threadMessages) {
			if (m.type !== "verdict") continue;
			const payload = JSON.parse(m.payload) as VerdictMessagePayload;
			if (payload.resolvesMessageId !== reviewMessageId) continue;
			if (typeof payload.decision !== "string") continue;
			verdict = { decision: payload.decision, resolvedAt: m.createdAt };
		}

		// The canvas evidence the payload carries, and nothing else. An empty
		// list is the honest answer to "what is attached" when it carries none —
		// the surface calls `.find` on it unconditionally, so absence crashes it.
		const artifacts = Array.isArray(reviewPayload.artifacts)
			? (reviewPayload.artifacts as Array<Record<string, unknown>>)
			: [];

		// @lore layer, never replace: the composed fields go UNDER the payload,
		// not over it. A review that already carries `tokens` or its own
		// `artifacts` keeps them; composition only fills what is missing.
		// Spreading the payload first and the defaults after silently blanked a
		// demo review's own values.
		return c.json({
			id: reviewMsg.id,
			title,
			parentTaskId,
			betTitle: parentTask?.title ?? "",
			...(task ? { taskId: task.id, taskTitle: task.title } : {}),
			// What the agent was asked to do — the task in its own words.
			prompt: task?.description ?? task?.title ?? "",
			authorName: author?.name ?? reviewMsg.senderId,
			reviewerName,
			// The surface renders nothing for an empty string. We do not meter a
			// session's spend or tool use onto a review, so we say nothing.
			producedAgo: "",
			tokens: "",
			tools: [],
			// The agent's own account of what it did and wants to do. This is the
			// substance of the review and the only place the surface shows it.
			outcome: reasoning.join("\n\n"),
			resultKpis: [],
			intent: [],
			needs: [],
			// Filled in by the page from the review's own thread.
			conversation: [],
			...reviewPayload,
			// Composed from rows rather than carried on the payload, so these win
			// over anything a payload happens to hold under the same name.
			threadId: reviewMsg.threadId,
			artifacts,
			blocking: verdict === undefined,
			...(verdict ? { verdict } : {}),
		});
	});

	return app;
}
