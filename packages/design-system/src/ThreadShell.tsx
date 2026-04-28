/**
 * L1a — `ThreadShell` design-system component.
 *
 * Plan §7.7; approved.md §2.6 + §4. Composition root that mounts:
 *  - `ThreadHostBanner`
 *  - `ThreadHead` (iff `headCollapsePredicate(messages).headMessageId !== null`)
 *  - `CommentStream` (a thin <ul> of CommentRows)
 *  - `Composer` (always pinned at the floor)
 *
 * State coverage (approved.md §4): empty / loading / error / populated-issue
 * / populated-chat / populated-resolved / populated-overflow.
 */

import type { ArtifactRef, Message, MessageType, Thread } from "@hyperidle/shared";
import { headCollapsePredicate, isRedactedPayload } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { CommentRow } from "./CommentRow.js";
import { Composer } from "./Composer.js";
import { dsProps } from "./ds-attrs.js";
import { EmptyState } from "./EmptyState.js";
import { ErrorState } from "./ErrorState.js";
import { ReviewVerdictBar } from "./ReviewVerdictBar.js";
import { SkeletonList } from "./Skeleton.js";
import { ThreadHead } from "./ThreadHead.js";
import { ThreadHostBanner } from "./ThreadHostBanner.js";

export interface ThreadShellIdentity {
	name: string;
	role?: string;
	avatarUrl?: string;
}

export interface ThreadShellAppendInput {
	type: MessageType;
	payload: unknown;
	clientKey: string;
}

export interface ThreadShellProps {
	thread: Thread;
	messages: ReadonlyArray<Message>;
	identities: Record<string, ThreadShellIdentity>;
	artifactSlot?: (ref: ArtifactRef) => ReactNode;
	onAppendMessage: (input: ThreadShellAppendInput) => Promise<void>;
	loading?: boolean;
	error?: string;
}

const FALLBACK_IDENTITY: ThreadShellIdentity = { name: "Unknown" };

function identityFor(
	identities: Record<string, ThreadShellIdentity>,
	id: string,
): ThreadShellIdentity {
	return identities[id] ?? FALLBACK_IDENTITY;
}

/**
 * Resolve the artifact reference embedded in a review-typed head message and
 * hand it to the page-supplied `artifactSlot` callback. Returns undefined for
 * non-review heads, redacted reviews, or when the page did not provide a
 * renderer (L1 step5 SL-C1: type narrowing replaces the unsafe `as` cast).
 */
function resolveArtifactSlot(
	headMessage: Message,
	artifactSlot: ((ref: ArtifactRef) => ReactNode) | undefined,
): ReactNode | undefined {
	if (!artifactSlot) return undefined;
	if (headMessage.type !== "review") return undefined;
	const { payload } = headMessage;
	if (isRedactedPayload(payload)) return undefined;
	return artifactSlot(payload.artifactRef);
}

export function ThreadShell({
	thread,
	messages,
	identities,
	artifactSlot,
	onAppendMessage,
	loading,
	error,
}: ThreadShellProps): JSX.Element {
	// Sort ASC for the predicate; rendering is also ASC for natural reading.
	const ordered = [...messages].sort((a, b) => {
		const ts = a.createdAt.localeCompare(b.createdAt);
		return ts !== 0 ? ts : a.id.localeCompare(b.id);
	});
	const head = headCollapsePredicate(ordered);
	const headMessage = head.headMessageId
		? ordered.find((m) => m.id === head.headMessageId)
		: undefined;

	const participants = thread.participants.map((id) => ({
		id,
		name: identityFor(identities, id).name,
	}));

	const handleComposerSubmit = async (input: {
		text: string;
		clientKey: string;
	}): Promise<void> => {
		await onAppendMessage({
			type: "plain",
			payload: { text: input.text },
			clientKey: input.clientKey,
		});
	};

	// L1 step5 W10: error and populated branches share the host banner; we
	// render the banner once and switch the body, instead of duplicating the
	// outer JSX.
	const banner = (
		<ThreadHostBanner
			hostKind={thread.hostKind}
			hostTitle={`${thread.hostKind}/${thread.hostId}`}
			blocking={false}
			resolved={thread.resolvedAt !== null}
			pinned={thread.pinned}
			participants={participants}
		/>
	);

	return (
		<div
			{...dsProps("ThreadShell", "3")}
			data-testid="thread-shell"
			className="flex flex-col h-full bg-[var(--surface-1)]"
		>
			{banner}
			{error ? (
				<ErrorState title="Failed to load thread" description={error} />
			) : (
				<>
					{headMessage ? (
						<ThreadHead
							message={headMessage}
							artifactSlot={resolveArtifactSlot(headMessage, artifactSlot)}
						/>
					) : null}
					<div className="flex-1 overflow-y-auto">
						{loading ? (
							<div className="p-[var(--density-card-pad,12px)]">
								<SkeletonList rows={3} ariaLabel="Loading messages" dataTestId="skeleton-list" />
							</div>
						) : ordered.length === 0 ? (
							<EmptyState
								title="No messages yet"
								description="Be the first to post in this thread."
							/>
						) : (
							<ul className="flex flex-col py-[var(--density-pad-y,8px)]">
								{ordered
									.filter((m) => m.id !== head.headMessageId)
									.map((m) => (
										<CommentRow
											key={m.id}
											message={m}
											sender={{
												id: m.senderId,
												name: identityFor(identities, m.senderId).name,
												role: identityFor(identities, m.senderId).role,
											}}
											showSenderHeader={true}
										/>
									))}
							</ul>
						)}
					</div>
					{headMessage && headMessage.type === "review" && headMessage.resolvedAt === null ? (
						<ReviewVerdictBar
							onAction={(action): void => {
								// `action` is now `VerdictDecision` — every value resolves to
								// a verdict message. The dead non-binding/sidecar branch was
								// removed in L1 step5 (S-C1).
								void onAppendMessage({
									type: "verdict",
									payload: {
										decision: action,
										resolvesMessageId: headMessage.id,
									},
									clientKey: `verdict-${headMessage.id}-${Date.now().toString(36)}`,
								});
							}}
						/>
					) : null}
					<Composer threadId={thread.id} onSubmit={handleComposerSubmit} />
				</>
			)}
		</div>
	);
}
