import type { JSX } from "react";
import { type InlineCommentDraft, RequestChangesComposer } from "./RequestChangesComposer";

export default { title: "RequestChangesComposer", tier: "3" as const };

const noop = (): void => {};
const noop2 = (_a: string, _b?: string): void => {};

const sampleDrafts: InlineCommentDraft[] = [
	{
		lineKey: "@@ -1,3 +1,5 @@:1",
		lineIndex: 1,
		preview: "import { jwt } from 'hono/jwt';",
		body: "Rename to authMiddleware for consistency.",
	},
	{
		lineKey: "@@ -1,3 +1,5 @@:4",
		lineIndex: 4,
		preview: "// TODO: add auth",
		body: "Drop this TODO; implementation lands in this diff.",
	},
];

/** Closed: nothing renders. */
export const Closed = (): JSX.Element | null => (
	<RequestChangesComposer
		open={false}
		drafts={[]}
		onChangeDraft={noop2}
		onRemoveDraft={noop}
		onSubmit={noop}
		onCancel={noop}
	/>
);

/** Empty: open with no inline drafts — typical R-key entry. */
export const OpenEmpty = (): JSX.Element | null => (
	<RequestChangesComposer
		open
		drafts={[]}
		onChangeDraft={noop2}
		onRemoveDraft={noop}
		onSubmit={noop}
		onCancel={noop}
	/>
);

/** With drafts: showcases multiple inline-comment rows and the submit-enabled state. */
export const OpenWithDrafts = (): JSX.Element | null => (
	<RequestChangesComposer
		open
		drafts={sampleDrafts}
		onChangeDraft={noop2}
		onRemoveDraft={noop}
		onSubmit={noop}
		onCancel={noop}
	/>
);

/** Validation error: parent surfaces an error message. */
export const OpenWithError = (): JSX.Element | null => (
	<RequestChangesComposer
		open
		drafts={[]}
		onChangeDraft={noop2}
		onRemoveDraft={noop}
		onSubmit={noop}
		onCancel={noop}
		errorMessage="Network error: please try again."
	/>
);
