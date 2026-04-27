import { KillSwitchDialog } from "./KillSwitchDialog";

export default {
	title: "KillSwitchDialog",
	tier: "3" as const,
};

const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;

export const FactoryPausePressHold = (): React.JSX.Element => (
	<KillSwitchDialog
		open
		verb="factory_pause"
		target={{ id: "factory", name: "HyperIdle" }}
		blastRadius="This will pause 3 sessions across 1 product"
		mode="press_hold"
		onConfirm={asyncNoop}
		onCancel={noop}
	/>
);

export const FactoryPauseTypeName = (): React.JSX.Element => (
	<KillSwitchDialog
		open
		verb="factory_pause"
		target={{ id: "factory", name: "HyperIdle" }}
		blastRadius="This will pause 3 sessions across 1 product"
		mode="type_name"
		onConfirm={asyncNoop}
		onCancel={noop}
	/>
);

export const SessionPause = (): React.JSX.Element => (
	<KillSwitchDialog
		open
		verb="session_pause"
		target={{ id: "session-1", name: "Builder" }}
		blastRadius="This will pause Builder's session at the next checkpoint."
		mode="press_hold"
		onConfirm={asyncNoop}
		onCancel={noop}
	/>
);
