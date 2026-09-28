/**
 * HostThreadSection stories — L18 Tier 3 shell component.
 *
 * Shows the three visible states: loading, populated (with messages),
 * and the prefill-chip variant (block discuss flow).
 *
 * @lore stories render content DIV directly (not full component) — HostThreadSection calls hooks internally; CommentRow used directly for visual parity
 */

import { CommentRow, ReferenceChip } from "../ds";

export default { title: "HostThreadSection", tier: "3" as const };

// ── Loading state ────────────────────────────────────────────────────────────

export const Loading = (): React.JSX.Element => (
	<div className="w-[400px] p-4 bg-[var(--surface-1)]">
		<div data-testid="host-thread-section-loading" className="p-3">
			<div className="animate-pulse h-4 bg-[var(--surface-elevated)] rounded w-1/2" />
		</div>
	</div>
);

// ── Empty state (no messages yet) ───────────────────────────────────────────

export const Empty = (): React.JSX.Element => (
	<div className="w-[400px] p-4 bg-[var(--surface-1)]">
		<section aria-label="Discussion" className="flex flex-col gap-3 p-3">
			<h3 className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-tertiary)]">
				Discussion
			</h3>
			<div data-testid="host-thread-section" className="flex flex-col gap-2">
				<div className="flex gap-2">
					<textarea
						className="textarea textarea-bordered text-base resize-none flex-1 h-16"
						placeholder="Write a message…"
						readOnly
					/>
					<button type="button" className="btn btn-primary btn-sm self-end" disabled>
						Send
					</button>
				</div>
			</div>
		</section>
	</div>
);

// ── Populated state (with messages) ─────────────────────────────────────────

const STORY_MESSAGES_HUMAN = [
	{
		id: "msg-s1",
		threadId: "t-story",
		senderId: "u-tobias",
		type: "plain" as const,
		payload: { text: "The auth cache TTL is too long — should be 5 min not 15." },
		clientKey: "ck-s1",
		blockId: null,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-06-03T14:00:00Z",
	},
	{
		id: "msg-s2",
		threadId: "t-story",
		senderId: "agent-atlas",
		type: "plain" as const,
		payload: {
			text: "Agreed. I'll open a PR to fix it. Will also add integration tests for the TTL boundary cases.",
		},
		clientKey: "ck-s2",
		blockId: null,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-06-03T14:05:00Z",
	},
	{
		id: "msg-s3",
		threadId: "t-story",
		senderId: "u-tobias",
		type: "plain" as const,
		payload: { text: "Thanks. Also check the refresh token TTL while you're in there." },
		clientKey: "ck-s3",
		blockId: null,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-06-03T14:08:00Z",
	},
];

export const WithMessages = (): React.JSX.Element => (
	<div className="w-[400px] p-4 bg-[var(--surface-1)]">
		<section aria-label="Discussion" className="flex flex-col gap-3 p-3">
			<h3 className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-tertiary)]">
				Discussion
			</h3>
			<div data-testid="host-thread-section" className="flex flex-col gap-2">
				<ul
					className="flex flex-col gap-[18px] list-none m-0 py-[6px]"
					aria-label="Discussion messages"
				>
					{STORY_MESSAGES_HUMAN.map((msg, index) => {
						const prevMsg = index > 0 ? (STORY_MESSAGES_HUMAN[index - 1] ?? null) : null;
						const showSenderHeader = prevMsg === null || prevMsg.senderId !== msg.senderId;
						const isAgent = msg.senderId.startsWith("agent");
						return (
							<CommentRow
								key={msg.id}
								message={msg}
								sender={{
									id: msg.senderId,
									name: isAgent ? "Atlas" : "Tobias",
									isAgent,
								}}
								showSenderHeader={showSenderHeader}
							/>
						);
					})}
				</ul>
				<div className="flex gap-2">
					<textarea
						className="textarea textarea-bordered text-base resize-none flex-1 h-16"
						placeholder="Write a message…"
						readOnly
					/>
					<button type="button" className="btn btn-primary btn-sm self-end" disabled>
						Send
					</button>
				</div>
			</div>
		</section>
	</div>
);

// ── With block prefill chip ──────────────────────────────────────────────────

export const WithPrefillChip = (): React.JSX.Element => (
	<div className="w-[400px] p-4 bg-[var(--surface-1)]">
		<section aria-label="Discussion" className="flex flex-col gap-3 p-3">
			<h3 className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-tertiary)]">
				Discussion
			</h3>
			<div data-testid="host-thread-section" className="flex flex-col gap-2">
				<ReferenceChip
					kind="block"
					label="JWT with refresh rotation should be short-lived"
					mode="draft"
					dataTestId="host-thread-prefill-chip"
					onRemove={() => {}}
					removeAriaLabel="Cancel block reply"
				/>
				<div className="flex gap-2">
					<textarea
						className="textarea textarea-bordered text-base resize-none flex-1 h-16"
						placeholder="Write a message…"
						readOnly
					/>
					<button type="button" className="btn btn-primary btn-sm self-end" disabled>
						Send
					</button>
				</div>
			</div>
		</section>
	</div>
);

// ── Inline variant (TaskSheet) ───────────────────────────────────────────────

export const Inline = (): React.JSX.Element => (
	<div className="w-[400px] p-4 bg-[var(--surface-container)]">
		<div data-testid="host-thread-section" className="flex flex-col gap-2">
			<div className="flex gap-2">
				<textarea
					className="textarea textarea-bordered text-base resize-none flex-1 h-16"
					placeholder="Write a message…"
					readOnly
				/>
				<button type="button" className="btn btn-primary btn-sm self-end" disabled>
					Send
				</button>
			</div>
		</div>
	</div>
);

// ── Error state ──────────────────────────────────────────────────────────────

export const ErrorState = (): React.JSX.Element => (
	<div className="w-[400px] p-4 bg-[var(--surface-1)]">
		<div data-testid="host-thread-section-error" className="p-3 text-sm text-error">
			Failed to load thread: HTTP 500
		</div>
	</div>
);
