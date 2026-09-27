import type { JSX } from "react";
import { ReferenceChip, type ReferenceChipKind } from "./ReferenceChip.js";

export default {
	title: "ReferenceChip",
	group: "Conversations" as const,
	tier: "1" as const,
	order: ["PostedKinds", "DraftKinds", "DraftWithRemove", "WithMeta"],
};

const KINDS: ReferenceChipKind[] = ["artifact", "image", "document", "block", "task"];

export const PostedKinds = (): JSX.Element => (
	<div className="flex flex-wrap gap-[6px]">
		{KINDS.map((kind) => (
			<ReferenceChip key={kind} kind={kind} label={`${kind} reference`} mode="posted" />
		))}
	</div>
);

export const DraftKinds = (): JSX.Element => (
	<div className="flex flex-wrap gap-[6px]">
		{KINDS.map((kind) => (
			<ReferenceChip key={kind} kind={kind} label={`${kind}.ts`} mode="draft" />
		))}
	</div>
);

// B2 fix: draft mode with a non-interactive body (no onOpen) + a remove
// control with a custom accessible name — the shape HostThreadSection's
// "Re: <block excerpt>" reply preview adopted instead of a hand-rolled pill.
export const DraftWithRemove = (): JSX.Element => (
	<ReferenceChip
		kind="block"
		label="The auth cache TTL policy"
		mode="draft"
		onRemove={() => {}}
		removeAriaLabel="Cancel block reply"
	/>
);

export const WithMeta = (): JSX.Element => (
	<div className="flex flex-wrap gap-[6px]">
		<ReferenceChip kind="artifact" label="auth/passkey.ts" meta="+2 −1" mode="posted" />
		<ReferenceChip kind="image" label="auth-flow.png" meta="82 KB" mode="draft" />
	</div>
);
