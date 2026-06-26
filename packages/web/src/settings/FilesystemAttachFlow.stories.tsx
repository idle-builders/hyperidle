/**
 * AO1 — Variant C: a connection-first attach FLOW (reference: Vercel / Linear
 * "Connect a repository").
 *
 * The load-bearing fork this variant takes: the entry point is the CONNECTION
 * (the auth axis), not the agent and not a flat list. The founder starts from
 * "which connected account?", then browses that account's resources (repos /
 * folders), then assigns the chosen resource to an agent. The flow makes the
 * Filesystem ⟂ Connection composition the literal spine of the interaction:
 * step 1 IS the connection, step 2 IS the resource, step 3 IS the agent.
 *
 * Distinct from A and B on: hierarchy (the eye lands on the connection picker,
 * not a list of existing attachments), action surface (a left-rail step list
 * drives a single working pane — borrowed grammar from Vercel's import flow),
 * state strategy (a wizard-style single flow rather than a populated list +
 * dialog), composition (a two-pane flow, not a section of rows). Reachability
 * surfaces at step 1: a connection that can't resolve is flagged before you
 * pick a resource from it (AC5 surfaced at the source).
 *
 * Populated real state only: the flow shown mid-stream — a connected GitHub
 * account selected, its repos listed (one already attached, one selectable),
 * and a needs_attention connection flagged in the picker. No skeleton / empty /
 * error (deferred to build).
 *
 * Composes only catalogued primitives (Row, ItemList, SectionLabel, NavItem,
 * StatusChip, Tag, Button, Select, Input) — zero new shapes.
 */

import {
	Button,
	Input,
	ItemList,
	NavItem,
	Row,
	SectionLabel,
	type Status,
	StatusChip,
	Tag,
} from "@hyperidle/design-system";
import { type JSX, useState } from "react";

type FsState = "reachable" | "needs_attention";

interface ConnectionOption {
	id: string;
	service: string;
	via: string;
	state: FsState;
}

interface RepoOption {
	id: string;
	name: string;
	defaultBranch: string;
	/** already attached to an agent? then show who + disable select. */
	attachedTo?: string;
}

const CONNECTIONS: ConnectionOption[] = [
	{ id: "gh", service: "GitHub", via: "Claude Code · gh CLI", state: "reachable" },
	{ id: "gh-org", service: "GitHub (acme-org)", via: "Token · stored encrypted", state: "needs_attention" },
	{ id: "local", service: "Local repos", via: "No connection · local-first", state: "reachable" },
];

const REPOS: RepoOption[] = [
	{ id: "r1", name: "acme/storefront", defaultBranch: "main", attachedTo: "Builder Bot" },
	{ id: "r2", name: "acme/marketing-site", defaultBranch: "release" },
	{ id: "r3", name: "acme/internal-tools", defaultBranch: "main" },
];

function stateToStatus(s: FsState): Status {
	return s === "reachable" ? "healthy" : "behind";
}
function stateLabel(s: FsState): string {
	return s === "reachable" ? "Connected" : "Needs attention";
}

/** @lore AO1: inline single-use kind mark, not promoted (matches Variants A/B). */
function KindMark({ kind }: { kind: "code" | "doc_set" }): JSX.Element {
	const mark = kind === "code" ? "{ }" : "¶";
	return (
		<span className="inline-flex items-center justify-center h-[28px] w-[28px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[12px] font-[600] text-[var(--text-secondary)] shrink-0">
			{mark}
		</span>
	);
}

export default {
	title: "FilesystemAttachFlow",
	group: "Settings" as const,
};

