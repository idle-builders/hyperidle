import type { AgentOperationalStatus, HostKind } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";
import { StatusChip } from "./StatusChip.js";
import { Tag } from "./Tag.js";

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
			className="text-[var(--text-tertiary)] shrink-0"
			aria-label="Pinned"
		>
			<title>Pinned</title>
			<path d="M12 17v5" />
			<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
		</svg>
	);
}

function PresenceDot({
	status,
	name,
}: {
	status: AgentOperationalStatus;
	name: string;
}): JSX.Element | null {
	if (status === "idle") return null;
	const bg = status === "active" ? "bg-[var(--accent-primary)]" : "bg-[var(--status-error)]";
	return (
		<span
			role="img"
			className={`absolute bottom-[-2px] right-[-2px] w-[8px] h-[8px] rounded-[var(--r-pill)] border-width-strong border-[var(--surface-container)] ${bg}`}
			aria-label={`${name} - ${status}`}
		/>
	);
}

export interface ThreadHostBannerParticipant {
	id: string;
	name: string;
	avatarUrl?: string;
	/** True for AI agent participants. */
	isAgent?: boolean;
	/** Operational status for agent participants. When present and agent, shows presence dot. */
	operationalStatus?: AgentOperationalStatus;
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
			className="border-width-thin-b flex items-center gap-[12px] py-[12px] px-[12px]  border-[var(--border-subtle)] bg-[var(--surface-container)]"
		>
			{/* Host label */}
			<div className="flex items-center gap-[9px] min-w-0 flex-1">
				<Tag label={hostKind} />
				{hostHref ? (
					<a
						href={hostHref}
						className="type-control text-[var(--text-primary)] truncate  hover:underline"
					>
						{hostTitle}
					</a>
				) : (
					<span className="type-small text-[var(--text-primary)] truncate ">{hostTitle}</span>
				)}
				{pinned ? <PinIcon /> : null}
			</div>

			{/* Status chips */}
			<div className="flex items-center gap-[6px] shrink-0">
				{blocking ? <StatusChip status="blocked" /> : null}
				{resolved ? <Tag label="Resolved" /> : null}
			</div>

			{/* Participants */}
			<div className="flex items-center gap-[3px] shrink-0">
				{visible.map((p) => (
					<span
						key={p.id}
						title={p.name}
						className="type-avatar-initial type-avatar-initial--sm border-width-thin relative inline-flex items-center justify-center w-[24px] h-[24px] rounded-[var(--r-pill)] overflow-hidden bg-[var(--surface-elevated)] text-[var(--text-tertiary)] border-[var(--border-subtle)]"
					>
						{p.name.charAt(0).toUpperCase()}
						{p.isAgent && p.operationalStatus ? (
							<PresenceDot status={p.operationalStatus} name={p.name} />
						) : null}
					</span>
				))}
				{overflow > 0 ? (
					<span className="type-avatar-initial type-avatar-initial--sm border-width-thin inline-flex items-center justify-center w-[24px] h-[24px] rounded-[var(--r-pill)] bg-[var(--surface-elevated)] text-[var(--text-tertiary)] border-[var(--border-subtle)]">
						+{overflow}
					</span>
				) : null}
			</div>
		</div>
	);
}
