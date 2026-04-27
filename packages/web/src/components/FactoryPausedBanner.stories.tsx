import { FactoryPausedBanner } from "./FactoryPausedBanner";

export default {
	title: "FactoryPausedBanner",
	tier: "3" as const,
};

const noop = (): void => undefined;

export const Paused = (): React.JSX.Element => (
	<FactoryPausedBanner
		state={{
			paused: true,
			pausedBy: "actor:ceo",
			pausedAt: "2026-04-27T10:00:00.000Z",
			pausedReason: "spotted bad output",
		}}
		onResume={noop}
	/>
);

export const Running = (): React.JSX.Element => (
	<FactoryPausedBanner
		state={{ paused: false, pausedBy: null, pausedAt: null, pausedReason: null }}
		onResume={noop}
	/>
);
