// @lore: sanitizeHtml — fixed, not a prop; single policy from utils/sanitize-html.ts for all agent-authored prose (documents, comments, text artifacts)

import type { Message } from "@hyperidle/domain-model";
import { isRedactedPayload } from "@hyperidle/domain-model";
import { type JSX, useMemo } from "react";
import { deriveBlocks } from "../../block/index.js";
import { AssistantAttachButton } from "../../components/AssistantAttachButton.js";
import { ArtifactFrame, Block } from "../../ds";
import { plainPayloadOf } from "../../ds/message-payload.js";
import { blockExcerptFromPayload, blockTextFromPayload } from "../../utils/block-excerpt.js";
import { sanitizeHtml } from "../../utils/sanitize-html.js";

export interface DocumentBodyProps {
	/** Raw markdown body text. May be empty. */
	body: string;
	/** Document id — passed as host.id to deriveBlocks. */
	hostId: string;
	/** Route document title; enables page-safe authored heading levels. */
	documentTitle?: string;
	/**
	 * Optional data-testid override. Defaults to "document-body".
	 * The edit-mode preview passes "document-edit-preview".
	 */
	testId?: string;
	/** Called when the user opens a block's actions menu (Space/Enter). */
	onOpenBlockActions?: (blockId: string) => void;
	/** Messages grouped by blockId for inline anchored-message slots. */
	messagesByBlockId?: ReadonlyMap<string, ReadonlyArray<Message>>;
}

// @lore: AnchoredMessages — anchorLost: anchor block missing or unreachable (edit or removal) renders an indicator; same signal for both cases
function AnchoredMessages({
	messages,
	anchorLost = false,
}: {
	messages: ReadonlyArray<Message>;
	anchorLost?: boolean;
}): JSX.Element | null {
	if (messages.length === 0) return null;
	return (
		<div data-testid="anchored-messages" className="flex flex-col gap-[3px] mt-[3px]">
			{anchorLost && (
				<span
					data-testid="anchor-lost-indicator"
					className="type-metadata  text-[var(--text-tertiary)] italic"
				>
					anchor lost
				</span>
			)}
			{messages.map((msg) => {
				if (msg.type !== "plain") return null;
				const payload = plainPayloadOf(msg);
				const text = isRedactedPayload(payload) ? "[redacted]" : payload.text;
				return (
					<div
						key={msg.id}
						className="type-metadata  text-[var(--text-tertiary)] px-2 py-1 bg-[var(--surface-container)] rounded-[var(--r-subtle)]"
					>
						{text}
					</div>
				);
			})}
		</div>
	);
}

export function DocumentBody({
	body,
	hostId,
	documentTitle,
	testId = "document-body",
	onOpenBlockActions,
	messagesByBlockId,
}: DocumentBodyProps): JSX.Element {
	const { blocks } = useMemo(
		() => deriveBlocks(body, { kind: "document", id: hostId }),
		[body, hostId],
	);

	// @lore: orphanMessages — pitch content may change after posting; orphans always shown, never silently dropped
	const orphanMessages = useMemo((): ReadonlyArray<Message> => {
		if (!messagesByBlockId) return [];
		// Widen to Set<string> so string keys from messagesByBlockId compare
		// without brand mismatch (BlockId is string & {__brand}).
		const renderedIds = new Set<string>(blocks.map((b) => b.id));
		const out: Message[] = [];
		for (const [blockId, msgs] of messagesByBlockId) {
			if (!renderedIds.has(blockId)) out.push(...msgs);
		}
		return out;
	}, [messagesByBlockId, blocks]);

	// @lore: sole-html-block — only when it is the ONLY block does a fenced html block run in the sandbox frame; alongside other blocks it stays a code listing
	if (blocks.length === 1) {
		const sole = blocks.at(0);
		if (sole !== undefined && sole.payload.kind === "code" && sole.payload.lang === "html") {
			return <ArtifactFrame html={sole.payload.text} title={documentTitle} />;
		}
	}

	return (
		<div data-document-body data-testid={testId} className="flex flex-col">
			{blocks.length === 0 ? (
				<p className="type-small text-[var(--text-tertiary)]  m-0">(no content yet)</p>
			) : (
				blocks.map((block, blockIndex) => (
					<div key={block.id} className="relative group/block-attach">
						<Block
							id={block.id}
							payload={block.payload}
							outline={documentTitle ? { documentTitle, blockIndex, levelOffset: 1 } : undefined}
							sanitizeHtml={sanitizeHtml}
							onOpenActions={
								onOpenBlockActions !== undefined ? () => onOpenBlockActions(block.id) : undefined
							}
							slots={{
								inlineAfterPayload: messagesByBlockId ? (
									<AnchoredMessages messages={messagesByBlockId.get(block.id) ?? []} />
								) : undefined,
							}}
						/>
						<AssistantAttachButton
							ref={{
								kind: "pending_block",
								content: blockTextFromPayload(block.payload),
								label: blockExcerptFromPayload(block.payload),
							}}
						/>
					</div>
				))
			)}
			<AnchoredMessages messages={orphanMessages} anchorLost />
		</div>
	);
}
