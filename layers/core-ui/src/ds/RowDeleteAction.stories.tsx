import type React from "react";
import { useState } from "react";
import { ItemList } from "./ItemList.js";
import { Row } from "./Row.js";
import { RowDeleteAction } from "./RowDeleteAction.js";

export default { title: "RowDeleteAction" };

export const Default = (): React.JSX.Element => (
	<ItemList variant="flush" isEmpty={false}>
		<Row
			title="write-tests"
			actions={
				<RowDeleteAction
					triggerLabel="Actions for write-tests"
					menuLabel="Item actions"
					onDelete={() => {}}
				/>
			}
		/>
	</ItemList>
);

export const WithExtraItem = (): React.JSX.Element => (
	<ItemList variant="flush" isEmpty={false}>
		<Row
			title="Nova"
			actions={
				<RowDeleteAction
					triggerLabel="Actions for Nova"
					menuLabel="Agent actions"
					items={[{ id: "edit", label: "Edit", onSelect: () => {} }]}
					onDelete={() => {}}
				/>
			}
		/>
	</ItemList>
);

export const NoDelete = (): React.JSX.Element => (
	<ItemList variant="flush" isEmpty={false}>
		<Row
			title="Assistant"
			actions={
				<RowDeleteAction
					triggerLabel="Actions for Assistant"
					menuLabel="Agent actions"
					items={[{ id: "edit", label: "Edit", onSelect: () => {} }]}
				/>
			}
		/>
	</ItemList>
);

/** Click the "..." trigger, then "Delete" to see the confirm/cancel step. */
export const ConfirmStep = (): React.JSX.Element => {
	const [deleted, setDeleted] = useState(false);
	return (
		<ItemList variant="flush" isEmpty={false}>
			<Row
				title={deleted ? "write-tests (deleted)" : "write-tests"}
				actions={
					<RowDeleteAction
						triggerLabel="Actions for write-tests"
						menuLabel="Item actions"
						onDelete={() => setDeleted(true)}
					/>
				}
			/>
		</ItemList>
	);
};
