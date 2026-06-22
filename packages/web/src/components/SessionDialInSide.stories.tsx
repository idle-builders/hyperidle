/**
 * AM3 Variant A — "Side panel" (slide-over beside the conversation).
 *
 * The session-reference Fold in the conversation opens a right-docked dial-in
 * column; the conversation stays visible at left. Config sits at the TOP of the
 * panel (collapsed to a Fold once you're auditing); activity fills the column
 * below via PartList — the SAME renderer the conversation uses.
 *
 * Thesis: dial-in is a COMPANION to the conversation you came from — you never
 * lose context. The panel is the lower-level sub-room docked alongside, not a
 * place that replaces the conversation.
 */

import type { JSX } from "react";
import { PartList } from "./PartList.js";
import { ConfigFold, DialInControls, DialInHeader, SESSION_PARTS } from "./sessionDialInFixtures.js";
import { useState } from "react";

// biome-ignore lint/suspicious/noConsole: story-only navigation-hook proof
const onOpen = (t: { route: string }): void => console.info("[AM3] open", t.route, t);

function ConversationStub(): JSX.Element {
	return (
		<div className="flex h-full flex-col bg-[var(--surface-page)]">
			<div className="border-b border-[var(--border-subtle)] px-[18px] py-[12px]">
				<span className="inline-flex items-center rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[9px] py-[1px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
					Bet
				</span>
				<h1 className="mt-[3px] mb-0 text-[17px] font-[600] leading-[1.25] text-[var(--text-primary)]">
					Passkey login
				</h1>
			</div>
			<div className="flex-1 overflow-y-auto px-[18px] py-[12px] opacity-[0.55]">
				<div className="max-w-[560px]">
					<PartList parts={SESSION_PARTS.slice(0, 2)} onOpen={onOpen} />
					<p className="mt-[12px] text-[12px] italic text-[var(--text-tertiary)]">
						(conversation — dimmed; the session-reference here opened the panel →)
					</p>
				</div>
			</div>
		</div>
	);
}

function SessionDialInSide(): JSX.Element {
	const [configOpen, setConfigOpen] = useState(true);
	return (
		<aside
			data-ds-component="SessionDialInSide"
			aria-label="Session dial-in"
			className="flex h-full w-[460px] shrink-0 flex-col border-l border-[var(--border-default)] bg-[var(--surface-page)] shadow-[var(--shadow-elevated)]"
		>
			<DialInHeader onClose={() => undefined} />
			{/* Config band — inline-compact (pulled from variant C); foldable to give
			    activity the height while auditing. */}
			<div className="border-b border-[var(--border-subtle)] bg-[var(--surface-container)] px-[18px] py-[12px]">
				<div className="mb-[9px]">
					<ConfigFold open={configOpen} onToggle={() => setConfigOpen((v) => !v)} />
				</div>
				{configOpen && <DialInControls layout="inline" />}
			</div>
			<div className="flex-1 overflow-y-auto px-[18px] py-[12px]">
				<div className="mb-[9px] font-[family-name:var(--font-mono)] text-[11px] font-[500] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
					What happened
				</div>
				<PartList parts={SESSION_PARTS} onOpen={onOpen} />
			</div>
		</aside>
	);
}

export default {
	title: "SessionDialIn · A Side panel",
	group: "Conversations" as const,
};

export const SidePanel = (): JSX.Element => (
	<div
		className="flex h-[760px] w-full overflow-hidden bg-[var(--surface-page)] text-[var(--text-primary)]"
		style={{ fontFamily: "var(--font-sans)" }}
	>
		<div className="min-w-0 flex-1">
			<ConversationStub />
		</div>
		<SessionDialInSide />
	</div>
);
