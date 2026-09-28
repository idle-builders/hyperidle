import type {
	AgentSessionStateSnapshot,
	Message,
	MessageType,
	Thread,
	VerdictDecision,
} from "@hyperidle/domain-model";
import { isBlocking, isRedactedPayload } from "@hyperidle/domain-model";
import { type JSX, type ReactNode, useMemo, useRef, useState } from "react";
import { CommentRow } from "./CommentRow.js";
import { Composer } from "./Composer.js";
import { EmptyState } from "./EmptyState.js";
import { ErrorState } from "./ErrorState.js";
import { questionnairePayloadOf, reviewPayloadOf, verdictPayloadOf } from "./message-payload.js";
import { RichMessageCard, type RichMessageCardAction } from "./RichMessageCard.js";
import { SkeletonList } from "./Skeleton.js";
import { ThreadHostBanner } from "./ThreadHostBanner.js";
import { promotedRichMessageId } from "./thread-display.js";

const SENDER_GROUP_WINDOW_MS = 5 * 60 * 1000; // 5-minute grouping window

export interface ThreadShellIdentity {
	name: string;
	/** Their craft, e.g. "designer" — absent renders no badge, never a placeholder. */
	discipline?: string | null;
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
	onAppendMessage: (input: ThreadShellAppendInput) => Promise<void>;
	loading?: boolean;
	error?: string;
	agentSessionState?: AgentSessionStateSnapshot;
	hostTitle?: string;
	hostHref?: string;
	/**
	 */
	hideHostBanner?: boolean;
	/**
	 */
	sanitizeHtml?: (raw: string) => string;
	/**
	 */
	renderMessageExtra?: (message: Message) => ReactNode;
}

interface SenderGroupedMessage {
	readonly message: Message;
	readonly showSenderHeader: boolean;
}

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

function buildRichSlots(message: Message): RichSlotsForRow | null {
	if (message.type === "review") {
		const payload = reviewPayloadOf(message);
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
			body: null,
			actions: null,
		};
	}
	if (message.type === "questionnaire") {
		const payload = questionnairePayloadOf(message);
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
	onAppendMessage,
	loading,
	error,
	agentSessionState,
	hostTitle,
	hostHref,
	hideHostBanner = false,
	sanitizeHtml,
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
				const verdict = ordered.find((v) => {
					if (v.type !== "verdict") return false;
					const payload = verdictPayloadOf(v);
					return !isRedactedPayload(payload) && payload.resolvesMessageId === m.id;
				});
				if (verdict && verdict.type === "verdict") {
					const verdictPayload = verdictPayloadOf(verdict);
					if (!isRedactedPayload(verdictPayload)) {
						return { message: m, verdict };
					}
				}
				return null;
			}
		}
		return null;
	}, [ordered]);
	const promotedMessage =
		cardSubject && cardSubject.message.resolvedAt === null ? cardSubject.message : null;
	const [reExpanded, setReExpanded] = useState(false);

	const participants = thread.members.map((id: string) => ({
		id,
		name: identityFor(identities, id).name,
	}));

	const blocking =
		agentSessionState !== undefined ? isBlocking(thread, ordered, agentSessionState) : false;

	const groupedStream = useMemo(() => computeSenderGrouping(ordered), [ordered]);

	const [cardState, setCardState] = useState<
		{ phase: "idle" } | { phase: "saving" } | { phase: "error"; reason: string }
	>({ phase: "idle" });

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
		// answer is render-only — the card surfaces the click; no dispatch endpoint
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
											const vPayload = v && v.type === "verdict" ? verdictPayloadOf(v) : null;
											const resolvedProps =
												v && vPayload && !isRedactedPayload(vPayload)
													? {
															decision: vPayload.decision,
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
															discipline: identityFor(identities, m.senderId).discipline,
														}}
														blocking={resolvedProps ? false : blocking}
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
										const slots = buildRichSlots(message);
										if (slots) {
											return (
												<CommentRow
													key={message.id}
													message={message}
													sender={{
														id: message.senderId,
														name: identityFor(identities, message.senderId).name,
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
									// Append renderMessageExtra output (tool-call rows).
									const messageExtra = renderMessageExtra ? renderMessageExtra(message) : null;
									const afterBody = messageExtra ? messageExtra : undefined;
									return (
										<CommentRow
											key={message.id}
											message={message}
											sender={{
												id: message.senderId,
												name: identityFor(identities, message.senderId).name,
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
