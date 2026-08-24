/**
 * BodyEditor stories — demonstrates all 6 key states of the editor component.
 */

import type { JSX } from "react";
import { BodyEditor } from "./BodyEditor.js";

export default {
	title: "BodyEditor",
	tier: "2" as const,
	order: ["Empty", "WithContent", "MiniVariant", "ReadOnly", "WithPlaceholder", "RichContent"],
};

const noop = (): void => {};

export const Empty = (): JSX.Element => (
	<BodyEditor initialContent="" variant="full" onChange={noop} />
);

export const WithContent = (): JSX.Element => (
	<BodyEditor
		initialContent="## Hello\n\nSome **bold** text and *italic* text.\n\n- Item one\n- Item two\n- Item three"
		variant="full"
		onChange={noop}
	/>
);

export const MiniVariant = (): JSX.Element => (
	<BodyEditor
		initialContent="A short note with **bold** and *italic* formatting."
		variant="mini"
		onChange={noop}
	/>
);

export const ReadOnly = (): JSX.Element => (
	<BodyEditor
		initialContent="## Read Only\n\nThis content is not editable. All formatting is preserved but you cannot type."
		editable={false}
		onChange={noop}
	/>
);

export const WithPlaceholder = (): JSX.Element => (
	<BodyEditor initialContent="" placeholder="Type your hypothesis..." onChange={noop} />
);

export const RichContent = (): JSX.Element => (
	<BodyEditor
		initialContent={`# Rich Content Example

A paragraph with **bold**, *italic*, ~~strikethrough~~, and \`inline code\`.

## Heading 2

### Heading 3

- Bullet item one
- Bullet item two
  - Nested item

1. Ordered item one
2. Ordered item two

> This is a blockquote with some text inside it.

\`\`\`typescript
const greeting = (name: string): string => {
  return \`Hello, \${name}!\`;
};
\`\`\`

| Name | Value | Count |
| --- | --- | --- |
| Alpha | foo | 1 |
| Beta | bar | 2 |

---

![Example image](https://placehold.co/600x200)`}
		variant="full"
		onChange={noop}
	/>
);
