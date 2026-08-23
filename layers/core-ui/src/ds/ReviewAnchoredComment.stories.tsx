import type { Message } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { useState } from "react";
import { CommentRow, Composer } from "./index.js";

export default { title: "Review Anchored Comment" };

const cardClass =
	"rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]";

const LABEL = "PromoField.tsx:118";

const codeText = "  if (promo.expiresAt < now()) {";

const anchoredMessage: Message = {
	id: "m1",
	threadId: "t-al4",
	senderId: "u1",
	clientKey: "ck-1",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-06-19T12:00:00Z",
	type: "plain",
	payload: {
		text: "Does the 422 copy match our checkout error style — dated string and all?",
		refs: [{ kind: "artifact", id: LABEL }],
	},
};

const replyMessage: Message = {
	id: "m2",
	threadId: "t-al4",
	senderId: "agent-1",
	clientKey: "ck-2",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-06-19T12:01:00Z",
	type: "plain",
	payload: {
		text: "Yes — it reuses the CheckoutError component and formats the date with the same formatDate helper.",
		refs: [],
	},
};

function Bookmark(): JSX.Element {
	return (
		<svg aria-hidden="true" viewBox="0 0 12 12" className="h-[11px] w-[11px]">
			<path
				d="M2.5 6.2 L5 8.5 L9.5 3.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CodeLineWithComposer(): JSX.Element {
	const [open, setOpen] = useState(true);

	return (
		<div className="rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-page)] overflow-hidden">
			<div className="px-[12px] py-[6px] font-mono text-[12px] text-[var(--text-tertiary)] select-none">
				{"@@ -41,5 +41,9 @@ function PromoField({ onApply }: PromoFieldProps) {"}
			</div>
			<div className="font-mono text-[12px] leading-[var(--leading-body)]">
				<div className="group/line relative flex hover:bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)] transition-colors">
					<span className="select-none w-[36px] shrink-0 px-[6px] text-right text-[var(--text-tertiary)] tabular-nums">
						41
					</span>
					<span className="select-none w-[36px] shrink-0 px-[6px] text-right text-[var(--text-tertiary)] tabular-nums border-r border-[var(--border-subtle)]">
						118
					</span>
					<button
						type="button"
						aria-label="Add inline comment"
						title="Add inline comment"
						onClick={() => setOpen((v) => !v)}
						className="absolute left-[68px] top-1/2 flex h-[16px] w-[16px] -translate-y-1/2 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] text-[12px] leading-none group-hover/line:flex focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
					>
						+
					</button>
					<span className="select-none w-[16px] shrink-0 px-[3px] text-center text-[var(--text-tertiary)]">
						{" "}
					</span>
					<code className="flex-1 whitespace-pre pr-[12px] text-[var(--text-primary)]">
						{codeText}
					</code>
				</div>
				{open ? (
					<div className="flex gap-[12px] pl-[88px] pr-[12px] py-[9px]">
						<div className="flex flex-col items-center gap-0">
							<div className="w-[var(--bw-default)] h-[18px] bg-[var(--border-strong)]" />
							<div className="w-[6px] h-[6px] rounded-full bg-[var(--accent-primary)]" />
							<div className="w-[var(--bw-default)] flex-1 bg-[var(--border-strong)]" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="mb-[6px] flex items-center gap-[6px]">
								<span className="font-mono text-[11px] text-[var(--text-tertiary)]">on</span>
								<span className="font-mono text-[11px] text-[var(--text-tertiary)]">{LABEL}</span>
							</div>
							<Composer
								threadId="story-inline-comment"
								onSubmit={async () => {
									setOpen(false);
								}}
							/>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}

function ThreadCard(): JSX.Element {
	return (
		<div className={`${cardClass} flex`}>
			<div className="w-[18px] shrink-0 border-r border-[var(--border-subtle)] flex flex-col items-center pt-[10px]">
				<span
					className="h-[6px] w-[6px] rounded-full bg-[var(--accent-primary)]"
					aria-hidden="true"
				/>
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-[6px] border-b border-[var(--border-subtle)] px-[12px] py-[6px]">
					<span className="font-mono text-[11px] text-[var(--text-secondary)]">{LABEL}</span>
				</div>
				<ul className="list-none m-0 p-0">
					<CommentRow
						message={anchoredMessage}
						sender={{ id: "u1", name: "You", isAgent: false }}
						showSenderHeader
						inlineAnchor={LABEL}
					/>
					<CommentRow
						message={replyMessage}
						sender={{ id: "agent-1", name: "Atlas", isAgent: true }}
						showSenderHeader={false}
					/>
				</ul>
			</div>
		</div>
	);
}

export function CodeLineHoverComposer(): JSX.Element {
	return (
		<div className="flex flex-col gap-[12px]">
			<div className="flex items-center gap-[6px] text-[12px] text-[var(--text-tertiary)]">
				<span className="inline-flex h-[16px] w-[16px] items-center justify-center rounded-[var(--r-subtle)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] text-[12px] leading-none">
					+
				</span>
				Hover the diff line to reveal the gutter + button; click it to open the inline composer.
			</div>
			<CodeLineWithComposer />
		</div>
	);
}

export function AnchoredThread(): JSX.Element {
	return (
		<div className="flex flex-col gap-[12px]">
			<div className="text-[12px] text-[var(--text-tertiary)]">
				After posting, the thread renders at the anchor with replies stacked inline.
			</div>
			<div className="rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-page)] overflow-hidden">
				<div className="px-[12px] py-[6px] font-mono text-[12px] text-[var(--text-tertiary)] select-none">
					{"@@ -41,5 +41,9 @@ function PromoField({ onApply }: PromoFieldProps) {"}
				</div>
				<div className="font-mono text-[12px] leading-[var(--leading-body)]">
					<div className="flex hover:bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)] transition-colors">
						<span className="select-none w-[36px] shrink-0 px-[6px] text-right text-[var(--text-tertiary)] tabular-nums">
							41
						</span>
						<span className="select-none w-[36px] shrink-0 px-[6px] text-right text-[var(--text-tertiary)] tabular-nums border-r border-[var(--border-subtle)]">
							118
						</span>
						<span className="select-none w-[16px] shrink-0 px-[3px] text-center text-[var(--text-tertiary)]">
							{" "}
						</span>
						<code className="flex-1 whitespace-pre pr-[12px] text-[var(--text-primary)]">
							{codeText}
						</code>
					</div>
					<div className="pl-[88px] pr-[12px] py-[9px]">
						<ThreadCard />
					</div>
				</div>
			</div>
		</div>
	);
}

export function ResolvedOrphanState(): JSX.Element {
	return (
		<div className="flex flex-col gap-[12px]">
			<div className="text-[12px] text-[var(--text-tertiary)]">
				Orphan state: when the anchored block no longer resolves, the card dims and shows a “source
				changed” badge.
			</div>
			<div className={cardClass}>
				<div className="flex items-center gap-[6px] border-b border-[var(--border-subtle)] px-[12px] py-[6px] opacity-60">
					<span
						className="h-[6px] w-[6px] rounded-full bg-[var(--text-tertiary)]"
						aria-hidden="true"
					/>
					<span className="font-mono text-[11px] text-[var(--text-tertiary)]">
						PromoField.tsx:118
					</span>
					<span className="ml-auto rounded-[var(--r-pill)] bg-[var(--surface-container)] px-[6px] py-[1px] text-[10px] text-[var(--text-tertiary)]">
						source changed
					</span>
				</div>
				<CommentRow
					message={anchoredMessage}
					sender={{ id: "u1", name: "You", isAgent: false }}
					showSenderHeader
					inlineAnchor="PromoField.tsx:118"
				/>
			</div>
		</div>
	);
}

// Keep the unused imports accepted by strict check.
export { Bookmark };
