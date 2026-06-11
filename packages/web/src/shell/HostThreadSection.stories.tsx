/**
 * HostThreadSection stories — L18 Tier 3 shell component.
 *
 * Shows the three visible states: loading, populated (with messages),
 * and the prefill-chip variant (block discuss flow).
 *
 * @lore L18: Stories use a wrapper that injects fixture data directly into
 * HostThreadSection via prop-level state injection. Since HostThreadSection
 * calls useHostThread internally and stories can't easily mock hooks, we render
 * the content DIV directly for visual stories instead of the full component.
 * The real component is tested via unit tests; stories prove the visual shape.
 *
 * @lore visual-parity-audit: WithMessages story updated to use CommentRow
 * directly so stories reflect the actual rendered output (avatar, name, timestamp)
 * matching the mockup discussion-message pattern.
 */

import { CommentRow } from "@hyperidle/design-system";

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
				<div
					data-testid="host-thread-prefill-chip"
					className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--surface-elevated)] rounded text-[var(--text-tertiary)]"
				>
					<span>Re:</span>
					<span className="truncate">JWT with refresh rotation should be short-lived</span>
				</div>
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
