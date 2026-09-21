import { useState } from "react";
import { MoveDialog } from "./MoveDialog";

export default { title: "Page: Document/MoveDialog" };

export const Default = (): React.JSX.Element => {
	const [open, setOpen] = useState(true);
	return (
		<MoveDialog
			open={open}
			onClose={() => setOpen(false)}
			onSaved={() => setOpen(false)}
			documentId="doc-test-1"
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
		documentId="doc-test-1"
		currentVersion={1}
		currentParentId={null}
		currentParentKind={null}
		scopeKind="factory"
	/>
);
