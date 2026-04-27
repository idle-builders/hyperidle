/**
 * L7 — `FactoryStateContext`. Lifts the singleton `factory_state`
 * subscription into the AppShell so every page can read it without
 * mounting its own poll loop.
 *
 * @lore L7 (S5): three callers (AppShell, WorkBet, WorkTeam) used to
 * each instantiate `useFactoryState()`, producing three concurrent 30s
 * poll loops over the same singleton row. Pages now read from this
 * context provider; the AppShell mounts the only poller.
 */
import type { FactoryStateResponse } from "@hyperidle/shared";
import { createContext, useContext, type ReactNode } from "react";

interface FactoryStateContextValue {
	state: FactoryStateResponse;
	refresh: () => void;
}

const RUNNING: FactoryStateResponse = {
	paused: false,
	pausedBy: null,
	pausedAt: null,
	pausedReason: null,
};

const FALLBACK: FactoryStateContextValue = {
	state: RUNNING,
	refresh: () => {
		/* no-op outside provider */
	},
};

const FactoryStateContext = createContext<FactoryStateContextValue>(FALLBACK);

export interface FactoryStateProviderProps {
	value: FactoryStateContextValue;
	children: ReactNode;
}

export function FactoryStateProvider(props: FactoryStateProviderProps): JSX.Element {
	return (
		<FactoryStateContext.Provider value={props.value}>
			{props.children}
		</FactoryStateContext.Provider>
	);
}

export function useFactoryStateContext(): FactoryStateContextValue {
	return useContext(FactoryStateContext);
}
