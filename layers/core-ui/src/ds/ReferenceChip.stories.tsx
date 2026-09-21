import type { JSX } from "react";
import { ReferenceChip, type ReferenceChipKind } from "./ReferenceChip.js";

export default {
	title: "ReferenceChip",
	group: "Conversations" as const,
	tier: "1" as const,
	order: ["PostedKinds", "DraftKinds", "WithMeta"],
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

export const WithMeta = (): JSX.Element => (
	<div className="flex flex-wrap gap-[6px]">
		<ReferenceChip kind="artifact" label="auth/passkey.ts" meta="+2 −1" mode="posted" />
		<ReferenceChip kind="image" label="auth-flow.png" meta="82 KB" mode="draft" />
	</div>
);
