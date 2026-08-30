import { useState } from "react";
import { KnowledgeCreateDialog } from "./KnowledgeCreateDialog";

export default { title: "Page: Knowledge/KnowledgeCreateDialog" };

export const Default = (): React.JSX.Element => {
	const [open, setOpen] = useState(true);
	return (
		<KnowledgeCreateDialog
			open={open}
			onClose={() => setOpen(false)}
			onCreated={() => setOpen(false)}
		/>
	);
};

export const LockedBetScope = (): React.JSX.Element => {
	const [open, setOpen] = useState(true);
	return (
		<KnowledgeCreateDialog
			open={open}
			onClose={() => setOpen(false)}
			onCreated={() => setOpen(false)}
			lockedScopeKind="task"
			lockedScopeId="task-abc-123"
		/>
	);
};

export const Closed = (): React.JSX.Element => (
	<KnowledgeCreateDialog open={false} onClose={() => {}} onCreated={() => {}} />
);
