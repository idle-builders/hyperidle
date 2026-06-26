/**
 * AO1 — Variant B: filesystems INLINE on the agent's own config panel.
 *
 * The load-bearing fork this variant takes: a filesystem is a PROPERTY OF THE
 * AGENT, so it is attached and inspected exactly where the agent is already
 * configured (the agent panel where harness / model / role live), NOT in a
 * separate Settings list. This is the most literal reading of "attach a
 * filesystem to THIS agent" — the founder is on the agent already.
 *
 * Distinct from Variant A on hierarchy (the AGENT is the frame, filesystems are
 * a sub-card), density (a per-agent panel, one agent at a time, with the full
 * inspect surface expanded), action surface (attach button sits in the agent's
 * own section header), and inspect strategy (KeyValue field grid makes kind /
 * resource / write-back / connection / state each a first-class labeled value —
 * Filesystem ⟂ Connection is legible because they are SEPARATE rows in the grid).
 *
 * Populated real state only: one agent (Builder Bot) with its config summary +
 * two attached filesystems (a healthy code repo expanded into its KeyValue
 * inspect, and a doc_set folder) + a needs_attention example. No skeleton /
 * empty / error (deferred to build).
 *
 * Composes only catalogued primitives (Row, ItemList, SectionLabel, KeyValue,
 * StatusChip, Tag, Button, KeyValue) — zero new shapes.
 */

import {
	Button,
	ItemList,
	KeyValue,
	Row,
	SectionLabel,
	type Status,
	StatusChip,
	Tag,
} from "@hyperidle/design-system";
import { type JSX, useState } from "react";

type FilesystemKind = "code" | "doc_set";
type WriteBack = "git" | "file" | "none";
type FsState = "attached" | "reachable" | "needs_attention";

interface FilesystemView {
	id: string;
	resource: string;
	branch?: string;
	kind: FilesystemKind;
	writeback: WriteBack;
	state: FsState;
	connection: string | null;
	attentionReason?: string;
}

const FILESYSTEMS: FilesystemView[] = [
	{
		id: "fs-acme-app",
		resource: "acme/storefront",
		branch: "main",
		kind: "code",
		writeback: "git",
		state: "reachable",
		connection: "GitHub",
	},
	{
		id: "fs-acme-notes",
		resource: "~/vaults/product-notes",
		kind: "doc_set",
		writeback: "file",
		state: "reachable",
		connection: null,
	},
	{
		id: "fs-marketing-site",
		resource: "acme/marketing-site",
		branch: "release",
		kind: "code",
		writeback: "git",
		state: "needs_attention",
		connection: "GitHub",
		attentionReason: "GitHub connection not found",
	},
];

function stateToStatus(s: FsState): Status {
	if (s === "reachable") return "healthy";
	if (s === "needs_attention") return "behind";
	return "paused";
}
function stateLabel(s: FsState): string {
	if (s === "reachable") return "Reachable";
	if (s === "needs_attention") return "Needs attention";
	return "Attached";
}
function kindLabel(k: FilesystemKind): string {
	return k === "code" ? "code" : "doc_set";
}
function writebackLabel(w: WriteBack): string {
	if (w === "git") return "git (commit → PR)";
	if (w === "file") return "file (write)";
	return "none (read-only)";
}

/** @lore AO1: inline single-use kind mark, not promoted (matches Variant A). */
function KindMark({ kind }: { kind: FilesystemKind }): JSX.Element {
	const mark = kind === "code" ? "{ }" : "¶";
	return (
		<span className="inline-flex items-center justify-center h-[28px] w-[28px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[12px] font-[600] text-[var(--text-secondary)] shrink-0">
			{mark}
		</span>
	);
}

/**
 * One filesystem as a card-row that expands to a KeyValue inspect grid.
 * The inspect grid is where Filesystem ⟂ Connection becomes legible: kind,
 * resource, branch, write-back, connection, state are each a separate labeled
 * field — the auth axis (connection) and the resource axis never collapse.
 */
