// AM5 — base-primitive foundation story: Table (pure content).
// Thin wrapper over block/TablePayload. Header/rows are InlineNode[][]; numeric
// cells render tabular-nums per AQ-006.
import type { JSX } from "react";
import { TablePayload } from "./block/TablePayload.js";

export default { title: "Table", group: "Blocks" as const };

export const Populated = (): JSX.Element => (
	<div className="w-[480px]">
		<TablePayload
			align={["left", "left", "right"]}
			header={[
				[{ type: "text", value: "Agent" }],
				[{ type: "text", value: "Role" }],
				[{ type: "text", value: "Bets" }],
			]}
			rows={[
				[
					[{ type: "text", value: "Atlas" }],
					[{ type: "text", value: "Builder" }],
					[{ type: "text", value: "12" }],
				],
				[
					[{ type: "text", value: "Vega" }],
					[{ type: "text", value: "Reviewer" }],
					[{ type: "text", value: "7" }],
				],
				[
					[{ type: "text", value: "Nova" }],
					[{ type: "text", value: "Designer" }],
					[{ type: "text", value: "21" }],
				],
			]}
		/>
	</div>
);

export const WithInline = (): JSX.Element => (
	<div className="w-[480px]">
		<TablePayload
			align={["left", "right"]}
			header={[[{ type: "text", value: "Metric" }], [{ type: "text", value: "Value" }]]}
			rows={[
				[
					[{ type: "strong", children: [{ type: "text", value: "Approval rate" }] }],
					[{ type: "text", value: "0.94" }],
				],
				[[{ type: "inlineCode", value: "p95_latency" }], [{ type: "text", value: "120ms" }]],
			]}
		/>
	</div>
);
