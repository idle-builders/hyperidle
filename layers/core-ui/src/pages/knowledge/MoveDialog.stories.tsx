import { useState } from "react";
import { MoveDialog } from "./MoveDialog";

export default { title: "Page: Knowledge/MoveDialog" };

export const Default = (): React.JSX.Element => {
	const [open, setOpen] = useState(true);
	return (
		<MoveDialog
			open={open}
			onClose={() => setOpen(false)}
			onSaved={() => setOpen(false)}
			knowledgeId="ki-test-1"
			currentVersion={1}
			currentParentId={null}
			currentParentKind={null}
			scopeKind="factory"
		/>
	);
};

export const Closed = (): React.JSX.Element => (
	<MoveDialog
		open={false}
		onClose={() => {}}
		onSaved={() => {}}
		knowledgeId="ki-test-1"
		currentVersion={1}
		currentParentId={null}
		currentParentKind={null}
		scopeKind="factory"
	/>
);
