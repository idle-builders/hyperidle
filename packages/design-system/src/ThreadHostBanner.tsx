/**
 * L1a — `ThreadHostBanner` design-system component.
 *
 * Plan §7.1; approved.md §2.1. Renders the thread's host attachment label,
 * status flags (blocking, resolved, pinned), and participant avatars.
 */

import type { HostKind } from "@hyperidle/shared";
import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";
import { StatusChip } from "./StatusChip.js";
import { Tag } from "./Tag.js";

// @lore L1a: inline 14×14 pin SVG. We avoid adding lucide-react as a
// dependency for a single icon — Tag.tsx and tag-kinds.tsx already
// established this convention.
function PinIcon(): JSX.Element {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="text-[var(--text-lo)] shrink-0"
			aria-label="Pinned"
		>
			<title>Pinned</title>
			<path d="M12 17v5" />
			<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
		</svg>
	);
}

// @lore L1 step5 (S-C1): the `onMoreActions` prop and `ThreadHostBannerAction`
// enum were declared in step 2 but never wired anywhere. They land with the
// L1b banner overflow menu; ship the smaller surface for now.

export interface ThreadHostBannerParticipant {
	id: string;
	name: string;
	avatarUrl?: string;
}

export interface ThreadHostBannerProps {
	hostKind: HostKind;
	hostTitle: string;
	hostHref?: string;
	blocking: boolean;
	resolved: boolean;
	pinned: boolean;
	participants: ReadonlyArray<ThreadHostBannerParticipant>;
}

const MAX_AVATARS = 3;

export function ThreadHostBanner({
	hostKind,
	hostTitle,
	hostHref,
	blocking,
	resolved,
	pinned,
	participants,
}: ThreadHostBannerProps): JSX.Element {
	const visible = participants.slice(0, MAX_AVATARS);
	const overflow = participants.length - visible.length;

	return (
		<div
			{...dsProps("ThreadHostBanner", "2")}
			className="flex items-center gap-[12px] py-[var(--density-pad-y,8px)] px-[var(--density-pad-x,12px)] border-b border-[var(--border-subtle)] bg-[var(--surface-1)]"
		>
			{/* Host label */}
			<div className="flex items-center gap-[8px] min-w-0 flex-1">
				<Tag label={hostKind} />
				{hostHref ? (
					<a href={hostHref} className="text-[var(--text-hi)] truncate font-medium hover:underline">
						{hostTitle}
					</a>
				) : (
					<span className="text-[var(--text-hi)] truncate font-medium">{hostTitle}</span>
				)}
				{pinned ? <PinIcon /> : null}
			</div>

			{/* Status chips */}
			<div className="flex items-center gap-[6px] shrink-0">
				{blocking ? <StatusChip status="blocked" /> : null}
				{resolved ? <Tag label="Resolved" /> : null}
			</div>

			{/* Participants */}
			<div className="flex items-center gap-[2px] shrink-0">
				{visible.map((p) => (
					<span
						key={p.id}
						title={p.name}
						className="inline-flex items-center justify-center w-[24px] h-[24px] rounded-full bg-[var(--surface-2)] text-[var(--text-lo)] text-[10px] font-medium border border-[var(--border-subtle)]"
					>
						{p.name.charAt(0).toUpperCase()}
					</span>
				))}
				{overflow > 0 ? (
					<span className="inline-flex items-center justify-center w-[24px] h-[24px] rounded-full bg-[var(--surface-2)] text-[var(--text-lo)] text-[10px] font-medium border border-[var(--border-subtle)]">
						+{overflow}
					</span>
				) : null}
			</div>
		</div>
	);
}
