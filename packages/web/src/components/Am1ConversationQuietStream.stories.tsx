/**
 * AM1 — Variant A "Quiet stream" stories.
 *
 * Populated = the full canonical fixture conversation (all 7 messages incl.
 * the four Embeds + review/verdict + the Fold). Empty / Loading / Error are
 * minimal state stubs rendered inside the same calm reading column.
 */

import type React from "react";
import Am1ConversationQuietStream from "./Am1ConversationQuietStream.js";

export default {
	title: "AM1 Conversation — Quiet Stream (A)",
	group: "Conversations" as const,
	order: ["Populated", "Empty", "Loading", "Error"],
};

function Frame({ children }: { children: React.ReactNode }): React.JSX.Element {
	return (
		<div className="min-h-screen w-full bg-[var(--surface-page)] flex justify-center">
			{children}
		</div>
	);
}

function ColumnStub({ children }: { children: React.ReactNode }): React.JSX.Element {
	return (
		<div className="w-full max-w-[720px] px-[24px] py-[48px] flex justify-center">{children}</div>
	);
}

export const Populated = (): React.JSX.Element => (
	<Frame>
		<Am1ConversationQuietStream resolved={true} />
	</Frame>
);

export const Empty = (): React.JSX.Element => (
	<Frame>
		<ColumnStub>
			<div className="flex flex-col items-center text-center mt-[48px]">
				<span className="inline-flex items-center justify-center size-[36px] rounded-full bg-[var(--surface-container)] text-[var(--text-tertiary)] mb-[12px]">
					<svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
						<path
							d="M3 5h14v8H8l-3 3v-3H3z"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.25"
							strokeLinejoin="round"
						/>
					</svg>
				</span>
				<p className="text-[15px] font-medium text-[var(--text-primary)]">No messages yet</p>
				<p className="text-[13px] text-[var(--text-secondary)] mt-[3px] max-w-[320px]">
					Start the conversation — describe the work or ask a question, and your agents will reply
					here.
				</p>
			</div>
		</ColumnStub>
	</Frame>
);

export const Loading = (): React.JSX.Element => (
	<Frame>
		{/* 3 sender-grouped skeleton rows matching the message-row shape: avatar
		    circle + meta line + 2 body lines. Bars use --border-strong: the
		    shared skeleton-pulse dips to opacity 0.4, so a faint fill vanishes
		    mid-cycle — --border-strong stays clearly visible against
		    --surface-page at every phase. Warm-tinted, on-grid. */}
		<div className="w-full max-w-[720px] px-[24px] py-[24px] flex flex-col gap-[24px]">
			{[0, 1, 2].map((i) => (
				<div key={i} className="flex gap-[12px]">
					<div
						className="h-[28px] w-[28px] shrink-0 rounded-[var(--r-pill)] animate-[skeleton-pulse_1.6s_ease-in-out_infinite]"
						style={{ background: "var(--border-strong)" }}
					/>
					<div className="flex-1 flex flex-col gap-[9px]">
						<div
							className="rounded-[var(--r-subtle)] animate-[skeleton-pulse_1.6s_ease-in-out_infinite]"
							style={{ height: "13px", width: "140px", background: "var(--border-strong)" }}
						/>
						<div
							className="w-full rounded-[var(--r-subtle)] animate-[skeleton-pulse_1.6s_ease-in-out_infinite]"
							style={{ height: "15px", background: "var(--border-strong)" }}
						/>
						<div
							className="rounded-[var(--r-subtle)] animate-[skeleton-pulse_1.6s_ease-in-out_infinite]"
							style={{ height: "15px", width: "70%", background: "var(--border-strong)" }}
						/>
					</div>
				</div>
			))}
		</div>
	</Frame>
);

export const Error = (): React.JSX.Element => (
	<Frame>
		<ColumnStub>
			<div className="flex flex-col items-center text-center mt-[48px]">
				<span className="inline-flex items-center justify-center size-[36px] rounded-full bg-[var(--status-error-dim)] text-[var(--status-error)] mb-[12px]">
					<svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
						<path d="M10 5v6M10 14v.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
						<circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
					</svg>
				</span>
				<p className="text-[15px] font-medium text-[var(--text-primary)]">
					Couldn’t load this conversation
				</p>
				<p className="text-[13px] text-[var(--text-secondary)] mt-[3px] max-w-[320px]">
					The thread didn’t respond. Check your connection and try again.
				</p>
				<button
					type="button"
					className="mt-[12px] px-[12px] py-[7px] rounded-[var(--r-subtle)] text-[13px] font-medium text-[var(--text-secondary)] border border-[var(--border-default)] bg-[var(--surface-elevated)] hover:border-[var(--border-strong)] transition-colors duration-[var(--motion-fast)]"
				>
					Retry
				</button>
			</div>
		</ColumnStub>
	</Frame>
);
