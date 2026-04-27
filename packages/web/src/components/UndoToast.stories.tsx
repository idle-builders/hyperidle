import { UndoToast } from "./UndoToast";

export default { title: "UndoToast", tier: "utility" as const };

const baseProps = {
	visible: true,
	threadId: "thread-1",
	windowSeconds: 8,
	agentActed: false,
	auditRowId: "resp-1",
	onUndo: async (): Promise<void> => {},
	onDismiss: (): void => {},
};

export const Live = (): React.JSX.Element => <UndoToast {...baseProps} />;

export const Expiring = (): React.JSX.Element => <UndoToast {...baseProps} windowSeconds={2} />;

export const AgentActed = (): React.JSX.Element => (
	<UndoToast {...baseProps} agentActed={true} auditRowId="resp-42" threadId="thread-9" />
);

export const Hidden = (): React.JSX.Element => <UndoToast {...baseProps} visible={false} />;
