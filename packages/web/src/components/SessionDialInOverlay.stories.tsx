/**
 * AM3 Variant C — "Overlay sheet" (modal dial-in).
 *
 * The session-reference opens a centered sheet floating over a dimmed
 * conversation (scrim). Compact: config is a single COLLAPSIBLE header band
 * (inline-wrapped controls), activity is the Part column filling the sheet body.
 *
 * Thesis: dial-in is a MOMENTARY act — open, steer or glance, dismiss. It
 * deliberately resists becoming a place you linger; the scrim keeps the
 * conversation as the thing you'll return to. Lower-level by construction: it is
 * a transient overlay, never promoted into the conversation flow.
 *
 * Embodiment note: this maps to the DS `Dialog` (size="lg", layer="dialog") in
 * production — the architecture decides DS-Dialog shell vs custom scrim. The
 * story renders a self-contained scrim+sheet so it shows in isolation without a
 * portal root; the COMPOSITION (header · config band · PartList) is the design.
 */

import type { JSX } from "react";
import { useState } from "react";
import { PartList } from "./PartList.js";
import { ConfigFold, DialInControls, DialInHeader, SESSION_PARTS } from "./sessionDialInFixtures.js";

// biome-ignore lint/suspicious/noConsole: story-only navigation-hook proof
const onOpen = (t: { route: string }): void => console.info("[AM3] open", t.route, t);

function SessionDialInOverlay(): JSX.Element {
	const [configOpen, setConfigOpen] = useState(true);
	return (
		<div
			data-ds-component="SessionDialInOverlay"
			role="dialog"
			aria-label="Session dial-in"
			className="flex max-h-[680px] w-full max-w-[720px] flex-col overflow-hidden rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-page)] shadow-[var(--shadow-elevated)]"
		>
			<DialInHeader onClose={() => undefined} compact />
			{/* Config as a single collapsible band — inline-wrapped, compact. */}
			<div className="border-b border-[var(--border-subtle)] bg-[var(--surface-container)] px-[18px] py-[9px]">
				<div className="mb-[9px]">
					<ConfigFold open={configOpen} onToggle={() => setConfigOpen((v) => !v)} />
				</div>
				{configOpen && <DialInControls layout="inline" />}
			</div>
			<div className="flex-1 overflow-y-auto px-[18px] py-[12px]">
				<div className="mb-[9px] font-[family-name:var(--font-mono)] text-[11px] font-[500] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
					What happened
				</div>
				<div className="mx-auto w-full max-w-[600px]">
					<PartList parts={SESSION_PARTS} onOpen={onOpen} />
				</div>
			</div>
		</div>
	);
}

export default {
	title: "SessionDialIn · C Overlay sheet",
	group: "Conversations" as const,
};

export const OverlaySheet = (): JSX.Element => (
	<div
		className="flex h-[760px] w-full items-center justify-center p-[24px]"
		style={{
			fontFamily: "var(--font-sans)",
			background:
				"color-mix(in oklab, var(--surface-page) 40%, color-mix(in oklab, var(--text-primary) 28%, transparent))",
		}}
	>
		<SessionDialInOverlay />
	</div>
);
