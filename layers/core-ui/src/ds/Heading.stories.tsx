// AM5 — base-primitive foundation story: Heading (pure content, no state, no diff).
// Thin wrapper over the shipped block/HeadingPayload — reuses logic, no duplication.
import type { JSX } from "react";
import { HeadingPayload } from "./block/HeadingPayload.js";

export default { title: "Heading", group: "Blocks" as const };

export const Levels = (): JSX.Element => (
	<div className="flex flex-col gap-[12px]">
		<HeadingPayload level={1} inline={[{ type: "text", value: "Heading level one" }]} />
		<HeadingPayload level={2} inline={[{ type: "text", value: "Heading level two" }]} />
		<HeadingPayload level={3} inline={[{ type: "text", value: "Heading level three" }]} />
		<HeadingPayload level={4} inline={[{ type: "text", value: "Heading level four" }]} />
		<HeadingPayload level={5} inline={[{ type: "text", value: "Heading level five" }]} />
		<HeadingPayload level={6} inline={[{ type: "text", value: "Heading level six" }]} />
	</div>
);

export const WithInline = (): JSX.Element => (
	<HeadingPayload
		level={2}
		inline={[
			{ type: "text", value: "Quarterly review " },
			{ type: "emphasis", children: [{ type: "text", value: "(draft)" }] },
		]}
	/>
);
