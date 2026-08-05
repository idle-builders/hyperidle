/**
 * AD8b — AssistantOverlay stories.
 * Renders key states for visual verification.
 */

import type { JSX } from "react";
import { createRef } from "react";
import type { AssistantContextRef } from "../contexts/AssistantContext";
import { AssistantOverlay } from "./AssistantOverlay";

export default {
	title: "AssistantOverlay",
	tier: "3" as const,
	uses: ["ThreadShell"],
};

const anchorRef = createRef<HTMLButtonElement>();
const noop = (): void => undefined;

const contextRefs: AssistantContextRef[] = [
	{ kind: "bet", id: "bet-1", label: "Ambrovia v2" },
	{ kind: "task", id: "task-1", label: "Fix authentication bug" },
];

/** Open overlay in empty-thread state (no messages). */
export function Empty(): JSX.Element {
	return (
		<div style={{ height: "600px", position: "relative" }}>
			<AssistantOverlay
				open={true}
				onClose={noop}
				anchorRef={anchorRef}
				contextRefs={[]}
				onRemoveContextRef={noop}
			/>
		</div>
	);
}

/** Open overlay with context refs attached. */
export function WithContextRefs(): JSX.Element {
	return (
		<div style={{ height: "600px", position: "relative" }}>
			<AssistantOverlay
				open={true}
				onClose={noop}
				anchorRef={anchorRef}
				contextRefs={contextRefs}
				onRemoveContextRef={noop}
			/>
		</div>
	);
}

/** Closed state — renders nothing. */
export function Closed(): JSX.Element {
	return (
		<div style={{ height: "600px", position: "relative" }}>
			<p style={{ color: "var(--text-tertiary)" }}>AssistantOverlay is closed — nothing renders.</p>
			<AssistantOverlay
				open={false}
				onClose={noop}
				anchorRef={anchorRef}
				contextRefs={[]}
				onRemoveContextRef={noop}
			/>
		</div>
	);
}
