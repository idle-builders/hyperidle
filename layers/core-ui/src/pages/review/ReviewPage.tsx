import type { AnchorRef, Message, ThreadView, VerdictDecision } from "@hyperidle/domain-model";
import { isRedactedPayload } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { BlockId } from "../../block/types.js";
import { ErrorState, PageHeader, PageScaffold } from "../../ds";
import { plainPayloadOf, reviewPayloadOf, verdictPayloadOf } from "../../ds/message-payload.js";
import { useCurrentUser } from "../../hooks/useCurrentUser.js";
import { useThread } from "../../hooks/useThread.js";
import { call } from "../../services/call.js";
import { relativeShort } from "../../utils/time.js";
import { ReviewComposition } from "./ReviewComposition.js";
import type { ComposedReviewSubject, ReviewComment } from "./review-composition.js";

export type ReviewLoader = (params: {
	readonly reviewId: string;
	readonly threadId: string;
	readonly thread: ThreadView;
}) => Promise<ComposedReviewSubject>;

interface ReviewPageProps {
	readonly loader?: ReviewLoader;
	readonly overrideReviewId?: string;
	readonly overrideThreadId?: string;
	readonly presentation?: "page" | "pane";
}

function isArtifactEntityRef(ref: {
	readonly kind: string;
}): ref is { readonly kind: "artifact"; readonly id: string } {
	return ref.kind === "artifact";
}

/**
 * The review's single conversation is the Thread attached to the work item.
 * Map the server's messages into ReviewComment shape, extracting anchored
 * comments from the blockId + artifact ref payload fields.
 */
function hostMessagesToReviewComments(
	messages: ReadonlyArray<Message>,
	identities: Record<string, { name: string; isAgent: boolean }>,
): ReadonlyArray<ReviewComment> {
	const result: ReviewComment[] = [];
	for (const m of messages) {
		if (m.type !== "plain") continue;
		const payload = plainPayloadOf(m);
		if (isRedactedPayload(payload)) continue;
		const entityRef = payload.refs?.find(isArtifactEntityRef);
		const blockIdString = payload.blockId;
		const spotLabel = payload.spotLabel;

		const identity = identities[m.senderId];
		const author = identity?.name ?? m.senderId;
		const authorIsAgent = identity?.isAgent === true;
		const blockId = blockIdString ? (blockIdString as BlockId) : undefined;
		const anchor: AnchorRef | undefined =
			entityRef && blockId ? { artifactId: entityRef.id, blockId, spotLabel } : undefined;

		result.push({
			id: m.id,
			author,
			authorIsAgent,
			body: payload.text,
			ago: relativeShort(m.createdAt),
			refs: anchor
				? [
						{
							kind: "artifact",
							label: anchor.spotLabel ?? anchor.artifactId,
							artifactId: anchor.artifactId,
							blockId,
							spotLabel,
						},
					]
				: undefined,
			anchor,
		});
	}
	return result;
}

/**
 * A verdict already given makes the surface read-only — find the one that
 * resolved THIS review; a thread may hold several. Shared between
 * `defaultLoader`'s initial composition and `ReviewPage`'s reactive overlay
 * (recomputed off `useThread`'s own data on every refresh, so a verdict
 * update never needs a second loader call — see @lore below `ReviewPage`).
 */
function findVerdictForReview(
	messages: ReadonlyArray<Message>,
	reviewId: string,
): { decision: VerdictDecision; resolvedAt: string } | undefined {
	let verdict: { decision: VerdictDecision; resolvedAt: string } | undefined;
	for (const m of messages) {
		if (m.type !== "verdict") continue;
		const payload = verdictPayloadOf(m);
		if (isRedactedPayload(payload) || payload.resolvesMessageId !== reviewId) continue;
		verdict = { decision: payload.decision, resolvedAt: m.createdAt };
	}
	return verdict;
}

