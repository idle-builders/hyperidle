import { useState } from "react";
import { ScopeChangeDialog } from "./ScopeChangeDialog";

export default { title: "Page: Document/ScopeChangeDialog" };

export const Default = (): React.JSX.Element => {
	const [open, setOpen] = useState(true);
	return (
		<ScopeChangeDialog
			open={open}
			onClose={() => setOpen(false)}
			onSaved={() => setOpen(false)}
			documentId="doc-test-1"
			currentVersion={1}
			currentScopeKind="user"
			hasParent={true}
		/>
	);
};

export const Closed = (): React.JSX.Element => (
	<ScopeChangeDialog
		open={false}
		onClose={() => {}}
		onSaved={() => {}}
		documentId="doc-test-1"
		currentVersion={1}
		currentScopeKind="factory"
		hasParent={true}
	/>
);
