/**
 * L1a / L11 — `ThreadShell` design-system component.
 *
 * Plan §7.7 (L1) + L11 plan §5.5. Composition root that mounts:
 *  - `ThreadHostBanner` (always — only chrome above the stream after L11)
 *  - The message stream — promoted rich message → `RichMessageCard`,
 *    other unresolved review/questionnaire → `CommentRow` rich-row variant,
 *    everything else → standard `CommentRow`.
 *  - `Composer` (always pinned at the floor)
 *
 * @lore L11 plan §6.2: `ThreadHead` and `ReviewVerdictBar` mounts removed.
 * The promotion rule (`promotedRichMessageId`) replaces `headCollapsePredicate`
 * for rendering — head was about WHERE rich content rendered (above the
 * stream); promotion is about WHICH rich message becomes a card. The
 * `headCollapsePredicate` helper still ships from shared for `isBlocking`.
 *
 * @lore L11 plan §5.5: the IntersectionObserver / verdict-bar wrapper /
 * verdict-sentinel testid / `Unresolved review · acting required ↑` link
 * are deleted. Sticky-within-card replaces the sticky bar; the card sits
 * in the stream so there is nothing for the link to scroll to.
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
	VerdictDecision,
} from "@hyperidle/shared";
import { isBlocking, isRedactedPayload, promotedRichMessageId } from "@hyperidle/shared";
import { type JSX, type ReactNode, useMemo, useState } from "react";
import { CommentRow } from "./CommentRow.js";
import { Composer } from "./Composer.js";
import { dsProps } from "./ds-attrs.js";
import { EmptyState } from "./EmptyState.js";
import { ErrorState } from "./ErrorState.js";
import { RichMessageCard, type RichMessageCardAction } from "./RichMessageCard.js";
import { SkeletonList } from "./Skeleton.js";
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
	 * `ThreadHostBanner` blocking indicator AND the `RichMessageCard`
	 * `--danger` left-border.
	 */
	agentSessionState?: AgentSessionStateSnapshot;
	hostTitle?: string;
	hostHref?: string;
}

interface SenderGroupedMessage {
	readonly message: Message;
	readonly showSenderHeader: boolean;
}

