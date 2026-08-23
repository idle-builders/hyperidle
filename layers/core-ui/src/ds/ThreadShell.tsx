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
	InlineRef,
	Message,
	MessageType,
	Thread,
	VerdictDecision,
} from "@hyperidle/domain-model";
import { isBlocking, isRedactedPayload, promotedRichMessageId } from "@hyperidle/domain-model";
import { type JSX, type ReactNode, useMemo, useRef, useState } from "react";
import { CommentRow } from "./CommentRow.js";
import { Composer } from "./Composer.js";
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
	/** When true, renders the agent avatar variant and sets data-sender-kind="ai" on the row. */
	isAgent?: boolean;
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
	/**
	 * When true, ThreadHostBanner is not rendered. Use when the consuming
	 * page already renders its own header with thread title — avoids a
	 * duplicate header above the message stream.
	 *
	 * @lore visual-parity-audit: Conversations.tsx renders its own <header>
	 * with the thread title and dial-in button. Without this prop, ThreadShell
	 * also renders ThreadHostBanner, producing two stacked headers.
	 */
	hideHostBanner?: boolean;
	/**
	 * Optional HTML sanitizer (e.g. DOMPurify). Threaded through to
	 * `CommentRow` so that raw HTML blocks in plain messages are sanitized
	 * before rendering. When absent, html payloads degrade to UnknownPayload.
	 *
	 * @lore R3 C-1 (reviewer): web consumer (Conversations.tsx) passes
	 * DOMPurify here; design-system stays free of DOMPurify dependency.
	 */
	sanitizeHtml?: (raw: string) => string;
	/**
	 * T4: Optional render function for inline ref embeds. Called per-message
	 * with the message's refs array. The web consumer provides BlockRefEmbed
	 * instances; the design-system stays free of data-fetching components.
	 *
	 * @lore T4: ThreadShell cannot import BlockRefEmbed (web-layer) directly.
	 * The render prop keeps the design-system pure while enabling inline embeds
	 * in any ThreadShell consumer (CocOverlay, Conversations).
	 */
	renderRefEmbeds?: (refs: ReadonlyArray<InlineRef>) => ReactNode;
	/**
	 * AD8b B3.1: Optional render function for per-message extra content.
	 * Called per plain message; return value is appended after the message
	 * body (afterBody). Used by AssistantOverlay to render tinted tool-call
	 * summary rows for messages with payload.toolCalls.
	 *
	 * @lore AD8b: Keeps design-system free of ToolCallSummary rendering
	 * logic. The web-layer consumer (AssistantOverlay) provides the render
	 * function; ThreadShell just calls it per message.
	 */
	renderMessageExtra?: (message: Message) => ReactNode;
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

