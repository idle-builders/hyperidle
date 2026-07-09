/**
 * AB1 — Agent Profile page at /agents/:agentId.
 *
 * Read-only profile showing complete operational picture of an AI agent:
 * identity, configuration, harness capabilities, skills, recent activity,
 * and performance. Links to Settings for editing.
 *
 * Design: Variant B (approved)
 * Layout (top to bottom):
 * 1. Breadcrumb
 * 2. Health Banner (conditional — only when degraded, role="alert")
 * 3. Header: Avatar + Name + StatusChip + Tag(category) + role + created + active session + settings link
 * 4. Section 1 — Configuration: KeyValue grid + collapsed system prompt
 * 5. Section 2 — Harness Capabilities: badge row
 * 6. Section 3 — Skills: table with overflow-x-auto
 * 7. Section 4 — Recent Activity: table
 * 8. Section 5 — Performance: horizontal KeyValue row
 *
 * Reviewer findings addressed:
 * - F1: Settings link → /conversations?settings=open (deep-link broken)
 * - F2: Health banner has role="alert"
 * - F4: Tables have aria-label
 * - F5: Skills table has overflow-x-auto wrapper
 * - F6: Sections use bg-[var(--surface-container)] card styling
 * - A2: Operational status derived on frontend, not from DB status column
 */

import {
	Avatar,
	agentOperationalStatusToStatus,
	Breadcrumb,
	EmptyState,
	ErrorState,
	KeyValue,
	LiveDot,
	PageHeader,
	SectionLabel,
	SkeletonCard,
	StatusChip,
	sessionOutcomeToStatus,
	Tag,
} from "@hyperidle/design-system";
import type { AgentProfileResponse, SessionOutcome } from "@hyperidle/shared";
import {
	AGENT_OPERATIONAL_STATUS_LABEL,
	absoluteDate,
	findRoleCatalogEntry,
	relativeLong,
} from "@hyperidle/shared";
import type { JSX } from "react";
import { Link as RRLink, useNavigate, useParams } from "react-router-dom";
import { useAgentProfile } from "../hooks/useAgentProfile.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";
import { deriveInitials } from "../utils/initials.js";

/** F2: Narrow string|null to SessionOutcome without an unsafe cast. */
const SESSION_OUTCOMES: ReadonlySet<SessionOutcome> = new Set<SessionOutcome>([
	"completed",
	"crashed",
	"stopped",
]);
function isSessionOutcome(v: string | null): v is SessionOutcome {
	return v !== null && (SESSION_OUTCOMES as ReadonlySet<string>).has(v);
}

export interface AgentProfileProps {
	/** Override the profile data. Used by stories and tests. */
	overrideData?: AgentProfileResponse | null;
	overrideLoading?: boolean;
	overrideError?: Error | null;
}

export function AgentProfile({
	overrideData,
	overrideLoading,
	overrideError,
}: AgentProfileProps = {}): JSX.Element {
	const { agentId } = useParams<{ agentId: string }>();

	const fetched = useAgentProfile(overrideData !== undefined ? undefined : agentId);

	const loading = overrideLoading === true || (overrideData === undefined && fetched.loading);
	const error = overrideError !== undefined ? (overrideError ?? null) : (fetched.error ?? null);
	const data = overrideData !== undefined ? overrideData : (fetched.data ?? null);

	if (loading) {
		return (
			<div className="flex flex-col h-full" data-testid="agent-profile-page">
				<PageHeader title="Agent" />
				<div className="flex-1 overflow-y-auto">
					<div className="flex flex-col gap-[12px] p-[24px]">
						<SkeletonCard ariaLabel="Loading agent profile header" />
						<SkeletonCard ariaLabel="Loading agent configuration" />
						<SkeletonCard ariaLabel="Loading agent activity" />
					</div>
				</div>
			</div>
		);
	}

	if (error !== null) {
		const is404 = error.message.includes("404");
		if (is404) {
			return (
				<div className="flex flex-col h-full" data-testid="agent-profile-page">
					<PageHeader title="Agent" />
					<div className="flex-1 overflow-y-auto p-[24px]">
						<EmptyState
							title="Agent not found"
							description="The agent you are looking for does not exist."
							dataTestId="agent-not-found"
						/>
					</div>
				</div>
			);
		}
		return (
			<div className="flex flex-col h-full" data-testid="agent-profile-page">
				<PageHeader title="Agent" />
				<div className="flex-1 overflow-y-auto p-[24px]">
					<ErrorState title="Failed to load agent profile" description={error.message} />
				</div>
			</div>
		);
	}

	if (data === null) {
		return (
			<div className="flex flex-col h-full" data-testid="agent-profile-page">
				<PageHeader title="Agent" />
				<div className="flex-1 overflow-y-auto p-[24px]">
					<EmptyState
						title="Agent not found"
						description="The agent you are looking for does not exist."
						dataTestId="agent-not-found"
					/>
				</div>
			</div>
		);
	}

	return <AgentProfileLoaded data={data} />;
}

