// AM5 — base-primitive foundation story: Link (pure inline content).
// Link is the ONE inline base primitive — it has no block payload of its own; it
// is the `link` case in block/inline.tsx (rendered via renderInline). This story
// renders the link node in isolation + in flowing prose, reusing the shipped
// inline renderer (no duplication). Founder: Link is a foundation in its own right.
import type { InlineNode } from "../block/types.js";
import type { JSX } from "react";
import { renderInline } from "./block/inline.js";

export default { title: "Link", group: "Blocks" as const };

const link = (href: string, label: string): InlineNode => ({
	type: "link",
	href,
	children: [{ type: "text", value: label }],
});

export const Standalone = (): JSX.Element => (
	<p className="text-[var(--text-primary)] leading-[1.6] m-0">
		{renderInline([link("/work/bet/q3-onboarding", "Q3 onboarding bet")])}
	</p>
);

export const InProse = (): JSX.Element => (
	<p className="text-[var(--text-primary)] leading-[1.6] m-0">
		{renderInline([
			{ type: "text", value: "Open the " },
			link("/artifacts/a1", "draft artifact"),
			{ type: "text", value: " or jump to the " },
			link("/knowledge/k9", "knowledge entry"),
			{ type: "text", value: " for context." },
		])}
	</p>
);
