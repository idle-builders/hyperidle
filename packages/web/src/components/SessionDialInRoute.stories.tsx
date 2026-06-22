/**
 * AM3 Variant B — "Inspector route" (dedicated full sub-surface).
 *
 * Opening the session-reference navigates to a real place (`/session/:id`).
 * A full-width sub-room: header strip, a LEFT controls rail (config gets its own
 * column and stays visible while you read), activity as the main Part column.
 *
 * Thesis: a session is a real PLACE you can deep-link and audit. Controls and
 * activity both get room; the rail keeps config persistently steerable. The
 * back-affordance (breadcrumb) returns you to the conversation you came from —
 * this is lower-level, reached deliberately, not inlined.
 */

import { Breadcrumb } from "@hyperidle/design-system";
import type { JSX } from "react";
import { PartList } from "./PartList.js";
import { DialInControls, DialInHeader, SESSION_PARTS } from "./sessionDialInFixtures.js";

// biome-ignore lint/suspicious/noConsole: story-only navigation-hook proof
const onOpen = (t: { route: string }): void => console.info("[AM3] open", t.route, t);

function SessionDialInRoute(): JSX.Element {
	return (
		<div
			data-ds-component="SessionDialInRoute"
			className="flex h-[760px] w-full flex-col bg-[var(--surface-page)] text-[var(--text-primary)]"
			style={{ fontFamily: "var(--font-sans)" }}
		>
			{/* Orientation: this is a sub-room reached FROM a conversation. */}
			<div className="border-b border-[var(--border-subtle)] px-[18px] pt-[12px]">
				<Breadcrumb
					segments={[
						{ label: "Passkey login", to: "/work/bet/bet-1" },
						{ label: "Atlas · session" },
					]}
				/>
			</div>
			<DialInHeader onClose={() => undefined} />

			<div className="flex min-h-0 flex-1">
				{/* Left controls rail — config persistently visible while you read. */}
				<aside
					aria-label="Session configuration"
					className="w-[300px] shrink-0 overflow-y-auto border-r border-[var(--border-subtle)] bg-[var(--surface-container)] px-[18px] py-[18px]"
				>
					<div className="mb-[12px] font-[family-name:var(--font-mono)] text-[11px] font-[500] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
						Configure
					</div>
					<DialInControls layout="stack" />
				</aside>

				{/* Main activity column — the Part renderer, calm reading width. */}
				<main className="min-w-0 flex-1 overflow-y-auto px-[18px] py-[18px]">
					<div className="mx-auto w-full max-w-[680px]">
						<div className="mb-[12px] font-[family-name:var(--font-mono)] text-[11px] font-[500] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
							What happened
						</div>
						<PartList parts={SESSION_PARTS} onOpen={onOpen} />
					</div>
				</main>
			</div>
		</div>
	);
}

export default {
	title: "SessionDialIn · B Inspector route",
	group: "Conversations" as const,
};

export const InspectorRoute = (): JSX.Element => <SessionDialInRoute />;