/** Internal component rendered when data is fully resolved. */
function AgentProfileLoaded({ data }: { data: AgentProfileResponse }): JSX.Element {
	const catalogEntry = findRoleCatalogEntry(data.role);
	const initials = deriveInitials(data.name);
	const navigate = useNavigate();
	const { sidebarMobile } = useViewportBreakpoint();

	// A2: Derive operational status from data, not DB status column
	const isActive = data.activeSession !== null;
	const isError = !isActive && data.healthSignals.lastSessionCrashed;
	const operationalStatus = isActive ? "active" : isError ? "error" : "idle";

	const createdDate = absoluteDate(data.createdAt);

	// @lore AB1 S4: Team agents link back to their team page; others to conversations.
	// parentPathFor(/agents/:id) returns /conversations (generic fallback); page overrides
	// to team-aware path when teamId is present.
	const agentParentPath = data.teamId ? `/work/team/${data.teamId}` : "/conversations";
	const agentParentLabel = data.teamName ?? "Agents";

	return (
		<div className="flex flex-col h-full" data-testid="agent-profile-page">
			{/* AI7: PageHeader owns the pinned title strip.
			    AG4: DS Breadcrumb in leading prop. Identity block stays in body scroll. */}
			<PageHeader
				title={data.name}
				leading={
					<Breadcrumb
						segments={[{ label: agentParentLabel, to: agentParentPath }, { label: data.name }]}
						leading={
							!sidebarMobile ? (
								<NavHistoryCluster onBack={() => navigate(-1)} onForward={() => navigate(1)} />
							) : undefined
						}
						LinkComponent={RRLink}
					/>
				}
				actions={
					<div className="flex items-center gap-[6px]">
						{isActive && <LiveDot />}
						<StatusChip
							status={agentOperationalStatusToStatus(operationalStatus)}
							label={AGENT_OPERATIONAL_STATUS_LABEL[operationalStatus]}
						/>
					</div>
				}
			/>
			<div className="flex-1 overflow-y-auto">
				<div className="flex flex-col gap-[12px] p-[24px]">
					{/* F2: Health banner — only shown when degraded, has role="alert" */}
					{data.healthSignals.degraded && (
						<div
							role="alert"
							className="rounded-[var(--r-subtle)] p-[12px] text-[13px] text-[var(--text-secondary)]"
							style={{
								background: "rgba(220, 100, 60, 0.08)",
								border: "1px solid rgba(220, 100, 60, 0.2)",
							}}
						>
							<span className="font-medium text-[var(--text-primary)]">Health warning</span>
							{data.healthSignals.failureRate7d > 0.5 && (
								<span className="ml-2">
									High failure rate: {Math.round(data.healthSignals.failureRate7d * 100)}% in last 7
									days.
								</span>
							)}
							{data.healthSignals.lastSessionCrashed && (
								<span className="ml-2">Last session crashed.</span>
							)}
							{!data.healthSignals.harnessAvailable && (
								<span className="ml-2">Required harness not available.</span>
							)}
						</div>
					)}

					{/* Identity block — Avatar + meta. Name/status live in PageHeader (AI7). */}
					<section
						aria-label="Agent identity"
						className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]"
					>
						<div className="flex items-start gap-[12px]">
							<Avatar initials={initials} size="md" agent />
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-[9px] flex-wrap">
									{/* AI4 Decision 3a: Category tag (name + status are in PageHeader) */}
									{data.agentCategory && data.agentCategory !== "team" && (
										<Tag
											label={
												data.agentCategory === "strategy"
													? "App-managed"
													: data.agentCategory === "individual"
														? "Individual"
														: data.agentCategory
											}
										/>
									)}
								</div>
								<p className="text-[12px] text-[var(--text-tertiary)] mt-[3px]">
									{catalogEntry?.label ?? data.role}
									{data.teamName && <span className="ml-2">· {data.teamName}</span>}
									<span className="ml-2">· Created {createdDate}</span>
								</p>
								{/* Active session link — /work/bet/:betId/task/:taskId (M1: was using taskId as betId) */}
								{data.activeSession !== null && (
									<div className="mt-[6px]" data-testid="agent-active-session">
										<RRLink
											to={`/work/bet/${encodeURIComponent(data.activeSession.betId)}/task/${encodeURIComponent(data.activeSession.taskId)}`}
											className="text-[12px] text-[var(--accent-primary)] hover:underline"
										>
											↗ Active session: {data.activeSession.sessionId}
										</RRLink>
									</div>
								)}
							</div>
							{/* F1: Link to Settings — /conversations?settings=open (deep-link broken fix) */}
							<RRLink to="/conversations?settings=open" className="btn btn-ghost btn-sm shrink-0">
								Edit in Settings
							</RRLink>
						</div>
					</section>

					{/* Section 1 — Configuration */}
					<section
						aria-label="Configuration"
						data-testid="agent-config-section"
						className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]"
					>
						<SectionLabel label="Configuration" as="h2" />
						<div className="grid grid-cols-2 gap-x-[24px] gap-y-[6px]">
							<KeyValue label="Role" value={data.role} />
							<KeyValue label="Harness" value={data.harnessType ?? "Any"} />
							<KeyValue label="Category" value={data.agentCategory ?? "team"} />
							<KeyValue label="Model tier" value={data.modelTierPreference ?? "Default"} />
							{data.teamName && <KeyValue label="Team" value={data.teamName} />}
							<KeyValue label="Max sessions" value={String(data.maxConcurrentSessions)} />
							<KeyValue label="Created" value={createdDate} />
						</div>
						{data.systemPrompt && (
							<details className="mt-[12px]">
								<summary className="text-[12px] text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-secondary)] select-none">
									System prompt
								</summary>
								<pre className="mt-[6px] text-[11px] text-[var(--text-secondary)] font-mono whitespace-pre-wrap break-all bg-[var(--surface-page)] rounded-[var(--r-subtle)] p-[9px] max-h-[200px] overflow-y-auto">
									{data.systemPrompt}
								</pre>
							</details>
						)}
					</section>

					{/* Section 2 — Harness Capabilities */}
					<section
						aria-label="Harness capabilities"
						data-testid="agent-capabilities-section"
						className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]"
					>
						<SectionLabel label="Harness Capabilities" as="h2" />
						<div className="flex flex-wrap gap-[6px]">
							<CapabilityBadge label="Tool use" supported={data.harnessCapabilities.toolUse} />
							<CapabilityBadge label="MCP" supported={data.harnessCapabilities.mcpSupport} />
							<CapabilityBadge
								label="File editing"
								supported={data.harnessCapabilities.fileEditing}
							/>
							<CapabilityBadge label="Sub-agents" supported={data.harnessCapabilities.subAgents} />
						</div>
					</section>

					{/* Section 3 — Review Track Record */}
					<section
						aria-label="Review track record"
						data-testid="agent-track-record-section"
						className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]"
					>
						<SectionLabel label="Review Track Record" as="h2" />
						{data.reviewTrackRecord.totalVerdicts === 0 ? (
							<p className="text-[12px] text-[var(--text-tertiary)]">No reviews recorded yet.</p>
						) : (
							<div className="flex flex-col gap-[9px]">
								<div className="flex gap-[24px] flex-wrap">
									<KeyValue
										label="Approval rate"
										value={`${Math.round(data.reviewTrackRecord.approvalRate * 100)}%`}
									/>
									<KeyValue label="Reviews" value={String(data.reviewTrackRecord.totalVerdicts)} />
									<KeyValue label="Window" value={`${data.reviewTrackRecord.windowDays} days`} />
								</div>
								<div className="flex gap-[6px] mt-[6px]">
									{data.reviewTrackRecord.recentVerdicts.slice(0, 10).map((v, i) => (
										<VerdictDot key={i} decision={v.decision} createdAt={v.createdAt} />
									))}
								</div>
							</div>
						)}
					</section>

					{/* Section 4 — Recent Activity */}
					<section
						aria-label="Recent activity"
						data-testid="agent-activity-section"
						className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]"
					>
						<SectionLabel label="Recent Activity" as="h2" />
						{data.recentSessions.length === 0 ? (
							<p className="text-[12px] text-[var(--text-tertiary)]">No sessions recorded.</p>
						) : (
							<table className="w-full text-[12px]" aria-label="Recent agent session activity">
								<thead>
									<tr className="text-[var(--text-tertiary)] text-left border-b border-[var(--border-subtle)]">
										<th className="pb-[6px] font-medium">Task</th>
										<th className="pb-[6px] font-medium">Outcome</th>
										<th className="pb-[6px] font-medium">Cost</th>
										<th className="pb-[6px] font-medium">When</th>
									</tr>
								</thead>
								<tbody>
									{data.recentSessions.map((session) => (
										<tr
											key={session.sessionId}
											className="border-b border-[var(--border-subtle)] last:border-0"
										>
											<td className="py-[6px] text-[var(--text-primary)] truncate max-w-[200px]">
												{session.taskTitle}
											</td>
											<td className="py-[6px]">
												{/* AI4 AC1: session outcome via StatusChip (was text-only OutcomeChip).
										     F2: narrowed from `as SessionOutcome` cast; label omitted so chip
										     renders the presentation status name (DONE/ERROR/PAUSED) from
										     SESSION_OUTCOME_MAP — no SESSION_OUTCOME_LABEL registry in plan. */}
												{isSessionOutcome(session.outcome) ? (
													<StatusChip status={sessionOutcomeToStatus(session.outcome)} />
												) : (
													<span className="text-[var(--text-tertiary)]">—</span>
												)}
											</td>
											<td className="py-[6px] tabular-nums text-[var(--text-tertiary)]">—</td>
											<td className="py-[6px] text-[var(--text-tertiary)]">
												{relativeLong(session.startedAt)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</section>

					{/* Section 5 — Performance */}
					<section
						aria-label="Performance"
						data-testid="agent-performance-section"
						className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]"
					>
						<SectionLabel label="Performance" as="h2" />
						<div className="flex gap-[24px] flex-wrap">
							<KeyValue label="Sessions" value={String(data.performance.totalSessions)} />
							<KeyValue
								label="Success rate"
								value={`${Math.round(data.performance.successRate * 100)}%`}
							/>
							<KeyValue label="Avg cost" value="—" />
							<KeyValue label="Total cost" value="—" />
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Green/ghost badge for a harness capability. */
function CapabilityBadge({ label, supported }: { label: string; supported: boolean }): JSX.Element {
	return (
		<span
			className={`text-[11px] font-medium px-[9px] py-[3px] rounded-[var(--r-pill)] ${
				supported
					? "bg-[var(--accent-primary)] text-white"
					: "bg-[var(--surface-elevated)] text-[var(--text-tertiary)]"
			}`}
		>
			{label}
		</span>
	);
}

/** Compact verdict indicator dot for the review track record. */
function VerdictDot({ decision, createdAt }: { decision: string; createdAt: string }): JSX.Element {
	const isApproval = decision === "approve" || decision === "approve-with-comments";
	const isRejection = decision === "reject";
	return (
		<span
			title={`${decision} — ${absoluteDate(createdAt)}`}
			className={`w-[9px] h-[9px] rounded-[var(--r-pill)] inline-block ${
				isApproval
					? "bg-[var(--accent-primary)]"
					: isRejection
						? "bg-[var(--status-error)]"
						: "bg-[var(--text-tertiary)]"
			}`}
		/>
	);
}

// AI4 AC1: OutcomeChip deleted — replaced with StatusChip at the call site.
// Session outcomes now render as full StatusChip pills (deliberate visual change:
// text-only colored label → chrome pill with dot). VerdictDot and CapabilityBadge
// are correctly left in place (not status — Decision 3 scope ruling).