function FilesystemCard({ fs, expanded }: { fs: FilesystemView; expanded: boolean }): JSX.Element {
	const [open, setOpen] = useState(expanded);
	return (
		<div className="border-[1.5px] border-[var(--border-subtle)] rounded-[var(--r-subtle)] overflow-hidden">
			<Row
				lead={<KindMark kind={fs.kind} />}
				title={
					<span className="flex items-center gap-[9px]">
						<span className="font-[var(--font-mono)] text-[13px]">{fs.resource}</span>
						{fs.branch ? (
							<span className="font-[var(--font-mono)] text-[11px] text-[var(--text-tertiary)]">
								@{fs.branch}
							</span>
						) : null}
						<Tag label={kindLabel(fs.kind)} />
					</span>
				}
				subtitle={
					fs.state === "needs_attention" && fs.attentionReason ? (
						<span className="text-[var(--status-warning)]">{fs.attentionReason}</span>
					) : (
						<span>{fs.connection ? `Auth via ${fs.connection}` : "Local · no connection"}</span>
					)
				}
				actions={
					<span className="flex items-center gap-[9px]">
						<StatusChip status={stateToStatus(fs.state)} label={stateLabel(fs.state)} />
						<Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
							{open ? "Hide" : "Inspect"}
						</Button>
					</span>
				}
			/>
			{open ? (
				<div className="px-[12px] pb-[12px] pt-[3px] grid grid-cols-2 gap-x-[24px] gap-y-[9px] border-t-[1px] border-[var(--border-subtle)]">
					<KeyValue label="Kind" value={kindLabel(fs.kind)} />
					<KeyValue label="State" value={stateLabel(fs.state)} />
					<KeyValue label="Resource" value={fs.resource} />
					<KeyValue label="Branch" value={fs.branch ?? "—"} />
					<KeyValue label="Write-back" value={writebackLabel(fs.writeback)} />
					<KeyValue label="Connection" value={fs.connection ?? "Local (none)"} />
					<div className="col-span-2 flex gap-[9px] pt-[6px]">
						<Button variant="ghost" size="sm">
							Re-select resource…
						</Button>
						<Button variant="ghost" size="sm" className="text-[var(--status-error)]">
							Detach
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}

export default {
	title: "AgentFilesystemsInline",
	group: "Settings" as const,
};

export const Populated = (): JSX.Element => {
	return (
		<div className="p-[24px] max-w-[760px] flex flex-col gap-[24px] bg-[var(--surface-page)]">
			{/* Agent config frame — filesystems live as one section of the agent panel */}
			<div className="flex items-start gap-[12px]">
				<span className="inline-flex items-center justify-center h-[36px] w-[36px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[13px] font-[600] text-[var(--text-secondary)] shrink-0">
					BB
				</span>
				<div className="flex flex-col gap-[3px]">
					<h2 className="text-[20px] font-[600] text-[var(--text-primary)]">Builder Bot</h2>
					<p className="text-[13px] text-[var(--text-secondary)]">
						builder · Claude Code · claude-opus-4-8
					</p>
				</div>
			</div>

			{/* Sibling agent-config sections shown collapsed for context (this is ONE
			    panel; filesystems is the section AO1 adds). Rendered as flush rows. */}
			<ItemList variant="flush">
				<Row title="Role & system prompt" subtitle="builder" actions={<Button variant="ghost" size="sm">Edit</Button>} />
				<Row title="Harness & model" subtitle="Claude Code · claude-opus-4-8" actions={<Button variant="ghost" size="sm">Edit</Button>} />
			</ItemList>

			{/* The AO1 section: Filesystems for THIS agent */}
			<section className="flex flex-col gap-[9px]">
				<div className="flex flex-col gap-[3px]">
					<SectionLabel
						label="Filesystems"
						trailing={
							<Button variant="ghost" size="sm">
								+ Attach
							</Button>
						}
					/>
					<p className="text-[12px] text-[var(--text-tertiary)]">
						The repos and document sets this agent authors into. Auth rides a connection; the
						filesystem is the resource.
					</p>
				</div>
				<div className="flex flex-col gap-[9px]">
					<FilesystemCard fs={FILESYSTEMS[0] as FilesystemView} expanded />
					<FilesystemCard fs={FILESYSTEMS[1] as FilesystemView} expanded={false} />
					<FilesystemCard fs={FILESYSTEMS[2] as FilesystemView} expanded={false} />
				</div>
			</section>
		</div>
	);
};
Populated.storyName = "Agent config — Filesystems inline (KeyValue inspect)";