/**
 * Group consecutive messages from the same sender within a 5-minute window.
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
 * review/questionnaire. Retained as a pure helper for thread-level analysis;
 * after L11 the composer no longer renders the legacy "Unresolved review"
 * link (the in-stream card replaces the off-viewport sticky bar).
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

interface RichSlotsForRow {
	header: ReactNode;
	body: ReactNode;
	actions: ReactNode;
}

function buildRichSlots(
	message: Message,
	artifactSlot: ((ref: ArtifactRef) => ReactNode) | undefined,
): RichSlotsForRow | null {
	if (message.type === "review") {
		const { payload } = message;
		if (isRedactedPayload(payload)) return null;
		return {
			header: (
				<>
					<div className="flex items-center gap-[6px] font-mono text-[11px] tracking-[0.05em] uppercase text-[var(--text-lo)]">
						<span className="inline-flex items-center px-[8px] py-[2px] rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--primary)_18%,transparent)] text-[var(--primary)]">
							REVIEW
						</span>
					</div>
					<h3 className="text-[14px] font-semibold text-[var(--text-hi)] m-0">
						{payload.title}
					</h3>
					{payload.reasoning.length > 0 ? (
						<ol className="list-decimal pl-[20px] text-[13px] text-[var(--text-mid)] m-0">
							{payload.reasoning.map((line, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: reasoning entries are immutable once sent.
								<li key={`${message.id}-r-${i}`} className="my-[2px]">
									{line}
								</li>
							))}
						</ol>
					) : null}
				</>
			),
			body: artifactSlot ? artifactSlot(payload.artifactRef) : null,
			actions: null,
		};
	}
	if (message.type === "questionnaire") {
		const { payload } = message;
		if (isRedactedPayload(payload)) return null;
		return {
			header: (
				<>
					<div className="flex items-center gap-[6px] font-mono text-[11px] tracking-[0.05em] uppercase text-[var(--text-lo)]">
						<span className="inline-flex items-center px-[8px] py-[2px] rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--primary)_18%,transparent)] text-[var(--primary)]">
							QUESTION
						</span>
					</div>
					<h3 className="text-[14px] font-semibold text-[var(--text-hi)] m-0">
						{payload.title}
					</h3>
					<p className="text-[13px] text-[var(--text-mid)] m-0">{payload.question}</p>
				</>
			),
			body: null,
			actions: payload.options.length > 0 ? (
				<>
					{payload.options.map((opt, idx) => (
						<button
							key={`${message.id}-opt-${opt}`}
							type="button"
							className={`px-[10px] py-[5px] min-h-[44px] rounded-[var(--r1)] text-[12px] font-medium border ${
								idx === 0
									? "bg-[var(--primary)] text-[var(--surface-0)] border-transparent"
									: "bg-transparent text-[var(--text-mid)] border-[var(--border-default)]"
							}`}
						>
							{opt}
						</button>
					))}
				</>
			) : null,
		};
	}
	return null;
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

	const promotedId = useMemo(() => promotedRichMessageId(ordered), [ordered]);
	const promotedMessage = promotedId
		? ordered.find((m) => m.id === promotedId) ?? null
		: null;

	// @lore L11 plan §9: when no unresolved candidate exists, the most-recent
	// RESOLVED review/questionnaire renders as the resolved single-line card
	// summary so the user retains continuity between "I clicked Approve" and
	// "the verdict is recorded". Re-expand exposes the original card body.
	const resolvedCardSubject = useMemo(() => {
		if (promotedId !== null) return null;
		for (let i = ordered.length - 1; i >= 0; i--) {
			const m = ordered[i];
			if ((m.type === "review" || m.type === "questionnaire") && m.resolvedAt !== null) {
				const verdict = ordered.find(
					(v) => v.type === "verdict" && !isRedactedPayload(v.payload) && v.payload.resolvesMessageId === m.id,
				);
				if (verdict && verdict.type === "verdict" && !isRedactedPayload(verdict.payload)) {
					return { message: m, verdict };
				}
				return { message: m, verdict: null };
			}
		}
		return null;
	}, [ordered, promotedId]);
	const [reExpanded, setReExpanded] = useState(false);

	const participants = thread.participants.map((id) => ({
		id,
		name: identityFor(identities, id).name,
	}));

	const blocking =
		agentSessionState !== undefined ? isBlocking(thread, ordered, agentSessionState) : false;

	const groupedStream = useMemo(() => computeSenderGrouping(ordered), [ordered]);

	const [cardState, setCardState] = useState<
		{ phase: "idle" } | { phase: "saving" } | { phase: "error"; reason: string }
	>({ phase: "idle" });

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

	const handleCardAction = async (
		message: Message,
		action: RichMessageCardAction,
	): Promise<void> => {
		if (action.kind === "verdict") {
			setCardState({ phase: "saving" });
			try {
				await onAppendMessage({
					type: "verdict",
					payload: {
						decision: action.decision satisfies VerdictDecision,
						resolvesMessageId: message.id,
					},
					clientKey: action.clientKey,
				});
				setCardState({ phase: "idle" });
			} catch (cause) {
				setCardState({
					phase: "error",
					reason: cause instanceof Error ? cause.message : "Could not commit verdict",
				});
			}
		}
		// answer / retry intentionally render-only at the page level for L11
		// (plan §5.6 CONFUSION-C). The card surfaces the click; no dispatch.
	};

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

	return (
		<div
			{...dsProps("ThreadShell", "3")}
			data-testid="thread-shell"
			aria-live="polite"
			className="flex flex-col h-full bg-[var(--surface-1)] focus-within:outline-none"
		>
			{banner}
			{error ? (
				<ErrorState title="Failed to load thread" description={error} />
			) : (
				<>
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
							<ul className="flex flex-col py-[var(--density-pad-y,8px)] gap-[12px]">
								{resolvedCardSubject && resolvedCardSubject.verdict ? (
									<li key={`resolved-${resolvedCardSubject.message.id}`}>
										<RichMessageCard
											message={resolvedCardSubject.message}
											sender={{
												id: resolvedCardSubject.message.senderId,
												name: identityFor(identities, resolvedCardSubject.message.senderId).name,
												role: identityFor(identities, resolvedCardSubject.message.senderId).role,
											}}
											blocking={false}
											onAction={(): void => undefined}
											state={{ phase: "idle" }}
											resolved={
												resolvedCardSubject.verdict.type === "verdict" &&
												!isRedactedPayload(resolvedCardSubject.verdict.payload)
													? {
															decision: resolvedCardSubject.verdict.payload.decision,
															actor: identityFor(
																identities,
																resolvedCardSubject.verdict.senderId,
															).name,
															timestamp: resolvedCardSubject.message.resolvedAt ?? "",
															reExpanded,
															onReexpandToggle: (): void => setReExpanded((p) => !p),
														}
													: undefined
											}
										/>
									</li>
								) : null}
								{groupedStream.map(({ message, showSenderHeader }) => {
									if (promotedMessage && message.id === promotedMessage.id) {
										return (
											<li key={message.id}>
												<RichMessageCard
													message={message}
													sender={{
														id: message.senderId,
														name: identityFor(identities, message.senderId).name,
														role: identityFor(identities, message.senderId).role,
													}}
													blocking={blocking}
													artifactSlot={
														message.type === "review" && !isRedactedPayload(message.payload)
															? artifactSlot?.(message.payload.artifactRef)
															: undefined
													}
													onAction={(action): void => {
														void handleCardAction(message, action);
													}}
													state={cardState}
												/>
											</li>
										);
									}
									if (
										(message.type === "review" || message.type === "questionnaire") &&
										message.resolvedAt === null
									) {
										const slots = buildRichSlots(message, artifactSlot);
										if (slots) {
											return (
												<CommentRow
													key={message.id}
													message={message}
													sender={{
														id: message.senderId,
														name: identityFor(identities, message.senderId).name,
														role: identityFor(identities, message.senderId).role,
													}}
													showSenderHeader={showSenderHeader}
													richHeader={slots.header}
													richBody={slots.body}
													richActions={slots.actions}
												/>
											);
										}
									}
									return (
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
									);
								})}
							</ul>
						)}
					</div>
					<Composer threadId={thread.id} onSubmit={handleComposerSubmit} />
				</>
			)}
		</div>
	);
}
