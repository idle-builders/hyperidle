import { PauseSessionButton } from "./PauseSessionButton";

export default {
	title: "PauseSessionButton",
	tier: "3" as const,
};

const asyncNoop = async (): Promise<void> => undefined;

export const Running = (): React.JSX.Element => (
	<PauseSessionButton
		session={{ id: "session-1", state: "running", agentName: "Builder" }}
		onPause={asyncNoop}
		onResume={asyncNoop}
	/>
);

export const Paused = (): React.JSX.Element => (
	<PauseSessionButton
		session={{ id: "session-1", state: "paused", agentName: "Builder" }}
		onPause={asyncNoop}
		onResume={asyncNoop}
	/>
);

export const FactoryPaused = (): React.JSX.Element => (
	<PauseSessionButton
		session={{ id: "session-1", state: "running", agentName: "Builder" }}
		onPause={asyncNoop}
		onResume={asyncNoop}
		factoryPaused
	/>
);
