import { ErrorState, PageHeader, PageScaffold } from "@hyperidle/design-system";
import type {
	AnchorRef,
	BlockId,
	HostKind,
	Message,
	PlainPayload,
	VerdictDecision,
} from "@hyperidle/domain-model";
import { isRedactedPayload } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useCurrentUser } from "../../hooks/useCurrentUser.js";
import type { HostThreadIdentity } from "../../hooks/useHostThread.js";
import { useHostThread } from "../../hooks/useHostThread.js";
import { apiFetch } from "../../services/api-fetch.js";
import {
	postPlainHostMessage,
	postVerdictHostMessage,
	resolveOrCreateHostThread,
} from "../../services/host-threads.js";
import { relativeShort } from "../../utils/time.js";
import { ReviewComposition } from "./ReviewComposition.js";
import type { ComposedReviewSubject, ReviewComment } from "./review-composition.js";

export type ReviewLoader = (params: {
	readonly betId: string;
	readonly reviewId: string;
}) => Promise<ComposedReviewSubject>;

interface ReviewPageProps {
	readonly loader?: ReviewLoader;
	readonly overrideBetId?: string;
	readonly overrideReviewId?: string;
	readonly presentation?: "page" | "pane";
}

async function defaultLoader({
	reviewId,
}: {
	readonly reviewId: string;
}): Promise<ComposedReviewSubject> {
	const res = await apiFetch(`/api/reviews/${encodeURIComponent(reviewId)}`);
	if (!res.ok) {
		throw new Error(`Could not load review: ${res.status}`);
	}
	return (await res.json()) as ComposedReviewSubject;
}

function isArtifactEntityRef(ref: {
	readonly kind: string;
}): ref is { readonly kind: "artifact"; readonly id: string } {
	return ref.kind === "artifact";
}

/**
 * AL4: The review's single conversation is the Thread attached to the work item.
 * Map the server's messages into ReviewComment shape, extracting anchored
 * comments from the blockId + artifact ref payload fields.
 */
function hostMessagesToReviewComments(
	messages: ReadonlyArray<Message>,
	identities: Record<string, HostThreadIdentity>,
): ReadonlyArray<ReviewComment> {
	const result: ReviewComment[] = [];
	for (const m of messages) {
		if (m.type !== "plain") continue;
		if (isRedactedPayload(m.payload)) continue;
		const payload = m.payload as PlainPayload;
		const payloadRecord = payload as { blockId?: unknown; spotLabel?: unknown };
		const artifactRef = payload.refs?.find(isArtifactEntityRef);
		const blockIdString =
			typeof payloadRecord.blockId === "string" ? payloadRecord.blockId : undefined;
		const spotLabel =
			typeof payloadRecord.spotLabel === "string" ? payloadRecord.spotLabel : undefined;

		const identity = identities[m.senderId];
		const author = identity?.name ?? m.senderId;
		const authorIsAgent = identity?.role === "agent" || m.senderId.startsWith("agent");
		const blockId = blockIdString ? (blockIdString as BlockId) : undefined;
		const anchor: AnchorRef | undefined =
			artifactRef && blockId ? { artifactId: artifactRef.id, blockId, spotLabel } : undefined;

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
 * AL3 — production review destination.
 *
 * Loads the review Subject for the canonical route
 * `/work/bet/:betId/review/:reviewId` and renders the ReviewComposition surface.
 * The optional `loader` prop is used by tests to avoid a real fetch.
 */
export function ReviewPage({
	loader = defaultLoader,
	overrideBetId,
	overrideReviewId,
	presentation = "page",
}: ReviewPageProps = {}): JSX.Element {
	const { betId: routeBetId = "", reviewId: routeReviewId = "" } = useParams<{
		betId: string;
		reviewId: string;
	}>();
	const betId = overrideBetId ?? routeBetId;
	const reviewId = overrideReviewId ?? routeReviewId;
	const [subject, setSubject] = useState<ComposedReviewSubject | null>(null);
	const [error, setError] = useState<Error | null>(null);
	const { user } = useCurrentUser();

	const hostId = subject?.taskId ?? subject?.betId ?? "";
	const hostKind: HostKind = subject?.taskId ? "task" : "bet";
	const hostThread = useHostThread(hostKind, hostId);

	const reviewSubject = useMemo<ComposedReviewSubject | null>(() => {
		if (!subject) return null;
		const threadComments =
			hostThread.data?.messages && hostThread.data.messages.length > 0
				? hostMessagesToReviewComments(hostThread.data.messages, hostThread.data.identities)
				: undefined;
		if (!threadComments) return subject;
		return { ...subject, conversation: threadComments };
	}, [subject, hostThread.data]);

	useEffect(() => {
		let cancelled = false;
		loader({ betId, reviewId })
			.then((s) => {
				if (!cancelled) setSubject(s);
			})
			.catch((e: unknown) => {
				if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
			});
		return () => {
			cancelled = true;
		};
	}, [betId, reviewId, loader]);

	const handlePostComment = useCallback(
		async ({ text, anchor }: { text: string; anchor?: AnchorRef }) => {
			if (!(user && reviewId && reviewSubject)) return;
			const threadId = hostThread.data?.thread.id;
			const activeThreadId =
				threadId ?? (await resolveOrCreateHostThread(hostKind, hostId, user.id, null));
			await postPlainHostMessage(activeThreadId, text, crypto.randomUUID(), undefined, anchor);
			hostThread.refresh();
			const refreshed = await loader({ betId, reviewId });
			setSubject(refreshed);
		},
		[betId, hostId, hostKind, hostThread, loader, reviewId, reviewSubject, user],
	);

	const handleSubmitVerdict = useCallback(
		async (decision: VerdictDecision) => {
			const threadId = hostThread.data?.thread.id;
			if (!(threadId && reviewId && user)) return;
			// The verdict resolves a specific type:"review" message. The route
			// `reviewId` IS that message's id — the OpenTarget is built directly
			// from the review Message (`shared/src/part.ts` reviewTarget:
			// { reviewId: message.id }), and the server resolves the exact
			// resolvesMessageId supplied. Reviews re-open by design, so a thread
			// can hold multiple review messages; only the route's id is correct.
			const reviewMessageId = reviewId;

			// postVerdictHostMessage returns "ok" | "race" | "forbidden" without
			// throwing for the two expected non-OK conditions. On success the review
			// is resolved; on a race (409) another verdict already won; on forbidden
			// (403) the sender lacked authority. In every case we refresh so the
			// surface shows the authoritative resolved state, not a stale/optimistic
			// one — which is also how the user sees a race/authz failure surface.
			await postVerdictHostMessage(threadId, decision, reviewMessageId, crypto.randomUUID());
			hostThread.refresh();
			const refreshed = await loader({ betId, reviewId });
			setSubject(refreshed);
		},
		[betId, hostThread, loader, reviewId, user],
	);

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
			<ReviewComposition
				subject={reviewSubject}
				onSubmitVerdict={handleSubmitVerdict}
				onPostComment={user ? handlePostComment : undefined}
				threadId={hostThread.data?.thread.id ?? ""}
				presentation={presentation}
			/>
		</PageScaffold>
	);
}

// @lore AU28: AL3 re-exported `REVIEW_COMPOSITION_SUBJECT` from this production module
// so tests and stories could reach it. That made a shipping page import a fixture for no
// runtime reason — `defaultLoader` never used it. The five consumers all import the
// fixture directly from `./__fixtures__/review-composition.fixture.js`.
