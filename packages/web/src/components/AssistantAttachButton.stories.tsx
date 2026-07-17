/**
 * LG1 Phase 5 — AssistantAttachButton stories.
 *
 * The button renders only when the assistant overlay is open (returns null otherwise).
 * Stories provide AssistantContext.Provider with overlayOpen=true to render the button.
 */

import type { JSX } from "react";
import { AssistantContext } from "../contexts/AssistantContext.js";
import { AssistantAttachButton } from "./AssistantAttachButton.js";

export default { title: "AssistantAttachButton", group: "Conversations" as const };

const noop = (): void => {};

const OPEN_CONTEXT = {
	overlayOpen: true,
	attachContext: noop,
};

const CLOSED_CONTEXT = {
	overlayOpen: false,
	attachContext: noop,
};

/** Overlay open — button renders. */
export function AssistantAttachButtonVisible(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<AssistantContext.Provider value={OPEN_CONTEXT}>
				<AssistantAttachButton ref={{ kind: "bet", id: "bet-01", label: "Chat streaming fix" }} />
			</AssistantContext.Provider>
		</div>
	);
}

/** Overlay closed — button returns null (nothing visible). */
export function AssistantAttachButtonHidden(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<AssistantContext.Provider value={CLOSED_CONTEXT}>
				<span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
					(button hidden — overlay is closed)
				</span>
				<AssistantAttachButton ref={{ kind: "task", id: "task-01", label: "Fix streaming" }} />
			</AssistantContext.Provider>
		</div>
	);
}

/** Knowledge item context ref. */
export function AssistantAttachButtonKnowledge(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<AssistantContext.Provider value={OPEN_CONTEXT}>
				<AssistantAttachButton
					ref={{ kind: "knowledge_item", id: "ki-01", label: "SDK upgrade notes" }}
				/>
			</AssistantContext.Provider>
		</div>
	);
}