function identityFor(
	identities: Record<string, ThreadShellIdentity>,
	id: string,
): ThreadShellIdentity {
	return identities[id] ?? { name: "Unknown" };
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
					<div className="type-label flex items-center gap-[6px]    uppercase text-[var(--text-tertiary)]">
						<span className="inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--accent-primary)_18%,transparent)] text-[var(--accent-deep)]">
							REVIEW
						</span>
					</div>
					<h3 className="type-subheading   text-[var(--text-primary)] m-0">{payload.title}</h3>
					{payload.reasoning.length > 0 ? (
						<ol className="type-small list-decimal pl-[18px]  text-[var(--text-secondary)] m-0">
							{payload.reasoning.map((line: string, i: number) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: reasoning entries are immutable once sent.
								<li key={`${message.id}-r-${i}`} className="my-[3px]">
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
					<div className="type-label flex items-center gap-[6px]    uppercase text-[var(--text-tertiary)]">
						<span className="inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--accent-primary)_18%,transparent)] text-[var(--accent-deep)]">
							QUESTION
						</span>
					</div>
					<h3 className="type-subheading   text-[var(--text-primary)] m-0">{payload.title}</h3>
					<p className="type-small  text-[var(--text-secondary)] m-0">{payload.question}</p>
				</>
			),
			body: null,
			// @lore L11 plan §6.2 CONFUSION-A + step9 W2: questionnaire
			// dispatch is render-only at the page level for L11 (no answer
			// commit endpoint). Buttons are disabled + aria-disabled so the
			// user gets honest feedback instead of a dead-click. All-ghost
			// styling — no false hierarchy on neutral-choice questionnaires.
			actions:
				payload.options.length > 0
					? payload.options.map((opt: string) => (
							<button
								key={`${message.id}-opt-${opt}`}
								type="button"
								disabled
								aria-disabled="true"
								title="Answer dispatch lands in a follow-up"
								className="type-control border-width-thin px-[9px] py-[6px] min-h-[44px] rounded-[var(--r-subtle)]    bg-transparent text-[var(--text-secondary)] border-[var(--border-subtle)] disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{opt}
							</button>
						))
					: null,
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
	hideHostBanner = false,
	sanitizeHtml,
	renderRefEmbeds,
	renderMessageExtra,
}: ThreadShellProps): JSX.Element {
	// Sort ASC by createdAt with id as a stability tiebreaker.
	const ordered = useMemo(
		() =>
			[...messages].sort((a, b) => {
				const ts = a.createdAt.localeCompare(b.createdAt);
				return ts !== 0 ? ts : a.id.localeCompare(b.id);
			}),
		[messages],
	);

	// @lore L11 step9 (apply-review C2): a single card subject — the
	// promoted unresolved candidate when one exists, otherwise the
	// most-recent resolved review/questionnaire WITH a recorded verdict.
	// Render goes through ONE path; the card's `resolved` prop is what
	// flips when `promotedRichMessageId` re-evaluates after a successful
	// verdict POST. No second `<li>` synthesised above the stream.
	const cardSubject = useMemo(() => {
		const promotedId = promotedRichMessageId(ordered);
		if (promotedId !== null) {
			const m = ordered.find((x) => x.id === promotedId);
			return m ? { message: m, verdict: null } : null;
		}
		for (let i = ordered.length - 1; i >= 0; i--) {
			const m = ordered[i];
			if (m === undefined) continue;
			if ((m.type === "review" || m.type === "questionnaire") && m.resolvedAt !== null) {
				const verdict = ordered.find(
					(v) =>
						v.type === "verdict" &&
						!isRedactedPayload(v.payload) &&
						v.payload.resolvesMessageId === m.id,
				);
				if (verdict && verdict.type === "verdict" && !isRedactedPayload(verdict.payload)) {
					return { message: m, verdict };
				}
				return null;
			}
		}
		return null;
	}, [ordered]);
	const promotedMessage =
		cardSubject && cardSubject.message.resolvedAt === null ? cardSubject.message : null;
	const [reExpanded, setReExpanded] = useState(false);

	const participants = thread.participants.map((id: string) => ({
		id,
		name: identityFor(identities, id).name,
	}));

	const blocking =
		agentSessionState !== undefined ? isBlocking(thread, ordered, agentSessionState) : false;

	const groupedStream = useMemo(() => computeSenderGrouping(ordered), [ordered]);

	const [cardState, setCardState] = useState<
		{ phase: "idle" } | { phase: "saving" } | { phase: "error"; reason: string }
	>({ phase: "idle" });

	/**
	 * @lore L7 reconciliation: L11 left retry as render-only (CONFUSION-C §5.6).
	 * L7 wires retry at the page level via props. The reconciled approach stores
	 * the last verdict dispatch input here so `handleCardAction("retry")` can
	 * re-invoke `dispatchVerdict` without re-lifting state to the page.
	 */
	const lastVerdictInput = useRef<{
		type: "verdict";
		payload: { decision: string; resolvesMessageId: string };
		clientKey: string;
	} | null>(null);

	const dispatchVerdict = async (input: {
		type: "verdict";
		payload: { decision: string; resolvesMessageId: string };
		clientKey: string;
	}): Promise<void> => {
		setCardState({ phase: "saving" });
		try {
			await onAppendMessage(input);
			lastVerdictInput.current = null;
			setCardState({ phase: "idle" });
		} catch (cause) {
			setCardState({
				phase: "error",
				reason: cause instanceof Error ? cause.message : "Could not commit verdict",
			});
		}
	};

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
			const input = {
				type: "verdict" as const,
				payload: {
					decision: action.decision satisfies VerdictDecision,
					resolvesMessageId: message.id,
				},
				clientKey: action.clientKey,
			};
			lastVerdictInput.current = input;
			await dispatchVerdict(input);
		} else if (action.kind === "retry") {
			const prior = lastVerdictInput.current;
			if (prior) {
				await dispatchVerdict(prior);
			}
		}
		// answer intentionally render-only at the page level for L11
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
			data-ds-shell="ThreadShell"
			data-ds-tier="3"
			data-ds-source="web-shell"
			data-testid="thread-shell"
			aria-live="polite"
			className="flex flex-col h-full bg-[var(--surface-elevated)] focus-within:outline-hidden"
		>
			{!hideHostBanner && banner}
			{error ? (
				<ErrorState title="Failed to load thread" description={error} />
			) : (
				<>
					<div className="flex-1 overflow-y-auto">
						{loading ? (
							<div className="p-[12px]">
								<SkeletonList rows={3} ariaLabel="Loading messages" dataTestId="skeleton-list" />
							</div>
						) : ordered.length === 0 ? (
							<EmptyState
								title="No messages yet"
								description="Be the first to post in this thread."
							/>
						) : (
							<ul className="flex flex-col px-[24px] py-[18px] gap-[18px] max-w-[720px] mx-auto">
								{cardSubject
									? (() => {
											const m = cardSubject.message;
											const v = cardSubject.verdict;
											const resolvedProps =
												v && v.type === "verdict" && !isRedactedPayload(v.payload)
													? {
															decision: v.payload.decision,
															actor: identityFor(identities, v.senderId).name,
															timestamp: m.resolvedAt ?? "",
															reExpanded,
															onReexpandToggle: (): void => setReExpanded((p) => !p),
														}
													: undefined;
											return (
												<li key={`card-${m.id}`}>
													<RichMessageCard
														message={m}
														sender={{
															id: m.senderId,
															name: identityFor(identities, m.senderId).name,
															role: identityFor(identities, m.senderId).role,
														}}
														blocking={resolvedProps ? false : blocking}
														artifactSlot={
															!resolvedProps && m.type === "review" && !isRedactedPayload(m.payload)
																? artifactSlot?.(m.payload.artifactRef)
																: undefined
														}
														onAction={
															resolvedProps
																? (): void => undefined
																: (action): void => {
																		void handleCardAction(m, action);
																	}
														}
														state={resolvedProps ? { phase: "idle" } : cardState}
														{...(resolvedProps ? { resolved: resolvedProps } : {})}
													/>
												</li>
											);
										})()
									: null}
								{groupedStream.map(({ message, showSenderHeader }) => {
									if (promotedMessage && message.id === promotedMessage.id) {
										// Already rendered as the card above.
										return null;
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
														isAgent: identityFor(identities, message.senderId).isAgent,
													}}
													showSenderHeader={showSenderHeader}
													richHeader={slots.header}
													richBody={slots.body}
													richActions={slots.actions}
													sanitizeHtml={sanitizeHtml}
												/>
											);
										}
									}
									// T4: compute afterBody for plain messages with refs.
									// AD8b B3.1: also append renderMessageExtra output (tool-call rows).
									const refEmbeds =
										renderRefEmbeds &&
										message.type === "plain" &&
										!isRedactedPayload(message.payload) &&
										message.payload.refs &&
										message.payload.refs.length > 0
											? renderRefEmbeds(message.payload.refs)
											: null;
									const messageExtra = renderMessageExtra ? renderMessageExtra(message) : null;
									const afterBody =
										refEmbeds || messageExtra ? (
											<>
												{refEmbeds}
												{messageExtra}
											</>
										) : undefined;
									return (
										<CommentRow
											key={message.id}
											message={message}
											sender={{
												id: message.senderId,
												name: identityFor(identities, message.senderId).name,
												role: identityFor(identities, message.senderId).role,
												isAgent: identityFor(identities, message.senderId).isAgent,
											}}
											showSenderHeader={showSenderHeader}
											sanitizeHtml={sanitizeHtml}
											{...(afterBody !== undefined ? { afterBody } : {})}
										/>
									);
								})}
							</ul>
						)}
					</div>
					<div className="max-w-[720px] mx-auto w-full px-[24px]">
						<Composer threadId={thread.id} onSubmit={handleComposerSubmit} />
					</div>
				</>
			)}
		</div>
	);
}
