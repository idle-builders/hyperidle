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
	PageScaffold,
	SectionLabel,
	SkeletonCard,
	StatusChip,
	sessionOutcomeToStatus,
	Tag,
} from "@hyperidle/design-system";
import type { AgentProfileResponse, SessionOutcome } from "@hyperidle/domain-model";
import {
	AGENT_OPERATIONAL_STATUS_LABEL,
	findRoleCatalogEntry,
	roleLabel,
} from "@hyperidle/domain-model";
import { absoluteDate, relativeLong } from "@hyperidle/presentation-format";
import type { JSX } from "react";
import { Link as RRLink, useNavigate, useParams } from "react-router-dom";
import { useAgentProfile } from "../hooks/useAgentProfile.js";
import { type AgentRunState, useAgentRunState } from "../hooks/useAgentRunState.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";
import { deriveInitials } from "../utils/initials.js";

// UI-041: static display names for known harness families. Matches
// KNOWN_HARNESS_NAMES in harness-capability-descriptors.ts.
const HARNESS_DISPLAY: Record<string, string> = {
	builtin: "Built-in",
	"claude-code": "Claude Code",
	codex: "Codex",
	"cursor-agent": "Cursor Agent",
	opencode: "OpenCode",
};

function harnessLabel(type: string | null | undefined): string {
	if (!type) return "Any";
	return (
		HARNESS_DISPLAY[type] ??
		type
			.split(/[-_]/)
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(" ")
	);
}

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
	/**
	 * Override the agent's run state (active run, recent runs, performance,
	 * health signals). Used by stories and tests.
	 *
	 * @lore AU26 J4: these four used to arrive on `overrideData` because core-api
	 * served them on the profile response. They are fetched from
	 * `agent-orchestration` now, so the story/test injection seam for them is its
	 * own prop — same pattern as `overrideData`, one prop per source.
	 */
	overrideRunState?: AgentRunState;
}

export function AgentProfile({
	overrideData,
	overrideLoading,
	overrideError,
	overrideRunState,
}: AgentProfileProps = {}): JSX.Element {
	const { agentId } = useParams<{ agentId: string }>();

	const fetched = useAgentProfile(overrideData !== undefined ? undefined : agentId);

	const loading = overrideLoading === true || (overrideData === undefined && fetched.loading);
	const error = overrideError !== undefined ? (overrideError ?? null) : (fetched.error ?? null);
	const data = overrideData !== undefined ? overrideData : (fetched.data ?? null);

	if (loading) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Agent" />}
				data-testid="agent-profile-page"
			>
				<div className="flex flex-col gap-[12px] p-[24px]">
					<SkeletonCard ariaLabel="Loading agent profile header" />
					<SkeletonCard ariaLabel="Loading agent configuration" />
					<SkeletonCard ariaLabel="Loading agent activity" />
				</div>
			</PageScaffold>
		);
	}

	if (error !== null) {
		const is404 = error.message.includes("404");
		if (is404) {
			return (
				// @lore UI-129: body="managed" gives children a flex-1 flex-col container
				// with definite height (fills the AppShell h-screen chain). frame="page" wraps
				// in PageFrame (block, auto height), so min-h-full = content height not viewport.
				<PageScaffold
					body="managed"
					header={<PageHeader title="Agent" />}
					data-testid="agent-profile-page"
				>
					<div className="flex-1 flex items-center justify-center p-[48px_24px]">
						<EmptyState
							title="Agent not found"
							description="The agent you are looking for does not exist."
							dataTestId="agent-not-found"
						/>
					</div>
				</PageScaffold>
			);
		}
		return (
			<PageScaffold
				body="managed"
				header={<PageHeader title="Agent" />}
				data-testid="agent-profile-page"
			>
				<div className="flex-1 flex items-center justify-center p-[48px_24px]">
					<ErrorState title="Failed to load agent profile" description={error.message} />
				</div>
			</PageScaffold>
		);
	}

	if (data === null) {
		return (
			<PageScaffold
				body="managed"
				header={<PageHeader title="Agent" />}
				data-testid="agent-profile-page"
			>
				<div className="flex-1 flex items-center justify-center p-[48px_24px]">
					<EmptyState
						title="Agent not found"
						description="The agent you are looking for does not exist."
						dataTestId="agent-not-found"
					/>
				</div>
			</PageScaffold>
		);
	}

	return <AgentProfileLoaded data={data} overrideRunState={overrideRunState} />;
}

