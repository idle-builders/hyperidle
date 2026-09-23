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

import type { SessionOutcome } from "@hyperidle/domain-model";
import { AGENT_OPERATIONAL_STATUS_LABEL, roleLabel } from "@hyperidle/domain-model";
import { type JSX, useState } from "react";
import { Link as RRLink, useNavigate, useParams } from "react-router-dom";
import type { OpenHandler, PartAuthor } from "../components/parts";
import { SessionView } from "../components/SessionView.js";
import {
	Avatar,
	agentOperationalStatusToStatus,
	Breadcrumb,
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
import { absoluteDate } from "../utils/time.js";
import { SubscriptionsSection } from "./SubscriptionsSection.js";

// UI-041: static display names for known harness families. Matches
// KNOWN_HARNESS_NAMES in harness-capability-descriptors.ts.
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
	overrideData?: AgentProfileData | null;
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
	const navigate = useNavigate();

	const fetched = useAgentProfile(overrideData !== undefined ? undefined : agentId);

	const loading = overrideLoading === true || (overrideData === undefined && fetched.loading);
	const error = overrideError !== undefined ? (overrideError ?? null) : (fetched.error ?? null);
	const data = overrideData !== undefined ? overrideData : (fetched.data ?? null);
	// @lore UI-014: httpStatus comes from the hook so AgentProfile can branch on the numeric
	// code without parsing error.message strings. Null when using overrideError (tests/stories).
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
		// @lore UI-014: check httpStatus (numeric, no string parsing) when available;
		// fall back to error.message parsing for overrideError callers (tests/stories).
		const is404 = httpStatus === 404 || error.message.includes("404");
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

	// @lore AU26 J4: `activeSession`, `recentSessions`, `performance` and
	// `healthSignals` used to arrive on this response, computed by core-api from
	// `agent-orchestration`'s `sessions` table. Founder ruling: *"orchestration
	// now has an api so that the ui can get the agent run state from the
	// orchestration directly and combine this information in the ui instead of in
	// the core api service."* This hook fetches the runs from that Layer and
	// derives the same four with the same `computeHealthSignals` — the live chip,
	// the recent-runs table, the success rate and the degraded banner all render
	// exactly what they rendered before.
	// @lore BC5 T18: `harnessAvailable` is a fact about the server's adapter
	// pool (`open_user`'s `runsOn`), not run state — `useAgentProfile` derives
	// it from the same read `harnessCapabilities` uses and hands it back here,
	// the one input `useAgentRunState` cannot compute in the browser.
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

	// @lore UI-072: orchestration can return duplicate sessionId rows when a run
	// appears in both the "active" slot and the "recent" list mid-flight, or when
	// the hook re-maps the same run twice via flatMap. Dedup by sessionId (first
	// occurrence wins) before rendering. This is a display-only guard — the source
	// of truth is not altered.
	const recentSessions = rawRecentSessions.filter(
		(session, index, arr) => arr.findIndex((s) => s.sessionId === session.sessionId) === index,
	);
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
			body="managed"
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
									<span className="type-small  text-[var(--text-primary)]">
										Run state unavailable
									</span>
									<span className="ml-[6px]">
										This agent's runs could not be loaded, so health, recent runs and success rate
										are not shown.
									</span>
								</div>
							)}

							{/* F2: Health banner — only shown when degraded, has role="alert" */}
							{/* @lore UI-105: icon + "Edit in Settings" route added — the banner carried
				    copy but no icon or action. A warning icon makes the alert immediately
				    scannable; the Settings route (same as the Edit button) lets the founder
				    act on "harness not available" without scrolling the page. */}
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

							{/* Identity block — Avatar + meta. Name/status live in PageHeader (AI7). */}
							<section aria-label="Agent identity" className="flex flex-col gap-[12px]">
								<div className="flex items-start gap-[12px]">
									<Avatar initials={initials} size="md" agent />
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-[9px] flex-wrap">
											{/* AI4 Decision 3a: Category tag (name + status are in PageHeader) */}
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
										{/* @lore BB1: active session links directly to /work/task/:taskId */}
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
									{/* @lore FR-18: Link to /settings (real route) — was /conversations?settings=open */}
									<RRLink to="/settings" className="btn btn-ghost btn-sm shrink-0">
										Edit in Settings
									</RRLink>
								</div>
							</section>

							{/* Section 1 — Configuration */}
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
								{/* Who the agent is. It is a document, so the profile
					    links to it rather than reprinting it — one place to read it,
					    one place to edit it. */}
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

							{/* Section 2 — Harness Capabilities (BC5 T11: restored from
							    open_user's runsOn, matched by harnessType). */}
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

							{/* Section 3 — Subscriptions */}
							<SubscriptionsSection
								userId={data.id}
								subscriptions={data.subscriptions}
								onChanged={refetch}
							/>

							{/* Section 4 — Review Track Record (BC5 T11: restored — computed
							    by open_user itself now, through the deps bag). */}
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
											{data.reviewTrackRecord.recentVerdicts.map((v, i) => (
												<li
													key={`${v.threadId}-${i}`}
													className="type-small text-[var(--text-secondary)]"
												>
													{v.decision} — {absoluteDate(v.createdAt)}
												</li>
											))}
										</ul>
									)}
								</section>
							)}

							{/* Section 5 — Recent Activity */}
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
									// @lore UI-073: an HTML <table> is the right element here — this is
									// genuinely tabular data: sessions × (task, outcome, when). A flex/grid
									// layout would need role=grid and aria-rowcount/colcount to stay
									// accessible; a table gets those semantics for free and lets screen
									// readers announce "row 3 of 8, column 2: completed". ThreadRow is for
									// conversation-like entries with avatar + unread count — not applicable.
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
														{absoluteDate(session.startedAt)}
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
								className="flex flex-col gap-[12px]"
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

/**
 * The session viewer, opened from a Recent Activity row click into the
 * page's split pane. Reuses `SessionView` exactly as it is — no redesign, no
 * new component. `WorkTaskPage.tsx`'s `TaskSessionPanel`
 * verbatim.
 */
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
			<button
				type="button"
				onClick={onClose}
				aria-label="Close session view"
				data-testid="close-session-view"
				className="absolute top-[9px] right-[12px] z-[1] rounded-[var(--r-subtle)] p-[6px] text-[var(--text-tertiary)]   hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]"
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
			</button>
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

// AI4 AC1: OutcomeChip deleted — replaced with StatusChip at the call site.
// Session outcomes now render as full StatusChip pills (deliberate visual change:
// text-only colored label → chrome pill with dot).
//
// @lore BC5 T11: CapabilityBadge/VerdictDot (the old dedicated components for
// these two sections) are NOT restored — the restored sections above render
// with plain Tag/KeyValue instead. Harness Capabilities reads a `runsOn`
// entry (install-wide, matched by `harnessType`); Review Track Record reads
// `open_user`'s own `reviewTrackRecord` field, computed through the deps bag
// (`computeApprovalRate`, unchanged) rather than a second route.