export const Populated = (): JSX.Element => {
	const [selectedConn, setSelectedConn] = useState("gh");
	const [selectedRepo, setSelectedRepo] = useState("r2");
	const conn = CONNECTIONS.find((c) => c.id === selectedConn) ?? CONNECTIONS[0];

	return (
		<div className="p-[24px] max-w-[860px] flex flex-col gap-[18px] bg-[var(--surface-page)]">
			<div className="flex flex-col gap-[3px]">
				<h2 className="text-[20px] font-[600] text-[var(--text-primary)]">Attach a filesystem</h2>
				<p className="text-[13px] text-[var(--text-secondary)] max-w-[560px]">
					Start from a connected account, pick the repository or folder, then assign it to an agent.
					The connection supplies auth — the filesystem is the resource you pick from it.
				</p>
			</div>

			<div className="flex gap-[18px]">
				{/* Left rail — the three steps. Borrowed grammar: a step list driving one pane. */}
				<nav className="w-[200px] shrink-0 flex flex-col gap-[3px]">
					<NavItem label="1 · Connection" selected />
					<NavItem label="2 · Resource" />
					<NavItem label="3 · Agent" />
				</nav>

				{/* Working pane — step 1 (connection) + step 2 (resource) shown together
				    so the flow's spine is visible in one populated frame. */}
				<div className="flex-1 flex flex-col gap-[24px] min-w-0">
					{/* STEP 1 — connection (the auth axis is the entry point) */}
					<section className="flex flex-col gap-[9px]">
						<div className="flex flex-col gap-[3px]">
							<SectionLabel label="Connection" />
							<p className="text-[12px] text-[var(--text-tertiary)]">
								The account whose repos you'll attach. A connection that needs attention can't be
								browsed until it's reconnected.
							</p>
						</div>
						<ItemList variant="contained">
							{CONNECTIONS.map((c) => (
								<Row
									key={c.id}
									onClick={() => setSelectedConn(c.id)}
									lead={
										<span
											className={`inline-flex items-center justify-center h-[28px] w-[28px] rounded-[var(--r-subtle)] text-[12px] font-[600] shrink-0 ${
												c.id === selectedConn
													? "bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
													: "bg-[var(--surface-container)] text-[var(--text-secondary)]"
											}`}
										>
											{c.service.slice(0, 2)}
										</span>
									}
									title={c.service}
									subtitle={c.via}
									actions={
										<StatusChip status={stateToStatus(c.state)} label={stateLabel(c.state)} />
									}
								/>
							))}
						</ItemList>
					</section>

					{/* STEP 2 — resource within the selected connection */}
					<section className="flex flex-col gap-[9px]">
						<div className="flex flex-col gap-[3px]">
							<SectionLabel
								label="Resource"
								trailing={
									<span className="text-[11px] font-[400] tracking-normal normal-case text-[var(--text-tertiary)]">
										from {conn?.service}
									</span>
								}
							/>
							<p className="text-[12px] text-[var(--text-tertiary)]">
								Pick a repository to attach as a code filesystem (write-back: git).
							</p>
						</div>
						<ItemList variant="contained">
							{REPOS.map((r) => {
								const isAttached = Boolean(r.attachedTo);
								const isSelected = r.id === selectedRepo;
								return (
									<Row
										key={r.id}
										onClick={isAttached ? undefined : () => setSelectedRepo(r.id)}
										lead={<KindMark kind="code" />}
										title={
											<span className="flex items-center gap-[9px]">
												<span className="font-[var(--font-mono)] text-[13px]">{r.name}</span>
												<span className="font-[var(--font-mono)] text-[11px] text-[var(--text-tertiary)]">
													@{r.defaultBranch}
												</span>
												<Tag label="code" />
											</span>
										}
										subtitle={
											isAttached
												? `Already attached to ${r.attachedTo}`
												: isSelected
													? "Selected — set the branch and agent below"
													: "Available to attach"
										}
										actions={
											isAttached ? (
												<StatusChip status="healthy" label="Attached" />
											) : isSelected ? (
												<span className="text-[12px] font-[600] text-[var(--accent-primary)]">Selected</span>
											) : (
												<Button variant="ghost" size="sm">
													Select
												</Button>
											)
										}
									/>
								);
							})}
						</ItemList>
					</section>

					{/* STEP 3 — assign to an agent (branch + agent + write-back) */}
					<section className="flex flex-col gap-[9px]">
						<SectionLabel label="Assign" />
						<div className="border-[1.5px] border-[var(--border-subtle)] rounded-[var(--r-subtle)] p-[18px] flex flex-col gap-[12px]">
							<div className="grid grid-cols-2 gap-[12px]">
								<Input label="Branch" placeholder="main" value="release" />
								<Input label="Agent" placeholder="Builder Bot" value="Acme PM" />
							</div>
							<p className="text-[12px] text-[var(--text-tertiary)]">
								acme/marketing-site @ release → Acme PM · write-back via git. No token is stored on
								the filesystem; auth rides the GitHub connection into the sandbox.
							</p>
							<div className="flex justify-end gap-[9px]">
								<Button variant="ghost" size="sm">
									Cancel
								</Button>
								<Button variant="primary" size="sm">
									Attach filesystem
								</Button>
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
};
Populated.storyName = "Attach flow — connection-first (Vercel-style import)";
