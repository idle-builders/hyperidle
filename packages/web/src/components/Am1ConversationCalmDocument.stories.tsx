/**
 * AM1 — Conversation Experience, Variant C: "Calm document" — stories.
 *
 * Renders the canonical fixture conversation as a calm reading document with
 * full-bleed inline embeds (artifact diff, referenced block, session
 * reference), the prominent "Worked for 1m 12s" Fold, and the review →
 * verdict — plus the empty / loading / error states.
 *
 * Format mirrors the design-system story contract: default export carries a
 * title + group; named exports are React components each rendering one
 * variant at a comfortable desktop width on the page surface.
 */

import type React from "react";
import Am1ConversationCalmDocument from "./Am1ConversationCalmDocument.js";

export default {
	title: "AM1 Conversation — Calm Document (C)",
	group: "Conversations" as const,
	order: ["Populated", "Empty", "Loading", "Error"],
};

/** Frame: a comfortable desktop viewport on the page surface. */
function Frame({ children }: { children: React.ReactNode }): React.JSX.Element {
	return (
		<div
			className="min-h-[720px] w-full"
			style={{ background: "var(--surface-page)" }}
		>
			{children}
		</div>
	);
}

export const Populated = (): React.JSX.Element => (
	<Frame>
		<Am1ConversationCalmDocument />
	</Frame>
);

export const Empty = (): React.JSX.Element => (
	<Frame>
		<div className="mx-auto flex max-w-[760px] flex-col items-center px-[24px] pt-[120px] text-center">
			<h2 className="text-[17px] font-[var(--fw-semibold)] text-[var(--text-primary)]">
				No messages yet
			</h2>
			<p className="mt-[6px] text-[15px] leading-[1.55] text-[var(--text-secondary)]">
				Start a deliberate message to Atlas — embed a diff, a plan, or a session it
				should work from.
			</p>
		</div>
	</Frame>
);

export const Loading = (): React.JSX.Element => (
	<Frame>
		<div className="mx-auto flex max-w-[760px] flex-col gap-[24px] px-[24px] pt-[36px]">
			{[0, 1, 2].map((i) => (
				<div key={i} className="flex flex-col gap-[9px]">
					<div className="flex items-center gap-[9px]">
						<div
							className="h-[28px] w-[28px] animate-[skeleton-pulse_1.6s_ease-in-out_infinite] rounded-[var(--r-pill)]"
							style={{ background: "var(--border-strong)" }}
						/>
						<div
							className="animate-[skeleton-pulse_1.6s_ease-in-out_infinite] rounded-[var(--r-pill)]"
							style={{ height: "13px", width: "120px", background: "var(--border-strong)" }}
						/>
					</div>
					<div
						className="w-full animate-[skeleton-pulse_1.6s_ease-in-out_infinite] rounded-[var(--r-subtle)]"
						style={{ height: "15px", background: "var(--border-strong)" }}
					/>
					<div
						className="w-[70%] animate-[skeleton-pulse_1.6s_ease-in-out_infinite] rounded-[var(--r-subtle)]"
						style={{ height: "15px", background: "var(--border-strong)" }}
					/>
				</div>
			))}
		</div>
	</Frame>
);

export const Error = (): React.JSX.Element => (
	<Frame>
		<div className="mx-auto flex max-w-[760px] flex-col items-center px-[24px] pt-[120px] text-center">
			<h2 className="text-[17px] font-[var(--fw-semibold)] text-[var(--text-primary)]">
				Couldn't load this conversation
			</h2>
			<p className="mt-[6px] text-[15px] leading-[1.55] text-[var(--text-secondary)]">
				The thread failed to load. Check your connection and try again.
			</p>
			<button
				type="button"
				className="mt-[18px] rounded-[var(--r-subtle)] px-[18px] py-[7px] text-[13px] font-[var(--fw-semibold)]"
				style={{ background: "var(--accent-primary)", color: "var(--text-on-accent)" }}
			>
				Retry
			</button>
		</div>
	</Frame>
);
