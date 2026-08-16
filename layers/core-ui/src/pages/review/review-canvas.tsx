import { blockId, deriveBlocks, normalisedPayload } from "@hyperidle/block-derivation";
import { CommentRow, Composer } from "@hyperidle/design-system";
import type { AnchorRef, Block, BlockId, Message } from "@hyperidle/domain-model";
import type { ComponentType, JSX, ReactNode } from "react";
import { createContext, useCallback, useContext, useState } from "react";
import type { ReviewComment } from "./review-composition.js";

export interface ReviewCanvasContextValue {
	/** Anchored comments that belong to the active artifact. */
	readonly anchors: ReadonlyArray<ReviewComment>;
	/** True when the review is resolved — no new anchors or replies should be created. */
	readonly readOnly: boolean;
	/**
	 * Called by a canvas when the reviewer submits an inline anchored comment.
	 */
	readonly onAddAnchor: (input: { anchor: AnchorRef; text: string }) => Promise<void>;
	/**
	 * Called by the global conversation when an anchor chip is clicked.
	 */
	readonly onJumpToAnchor: (anchor: AnchorRef) => void;
}

const ReviewCanvasContext = createContext<ReviewCanvasContextValue | null>(null);

export const ReviewCanvasProvider: ComponentType<{
	children: ReactNode;
	value: ReviewCanvasContextValue;
}> = ReviewCanvasContext.Provider;

export function useReviewAnchors(): ReviewCanvasContextValue {
	const ctx = useContext(ReviewCanvasContext);
	if (!ctx) {
		// Default context so canvases can render outside a provider in tests/stories.
		return {
			anchors: [],
			readOnly: true,
			onAddAnchor: async () => undefined,
			onJumpToAnchor: () => undefined,
		};
	}
	return ctx;
}

function fileExtension(path: string): string {
	const idx = path.lastIndexOf(".");
	return idx > 0 ? path.slice(idx + 1) : "";
}

/**
 * Derive a stable {@link BlockId} for a single diff line.
 *
 * @lore AL4: Diff lines are not markdown. We synthesise a `code` payload and
 * an outline path that includes the artifact + file + hunk index. The line
 * survives edits that keep it inside the same hunk, but renames / hunk
 * renumbering will orphan anchors — accepted limitation.
 */
export function lineBlockId(
	artifactId: string,
	filePath: string,
	hunkIndex: number,
	line: { readonly text: string },
): BlockId {
	const payload: { kind: "code"; lang: string | null; text: string } = {
		kind: "code",
		lang: fileExtension(filePath),
		text: line.text,
	};
	return blockId({
		kind: "code",
		outlinePath: `${artifactId}:${filePath}#hunk${hunkIndex}`,
		normalisedPayload: normalisedPayload(payload),
	});
}

/**
 * Derive blocks for prose content inside a review artifact.
 */
export function deriveProseBlocks(artifactId: string, body: string): ReadonlyArray<Block> {
	return deriveBlocks(body, { kind: "artifact", id: artifactId }).blocks;
}

export interface InlineComposerProps {
	readonly anchor: AnchorRef;
	readonly onSubmit: (text: string) => Promise<void>;
}

export function InlineComposer({ anchor, onSubmit }: InlineComposerProps): JSX.Element {
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = useCallback(
		async (input: { text: string; clientKey: string }): Promise<void> => {
			setError(null);
			try {
				await onSubmit(input.text);
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : "Failed to send");
				throw cause;
			}
		},
		[onSubmit],
	);

	return (
		<div className="min-w-0 flex-1">
			{anchor.spotLabel ? (
				<div className="mb-[6px] flex items-center gap-[6px]">
					<span className="type-data   text-[var(--text-tertiary)]">on</span>
					<span className="type-data   text-[var(--text-tertiary)]">{anchor.spotLabel}</span>
				</div>
			) : null}
			{error ? (
				<div className="type-metadata mb-[6px]  text-[var(--status-error)]" role="alert">
					{error}
				</div>
			) : null}
			<Composer threadId="inline" onSubmit={handleSubmit} />
		</div>
	);
}

export interface AnchoredThreadCardProps {
	readonly anchor: AnchorRef;
	readonly comments: ReadonlyArray<ReviewComment>;
	readonly readOnly: boolean;
	/** AL4: the referenced block no longer resolves in the current rendered artifact. */
	readonly orphan?: boolean;
	readonly onReply?: (text: string) => Promise<void>;
}

function resolveSender(comment: ReviewComment): { id: string; name: string; isAgent?: boolean } {
	return { id: comment.id, name: comment.author, isAgent: comment.authorIsAgent };
}

function commentToMessage(comment: ReviewComment): Message {
	return {
		id: comment.id,
		threadId: "thread-inline",
		senderId: comment.author,
		clientKey: `ck-${comment.id}`,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: new Date().toISOString(),
		type: "plain",
		payload: { text: comment.body },
	} as Message;
}

export function AnchoredThreadCard({
	anchor,
	comments,
	readOnly,
	orphan = false,
	onReply,
}: AnchoredThreadCardProps): JSX.Element | null {
	const [replyOpen, setReplyOpen] = useState(false);
	const first = comments[0];
	if (!first) return null;

	const showReplyComposer = !readOnly && replyOpen;

	return (
		<div className="border-width-thin rounded-[var(--r-subtle)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] overflow-hidden">
			<div className="border-b-[var(--bw-thin)] flex items-center gap-[6px]  border-[var(--border-subtle)] px-[12px] py-[6px]">
				<span
					className="h-[6px] w-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary)]"
					aria-hidden="true"
				/>
				<span className="type-data   text-[var(--text-secondary)]">
					{anchor.spotLabel ?? "anchor"}
				</span>
				{orphan ? (
					<span className="type-metadata ml-auto rounded-[var(--r-pill)] bg-[var(--surface-container)] px-[6px] py-[1px]  text-[var(--text-tertiary)]">
						source changed
					</span>
				) : readOnly ? (
					<span className="type-metadata ml-auto rounded-[var(--r-pill)] bg-[var(--surface-container)] px-[6px] py-[1px]  text-[var(--text-tertiary)]">
						resolved
					</span>
				) : null}
			</div>
			<ul className="m-0 list-none p-0">
				{comments.map((comment, index) => (
					<CommentRow
						key={comment.id}
						message={commentToMessage(comment)}
						sender={resolveSender(comment)}
						showSenderHeader={index === 0}
						inlineAnchor={index === 0 ? anchor.spotLabel : undefined}
					/>
				))}
			</ul>
			{!readOnly ? (
				<div className="px-[12px] pb-[9px]">
					{showReplyComposer ? (
						<InlineComposer
							anchor={anchor}
							onSubmit={async (text) => {
								if (onReply) await onReply(text);
								setReplyOpen(false);
							}}
						/>
					) : (
						<button
							type="button"
							onClick={() => setReplyOpen(true)}
							className="type-control  text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
						>
							Reply
						</button>
					)}
				</div>
			) : null}
		</div>
	);
}
