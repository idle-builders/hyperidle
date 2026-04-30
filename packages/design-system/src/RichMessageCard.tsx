/**
 * L11 — `RichMessageCard` Tier 2 component.
 *
 * Approved.md §2.1 (review variant), §4 (states), §5.7 (sticky-within-card),
 * §8 (a11y). Plan §5.3 (props), §6.1 (file path).
 *
 * Single in-stream card that absorbs the role formerly split across
 * the legacy review header (top toolbar), thread head (review title +
 * reasoning + artifact), and verdict bar (sticky bottom). The action
 * surface is a
 * property of the message, not a property of the thread.
 *
 * @lore L11: oldest-unresolved promotion is computed by
 * `promotedRichMessageId` upstream — this component renders ONE message at a
 * time. It does not pick.
 *
 * @lore L11: clientKey is generated at click-handler entry via
 * `crypto.randomUUID()` and held in card-local state for the saving phase so
 * a Retry from the error alert reuses the same key (server returns 200 on
 * the second POST). A fresh click on a different decision generates a new
 * key.
 *
 * @lore L11: the action footer is `position: sticky; bottom: 0` INSIDE the
 * card. On browsers without nested-sticky (older iOS Safari) it falls back
 * to `static` and the footer renders at the natural bottom of the card.
 * The fallback is pure CSS — no JS coordination, no IntersectionObserver.
 */

import {
	type Message,
	type RedactedPayload,
	type VerdictDecision,
	isRedactedPayload,
	verdictDecisionLabel,
} from "@hyperidle/shared";
import { type JSX, type ReactNode, useId, useState } from "react";
import { dsProps } from "./ds-attrs.js";
import { StatusChip } from "./StatusChip.js";

export interface RichMessageCardSender {
	readonly id: string;
	readonly name: string;
	readonly role?: string;
	readonly avatarUrl?: string;
}

export type RichMessageCardAction =
	| { readonly kind: "verdict"; readonly decision: VerdictDecision; readonly clientKey: string }
	| { readonly kind: "answer"; readonly option: string; readonly clientKey: string }
	| { readonly kind: "retry"; readonly clientKey: string };

export type RichMessageCardState =
	| { readonly phase: "idle" }
	| { readonly phase: "saving" }
	| { readonly phase: "error"; readonly reason: string };

export interface RichMessageCardResolved {
	readonly decision: VerdictDecision;
	readonly actor: string;
	readonly timestamp: string;
	readonly reExpanded: boolean;
	readonly onReexpandToggle: () => void;
}

export interface RichMessageCardProps {
	readonly message: Message;
	readonly sender: RichMessageCardSender;
	readonly blocking: boolean;
	readonly artifactSlot?: ReactNode;
	readonly onAction: (action: RichMessageCardAction) => void;
	readonly state: RichMessageCardState;
	readonly resolved?: RichMessageCardResolved;
}

interface VerdictButtonSpec {
	readonly action: VerdictDecision;
	readonly label: string;
	readonly tone: "primary" | "ghost" | "danger";
}

const VERDICT_BUTTONS: ReadonlyArray<VerdictButtonSpec> = [
	{ action: "approve", label: "Approve", tone: "primary" },
	{ action: "approve-with-comments", label: "Approve with comments", tone: "ghost" },
	{ action: "request-changes", label: "Request changes", tone: "ghost" },
	{ action: "edit", label: "Edit", tone: "ghost" },
	{ action: "reject", label: "Reject", tone: "danger" },
];

function toneClass(tone: VerdictButtonSpec["tone"]): string {
	switch (tone) {
		case "primary":
			return "bg-[var(--primary)] text-[var(--surface-0)] border-transparent hover:brightness-110";
		case "danger":
			return "bg-transparent text-[var(--danger)] border-[color-mix(in_oklab,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_oklab,var(--danger)_8%,transparent)]";
		case "ghost":
			return "bg-transparent text-[var(--text-mid)] border-[var(--border-default)] hover:bg-[var(--surface-ghost)] hover:text-[var(--text-hi)]";
	}
}

const BUTTON_CLASS_BASE =
	"px-[12px] py-[6px] min-h-[44px] rounded-[var(--r1)] text-[13px] font-medium border focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed";

const REASONING_INLINE_THRESHOLD = 80;

