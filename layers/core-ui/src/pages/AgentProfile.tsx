import type { SessionOutcome } from "@hyperidle/domain-model";
import { AGENT_OPERATIONAL_STATUS_LABEL } from "@hyperidle/domain-model";
import { type JSX, useState } from "react";
import { Link as RRLink, useNavigate, useParams } from "react-router-dom";
import type { OpenHandler, PartAuthor } from "../components/parts";
import { SessionView } from "../components/SessionView.js";
import {
	Avatar,
	agentOperationalStatusToStatus,
	Breadcrumb,
	Button,
	clickableProps,
	EmptyState,
	ErrorState,
	KeyValue,
	LiveDot,
	PageFrame,
	PageHeader,
	PageScaffold,
	SectionLabel,
	SkeletonCard,
	SplitView,
	StatusChip,
	sessionOutcomeToStatus,
	Tag,
} from "../ds";
import type { AgentProfileData } from "../hooks/useAgentProfile.js";
import { useAgentProfile } from "../hooks/useAgentProfile.js";
import { type AgentRunState, useAgentRunState } from "../hooks/useAgentRunState.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useSessionActivity } from "../hooks/useSessionActivity.js";
import { useUiPreference } from "../hooks/useUiPreference.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { createOpenHandler } from "../services/open-handler.js";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";
import { deriveInitials } from "../utils/initials.js";
import { roleLabel } from "../utils/role-label.js";
import { absoluteDate } from "../utils/time.js";
import { SubscriptionsSection } from "./SubscriptionsSection.js";

// static display names for known harness families; matches KNOWN_HARNESS_NAMES in harness-capability-descriptors.ts
const HARNESS_DISPLAY: Record<string, string> = {
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
	overrideData?: AgentProfileData | null;
	overrideLoading?: boolean;
	overrideError?: Error | null;
	/** Override the agent's run state (active run, recent runs, performance, health signals). Used by stories and tests. */
	overrideRunState?: AgentRunState;
}

