/**
 * L21 — CocOverlay stories.
 * Renders key states at /designsystem for visual verification.
 */

import { createRef } from "react";
import type { CocContextRef } from "../contexts/CocContext";
import { CocOverlay } from "./CocOverlay";

export default {
	title: "CocOverlay",
	tier: "3" as const,
	uses: ["ThreadShell"],
};

const anchorRef = createRef<HTMLButtonElement>();
const noop = (): void => undefined;

const contextRefs: CocContextRef[] = [
	{ kind: "bet", id: "bet-1", label: "Ambrovia v2" },
	{ kind: "task", id: "task-1", label: "Fix authentication bug" },
];

/** Open overlay in empty-thread state (no messages). */
export function Empty(): JSX.Element {
	return (
		<div style={{ height: "600px", position: "relative" }}>
			<CocOverlay
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
			<CocOverlay
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
			<p style={{ color: "var(--text-tertiary)" }}>CocOverlay is closed — nothing renders.</p>
			<CocOverlay
				open={false}
				onClose={noop}
				anchorRef={anchorRef}
				contextRefs={[]}
				onRemoveContextRef={noop}
			/>
		</div>
	);
}
