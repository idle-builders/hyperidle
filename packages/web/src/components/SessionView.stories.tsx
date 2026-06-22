/**
 * AM3 — APPROVED "Session View" (founder review, 2026-06-22, 12 review rounds).
 *
 * Rendering axis: DISCLOSURE-MINIMAL + AGGREGATION-FORWARD. The calmest possible
 * reading of a session. At rest every tool call is a single bare line (icon · verb
 * · muted target · status) with NO inline I/O; a consecutive run folds hard into
 * ONE summary verb ("Read 2 files, ran a command, searched, queried Linear"). The
 * agent's prose owns the column; tool activity recedes to a quiet ledger you open
 * only when you want it.
 *
 * This story renders the PRODUCTION `SessionView` component (NOT a parallel
 * renderer). `SessionView` feeds `ActivityEntry[]` through the real
 * `derivePartsFromSession` adapter → `PartList` dispatch. The viewer at `:8098`
 * and the DOM-snapshot net both exercise the real production components.
 *
 * Data fixtures live in `sessionContentFixtures.tsx` (data-only; no renderer atoms).
 *
 * @lore AM3: hard-rule — one message renderer (`PartList` over
 * `derivePartsFromSession`). The fixture fork (the old parallel AgentProse /
 * HumanRow / QueuedBubble / SessionComposer / blockStream / ToolGlyph atoms) has
 * been deleted; the story now exercises the production path.
 */

import { type JSX, useState } from "react";
import { SessionView } from "./SessionView.js";
import {
	DESCRIPTOR,
	FOUNDER,
	SESSION_COST,
	SESSION_ENTRIES,
	SESSION_IDENTITY,
} from "./sessionContentFixtures.js";

export default { title: "Session View", group: "Conversations" as const };

/**
 * The full approved Session View — streaming state (agent is working).
 * Exercises all aspect-taxonomy items: streaming text · reasoning fold ·
 * tool families incl. mcp + sub-agent · FAILED tool (aggregate header signals
 * failure) · hard aggregation · diff chip + changed-files panel · cost in
 * header · queued message · descriptor pills · working/Stop state.
 */
// biome-ignore lint/style/useNamingConvention: story exports use Snake_Case to show variant hierarchy in the viewer (established pattern across all stories)
export function SessionView_Streaming(): JSX.Element {
	const [entries, setEntries] = useState<import("@hyperidle/shared").ActivityEntry[]>([
		...SESSION_ENTRIES,
	]);

	return (
		<div className="h-[900px] w-full">
			<SessionView
				entries={entries}
				identity={SESSION_IDENTITY}
				cost={SESSION_COST}
				descriptor={DESCRIPTOR}
				status="streaming"
				onOpen={(_target) => {
					// Story: open targets are no-ops (no router context)
				}}
				onSend={(text) => {
					// Story: echo the send as a human_message entry
					setEntries((prev) => [
						...prev,
						{
							type: "human_message",
							timestamp: Date.now(),
							data: {
								text,
								// Narrow isAgent to the literal false required by HumanMessageData.
								author: { ...FOUNDER, isAgent: false as const, isMe: true },
							},
						},
					]);
				}}
				onStop={() => {
					// Story: no-op
				}}
			/>
		</div>
	);
}

/**
 * Idle state — no active stream; the composer shows Send (not Stop).
 */
// biome-ignore lint/style/useNamingConvention: story exports use Snake_Case to show variant hierarchy in the viewer (established pattern across all stories)
export function SessionView_Idle(): JSX.Element {
	return (
		<div className="h-[900px] w-full">
			<SessionView
				entries={SESSION_ENTRIES}
				identity={SESSION_IDENTITY}
				cost={SESSION_COST}
				descriptor={DESCRIPTOR}
				status="ended"
				onOpen={(_target) => {
					// Story: no-op
				}}
				onSend={(_text) => {
					// Story: no-op
				}}
			/>
		</div>
	);
}

/**
 * No descriptor — composer shows no pills.
 */
// biome-ignore lint/style/useNamingConvention: story exports use Snake_Case to show variant hierarchy in the viewer (established pattern across all stories)
export function SessionView_NoPills(): JSX.Element {
	return (
		<div className="h-[900px] w-full">
			<SessionView
				entries={SESSION_ENTRIES}
				identity={SESSION_IDENTITY}
				cost={undefined}
				descriptor={undefined}
				status="ended"
				onOpen={(_target) => {
					// Story: no-op
				}}
				onSend={(_text) => {
					// Story: no-op
				}}
			/>
		</div>
	);
}
