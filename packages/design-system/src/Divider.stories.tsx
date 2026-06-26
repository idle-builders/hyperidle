// AM5 — base-primitive foundation story: Divider (pure content).
// Thin wrapper over block/DividerPayload (no props — a thematic rule).
import type { JSX } from "react";
import { DividerPayload } from "./block/DividerPayload.js";
import { ParagraphPayload } from "./block/ParagraphPayload.js";

export default { title: "Divider", group: "Blocks" as const };

export const Rule = (): JSX.Element => (
	<div className="flex flex-col">
		<ParagraphPayload inline={[{ type: "text", value: "Content above the divider." }]} />
		<DividerPayload />
		<ParagraphPayload inline={[{ type: "text", value: "Content below the divider." }]} />
	</div>
);
