// AM5 — (text, single) renders THROUGH the block system (K6).
//
// A `text` artifact's content IS a markdown body. A body's rich structure
// (headings, paragraphs, bullet/ordered lists, quotes, code, tables, images)
// is exactly the Block decomposition. So `(text, single)` renders through the
// SAME machinery as the `mixture` representation: `deriveBlocks(body)` + the
// block renderers (`block/*Payload` via `Block`). The block renderers ARE the
// rich text renderer — this is a unification, not a new component. The flat
// `TextRenderer` `whitespace-pre-wrap` div is insufficient and is retired.
//
// This story is presentational: it runs a realistic markdown `text` body
// through `deriveBlocks` and renders the block stream (mirrors how
// `KnowledgeBody` does it). No backend, no production wiring.

import type { BlockPayload } from "@hyperidle/shared";
import { deriveBlocks } from "@hyperidle/shared";
import { Block } from "../Block.js";

export default { title: "Kinds/TextBlocksRenderer" };

/**
 * Presentational text-via-blocks renderer.
 * Derives a markdown `text` body into a block stream and renders it through
 * the shared Block machinery — the same path the `mixture` representation uses.
 */
function TextBlocks({ body }: { body: string }): React.JSX.Element {
	const { blocks } = deriveBlocks(body, { kind: "artifact", id: "story-text" });
	return (
		<section aria-label="Text content" className="flex flex-col">
			{blocks.map((block) => (
				<Block key={block.id} id={block.id} payload={block.payload as BlockPayload} />
			))}
		</section>
	);
}

/**
 * The headline proof: a `text` body with the full rich structure a real
 * document carries — heading hierarchy, paragraphs, a bullet list, an ordered
 * list, a blockquote, a fenced code block, and a table — rendered THROUGH the
 * block system rather than dumped into a flat `whitespace-pre-wrap` div.
 */
export function RichDocument(): React.JSX.Element {
	return (
		<TextBlocks
			body={[
				"# Authentication strategy",
				"",
				"This document records the decision to use **JWT-based** authentication",
				"with refresh-token rotation, and the rationale behind it.",
				"",
				"## Token lifetimes",
				"",
				"Two token types, two lifetimes:",
				"",
				"- Access tokens expire in 15 minutes.",
				"- Refresh tokens last 7 days and rotate automatically.",
				"",
				"### Rollout steps",
				"",
				"1. Ship the issuer behind a flag.",
				"2. Migrate existing sessions on next login.",
				"3. Remove the legacy cookie path.",
				"",
				"> All tokens live in httpOnly cookies — never localStorage.",
				"",
				"## Reference",
				"",
				"The verification snippet teams paste into their service:",
				"",
				"```ts",
				"const claims = verify(token, publicKey);",
				"if (claims.exp < Date.now() / 1000) throw new TokenExpired();",
				"```",
				"",
				"Token matrix:",
				"",
				"| Token   | Lifetime | Storage         |",
				"| ------- | -------- | --------------- |",
				"| Access  | 15 min   | httpOnly cookie |",
				"| Refresh | 7 days   | httpOnly cookie |",
			].join("\n")}
		/>
	);
}

/**
 * A shorter body — heading + a couple of paragraphs + a list — to show the
 * same block path on a lighter document.
 */
export function ShortNote(): React.JSX.Element {
	return (
		<TextBlocks
			body={[
				"## Rate limiting",
				"",
				"Rate limiting runs at 100 requests/minute per API key using a sliding",
				"window. Over-limit requests return `429` with a `Retry-After` header.",
				"",
				"- Internal service accounts are exempt.",
				"- Limits reset on a rolling 60-second window.",
			].join("\n")}
		/>
	);
}