/**
 * @lore `defaultLoader` composes the review subject from real rows the way
 * the old `/api/reviews/:id` route did — but the thread fetch itself is
 * `useThread`'s job, not this loader's. `ReviewPage` passes the
 * already-fetched `ThreadView` in; a second `open_thread` call here would
 * duplicate the one the hook already made (and the websocket nudge already
 * keeps live).
 *
 * The task the review belongs to: the server stamps `taskId` onto the
 * review payload from the agent's session (`ee37000af`,
 * `reviewPayloadSchema`) — when present, `open_task` names it and fills
 * `taskId`/`taskTitle`/`parentTaskId` from the returned task. No `taskId`
 * on the payload (older reviews, or a session with no task) or a refused
 * `open_task` (e.g. the task was deleted) both leave those fields honestly
 * empty rather than guessed, exactly as the deleted route left evidence it
 * did not have. `betTitle` has no successor action at all — there is no
 * "bet" row `open_task` (or anything else) returns — so it stays empty.
 */
async function defaultLoader({
	reviewId,
	threadId,
	thread,
}: {
	readonly reviewId: string;
	readonly threadId: string;
	readonly thread: ThreadView;
}): Promise<ComposedReviewSubject> {
	const { messages, members } = thread;
	const reviewMsg = messages.find((m) => m.id === reviewId);
	if (reviewMsg?.type !== "review") {
		throw new Error("review_not_found");
	}
	const reviewPayload = reviewPayloadOf(reviewMsg);
	const title = isRedactedPayload(reviewPayload) ? "Review" : reviewPayload.title;
	const reasoning = isRedactedPayload(reviewPayload) ? [] : reviewPayload.reasoning;
	const artifacts = isRedactedPayload(reviewPayload) ? [] : (reviewPayload.artifacts ?? []);
	const reviewTaskId = isRedactedPayload(reviewPayload) ? undefined : reviewPayload.taskId;

	// The payload names the task; `open_task` is the one place that task's
	// title and parent live. A refused lookup (task gone, no access) leaves
	// these undefined/null rather than blocking the page.
	let taskId: string | undefined;
	let taskTitle: string | undefined;
	let parentTaskId: string | null = null;
	if (reviewTaskId) {
		const openedTask = await call("open_task", { id: reviewTaskId });
		if (openedTask.ok) {
			taskId = openedTask.data.task.id;
			taskTitle = openedTask.data.task.title;
			parentTaskId = openedTask.data.task.parentTaskId;
		}
	}

	const identityById = new Map(members.map((m) => [m.id, m]));
	const author = identityById.get(reviewMsg.senderId);

	// The one human, other than the sender, in this thread — same "who has to
	// answer" question `routes/reviews.ts` asked, over `open_thread`'s own
	// member list instead of a second fetch.
	let reviewerName = "";
	for (const member of members) {
		if (member.id === reviewMsg.senderId) continue;
		if (!member.isAgent) {
			reviewerName = member.name;
			break;
		}
	}

	const verdict = findVerdictForReview(messages, reviewMsg.id);

	return {
		id: reviewMsg.id,
		threadId,
		title,
		parentTaskId,
		betTitle: "",
		taskId,
		taskTitle,
		prompt: reasoning.join("\n\n"),
		authorName: author?.name ?? reviewMsg.senderId,
		reviewerName,
		producedAgo: "",
		tokens: "",
		tools: [],
		outcome: reasoning.join("\n\n"),
		resultKpis: [],
		intent: [],
		needs: [],
		conversation: [],
		artifacts,
		blocking: verdict === undefined,
		...(verdict ? { verdict } : {}),
	};
}

/**
 * Production review destination.
 *
 * Loads the review Subject for the canonical route `/reviews/:reviewId`
 * (flattened from `/work/bet/:betId/review/:reviewId`) and renders the
 * ReviewComposition surface. The optional `loader` prop is used by tests to
 * avoid a real fetch.
 */
