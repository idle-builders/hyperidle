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

import type {
	AgentSessionStateSnapshot,
	ArtifactRef,
	Message,
	MessageType,
	Thread,
} from "@hyperidle/shared";
import { headCollapsePredicate, isBlocking, isRedactedPayload } from "@hyperidle/shared";
import { type JSX, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { CommentRow } from "./CommentRow.js";
import { Composer } from "./Composer.js";
import { dsProps } from "./ds-attrs.js";
import { EmptyState } from "./EmptyState.js";
import { ErrorState } from "./ErrorState.js";
import { ReviewVerdictBar } from "./ReviewVerdictBar.js";
import { SkeletonList } from "./Skeleton.js";
import { ThreadHead } from "./ThreadHead.js";
import { ThreadHostBanner } from "./ThreadHostBanner.js";

const SENDER_GROUP_WINDOW_MS = 5 * 60 * 1000; // approved.md §2.4 — 5 minutes

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
	/**
	 * Optional snapshot of the agent's session state. Drives the
	 * `ThreadHostBanner` blocking indicator via `isBlocking(thread, messages,
	 * snapshot)` (concept §4.5.5). When omitted, the banner shows
	 * `blocking={false}`.
	 */
	agentSessionState?: AgentSessionStateSnapshot;
	/**
	 * Optional override for the resolved host title. The Conversations page
	 * resolves the host entity (bet, task, …) and passes its display title;
	 * `ThreadShell` falls back to `${hostKind}/${hostId}` for tests / pages
	 * that have not wired host resolution yet.
	 */
	hostTitle?: string;
	/** Optional href for the host-attachment label (approved.md §8 hard-rule 5). */
	hostHref?: string;
}

interface SenderGroupedMessage {
	readonly message: Message;
	readonly showSenderHeader: boolean;
}

/**
 * Group consecutive messages from the same sender within a 5-minute window.
 * Each group's first message renders the sender header; subsequent messages
 * stack indented (no header) per approved.md §2.4 + §8 hard-rule 3.
 *
 * @lore L1 step9 (Design-C2): the previous renderer hardcoded
 * `showSenderHeader={true}` for every row, ignoring the locked design contract.
 */
export function computeSenderGrouping(
	messages: ReadonlyArray<Message>,
): ReadonlyArray<SenderGroupedMessage> {
	const result: SenderGroupedMessage[] = [];
	let lastSenderId: string | null = null;
	let lastTimestampMs: number | null = null;
	for (const message of messages) {
		const tsMs = Date.parse(message.createdAt);
		const sameSender = lastSenderId === message.senderId;
		const withinWindow =
			lastTimestampMs !== null &&
			Number.isFinite(tsMs) &&
			tsMs - lastTimestampMs < SENDER_GROUP_WINDOW_MS;
		const showSenderHeader = !(sameSender && withinWindow);
		result.push({ message, showSenderHeader });
		lastSenderId = message.senderId;
		lastTimestampMs = Number.isFinite(tsMs) ? tsMs : lastTimestampMs;
	}
	return result;
}

/**
 * Determine whether the most recent message in the thread is an unresolved
 * review/questionnaire. When true, the Composer shows the
 * "Unresolved review · acting required ↑" fallback link (approved.md §2.5).
 *
 * @lore L1 step9 (Design-C3): this rule was specified but never wired.
 */
