import { createContext, useContext } from "react";

/**
 * Whether you are writing in a document right now. While you are, what is new waits quietly in
 * the sidebar instead of moving the list under you.
 */
interface Focus {
	readonly editing: boolean;
	readonly setEditing: (editing: boolean) => void;
}

export const FocusContext = createContext<Focus>({ editing: false, setEditing: () => undefined });

export function useFocus(): Focus {
	return useContext(FocusContext);
}
