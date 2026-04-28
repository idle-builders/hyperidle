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
import { headCollapsePredicate } from "@hyperidle/shared";
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

	if (error) {
		return (
			<div
				{...dsProps("ThreadShell", "3")}
				data-testid="thread-shell"
				className="flex flex-col h-full bg-[var(--surface-1)]"
			>
				<ThreadHostBanner
					hostKind={thread.hostKind}
					hostTitle={`${thread.hostKind}/${thread.hostId}`}
					blocking={false}
					resolved={thread.resolvedAt !== null}
					pinned={thread.pinned}
					participants={participants}
				/>
				<ErrorState title="Failed to load thread" description={error} />
			</div>
		);
	}

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

	return (
		<div
			{...dsProps("ThreadShell", "3")}
			data-testid="thread-shell"
			className="flex flex-col h-full bg-[var(--surface-1)]"
		>
			<ThreadHostBanner
				hostKind={thread.hostKind}
				hostTitle={`${thread.hostKind}/${thread.hostId}`}
				blocking={false}
				resolved={thread.resolvedAt !== null}
				pinned={thread.pinned}
				participants={participants}
			/>
			{headMessage ? (
				<ThreadHead
					message={headMessage}
					artifactSlot={
						headMessage.type === "review" && artifactSlot
							? artifactSlot((headMessage.payload as { artifactRef: ArtifactRef }).artifactRef)
							: undefined
					}
				/>
			) : null}
			<div className="flex-1 overflow-y-auto">
				{loading ? (
					<div className="p-[var(--density-card-pad,12px)]">
						<SkeletonList rows={3} ariaLabel="Loading messages" dataTestId="skeleton-list" />
					</div>
				) : ordered.length === 0 ? (
					<EmptyState title="No messages yet" description="Be the first to post in this thread." />
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
						if (
							action === "approve" ||
							action === "approve-with-comments" ||
							action === "request-changes" ||
							action === "edit" ||
							action === "reject"
						) {
							void onAppendMessage({
								type: "verdict",
								payload: {
									decision: action,
									resolvesMessageId: headMessage.id,
								},
								clientKey: `verdict-${headMessage.id}-${Date.now().toString(36)}`,
							});
						}
					}}
				/>
			) : null}
			<Composer threadId={thread.id} onSubmit={handleComposerSubmit} />
		</div>
	);
}