export function ReviewPage({
	loader = defaultLoader,
	overrideReviewId,
	overrideThreadId,
	presentation = "page",
}: ReviewPageProps = {}): JSX.Element {
	const { reviewId: routeReviewId = "" } = useParams<{ reviewId: string }>();
	const [searchParams] = useSearchParams();
	const reviewId = overrideReviewId ?? routeReviewId;
	const threadId = overrideThreadId ?? searchParams.get("threadId") ?? "";
	const [subject, setSubject] = useState<ComposedReviewSubject | null>(null);
	const [error, setError] = useState<Error | null>(null);
	const [verdictError, setVerdictError] = useState<string | null>(null);
	const { user } = useCurrentUser();

	// The route's own `threadId` search param names the thread directly,
	// instead of guessing it from a host lookup (a by-host lookup resolves the
	// first thread for that host — the WRONG thread whenever a host has more
	// than one). This is also the ONE fetch of thread data on the page —
	// `defaultLoader` below composes the review subject from `threadDetail.data`
	// rather than fetching it again itself.
	const threadDetail = useThread(threadId);

	// `subject` holds the mostly-static composition (title, task naming,
	// reasoning, artifacts) loaded once. `conversation` and `verdict`/`blocking`
	// are recomputed here on every `threadDetail.data` change instead of via a
	// second loader call — this is what "derive from useThread's data" means:
	// a post or a verdict submit below only calls `threadDetail.refresh()`
	// (ONE refetch), and this overlay reacts to the result — one source of
	// truth for thread data.
	const reviewSubject = useMemo<ComposedReviewSubject | null>(() => {
		if (!subject) return null;
		const threadMessages = threadDetail.data?.messages;
		const identities: Record<string, { name: string; isAgent: boolean }> = threadDetail.data
			? Object.fromEntries(
					threadDetail.data.members.map((m) => [m.id, { name: m.name, isAgent: m.isAgent }]),
				)
			: {};
		const threadComments =
			threadMessages && threadMessages.length > 0
				? hostMessagesToReviewComments(threadMessages, identities)
				: undefined;
		const verdict = threadMessages
			? findVerdictForReview(threadMessages, subject.id)
			: subject.verdict;
		return {
			...subject,
			...(threadComments ? { conversation: threadComments } : {}),
			verdict,
			blocking: verdict === undefined,
		};
	}, [subject, threadDetail.data]);

	// `threadDetail.data` is read through this ref rather than as a dep so its
	// later changes never re-invoke `loader` — those changes are handled by the
	// `reviewSubject` overlay above (conversation/verdict). Reading via a ref
	// (never a listed dependency) is the honest way to keep this effect keyed
	// on `threadDetail.status` transitioning to "ready", not on data identity.
	const threadDataRef = useRef(threadDetail.data);
	threadDataRef.current = threadDetail.data;

	useEffect(() => {
		// No thread id at all is a bad link, not a loading state — handled by
		// the dedicated render branch below. Never wait
		// on `useThread("")` here.
		if (!threadId) return;
		if (threadDetail.status === "error" || threadDetail.status === "not-found") {
			setError(new Error(threadDetail.error ?? "Could not load review"));
			return;
		}
		const data = threadDataRef.current;
		if (threadDetail.status !== "ready" || !data) return;
		let cancelled = false;
		loader({ reviewId, threadId, thread: data })
			.then((s) => {
				if (!cancelled) {
					setSubject(s);
					setError(null);
				}
			})
			.catch((e: unknown) => {
				if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
			});
		return () => {
			cancelled = true;
		};
	}, [reviewId, threadId, loader, threadDetail.status, threadDetail.error]);

	const handlePostComment = useCallback(
		async ({ text, anchor }: { text: string; anchor?: AnchorRef }) => {
			if (!(user && reviewId && reviewSubject)) return;
			// The review message already lives in a thread — there is always one
			// to post to, so no resolve-or-create fallback is needed.
			const res = await call("send_message", {
				threadId: reviewSubject.threadId,
				text,
				clientKey: crypto.randomUUID(),
				...(anchor
					? {
							blockId: anchor.blockId,
							spotLabel: anchor.spotLabel,
							refs: [{ kind: "artifact" as const, id: anchor.artifactId }],
						}
					: {}),
			});
			if (!res.ok) throw new Error(res.problems[0]?.message ?? "Failed to post comment");
			// The conversation is derived from `threadDetail.data` above — a single
			// refresh is the only refetch a post needs.
			threadDetail.refresh();
		},
		[reviewId, reviewSubject, threadDetail, user],
	);

	const handleSubmitVerdict = useCallback(
		async (decision: VerdictDecision) => {
			if (!(reviewSubject && reviewId && user)) return;
			// The verdict resolves a specific type:"review" message. The route
			// `reviewId` IS that message's id — the OpenTarget is built directly
			// from the review Message (`components/parts/part.ts` reviewTarget:
			// { reviewId: message.id }), and the server resolves the exact
			// resolvesMessageId supplied. Reviews re-open by design, so a thread
			// can hold multiple review messages; only the route's id is correct.
			const reviewMessageId = reviewId;

			const res = await call("send_message", {
				threadId: reviewSubject.threadId,
				clientKey: crypto.randomUUID(),
				verdict: { decision, resolvesMessageId: reviewMessageId },
			});
			// A refused verdict — a race another verdict already won, or the
			// sender lacking authority — comes back as `{ok:false, problems}`.
			// That is a control-level rejection, not a page load failure: it goes
			// in `verdictError` next to the verdict control, and the review stays
			// visible. `error` stays reserved for the page
			// failing to load at all.
			setVerdictError(res.ok ? null : (res.problems[0]?.message ?? "Failed to submit verdict"));
			// Either way we refresh so the surface shows the authoritative
			// resolved state rather than a stale/optimistic one — the verdict
			// overlay above reacts to it, so this is the only refetch a verdict
			// submission needs.
			threadDetail.refresh();
		},
		[reviewId, reviewSubject, threadDetail, user],
	);

	if (!threadId) {
		return (
			<PageScaffold
				frame={presentation === "page" ? "page" : "local"}
				header={<PageHeader presentation={presentation} title="Review" />}
			>
				<div className="p-[24px]">
					<ErrorState
						title="Could not load review"
						description="This review link is missing its conversation."
					/>
				</div>
			</PageScaffold>
		);
	}

	if (error) {
		return (
			<PageScaffold
				frame={presentation === "page" ? "page" : "local"}
				header={<PageHeader presentation={presentation} title="Review" />}
			>
				<div className="p-[24px]">
					<ErrorState title="Could not load review" description={error.message} />
				</div>
			</PageScaffold>
		);
	}

	if (!(subject && reviewSubject)) {
		return (
			<PageScaffold
				frame={presentation === "page" ? "page" : "local"}
				header={<PageHeader presentation={presentation} title="Review" />}
			>
				<div className="p-[24px] text-[var(--text-secondary)]">Loading review…</div>
			</PageScaffold>
		);
	}

	return (
		// @lore AZ2: ReviewComposition already owns its own scroll contract
		// internally (reviewListPane / ExaminePane both nest <PageScaffold>) — it
		// only needs a bounded flex column to size against, the managed body's job.
		<PageScaffold body="managed">
			{verdictError ? (
				// A refused verdict is a control-level rejection,
				// not a page load failure — it renders here, right above the verdict
				// control ReviewComposition's FrameHeader owns, using the same inline
				// alert styling `ds/Composer.tsx` uses for its own send failures. The
				// review composition below stays mounted and interactive.
				<div
					role="alert"
					className="type-metadata  border-width-thin-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[24px] py-[9px]  text-[var(--status-error)]"
				>
					{verdictError}
				</div>
			) : null}
			<ReviewComposition
				subject={reviewSubject}
				onSubmitVerdict={handleSubmitVerdict}
				onPostComment={user ? handlePostComment : undefined}
				threadId={subject.threadId}
				presentation={presentation}
			/>
		</PageScaffold>
	);
}

// @lore AU28: AL3 re-exported `REVIEW_COMPOSITION_SUBJECT` from this production module
// so tests and stories could reach it. That made a shipping page import a fixture for no
// runtime reason — `defaultLoader` never used it. The five consumers all import the
// fixture directly from `./__fixtures__/review-composition.fixture.js`.
