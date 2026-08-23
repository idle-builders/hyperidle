// AM5 — base-primitive foundation story: List (pure content).
// Thin wrapper over block/ListPayload. Items hold nested BlockPayload children
// (paragraphs), matching the shipped recursion.
import type { BlockPayload } from "../block/types.js";
import type { JSX } from "react";
import { ListPayload } from "./block/ListPayload.js";

export default { title: "List", group: "Blocks" as const };

const para = (text: string): BlockPayload => ({
	kind: "paragraph",
	inline: [{ type: "text", value: text }],
});

export const Unordered = (): JSX.Element => (
	<ListPayload
		ordered={false}
		start={null}
		items={[
			{ children: [para("Plan the bet")] },
			{ children: [para("Interact through the conversation")] },
			{ children: [para("Review the result")] },
		]}
	/>
);

export const Ordered = (): JSX.Element => (
	<ListPayload
		ordered={true}
		start={1}
		items={[
			{ children: [para("Extract the acceptance criteria")] },
			{ children: [para("Define the verification method")] },
			{ children: [para("Write the failing tests")] },
			{ children: [para("Implement against the target")] },
		]}
	/>
);
