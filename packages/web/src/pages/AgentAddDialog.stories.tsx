/**
 * AB3 — AgentAddDialog stories.
 * Renders key states at /designsystem for visual verification.
 */

import type { JSX } from "react";
import { AgentAddDialog } from "./AgentAddDialog.js";

const noop = (): void => {};

export default { title: "Page: Work/AgentAddDialog" };

/** Dialog open — create form ready. */
export const Open = (): JSX.Element => (
	<AgentAddDialog open={true} teamMembersId="tm-example" onClose={noop} onCreated={noop} />
);

/** Dialog closed. */
export const Closed = (): JSX.Element => (
	<AgentAddDialog open={false} teamMembersId="tm-example" onClose={noop} onCreated={noop} />
);
