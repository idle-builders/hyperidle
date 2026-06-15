/**
 * AD9 design variants — temporary design artifact (delete after /design lands).
 * Three variants of the Work overview = team list, rendered with real DS primitives.
 * Sidebar nav grammar is illustrated alongside each so the comparison is honest.
 */
import type React from "react";
import { Button } from "./Button.js";
import { ItemList } from "./ItemList.js";
import { Row } from "./Row.js";
import { RowDot } from "./RowDot.js";
import { StatusChip } from "./StatusChip.js";

export default {
	title: "AD9WorkOverview",
	tier: "3" as const,
	uses: ["ItemList", "Row", "StatusChip", "RowDot", "Button"],
	order: ["VariantASwitchOverview", "VariantBAttentionSorted", "VariantCSpotlight"],
};

type TeamFixture = {
	id: string;
	name: string;
	status: "healthy" | "behind" | "blocked";
	phase: string;
	activeBets: number;
	agentCount: number;
	activeAgentCount: number;
	agentHealthWarning: boolean;
	done: number;
	total: number;
};

const TEAMS: TeamFixture[] = [
	{ id: "t1", name: "Core Platform", status: "blocked", phase: "build", activeBets: 2, agentCount: 4, activeAgentCount: 1, agentHealthWarning: true, done: 3, total: 11 },
	{ id: "t2", name: "Growth", status: "behind", phase: "build", activeBets: 1, agentCount: 3, activeAgentCount: 2, agentHealthWarning: false, done: 5, total: 8 },
	{ id: "t3", name: "Design Studio", status: "healthy", phase: "shape", activeBets: 1, agentCount: 2, activeAgentCount: 2, agentHealthWarning: false, done: 2, total: 4 },
	{ id: "t4", name: "Content", status: "healthy", phase: "cool-down", activeBets: 0, agentCount: 2, activeAgentCount: 0, agentHealthWarning: false, done: 6, total: 6 },
];

const STATUS_TO_TONE: Record<TeamFixture["status"], "error" | "warning" | "success"> = {
	blocked: "error",
	behind: "warning",
	healthy: "success",
};

// ── Shared page frame (mirrors Conversations/KnowledgeList) ──────────────────
function PageFrame({ children, headerExtra }: { children: React.ReactNode; headerExtra?: React.ReactNode }): React.JSX.Element {
	return (
		<div className="flex flex-col h-[560px] w-[720px] bg-[var(--surface-page)] border border-[var(--border-subtle)] rounded-[var(--r-default)] overflow-hidden">
			<header className="shrink-0 flex items-center justify-between gap-[12px] px-[24px] py-[18px] border-b border-[var(--border-subtle)]">
				<div className="flex items-center gap-[12px]">
					<h2 className="text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)]">Teams</h2>
					{headerExtra}
				</div>
				<Button variant="primary" size="sm">New bet</Button>
			</header>
			<div className="flex-1 overflow-y-auto">
				<div className="max-w-[800px] mx-auto w-full">{children}</div>
			</div>
		</div>
	);
}

function agentsCell(t: TeamFixture) {
	return {
		content: `${t.activeAgentCount}/${t.agentCount}`,
		numeric: true as const,
		tone: t.agentHealthWarning ? ("warning" as const) : ("info" as const),
		"data-testid": "team-agents" as const,
	};
}
function progressCell(t: TeamFixture) {
	return { content: `${t.done}/${t.total}`, numeric: true as const, hideBelow: 640 };
}

// ── Variant A — Switch-and-Overview (flat, symmetric) ────────────────────────
export const VariantASwitchOverview = (): React.JSX.Element => (
	<PageFrame>
		<ItemList variant="flush" as="ul" isEmpty={false}>
			{TEAMS.map((t) => (
				<Row
					key={t.id}
					as="li"
					title={t.name}
					subtitle={`${t.activeBets} active bet${t.activeBets === 1 ? "" : "s"} · ${t.phase}`}
					cells={[
						{ content: <StatusChip status={t.status} />, align: "end" },
						agentsCell(t),
						progressCell(t),
					]}
					onClick={() => {}}
				/>
			))}
		</ItemList>
	</PageFrame>
);

// ── Variant B — Attention-sorted + leading RowDot ────────────────────────────
const ATTENTION_ORDER: Record<TeamFixture["status"], number> = { blocked: 0, behind: 1, healthy: 2 };
export const VariantBAttentionSorted = (): React.JSX.Element => {
	const sorted = [...TEAMS].sort(
		(a, b) => ATTENTION_ORDER[a.status] - ATTENTION_ORDER[b.status] || a.name.localeCompare(b.name),
	);
	return (
		<PageFrame headerExtra={<span className="text-[13px] text-[var(--text-tertiary)]">{TEAMS.length} teams</span>}>
			<ItemList variant="flush" as="ul" isEmpty={false}>
				{sorted.map((t) => (
					<Row
						key={t.id}
						as="li"
						lead={<RowDot tone={STATUS_TO_TONE[t.status]} />}
						title={t.name}
						subtitle={`${t.activeBets} active · ${t.activeAgentCount}/${t.agentCount} agents`}
						cells={[{ content: <StatusChip status={t.status} />, align: "end" }, progressCell(t)]}
						onClick={() => {}}
					/>
				))}
			</ItemList>
		</PageFrame>
	);
};

// ── Variant C — Active-team spotlight (sectioned) ────────────────────────────
function SectionHeader({ label, danger }: { label: string; danger?: boolean }): React.JSX.Element {
	return (
		<h3
			className={`flex items-center gap-2 px-[12px] py-[6px] text-[11px] font-mono uppercase tracking-wider ${danger ? "text-[var(--status-error)]" : "text-[var(--text-tertiary)]"}`}
			style={danger ? { background: "color-mix(in srgb, var(--status-error) 10%, var(--surface-container))", borderLeft: "3px solid var(--status-error)" } : undefined}
		>
			{label}
		</h3>
	);
}
export const VariantCSpotlight = (): React.JSX.Element => {
	const attention = TEAMS.filter((t) => t.status !== "healthy" || t.agentHealthWarning);
	const active = TEAMS.filter((t) => !attention.includes(t) && t.activeBets > 0);
	const quiet = TEAMS.filter((t) => !attention.includes(t) && t.activeBets === 0);
	const renderRow = (t: TeamFixture, dim?: boolean) => (
		<div key={t.id} className={dim ? "opacity-70" : undefined}>
			<Row
				as="li"
				title={t.name}
				subtitle={t.activeBets > 0 ? `${t.activeBets} active · ${t.phase}` : t.phase}
				cells={[{ content: <StatusChip status={t.status} />, align: "end" }, agentsCell(t)]}
				onClick={() => {}}
			/>
		</div>
	);
	return (
		<PageFrame>
			{attention.length > 0 && (
				<>
					<SectionHeader label={`Needs attention · ${attention.length}`} danger />
					<ItemList variant="flush" as="ul" isEmpty={false}>{attention.map((t) => renderRow(t))}</ItemList>
				</>
			)}
			<SectionHeader label={`Active · ${active.length}`} />
			<ItemList variant="flush" as="ul" isEmpty={false}>{active.map((t) => renderRow(t))}</ItemList>
			{quiet.length > 0 && (
				<>
					<SectionHeader label={`Quiet · ${quiet.length}`} />
					<ItemList variant="flush" as="ul" isEmpty={false}>{quiet.map((t) => renderRow(t, true))}</ItemList>
				</>
			)}
		</PageFrame>
	);
};