export function AgentProfile({
	overrideData,
	overrideLoading,
	overrideError,
	overrideRunState,
}: AgentProfileProps = {}): JSX.Element {
	const { agentId } = useParams<{ agentId: string }>();
	const navigate = useNavigate();

	const fetched = useAgentProfile(overrideData !== undefined ? undefined : agentId);

	const loading = overrideLoading === true || (overrideData === undefined && fetched.loading);
	const error = overrideError !== undefined ? (overrideError ?? null) : (fetched.error ?? null);
	const data = overrideData !== undefined ? overrideData : (fetched.data ?? null);
	const httpStatus = overrideError !== undefined ? null : (fetched.httpStatus ?? null);

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
		const is404 = httpStatus === 404 || error.message.includes("404");
		if (is404) {
			return (
				// @lore: body="managed" — children get flex-1 flex-col container; frame="page" is auto-height so min-h-full = content height not viewport
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
		const is429 = httpStatus === 429 || error.message.includes("429");
		const is5xx = (httpStatus !== null && httpStatus >= 500) || /5\d\d/.test(error.message);
		const friendlyMessage = is429
			? "Too many requests. Please wait a moment and try again."
			: is5xx
				? "Something went wrong on the server. Please try again."
				: "This profile couldn't be loaded. Please try again.";
		return (
			<PageScaffold
				body="managed"
				header={<PageHeader title="Agent" />}
				data-testid="agent-profile-page"
			>
				<div className="flex-1 flex items-center justify-center p-[48px_24px]">
					<ErrorState
						title="Failed to load agent profile"
						description={friendlyMessage}
						onRetry={() => navigate(0)}
					/>
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

	// Stories/tests own the fixture when overrideData is set — nothing to re-fetch.
	const noopRefetch = (): void => undefined;

	return (
		<AgentProfileLoaded
			data={data}
			overrideRunState={overrideRunState}
			refetch={overrideData !== undefined ? noopRefetch : fetched.refetch}
		/>
	);
}

/** Internal component rendered when data is fully resolved. */
function AgentProfileLoaded({
	data,
	overrideRunState,
	refetch,
}: {
	data: AgentProfileData;
	overrideRunState?: AgentRunState;
	/** Re-fetches the profile — passed to SubscriptionsSection so an add/pause/
	 * remove reflects immediately. A no-op when `overrideData` drives the page
	 * (stories/tests own the fixture). */
	refetch: () => void;
}): JSX.Element {
	const initials = deriveInitials(data.name);
	const navigate = useNavigate();
	const { sidebarMobile } = useViewportBreakpoint();

	// The session viewer door — a Recent Activity row click fires the
	// same `onOpenSession` OpenTarget path Conversations.tsx and WorkTaskPage
	// use, mounted in this page's own split pane.
	const { user } = useCurrentUser();
	const [openSessionId, setOpenSessionId] = useState<string | null>(null);
	const [sessionRatio, setSessionRatio] = useUiPreference("agent.session", 0.6);
	const openSessionTarget = createOpenHandler(navigate, { onOpenSession: setOpenSessionId });

	// @lore: harnessAvailable — from useAgentProfile (adapter pool state), not useAgentRunState; browser cannot compute it
	const fetchedRunState = useAgentRunState(
		overrideRunState ? null : data.id,
		data.harnessAvailable,
	);
	const {
		activeSession,
		recentSessions: rawRecentSessions,
		performance,
		healthSignals,
		status,
	} = overrideRunState ?? fetchedRunState;

	// @lore: recentSessions dedup — orchestration emits duplicate sessionId rows mid-flight; display-only guard, source not altered
	const recentSessions = rawRecentSessions.filter(
		(session, index, arr) => arr.findIndex((s) => s.sessionId === session.sessionId) === index,
	);
	// @lore: runStateUnavailable — computeHealthSignals([]) says "not degraded"; true for zero runs, false for failed load; show unavailability alert instead
	const runStateUnavailable = status === "error";
	// @lore: runStateSettled — render "—" until runs confirmed; avoids painting false zeros mid-flight
	const runStateSettled = status === "ready";

	const isActive = activeSession !== null;
	const isError = !isActive && healthSignals.lastSessionCrashed;
	const operationalStatus = isActive ? "active" : isError ? "error" : "idle";

	const createdDate = absoluteDate(data.createdAt);

	// @lore: breadcrumb — team agents show Work → Team → Name; others show Conversations → Name; parentPathFor(/agents/:id) returns /conversations as fallback
	const agentSegments = data.teamId
		? ([
				{ label: "Work", to: "/work" },
				{ label: data.teamName ?? "Team", to: `/work/team/${data.teamId}` },
				{ label: data.name },
			] as const)
		: ([{ label: "Conversations", to: "/conversations" }, { label: data.name }] as const);

	return (
		<PageScaffold
			body="managed"
			header={
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
			<SplitView
				compact={sidebarMobile}
				originLabel="agent"
				surfaceKey="agent.session"
				mode={openSessionId ? "split" : "fold-back"}
				dividerRatio={sessionRatio}
				onRatioChange={setSessionRatio}
				onModeChange={(mode) => {
					if (mode === "fold-back") setOpenSessionId(null);
				}}
				origin={
					<PageFrame>
						<div className="flex max-w-[960px] flex-col gap-[24px] py-[24px]">
							{/* Run state could not be read — say so, never imply health. */}
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
									<span className="type-small  text-[var(--text-primary)]">
										Run state unavailable
									</span>
									<span className="ml-[6px]">
										This agent's runs could not be loaded, so health, recent runs and success rate
										are not shown.
									</span>
								</div>
							)}

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
									<div className="flex items-start gap-[9px]">
										<svg
											aria-hidden="true"
											viewBox="0 0 16 16"
											fill="currentColor"
											className="shrink-0"
											style={{ width: 14, height: 14, color: "var(--status-warning)" }}
										>
											<path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM7.25 5h1.5l-.25 4.5h-1L7.25 5z" />
										</svg>
										<div className="flex-1 min-w-0">
											<span className="type-small  text-[var(--text-primary)]">Health warning</span>
											{healthSignals.failureRate7d > 0.5 && (
												<span className="ml-[6px]">
													High failure rate: {Math.round(healthSignals.failureRate7d * 100)}% in
													last 7 days.
												</span>
											)}
											{healthSignals.lastSessionCrashed && (
												<span className="ml-[6px]">Last session crashed.</span>
											)}
											{!healthSignals.harnessAvailable && (
												<span className="ml-[6px]">Required harness not available.</span>
											)}
											<RRLink
												to="/conversations?settings=open"
												className="type-control ml-[12px]  text-[var(--accent-deep)] hover:underline"
											>
												Edit in Settings
											</RRLink>
										</div>
									</div>
								</div>
							)}

							<section aria-label="Agent identity" className="flex flex-col gap-[12px]">
								<div className="flex items-start gap-[12px]">
									<Avatar initials={initials} size="md" agent />
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-[9px] flex-wrap">
											{data.agentCategory && data.agentCategory !== "team" && (
												<Tag
													label={
														data.agentCategory === "individual" ? "Individual" : data.agentCategory
													}
												/>
											)}
										</div>
										<p className="type-metadata  text-[var(--text-tertiary)] mt-[3px]">
											{roleLabel(data.role)}
											{data.teamName && <span className="ml-[6px]">· {data.teamName}</span>}
											<span className="ml-[6px]">· Created {createdDate}</span>
										</p>
										{activeSession !== null && (
											<div className="mt-[6px]" data-testid="agent-active-session">
												<RRLink
													to={`/work/task/${encodeURIComponent(activeSession.taskId)}`}
													className="type-control  text-[var(--accent-deep)] hover:underline"
												>
													↗ Active session: {activeSession.sessionId}
												</RRLink>
											</div>
										)}
									</div>
									<RRLink to="/settings" className="btn btn-ghost btn-sm shrink-0">
										Edit in Settings
									</RRLink>
								</div>
							</section>

							<section
								aria-label="Configuration"
								data-testid="agent-config-section"
								className="flex flex-col gap-[12px]"
							>
								<SectionLabel label="Configuration" as="h2" />
								<div className="flex flex-col gap-[6px] max-w-[320px]">
									<KeyValue label="Role" value={roleLabel(data.role)} />
									<KeyValue label="Harness" value={harnessLabel(data.harnessType)} />
									<KeyValue label="Category" value={data.agentCategory ?? "team"} />
									{data.teamName && <KeyValue label="Team" value={data.teamName} />}
									<KeyValue label="Max sessions" value={String(data.maxConcurrentSessions)} />
									<KeyValue label="Created" value={createdDate} />
								</div>
								{data.identityDocumentId && (
									<RRLink
										to={`/documents/${data.identityDocumentId}`}
										data-testid="agent-identity-link"
										className="type-metadata mt-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
									>
										Identity document
									</RRLink>
								)}
							</section>

							{data.harnessCapabilities && (
								<section
									aria-label="Harness capabilities"
									data-testid="agent-harness-capabilities-section"
									className="flex flex-col gap-[12px]"
								>
									<SectionLabel label="Harness Capabilities" as="h2" />
									<div className="flex flex-wrap gap-[6px]">
										<Tag label={data.harnessCapabilities.kind} />
										<Tag label={data.harnessCapabilities.discovery.state} />
										{data.harnessCapabilities.returnEnforcement && (
											<Tag label={data.harnessCapabilities.returnEnforcement} />
										)}
										<Tag label={`${data.harnessCapabilities.models.length} models`} />
									</div>
								</section>
							)}

							<SubscriptionsSection
								userId={data.id}
								subscriptions={data.subscriptions}
								onChanged={refetch}
							/>

							{data.reviewTrackRecord && (
								<section
									aria-label="Review track record"
									data-testid="agent-review-track-record-section"
									className="flex flex-col gap-[12px]"
								>
									<SectionLabel label="Review Track Record" as="h2" />
									<div className="flex flex-row gap-[24px]">
										<KeyValue
											label="Approval rate"
											value={`${Math.round(data.reviewTrackRecord.approvalRate * 100)}%`}
										/>
										<KeyValue
											label={`Verdicts (${data.reviewTrackRecord.windowDays}d)`}
											value={String(data.reviewTrackRecord.totalVerdicts)}
										/>
									</div>
									{data.reviewTrackRecord.recentVerdicts.length > 0 && (
										<ul className="flex flex-col gap-[3px]">
											{data.reviewTrackRecord.recentVerdicts.map((v) => (
												<li
													key={`${v.threadId}-${v.createdAt}`}
													className="type-small text-[var(--text-secondary)]"
												>
													{v.decision} — {absoluteDate(v.createdAt)}
												</li>
											))}
										</ul>
									)}
								</section>
							)}

							<section
								aria-label="Recent activity"
								data-testid="agent-activity-section"
								className="flex flex-col gap-[12px]"
							>
								<SectionLabel label="Recent Activity" as="h2" />
								{runStateUnavailable ? (
									<p className="type-metadata  text-[var(--text-tertiary)]">
										Runs could not be loaded.
									</p>
								) : !runStateSettled ? (
									<p className="type-metadata  text-[var(--text-tertiary)]">Loading runs…</p>
								) : recentSessions.length === 0 ? (
									<p className="type-metadata  text-[var(--text-tertiary)]">
										No sessions recorded.
									</p>
								) : (
									// @lore: table element — genuinely tabular (sessions × outcome/when); gives row/col semantics free; flex/grid needs manual aria-rowcount
									<table
										className="type-metadata w-full "
										aria-label="Recent agent session activity"
									>
										<thead>
											<tr className="border-width-thin-b text-[var(--text-tertiary)] text-left  border-[var(--border-subtle)]">
												<th className="type-small pb-[6px] ">Task</th>
												<th className="type-small pb-[6px] ">Outcome</th>
												<th className="type-small pb-[6px] ">When</th>
											</tr>
										</thead>
										<tbody>
											{recentSessions.map((session) => (
												<tr
													key={session.sessionId}
													data-testid="agent-session-row"
													{...clickableProps(
														() =>
															openSessionTarget({ route: "session", sessionId: session.sessionId }),
														"border-width-thin-b border-none  border-[var(--border-subtle)] ",
													)}
												>
													<td className="py-[6px] text-[var(--text-primary)] truncate max-w-[200px]">
														{session.taskTitle}
													</td>
													<td className="py-[6px]">
														{isSessionOutcome(session.outcome) ? (
															<StatusChip status={sessionOutcomeToStatus(session.outcome)} />
														) : (
															<span className="text-[var(--text-tertiary)]">—</span>
														)}
													</td>
													<td className="py-[6px] text-[var(--text-tertiary)]">
														{absoluteDate(session.startedAt)}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								)}
							</section>

							<section
								aria-label="Performance"
								data-testid="agent-performance-section"
								className="flex flex-col gap-[12px]"
							>
								<SectionLabel label="Performance" as="h2" />
								<div className="flex gap-[24px] flex-wrap">
									{/* An unread run set is "—", never a confident 0. */}
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
					</PageFrame>
				}
				destination={
					openSessionId ? (
						<AgentSessionPanel
							sessionId={openSessionId}
							viewerId={user?.id ?? ""}
							viewerName={user?.name ?? user?.id ?? ""}
							onClose={() => setOpenSessionId(null)}
							onOpen={openSessionTarget}
						/>
					) : (
						<div />
					)
				}
			/>
		</PageScaffold>
	);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AgentSessionPanel({
	sessionId,
	viewerId,
	viewerName,
	onClose,
	onOpen,
}: {
	sessionId: string;
	viewerId: string;
	viewerName: string;
	onClose: () => void;
	onOpen: OpenHandler;
}): JSX.Element {
	const { entries, status, summary } = useSessionActivity(sessionId);
	const agent: PartAuthor = summary?.agentId
		? { id: summary.agentId, name: summary.agentId, isAgent: true, isMe: false }
		: { id: "", name: "Agent", isAgent: true, isMe: false };
	const viewer: PartAuthor = { id: viewerId, name: viewerName, isAgent: false, isMe: true };

	return (
		<div className="relative flex h-full flex-col">
			<Button
				variant="ghost"
				tone="neutral"
				size="icon"
				onClick={onClose}
				aria-label="Close session view"
				data-testid="close-session-view"
				className="absolute top-[9px] right-[12px] z-[1]"
			>
				<svg
					viewBox="0 0 12 12"
					className="h-[11px] w-[11px]"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					aria-hidden="true"
				>
					<path d="M2 2 L10 10 M10 2 L2 10" strokeLinecap="round" />
				</svg>
			</Button>
			<SessionView
				sessionId={sessionId}
				entries={[...entries]}
				identity={{ agent, viewer, title: "Session", host: "" }}
				status={status}
				onOpen={onOpen}
				onSend={() => {
					// Agent-profile session view: read-only recap, not a live chat.
				}}
			/>
		</div>
	);
}