interface DerivedReviewView {
	readonly title: string;
	readonly reasoning: ReadonlyArray<string>;
	readonly redacted: false;
}

interface DerivedQuestionnaireView {
	readonly title: string;
	readonly question: string;
	readonly options: ReadonlyArray<string>;
	readonly redacted: false;
}

interface DerivedRedactedView {
	readonly redacted: true;
	readonly payload: RedactedPayload;
}

function deriveReview(message: Message): DerivedReviewView | DerivedRedactedView | null {
	if (message.type !== "review") return null;
	const { payload } = message;
	if (isRedactedPayload(payload)) return { redacted: true, payload };
	return {
		redacted: false,
		title: payload.title,
		reasoning: payload.reasoning,
	};
}

function deriveQuestionnaire(
	message: Message,
): DerivedQuestionnaireView | DerivedRedactedView | null {
	if (message.type !== "questionnaire") return null;
	const { payload } = message;
	if (isRedactedPayload(payload)) return { redacted: true, payload };
	return {
		redacted: false,
		title: payload.title,
		question: payload.question,
		options: payload.options,
	};
}

function isShortReasoning(reasoning: ReadonlyArray<string>): boolean {
	return reasoning.length === 1 && reasoning[0].length <= REASONING_INLINE_THRESHOLD;
}

