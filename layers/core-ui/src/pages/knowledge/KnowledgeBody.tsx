/**
 * KnowledgeBody — renders a Knowledge item body as structured Block primitives.
 *
 * Replaces the `<pre>` shell at KnowledgeDetail.tsx:301-307 (L23).
 *
 * @lore L23: Client-side render-time derivation. `deriveBlocks` is pure, has no
 * I/O, and costs <1 ms on bodies within the 256 KB cap. No server-side
 * pre-derivation — see architecture.md § "Where the deriver runs".
 *
 * @lore L23 / AZ6: `sanitizeHtml` is fixed and NOT exposed as a prop. It now
 * comes from `utils/sanitize-html.ts`, which is the single policy for
 * agent-authored prose across every host that renders a body — a knowledge item,
 * a comment and a `text` artifact are the same class of content.
 *
 * @lore L23: `slots` is intentionally omitted from <Block /> calls. FU-1
 * (floating-ui wiring) and FU-2 (mobile sheet) are L26 prereqs; the popover is
 * not wired in L23. BlockHandle never renders without gutterLeading.
 *
 * @lore L18: `onOpenBlockActions` and `messagesByBlockId` are added to wire the
 * L18 block popover and inline anchored-message slots. When provided, blocks
 * become interactive (Space/Enter opens popover) and messages are shown inline
 * after their anchor block. Unmatched messages render in a catch-all container
 * at the bottom (same pattern as BetPitch/WorkBet).
 */

import { deriveBlocks } from "@hyperidle/block-derivation";
import { Block } from "@hyperidle/design-system";
import type { Message } from "@hyperidle/domain-model";
import { isRedactedPayload } from "@hyperidle/domain-model";
import { type JSX, useMemo } from "react";
import { AssistantAttachButton } from "../../components/AssistantAttachButton.js";
import { blockExcerptFromPayload } from "../../utils/block-excerpt.js";
import { sanitizeHtml } from "../../utils/sanitize-html.js";

export interface KnowledgeBodyProps {
	/** Raw markdown body text. May be empty. */
	body: string;
	/** Knowledge item id — passed as host.id to deriveBlocks. */
	hostId: string;
	/**
	 * Optional data-testid override. Defaults to "knowledge-body".
	 * The edit-mode preview passes "knowledge-edit-preview".
	 */
	testId?: string;
	/** L18: Called when the user opens a block's actions menu (Space/Enter). */
	onOpenBlockActions?: (blockId: string) => void;
	/** L18: Messages grouped by blockId for inline anchored-message slots. */
	messagesByBlockId?: ReadonlyMap<string, ReadonlyArray<Message>>;
}

/**
 * Inline anchored messages — shown below a block's payload.
 * @lore L18: same catch-all pattern as BetPitch/WorkBet.
 * @lore T5: `anchorLost` renders an honest indicator when the block this message
 * was anchored to no longer resolves (edited or deleted). Same signal for both cases.
 */
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
					className="text-xs text-[var(--text-tertiary)] italic"
				>
					anchor lost
				</span>
			)}
			{messages.map((msg) => {
				if (msg.type !== "plain") return null;
				const text = isRedactedPayload(msg.payload) ? "[redacted]" : msg.payload.text;
				return (
					<div
						key={msg.id}
						className="text-xs text-[var(--text-tertiary)] px-2 py-1 bg-[var(--surface-container)] rounded-[var(--r-subtle)]"
					>
						{text}
					</div>
				);
			})}
		</div>
	);
}

/**
 * KnowledgeBody renders a markdown body as a sequence of Block primitives.
 * Pure render: no state, no effects.
 */
export function KnowledgeBody({
	body,
	hostId,
	testId = "knowledge-body",
	onOpenBlockActions,
	messagesByBlockId,
}: KnowledgeBodyProps): JSX.Element {
	const { blocks } = useMemo(
		() => deriveBlocks(body, { kind: "knowledge_item", id: hostId }),
		[body, hostId],
	);

	// Collect messages whose blockId doesn't match any rendered block (orphans).
	// @lore L18: pitch content may change after a message was posted; show orphans
	// so they're never silently dropped.
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

	return (
		<div data-knowledge-body data-testid={testId} className="flex flex-col">
			{blocks.length === 0 ? (
				<p className="text-[var(--text-tertiary)] text-sm m-0">(no content yet)</p>
			) : (
				blocks.map((block) => (
					// T4: relative wrapper so AssistantAttachButton can be positioned in the gutter.
					<div key={block.id} className="relative group/block-attach">
						<Block
							id={block.id}
							payload={block.payload}
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
						{/* T4: AssistantAttachButton — shows when Assistant overlay is open */}
						<AssistantAttachButton
							ref={{
								kind: "block",
								blockId: block.id,
								hostKind: "knowledge_item",
								hostId: hostId,
								label: blockExcerptFromPayload(block.payload),
							}}
						/>
					</div>
				))
			)}
			{/* Catch-all: anchored messages whose block no longer exists in the body */}
			{/* T5: anchorLost={true} renders the honest indicator for orphaned messages */}
			<AnchoredMessages messages={orphanMessages} anchorLost />
		</div>
	);
}
