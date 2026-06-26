import type {
	AdoptionView,
	AnchorRef,
	BlockId,
	HostKind,
	Message,
	PlainPayload,
	VerdictDecision,
} from "@hyperidle/shared";
import { isRedactedPayload, relativeShort } from "@hyperidle/shared";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCurrentUser } from "../../hooks/useCurrentUser.js";
import type { HostThreadIdentity } from "../../hooks/useHostThread.js";
import { useHostThread } from "../../hooks/useHostThread.js";
import { apiFetch } from "../../services/api-fetch.js";
import {
	postPlainHostMessage,
	postVerdictHostMessage,
	resolveOrCreateHostThread,
} from "../../services/host-threads.js";
import { ReviewComposition } from "./ReviewComposition.js";
import { REVIEW_COMPOSITION_SUBJECT } from "./review-composition.fixture.js";
import type { ComposedReviewSubject, ReviewComment } from "./review-composition.js";

export interface ReviewLoaderResult {
	readonly subject: ComposedReviewSubject;
	readonly adoptions: AdoptionView[];
}

export type ReviewLoader = (params: {
	readonly betId: string;
	readonly reviewId: string;
	/** The current user's teamId — threaded from useCurrentUser so the loader
	 * can include ?teamId= in the /api/surface-adoptions request. When absent
	 * (user not yet loaded or has no team), adoptions degrade to [] which causes
	 * resolveSurface to return the base canvas for every artifact. */
	readonly teamId?: string;
}) => Promise<ReviewLoaderResult>;

interface ReviewPageProps {
	readonly loader?: ReviewLoader;
}

/**
 * @lore AL5 §5 NIT: adoptions are fetched here once per page load (not in the
 * review loader /api/reviews/:id) so we don't embed team-level config into the
 * per-review response. The team's adoption list is tiny (one row per situation) —
 * a single parallel fetch, not N-per-artifact.
 *
 * teamId is threaded from the component's useCurrentUser hook. If unavailable
 * (user not yet loaded or has no team), adoptions degrade to [] — everything
 * resolves to base canvas (safe fallback, no broken page).
 *
 * @lore AL5 FIX-1: Previously called /api/surface-adoptions without ?teamId=
 * which always returned 400, silently degrading to base canvas on the live page.
 * The server requires teamId to scope the query to the correct team's rows.
 */
/** @internal Exported for unit-testing the teamId URL threading. */
export async function defaultLoader({
	reviewId,
	teamId,
	// betId is not used by the default loader (review is fetched by reviewId directly),
	// but it is part of ReviewLoader params so we accept it here for type compatibility.
}: {
	readonly betId: string;
	readonly reviewId: string;
	readonly teamId?: string;
}): Promise<ReviewLoaderResult> {
	// Parallel: fetch review + adoptions. If adoptions fail, degrade to empty (base canvas).
	const adoptionsUrl = teamId
		? `/api/surface-adoptions?teamId=${encodeURIComponent(teamId)}`
		: null;
	const [reviewRes, adoptionsRes] = await Promise.all([
		apiFetch(`/api/reviews/${encodeURIComponent(reviewId)}`),
		adoptionsUrl ? apiFetch(adoptionsUrl).catch(() => null) : Promise.resolve(null),
	]);

	if (!reviewRes.ok) {
		throw new Error(`Could not load review: ${reviewRes.status}`);
	}

	const subject = (await reviewRes.json()) as ComposedReviewSubject;

	let adoptions: AdoptionView[] = [];
	if (adoptionsRes?.ok) {
		try {
			adoptions = (await adoptionsRes.json()) as AdoptionView[];
		} catch {
			// degrade to empty — base canvas used for all artifacts
		}
	}

	return { subject, adoptions };
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
export function ReviewPage({ loader = defaultLoader }: ReviewPageProps = {}): JSX.Element {
	const { betId = "", reviewId = "" } = useParams<{ betId: string; reviewId: string }>();
	const navigate = useNavigate();
	const [subject, setSubject] = useState<ComposedReviewSubject | null>(null);
	const [adoptions, setAdoptions] = useState<AdoptionView[]>([]);
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

	// Capture teamId from user for the loader. Re-run if user loads after page mount.
	const teamId = user?.teamId;

	useEffect(() => {
		let cancelled = false;
		loader({ betId, reviewId, teamId })
			.then(({ subject: s, adoptions: a }) => {
				if (!cancelled) {
					setSubject(s);
					setAdoptions(a);
				}
			})
			.catch((e: unknown) => {
				if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
			});
		return () => {
			cancelled = true;
		};
	}, [betId, reviewId, loader, teamId]);

	const handlePostComment = useCallback(
		async ({ text, anchor }: { text: string; anchor?: AnchorRef }) => {
			if (!(user && reviewId && reviewSubject)) return;
			const threadId = hostThread.data?.thread.id;
			const activeThreadId =
				threadId ?? (await resolveOrCreateHostThread(hostKind, hostId, user.id, null));
			await postPlainHostMessage(activeThreadId, text, crypto.randomUUID(), undefined, anchor);
			hostThread.refresh();
			const { subject: refreshed } = await loader({ betId, reviewId, teamId });
			setSubject(refreshed);
		},
		[betId, hostId, hostKind, hostThread, loader, reviewId, reviewSubject, teamId, user],
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
			const { subject: refreshed } = await loader({ betId, reviewId, teamId });
			setSubject(refreshed);
		},
		[betId, hostThread, loader, reviewId, teamId, user],
	);

	if (error) {
		return (
			<div className="p-[24px] text-[var(--status-error)]">
				<p>Could not load review.</p>
				<p className="text-[13px] text-[var(--text-tertiary)]">{error.message}</p>
			</div>
		);
	}

	if (!(subject && reviewSubject)) {
		return (
			<div className="p-[24px] text-[var(--text-secondary)]">
				<p>Loading review…</p>
			</div>
		);
	}

	return (
		<div className="h-full">
			<ReviewComposition
				subject={reviewSubject}
				onSubmitVerdict={handleSubmitVerdict}
				onPostComment={user ? handlePostComment : undefined}
				threadId={hostThread.data?.thread.id ?? ""}
				adoptions={adoptions}
				onSwap={() => navigate("/conversations?settings=open")}
			/>
		</div>
	);
}

// @lore AL3: keep the fixture reachable from the production module for
// host tests and storybook; importing from the fixture file rather than
// redeclaring avoids drift between test data and the defaultLoader fallback.
export { REVIEW_COMPOSITION_SUBJECT };
