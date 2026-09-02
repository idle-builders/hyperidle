import type React from "react";
import { ItemList } from "./ItemList.js";
import { Row } from "./Row.js";
import { RowDot } from "./RowDot.js";

export default {
	title: "ItemList",
	tier: "2" as const,
	uses: ["Row", "RowDot", "EmptyState", "SkeletonList", "ErrorState"],
	order: ["Populated", "Empty", "Loading", "Error", "Flush", "Boxed", "AsUl"],
};

export const Populated = (): React.JSX.Element => (
	<ItemList isEmpty={false} variant="contained">
		<Row
			title="Builder Agent"
			lead={<RowDot tone="success" label="Healthy" />}
			onClick={() => {}}
		/>
		<Row
			title="Strategy Agent"
			lead={<RowDot tone="warning" label="Degraded" />}
			onClick={() => {}}
		/>
		<Row title="Idle Agent" lead={<RowDot tone="neutral" />} onClick={() => {}} />
	</ItemList>
);

export const Empty = (): React.JSX.Element => (
	<ItemList
		isEmpty
		empty={{
			title: "No agents",
			description: "No agents are assigned to this team.",
			dataTestId: "agents-empty",
		}}
	>
		{/* No children — isEmpty=true triggers EmptyState */}
	</ItemList>
);

export const Loading = (): React.JSX.Element => (
	<ItemList isEmpty={false} loading loadingRows={4} loadingLabel="Loading agents">
		{/* Children not shown during loading */}
	</ItemList>
);

export const ErrorState = (): React.JSX.Element => (
	<ItemList
		isEmpty={false}
		error={{ description: "Failed to load agents. The server returned a 503 error." }}
	>
		{/* Children not shown during error */}
	</ItemList>
);

export const Flush = (): React.JSX.Element => (
	<ItemList isEmpty={false} variant="flush">
		<Row
			title="Architecture Decision: Auth Strategy"
			subtitle="JWT auth decision"
			onClick={() => {}}
		/>
		<Row title="User Interview Notes" subtitle="Interview notes" onClick={() => {}} />
	</ItemList>
);

export const Boxed = (): React.JSX.Element => (
	<ItemList isEmpty={false} variant="boxed">
		<Row title="claude-code" subtitle="Ready" onClick={() => {}} />
		<Row title="codex" subtitle="Unauthenticated" onClick={() => {}} />
	</ItemList>
);

export const AsUl = (): React.JSX.Element => (
	<ItemList isEmpty={false} variant="flush" as="ul">
		<Row as="li" title="Architecture Decision" onClick={() => {}} />
		<Row as="li" title="User Interview Notes" onClick={() => {}} />
	</ItemList>
);
