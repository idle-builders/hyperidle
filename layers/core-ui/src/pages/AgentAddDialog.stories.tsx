/**
 * AB3 — AgentAddDialog stories.
 * Renders key states for visual verification.
 *
 * @lore AB3: Wrapped in <ToastRegion> because AgentAddDialog calls useToast().
 * The story viewer does not provide <ToastRegion>, so stories that render
 * dialogs must add their own wrapper to avoid a runtime crash.
 */

import type { JSX, ReactNode } from "react";
import { ToastRegion } from "../shell/ToastRegion.js";
import { AgentAddDialog } from "./AgentAddDialog.js";

const noop = (): void => {};

function WithToast({ children }: { children: ReactNode }): JSX.Element {
	return <ToastRegion>{children}</ToastRegion>;
}

export default { title: "Page: Work/AgentAddDialog" };

/** Dialog open — create form ready. Shows placement KeyValue above name field. */
export const Open = (): JSX.Element => (
	<WithToast>
		<AgentAddDialog open={true} teamName="Example Team" onClose={noop} onCreated={noop} />
	</WithToast>
);

/** Dialog closed. */
export const Closed = (): JSX.Element => (
	<WithToast>
		<AgentAddDialog open={false} teamName="Example Team" onClose={noop} onCreated={noop} />
	</WithToast>
);
