import type { BlockId, BlockPayload } from "@hyperidle/domain-model";
import { Block } from "./Block.js";

export default {
	title: "Block",
	tier: "2" as const,
	order: ["Heading", "Paragraph", "List", "Quote", "Code", "Table", "Divider", "Image", "Unknown"],
};

const STUB = "0123456789abcdef0123456789abcdef" as BlockId;

const para = (text: string): BlockPayload => ({
	kind: "paragraph",
	inline: [{ type: "text", value: text }],
});

export const Heading = (): React.JSX.Element => (
	<Block
		id={STUB}
		payload={{
			kind: "heading",
			level: 2,
			text: "Hello world",
			inline: [{ type: "text", value: "Hello world" }],
		}}
	/>
);

export const Paragraph = (): React.JSX.Element => (
	<Block id={STUB} payload={para("A paragraph of body text.")} />
);

export const List = (): React.JSX.Element => (
	<Block
		id={STUB}
		payload={{
			kind: "list",
			ordered: false,
			start: null,
			items: [
				{ children: [para("First item")] },
				{ children: [para("Second item")] },
				{ children: [para("Third item")] },
			],
		}}
	/>
);

export const Quote = (): React.JSX.Element => (
	<Block
		id={STUB}
		payload={{
			kind: "quote",
			children: [para("A quoted line.")],
		}}
	/>
);

export const Code = (): React.JSX.Element => (
	<Block id={STUB} payload={{ kind: "code", lang: "ts", text: "const x = 1\nconsole.log(x)" }} />
);

export const Table = (): React.JSX.Element => (
	<Block
		id={STUB}
		payload={{
			kind: "table",
			align: ["left", "right"],
			header: [[{ type: "text", value: "Name" }], [{ type: "text", value: "Count" }]],
			rows: [
				[[{ type: "text", value: "alpha" }], [{ type: "text", value: "1" }]],
				[[{ type: "text", value: "beta" }], [{ type: "text", value: "2" }]],
			],
		}}
	/>
);

export const Divider = (): React.JSX.Element => <Block id={STUB} payload={{ kind: "divider" }} />;

export const Image = (): React.JSX.Element => (
	<Block
		id={STUB}
		payload={{
			kind: "image",
			alt: "An example image",
			url: "https://placehold.co/600x200",
			title: null,
		}}
	/>
);

export const Unknown = (): React.JSX.Element => (
	<Block
		id={STUB}
		payload={{
			kind: "unknown",
			raw: "unrecognised content",
			reason: "parser-unrecognised",
		}}
	/>
);
