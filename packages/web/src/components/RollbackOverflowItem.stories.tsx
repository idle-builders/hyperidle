import { RollbackOverflowItem } from "./RollbackOverflowItem";

export default {
	title: "RollbackOverflowItem",
	tier: "3" as const,
};

const asyncOk = async (): Promise<{ outcome: "succeeded" }> => ({ outcome: "succeeded" });

export const ReversibleCommitted = (): React.JSX.Element => (
	<RollbackOverflowItem
		verdict={{ id: "v1", state: "committed", reversible: true, threadId: "t-1" }}
		onRollback={asyncOk}
	/>
);

export const NonReversible = (): React.JSX.Element | null => (
	<RollbackOverflowItem
		verdict={{ id: "v1", state: "committed", reversible: false, threadId: "t-1" }}
		onRollback={asyncOk}
	/>
);