function generateClientKey(): string {
	if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
		return globalThis.crypto.randomUUID();
	}
	// Fallback for pre-secure-context test environments. Plan §6.2 — the
	// only contract is "non-empty string, fresh per click intent". jsdom
	// since v22 ships randomUUID; this branch is defensive.
	return `ck-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function ChevronDown({ open }: { open: boolean }): JSX.Element {
	return (
		<svg
			className="w-[10px] h-[10px]"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			style={{
				transform: open ? "rotate(0deg)" : "rotate(-90deg)",
				transition: "transform var(--motion-medium) var(--motion-ease)",
			}}
			aria-hidden="true"
		>
			<polyline points="6 9 12 15 18 9" />
		</svg>
	);
}

function ResolvedView({
	titleId,
	title,
	resolved,
	blocking,
}: {
	titleId: string;
	title: string;
	resolved: RichMessageCardResolved;
	blocking: boolean;
}): JSX.Element {
	return (
		<section
			{...dsProps("RichMessageCard", "2")}
			data-component="RichMessageCard"
			data-testid="rich-message-card"
			data-state="resolved"
			data-blocking={blocking ? "true" : "false"}
			data-sticky-footer="true"
			aria-labelledby={titleId}
			className="ml-[36px] bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--r2)] overflow-hidden"
		>
			<div className="flex items-center gap-[8px] px-[12px] py-[10px] text-[13px] text-[var(--text-mid)] flex-wrap">
				<span className="inline-flex items-center px-[8px] py-[2px] rounded-[var(--r-pill)] text-[11px] font-mono tracking-[0.03em] bg-[var(--surface-ghost)] text-[var(--text-mid)]">
					RESOLVED
				</span>
				<span className="font-mono text-[11px] tracking-[0.05em] uppercase font-medium text-[var(--ok)]">
					{verdictDecisionLabel(resolved.decision)}
				</span>
				<span id={titleId} className="text-[var(--text-hi)]">
					{title}
				</span>
				<span className="text-[var(--text-lo)] ml-[4px] text-[12px]">— {resolved.actor}</span>
				<span className="text-[var(--text-lo)] text-[11px] tabular-nums">· {resolved.timestamp}</span>
				<button
					type="button"
					aria-expanded={resolved.reExpanded}
					onClick={resolved.onReexpandToggle}
					className="ml-auto bg-transparent border-none text-[var(--text-lo)] text-[12px] hover:text-[var(--text-hi)] cursor-pointer"
				>
					Re-expand
				</button>
			</div>
		</section>
	);
}

function RedactedView({
	titleId,
	kind,
	payload,
	blocking,
}: {
	titleId: string;
	kind: "review" | "questionnaire";
	payload: RedactedPayload;
	blocking: boolean;
}): JSX.Element {
	const label = kind === "review" ? "Review" : "Questionnaire";
	return (
		<section
			{...dsProps("RichMessageCard", "2")}
			data-component="RichMessageCard"
			data-testid="rich-message-card"
			data-blocking={blocking ? "true" : "false"}
			data-sticky-footer="true"
			aria-labelledby={titleId}
			className={`ml-[36px] bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--r2)] overflow-hidden ${blocking ? "border-l-2 border-l-[var(--danger)]" : ""}`}
		>
			<div id={titleId} className="px-[12px] py-[10px] italic text-[var(--text-lo)] text-[13px]">
				{label} redacted by {payload.redactedBy} — {payload.reason}
			</div>
		</section>
	);
}

export function RichMessageCard({
	message,
	sender,
	blocking,
	artifactSlot,
	onAction,
	state,
	resolved,
}: RichMessageCardProps): JSX.Element {
	const titleId = useId();
	const [retryClientKey, setRetryClientKey] = useState<string | null>(null);
	// Reasoning toggle (review variant only). Default closed for long, open
	// is irrelevant for short (rendered inline without the toggle).
	const [reasoningOpen, setReasoningOpen] = useState(false);

	const review = deriveReview(message);
	const questionnaire = deriveQuestionnaire(message);

	if (resolved && review && !review.redacted) {
		return (
			<ResolvedView
				titleId={titleId}
				title={review.title}
				resolved={resolved}
				blocking={blocking}
			/>
		);
	}
	if (resolved && questionnaire && !questionnaire.redacted) {
		return (
			<ResolvedView
				titleId={titleId}
				title={questionnaire.title}
				resolved={resolved}
				blocking={blocking}
			/>
		);
	}

	if (review?.redacted === true) {
		return (
			<RedactedView
				titleId={titleId}
				kind="review"
				payload={review.payload}
				blocking={blocking}
			/>
		);
	}
	if (questionnaire?.redacted === true) {
		return (
			<RedactedView
				titleId={titleId}
				kind="questionnaire"
				payload={questionnaire.payload}
				blocking={blocking}
			/>
		);
	}

	const isReview = review !== null && review.redacted === false;
	const isQuestionnaire = questionnaire !== null && questionnaire.redacted === false;

	const tagLabel = isReview ? "REVIEW" : isQuestionnaire ? "QUESTION" : "MESSAGE";
	const title = isReview && !review.redacted
		? review.title
		: isQuestionnaire && !questionnaire.redacted
			? questionnaire.title
			: "";

	const handleVerdict = (decision: VerdictDecision): void => {
		const clientKey = generateClientKey();
		setRetryClientKey(clientKey);
		onAction({ kind: "verdict", decision, clientKey });
	};

	const handleAnswer = (option: string): void => {
		const clientKey = generateClientKey();
		setRetryClientKey(clientKey);
		onAction({ kind: "answer", option, clientKey });
	};

	const handleRetry = (): void => {
		const clientKey = retryClientKey ?? generateClientKey();
		onAction({ kind: "retry", clientKey });
	};

	const renderActionFooter = (): ReactNode => {
		if (state.phase === "saving") {
			return (
				<div
					data-sticky="bottom"
					className="sticky bottom-0 flex items-center gap-[8px] px-[12px] py-[10px] bg-[var(--surface-2)] border-t border-[var(--border-subtle)] text-[13px] text-[var(--text-mid)]"
					aria-live="polite"
				>
					Saving…
				</div>
			);
		}
		if (state.phase === "error") {
			return (
				<div
					role="alert"
					data-sticky="bottom"
					className="sticky bottom-0 flex items-center gap-[8px] px-[12px] py-[10px] bg-[var(--surface-2)] border-t border-[var(--border-subtle)] text-[13px] text-[var(--danger)]"
				>
					<span>{state.reason}</span>
					<button
						type="button"
						className={`${BUTTON_CLASS_BASE} ${toneClass("ghost")} ml-auto`}
						onClick={handleRetry}
					>
						Retry
					</button>
				</div>
			);
		}
		if (isReview) {
			return (
				<div
					role="toolbar"
					aria-label="Verdict actions"
					data-sticky="bottom"
					className="sticky bottom-0 flex flex-wrap gap-[8px] px-[12px] py-[10px] bg-[var(--surface-2)] border-t border-[var(--border-subtle)]"
				>
					{VERDICT_BUTTONS.map((b) => (
						<button
							key={b.action}
							type="button"
							className={`${BUTTON_CLASS_BASE} ${toneClass(b.tone)}`}
							onClick={(): void => handleVerdict(b.action)}
						>
							{b.label}
						</button>
					))}
				</div>
			);
		}
		if (isQuestionnaire && !questionnaire.redacted) {
			return (
				<div
					role="toolbar"
					aria-label="Answer options"
					data-sticky="bottom"
					className="sticky bottom-0 flex flex-wrap gap-[8px] px-[12px] py-[10px] bg-[var(--surface-2)] border-t border-[var(--border-subtle)]"
				>
					{questionnaire.options.map((opt, idx) => (
						<button
							key={`${message.id}-opt-${opt}`}
							type="button"
							className={`${BUTTON_CLASS_BASE} ${toneClass(idx === 0 ? "primary" : "ghost")}`}
							onClick={(): void => handleAnswer(opt)}
						>
							{opt}
						</button>
					))}
				</div>
			);
		}
		return null;
	};

	const renderReasoning = (): ReactNode => {
		if (!isReview || review.redacted) return null;
		const reasoning = review.reasoning;
		if (reasoning.length === 0) return null;
		if (isShortReasoning(reasoning)) {
			return (
				<p className="px-[12px] pb-[8px] text-[13px] text-[var(--text-mid)] m-0">
					{reasoning[0]}
				</p>
			);
		}
		return (
			<>
				<button
					type="button"
					onClick={(): void => setReasoningOpen((p) => !p)}
					aria-expanded={reasoningOpen}
					className="inline-flex items-center gap-[6px] mx-[12px] mb-[8px] px-[8px] py-[4px] bg-[var(--surface-3)] rounded-[var(--r1)] text-[12px] text-[var(--text-mid)] cursor-pointer border-none w-fit hover:bg-[var(--surface-4)] hover:text-[var(--text-hi)]"
				>
					<ChevronDown open={reasoningOpen} />
					{reasoningOpen ? "Hide reasoning" : `${reasoning.length} reasons`}
				</button>
				{reasoningOpen ? (
					<ol className="px-[12px] pb-[8px] pl-[36px] list-decimal text-[13px] text-[var(--text-mid)] m-0">
						{reasoning.map((line, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: reasoning entries are immutable once sent.
							<li key={`${message.id}-r-${i}`} className="my-[2px]">
								{line}
							</li>
						))}
					</ol>
				) : null}
			</>
		);
	};

	const renderQuestionnaireBody = (): ReactNode => {
		if (!isQuestionnaire || questionnaire.redacted) return null;
		return (
			<p className="px-[12px] pb-[8px] text-[13px] text-[var(--text-mid)] m-0">
				{questionnaire.question}
			</p>
		);
	};

	return (
		<section
			{...dsProps("RichMessageCard", "2")}
			data-component="RichMessageCard"
			data-testid="rich-message-card"
			data-message-id={message.id}
			data-message-type={message.type}
			data-blocking={blocking ? "true" : "false"}
			data-sticky-footer="true"
			data-promoted="true"
			aria-labelledby={titleId}
			style={{ maxHeight: "min(var(--card-max-h), max-content)" }}
			className={`ml-[36px] bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--r2)] overflow-hidden flex flex-col ${blocking ? "border-l-2 border-l-[var(--danger)]" : ""}`}
		>
			<div className="flex items-center gap-[8px] px-[12px] pt-[8px] pb-[6px] text-[12px] text-[var(--text-mid)] flex-wrap">
				<span className="inline-flex items-center px-[8px] py-[2px] rounded-[var(--r-pill)] text-[11px] font-mono tracking-[0.03em] bg-[color-mix(in_oklab,var(--primary)_18%,transparent)] text-[var(--primary)]">
					{tagLabel}
				</span>
				<span className="text-[var(--text-hi)] font-medium">{sender.name}</span>
				{sender.role ? <span className="text-[var(--text-lo)]">· {sender.role}</span> : null}
				{blocking ? (
					<span className="ml-auto text-[11px] font-mono tracking-[0.05em] uppercase">
						<StatusChip status="blocked" />
					</span>
				) : null}
			</div>
			<h3
				id={titleId}
				className="px-[12px] pb-[6px] text-[16px] font-semibold text-[var(--text-hi)] m-0"
			>
				{title}
			</h3>
			{renderReasoning()}
			{renderQuestionnaireBody()}
			{artifactSlot ? (
				<div className="flex-1 min-h-0 overflow-y-auto px-[12px] pb-[12px]">{artifactSlot}</div>
			) : null}
			{renderActionFooter()}
		</section>
	);
}