export function hasMostRecentUnresolvedReview(messages: ReadonlyArray<Message>): boolean {
	if (messages.length === 0) return false;
	const last = messages[messages.length - 1];
	return (last.type === "review" || last.type === "questionnaire") && last.resolvedAt === null;
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
	agentSessionState,
	hostTitle,
	hostHref,
}: ThreadShellProps): JSX.Element {
	// Sort ASC for the predicate; rendering is also ASC for natural reading.
	const ordered = useMemo(
		() =>
			[...messages].sort((a, b) => {
				const ts = a.createdAt.localeCompare(b.createdAt);
				return ts !== 0 ? ts : a.id.localeCompare(b.id);
			}),
		[messages],
	);
	const head = headCollapsePredicate(ordered);
	const headMessage = head.headMessageId
		? ordered.find((m) => m.id === head.headMessageId)
		: undefined;

	const participants = thread.participants.map((id) => ({
		id,
		name: identityFor(identities, id).name,
	}));

	// L1 step9 (Arch): drive the banner's blocking indicator from the shared
	// `isBlocking` predicate when an `agentSessionState` snapshot is supplied.
	const blocking =
		agentSessionState !== undefined ? isBlocking(thread, ordered, agentSessionState) : false;

	// L1 step9 (Design-C2): compute sender-grouping for the comment stream
	// (excluding the head message, which renders separately).
	const streamMessages = useMemo(
		() => ordered.filter((m) => m.id !== head.headMessageId),
		[ordered, head.headMessageId],
	);
	const groupedStream = useMemo(() => computeSenderGrouping(streamMessages), [streamMessages]);

	// L1 step9 (Design-C3): the composer's "Unresolved review · acting required"
	// fallback link appears when the most recent message in the thread is an
	// unresolved review/questionnaire. This serves as a fallback for tall mobile
	// viewports where the sticky verdict bar may scroll out of view.
	const unresolvedReview = hasMostRecentUnresolvedReview(ordered);

	// L1 step9 (Design-W from review): IntersectionObserver wires the sticky
	// verdict bar's "head-edge → released" behavior. When the head's artifact
	// region is in view → bar is pinned; otherwise → bar releases (scrolls
	// with content).
	const artifactRegionRef = useRef<HTMLDivElement | null>(null);
	const verdictBarRef = useRef<HTMLDivElement | null>(null);
	const [verdictBarSticky, setVerdictBarSticky] = useState(true);
	useEffect(() => {
		const target = artifactRegionRef.current;
		if (!target) return;
		// Skip when IntersectionObserver is unavailable (e.g. some test environments).
		if (typeof window === "undefined" || typeof window.IntersectionObserver === "undefined") {
			return;
		}
		const observer = new window.IntersectionObserver(
			(entries) => {
				const [entry] = entries;
				setVerdictBarSticky(Boolean(entry?.isIntersecting));
			},
			{ threshold: 0 },
		);
		observer.observe(target);
		return (): void => observer.disconnect();
	}, []);

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

	const handleScrollToVerdict = (): void => {
		verdictBarRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
	};

	// L1 step5 W10: error and populated branches share the host banner; we
	// render the banner once and switch the body, instead of duplicating the
	// outer JSX.
	const resolvedHostTitle = hostTitle ?? `${thread.hostKind}/${thread.hostId}`;
	const banner = (
		<ThreadHostBanner
			hostKind={thread.hostKind}
			hostTitle={resolvedHostTitle}
			{...(hostHref !== undefined ? { hostHref } : {})}
			blocking={blocking}
			resolved={thread.resolvedAt !== null}
			pinned={thread.pinned}
			participants={participants}
		/>
	);

	const verdictBarVisible =
		headMessage && headMessage.type === "review" && headMessage.resolvedAt === null;

	return (
		<div
			{...dsProps("ThreadShell", "3")}
			data-testid="thread-shell"
			// L1 step9 (Design-C4): announce shape transitions (head mount /
			// unmount, canvas promote / demote) via aria-live. Non-blocking
			// (`polite`) so screen readers complete current speech first.
			aria-live="polite"
			className="flex flex-col h-full bg-[var(--surface-1)] focus-within:outline-none"
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
					{/*
					 * Sentinel for the IntersectionObserver. Sits at the head's
					 * lower edge when issue-shape; absent for chat-shape.
					 */}
					{headMessage ? (
						<div
							ref={artifactRegionRef}
							data-testid="verdict-sentinel"
							aria-hidden="true"
							className="h-[1px]"
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
								{groupedStream.map(({ message, showSenderHeader }) => (
									<CommentRow
										key={message.id}
										message={message}
										sender={{
											id: message.senderId,
											name: identityFor(identities, message.senderId).name,
											role: identityFor(identities, message.senderId).role,
										}}
										showSenderHeader={showSenderHeader}
									/>
								))}
							</ul>
						)}
					</div>
					{verdictBarVisible ? (
						<div
							ref={verdictBarRef}
							data-testid="verdict-bar-wrapper"
							data-sticky={verdictBarSticky ? "true" : "false"}
							className={verdictBarSticky ? "sticky bottom-0" : "static"}
						>
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
						</div>
					) : null}
					<Composer
						threadId={thread.id}
						onSubmit={handleComposerSubmit}
						{...(unresolvedReview && verdictBarVisible
							? { unresolvedReviewLink: { onClick: handleScrollToVerdict } }
							: {})}
					/>
				</>
			)}
		</div>
	);
}
