import type React from "react";
import { Avatar } from "./Avatar.js";
import { ItemList } from "./ItemList.js";
import { Row } from "./Row.js";
import { RowDot } from "./RowDot.js";
import { StatusChip } from "./StatusChip.js";
import { Tag } from "./Tag.js";

export default {
	title: "Row",
	tier: "2" as const,
	uses: ["RowDot", "Avatar", "StatusChip", "Tag"],
	order: [
		"Plain",
		"WithStatusDot",
		"WithAvatarLead",
		"WithCells",
		"WithTrailingAction",
		"Selected",
		"Subtitle",
		"NoLeadNoPlaceholder",
	],
};

export const Plain = (): React.JSX.Element => (
	<ItemList isEmpty={false} variant="contained">
		<Row title="Builder Agent" />
		<Row title="Strategy Agent" />
	</ItemList>
);

export const WithStatusDot = (): React.JSX.Element => (
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
		<Row title="Offline Agent" lead={<RowDot tone="error" label="Error" />} onClick={() => {}} />
	</ItemList>
);

export const WithAvatarLead = (): React.JSX.Element => (
	<ItemList isEmpty={false} variant="contained">
		<Row
			title="Builder Agent"
			lead={
				<>
					<RowDot tone="success" label="Healthy" />
					<Avatar initials="BA" size="sm" agent />
				</>
			}
			onClick={() => {}}
		/>
		<Row
			title="Strategy Agent"
			lead={
				<>
					<RowDot tone="neutral" />
					<Avatar initials="SA" size="sm" agent />
				</>
			}
			onClick={() => {}}
		/>
	</ItemList>
);

export const WithCells = (): React.JSX.Element => (
	<ItemList isEmpty={false} variant="contained">
		<Row
			title="Builder Agent"
			lead={<RowDot tone="success" label="Healthy" />}
			cells={[
				{ content: <Tag label="team" />, "data-testid": "agent-card-category" },
				{ content: "idle", width: 48, "data-testid": "agent-status" },
				{
					content: "Awaiting next task",
					width: 140,
					align: "start",
					"data-testid": "agent-context",
				},
			]}
			onClick={() => {}}
		/>
		<Row
			title="Daily digest"
			lead={<RowDot tone="success" />}
			cells={[
				{ content: "Every day at 8:00 AM", width: 80, align: "start" },
				{ content: "2d ago", width: 60, numeric: true },
				{ content: "—", width: 54, numeric: true },
			]}
			onClick={() => {}}
		/>
	</ItemList>
);

export const WithTrailingAction = (): React.JSX.Element => (
	<ItemList isEmpty={false} variant="contained">
		<Row
			title="Builder Agent"
			lead={<RowDot tone="success" label="Healthy" />}
			cells={[{ content: <StatusChip status="healthy" />, "data-testid": "agent-status" }]}
			actions={
				<button
					type="button"
					className="btn btn-ghost btn-xs"
					onClick={(e) => e.stopPropagation()}
					data-testid="agent-customize-btn"
				>
					Customize
				</button>
			}
			onClick={() => {}}
		/>
	</ItemList>
);

export const Selected = (): React.JSX.Element => (
	<ItemList isEmpty={false} variant="contained">
		<Row title="Regular row" onClick={() => {}} />
		<Row title="Selected row (active)" selected onClick={() => {}} />
		<Row title="Another row" onClick={() => {}} />
	</ItemList>
);

export const Subtitle = (): React.JSX.Element => (
	<ItemList isEmpty={false} variant="contained">
		<Row
			title="Architecture Decision: Auth Strategy"
			subtitle="JWT auth decision — last updated 1d ago"
			onClick={() => {}}
		/>
		<Row
			title="User Interview Notes"
			subtitle="Interview notes — last updated 2d ago"
			onClick={() => {}}
		/>
	</ItemList>
);

export const NoLeadNoPlaceholder = (): React.JSX.Element => (
	<ItemList isEmpty={false} variant="contained">
		<Row title="Row without lead (no placeholder renders)" onClick={() => {}} />
		<Row title="Another leadless row" onClick={() => {}} />
	</ItemList>
);
