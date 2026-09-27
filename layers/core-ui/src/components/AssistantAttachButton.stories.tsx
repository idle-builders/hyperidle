/**
 * Stories for AssistantAttachButton — visible only when the assistant overlay is open.
 */

import type { JSX } from "react";
import { AssistantContext } from "../contexts/AssistantContext";
import { AssistantAttachButton } from "./AssistantAttachButton";

export default { title: "AssistantAttachButton", group: "Conversations" as const };

const REF = { kind: "task" as const, id: "task-1", label: "Pricing overhaul" };

export function OverlayOpen(): JSX.Element {
	return (
		<AssistantContext.Provider value={{ overlayOpen: true, attachContext: () => {} }}>
			<div className="flex w-[280px] items-center gap-[9px] p-[18px]">
				<span className="type-small text-[var(--text-primary)]">{REF.label}</span>
				<AssistantAttachButton ref={REF} />
			</div>
		</AssistantContext.Provider>
	);
}

export function OverlayClosed(): JSX.Element {
	return (
		<AssistantContext.Provider value={{ overlayOpen: false, attachContext: () => {} }}>
			<div className="flex w-[280px] items-center gap-[9px] p-[18px]">
				<span className="type-small text-[var(--text-primary)]">{REF.label}</span>
				<AssistantAttachButton ref={REF} />
			</div>
		</AssistantContext.Provider>
	);
}
