// AM5 — base-primitive foundation story: Paragraph (pure content).
// Thin wrapper over block/ParagraphPayload. Exercises inline strong/emphasis/code/link.
import type { JSX } from "react";
import { ParagraphPayload } from "./block/ParagraphPayload.js";

export default { title: "Paragraph", group: "Blocks" as const };

export const Plain = (): JSX.Element => (
	<ParagraphPayload
		inline={[
			{
				type: "text",
				value:
					"A paragraph of body text rendered on the Hearth content scale — the base unit of prose across artifacts, blocks and documents.",
			},
		]}
	/>
);

export const RichInline = (): JSX.Element => (
	<ParagraphPayload
		inline={[
			{ type: "text", value: "Ship via " },
			{ type: "strong", children: [{ type: "text", value: "the open contract" }] },
			{ type: "text", value: " and reuse " },
			{ type: "inlineCode", value: "deriveBlocks(body)" },
			{ type: "text", value: " — see the " },
			{ type: "link", href: "/docs/blocks", children: [{ type: "text", value: "block spec" }] },
			{ type: "text", value: "." },
		]}
	/>
);
