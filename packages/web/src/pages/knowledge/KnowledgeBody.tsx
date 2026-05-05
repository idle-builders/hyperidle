/**
 * KnowledgeBody — renders a Knowledge item body as structured Block primitives.
 *
 * Replaces the `<pre>` shell at KnowledgeDetail.tsx:301-307 (L23).
 *
 * @lore L23: Client-side render-time derivation. `deriveBlocks` is pure, has no
 * I/O, and costs <1 ms on bodies within the 256 KB cap. No server-side
 * pre-derivation — see architecture.md § "Where the deriver runs".
 *
 * @lore L23: `sanitizeHtml` is fixed to DOMPurify.sanitize (default profile) and
 * is NOT exposed as a prop. One host, one sanitiser policy. Future hosts that
 * need a different policy build their own renderer. See architecture.md § 2.
 *
 * @lore L23: `slots` is intentionally omitted from <Block /> calls. FU-1
 * (floating-ui wiring) and FU-2 (mobile sheet) are L26 prereqs; the popover is
 * not wired in L23. BlockHandle never renders without gutterLeading.
 */

import { Block } from "@hyperidle/design-system";
import { deriveBlocks } from "@hyperidle/shared";
import DOMPurify from "dompurify";
import { type JSX, useMemo } from "react";

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
}

/**
 * Fixed sanitiser — DOMPurify default profile.
 * Not parametrised: one host, one policy.
 */
const sanitizeHtml = (raw: string): string => DOMPurify.sanitize(raw);

/**
 * KnowledgeBody renders a markdown body as a sequence of Block primitives.
 * Pure render: no state, no effects.
 */
export function KnowledgeBody({
	body,
	hostId,
	testId = "knowledge-body",
}: KnowledgeBodyProps): JSX.Element {
	const { blocks } = useMemo(
		() => deriveBlocks(body, { kind: "knowledge_item", id: hostId }),
		[body, hostId],
	);

	return (
		<div data-knowledge-body data-testid={testId} className="flex flex-col">
			{blocks.length === 0 ? (
				<p className="text-[var(--text-lo)] text-sm m-0">(no content yet)</p>
			) : (
				blocks.map((block) => (
					<Block key={block.id} id={block.id} payload={block.payload} sanitizeHtml={sanitizeHtml} />
				))
			)}
		</div>
	);
}