/** Internal component rendered when data is fully resolved. */
function AgentProfileLoaded({
	data,
	overrideRunState,
}: {
	data: AgentProfileResponse;
	overrideRunState?: AgentRunState;
}): JSX.Element {
	const catalogEntry = findRoleCatalogEntry(data.role);
	const initials = deriveInitials(data.name);
	const navigate = useNavigate();
	const { sidebarMobile } = useViewportBreakpoint();

	// @lore AU26 J4: `activeSession`, `recentSessions`, `performance` and
	// `healthSignals` used to arrive on this response, computed by core-api from
	// `agent-orchestration`'s `sessions` table. Founder ruling: *"orchestration
	// now has an api so that the ui can get the agent run state from the
	// orchestration directly and combine this information in the ui instead of in
	// the core api service."* This hook fetches the runs from that Layer and
	// derives the same four with the same `computeHealthSignals` — the live chip,
	// the recent-runs table, the success rate and the degraded banner all render
	// exactly what they rendered before. `harnessAvailable` still comes from
	// core-api: it is a fact about the server's adapter pool, not run state.
	const fetchedRunState = useAgentRunState(
		overrideRunState ? null : data.id,
		data.harnessAvailable,
	);
	const { activeSession, recentSessions, performance, healthSignals, status } =
		overrideRunState ?? fetchedRunState;
	// @lore AU26 review W6: a failed run read must not paint a healthy agent.
	// `computeHealthSignals([])` says "not degraded" — true of an agent with no
	// runs, a lie about an agent whose runs we could not read. The banner below
	// switches to an explicit unavailability alert instead.
	const runStateUnavailable = status === "error";
	// @lore AU26 review W5: while the run read is still in flight the page knows
	// nothing about runs — painting "0 sessions · 0% · No sessions recorded" and
	// then replacing it a round-trip later is a flicker that states a falsehood
	// on the way. The server-composed response used to arrive atomically; these
	// two blocks wait for the same certainty.
	const runStateSettled = status === "ready";

	// A2: Derive operational status from run state, not the DB status column
	const isActive = activeSession !== null;
	const isError = !isActive && healthSignals.lastSessionCrashed;
	const operationalStatus = isActive ? "active" : isError ? "error" : "idle";

	const createdDate = absoluteDate(data.createdAt);

	// @lore AB1 S4: Team agents link back to their team page; others to conversations.
	// parentPathFor(/agents/:id) returns /conversations (generic fallback); page overrides
	// to team-aware path when teamId is present.
	const agentSegments = data.teamId
		? ([
				{ label: "Work", to: "/work" },
				{ label: data.teamName ?? "Team", to: `/work/team/${data.teamId}` },
				{ label: data.name },
			] as const)
		: ([{ label: "Conversations", to: "/conversations" }, { label: data.name }] as const);

	return (
		<PageScaffold
			frame="page"
			header={
				/* AI7: PageHeader owns the pinned title strip.
				    AG4: DS Breadcrumb in leading prop. Identity block stays in body scroll. */
				<PageHeader
					title={data.name}
					leading={
						<Breadcrumb
							segments={agentSegments}
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
			}
			data-testid="agent-profile-page"
		>
			<div className="flex max-w-[960px] flex-col gap-[24px] py-[24px]">
				{/* AU26 W6: run state could not be read — say so, never imply health. */}
				{runStateUnavailable && (
					<div
						role="alert"
						data-testid="run-state-unavailable"
						className="type-small rounded-[var(--r-subtle)] p-[12px]  text-[var(--text-secondary)]"
						style={{
							background: "color-mix(in oklab, var(--status-warning) 8%, transparent)",
							border:
								"var(--bw-thin) solid color-mix(in oklab, var(--status-warning) 20%, transparent)",
						}}
					>
						<span className="type-small  text-[var(--text-primary)]">Run state unavailable</span>
						<span className="ml-[6px]">
							This agent's runs could not be loaded, so health, recent runs and success rate are not
							shown.
						</span>
					</div>
				)}

				{/* F2: Health banner — only shown when degraded, has role="alert" */}
				{!runStateUnavailable && healthSignals.degraded && (
					<div
						role="alert"
						className="type-small rounded-[var(--r-subtle)] p-[12px]  text-[var(--text-secondary)]"
						style={{
							background: "color-mix(in oklab, var(--status-warning) 8%, transparent)",
							border:
								"var(--bw-thin) solid color-mix(in oklab, var(--status-warning) 20%, transparent)",
						}}
					>
						<span className="type-small  text-[var(--text-primary)]">Health warning</span>
						{healthSignals.failureRate7d > 0.5 && (
							<span className="ml-[6px]">
								High failure rate: {Math.round(healthSignals.failureRate7d * 100)}% in last 7 days.
							</span>
						)}
						{healthSignals.lastSessionCrashed && (
							<span className="ml-[6px]">Last session crashed.</span>
						)}
						{!healthSignals.harnessAvailable && (
							<span className="ml-[6px]">Required harness not available.</span>
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
							<p className="type-metadata  text-[var(--text-tertiary)] mt-[3px]">
								{catalogEntry?.label ?? data.role}
								{data.teamName && <span className="ml-[6px]">· {data.teamName}</span>}
								<span className="ml-[6px]">· Created {createdDate}</span>
							</p>
							{/* Active session link — /work/bet/:betId/task/:taskId (M1: was using taskId as betId) */}
							{activeSession !== null && (
								<div className="mt-[6px]" data-testid="agent-active-session">
									<RRLink
										to={`/work/bet/${encodeURIComponent(activeSession.betId)}/task/${encodeURIComponent(activeSession.taskId)}`}
										className="type-control  text-[var(--accent-deep)] hover:underline"
									>
										↗ Active session: {activeSession.sessionId}
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
					<div className="flex flex-col gap-[6px] max-w-[320px]">
						<KeyValue label="Role" value={roleLabel(data.role)} />
						<KeyValue label="Harness" value={harnessLabel(data.harnessType)} />
						<KeyValue label="Category" value={data.agentCategory ?? "team"} />
						<KeyValue label="Model tier" value={data.modelTierPreference ?? "Default"} />
						{data.teamName && <KeyValue label="Team" value={data.teamName} />}
						<KeyValue label="Max sessions" value={String(data.maxConcurrentSessions)} />
						<KeyValue label="Created" value={createdDate} />
					</div>
					{data.systemPrompt && (
						<details className="mt-[12px]">
							<summary className="type-metadata  text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-secondary)] select-none">
								System prompt
							</summary>
							<pre className="type-data mt-[6px]  text-[var(--text-secondary)]  whitespace-pre-wrap break-all bg-[var(--surface-page)] rounded-[var(--r-subtle)] p-[9px] max-h-[200px] overflow-y-auto">
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
						<p className="type-metadata  text-[var(--text-tertiary)]">No reviews recorded yet.</p>
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
					{runStateUnavailable ? (
						<p className="type-metadata  text-[var(--text-tertiary)]">Runs could not be loaded.</p>
					) : !runStateSettled ? (
						<p className="type-metadata  text-[var(--text-tertiary)]">Loading runs…</p>
					) : recentSessions.length === 0 ? (
						<p className="type-metadata  text-[var(--text-tertiary)]">No sessions recorded.</p>
					) : (
						<table className="type-metadata w-full " aria-label="Recent agent session activity">
							<thead>
								<tr className="border-b-[var(--bw-thin)] text-[var(--text-tertiary)] text-left  border-[var(--border-subtle)]">
									<th className="type-small pb-[6px] ">Task</th>
									<th className="type-small pb-[6px] ">Outcome</th>
									<th className="type-small pb-[6px] ">When</th>
								</tr>
							</thead>
							<tbody>
								{recentSessions.map((session) => (
									<tr
										key={session.sessionId}
										className="border-b-[var(--bw-thin)] border-none  border-[var(--border-subtle)] "
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
						{/* AU26 W6: an unread run set is "—", never a confident 0. */}
						<KeyValue
							label="Sessions"
							value={runStateSettled ? String(performance.totalSessions) : "—"}
						/>
						<KeyValue
							label="Success rate"
							value={runStateSettled ? `${Math.round(performance.successRate * 100)}%` : "—"}
						/>
					</div>
				</section>
			</div>
		</PageScaffold>
	);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Green/ghost badge for a harness capability. */
function CapabilityBadge({ label, supported }: { label: string; supported: boolean }): JSX.Element {
	return (
		<span
			className={`type-label ${`  px-[9px] py-[3px] rounded-[var(--r-pill)] ${
				supported
					? "bg-[var(--accent-primary)] text-white"
					: "bg-[var(--surface-elevated)] text-[var(--text-tertiary)]"
			}`}`}
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
