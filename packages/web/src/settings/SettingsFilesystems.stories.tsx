/**
 * AO1 — Variant A: a Settings "Filesystems" section (sibling to Connections).
 *
 * The load-bearing fork this variant takes: the surface LIVES IN SETTINGS as a
 * dedicated section, and filesystems are listed GROUPED BY AGENT. Attach = a
 * "+ Attach filesystem" dialog (kind → connection → resource). This is the
 * Connections twin — it re-applies the founder-approved AN1 grouped-list idiom
 * (Row + ItemList + SectionLabel + StatusChip + Dialog) verbatim to filesystems,
 * so a founder who knows Connections already knows this.
 *
 * Filesystem ⟂ Connection is made legible by the row subtitle: the resource
 * (repo+branch / folder) is the title-line truth; the Connection (auth) + the
 * writeback capability ride the subtitle + trailing mono cells — distinct axes,
 * never merged. State rides the StatusChip (healthy=reachable, behind=needs-
 * attention, unknown=attached/unchecked).
 *
 * Populated real state only (AC1/AC2/AC3): one agent with a code repo + a
 * doc_set folder; a second agent with a needs_attention code repo (its forge
 * Connection is missing — AC5). No skeleton / empty / error here (deferred to
 * build).
 *
 * @lore AO1: KindMark is an inline single-use shape adapted from AN1 ServiceMark.
 * Do not promote to the design system. Composes only catalogued primitives.
 *
 * Composes only catalogued design-system primitives (Row, ItemList, SectionLabel,
 * StatusChip, Tag, Button, Menu, Dialog, Input, Select) — zero new shapes.
 */

import {
	Button,
	Dialog,
	Input,
	ItemList,
	Menu,
	type MenuItem,
	Row,
	SectionLabel,
	Select,
	type Status,
	StatusChip,
	Tag,
} from "@hyperidle/design-system";
import { type JSX, useState } from "react";

// ---------------------------------------------------------------------------
// Fixture shape — the Filesystem as the UI sees it (mirrors @hyperidle/shared
// Filesystem from plans/AO1/architecture.md §1). No credential ever in this
// shape — only the resource selection + the FACT of reachability.
// ---------------------------------------------------------------------------

type FilesystemKind = "code" | "doc_set";
type WriteBack = "git" | "file" | "none";
type FsState = "attached" | "reachable" | "needs_attention";

interface FilesystemView {
	id: string;
	agentName: string;
	/** repo "owner/name" (code) or folder path (doc_set) — the resource selection. */
	resource: string;
	/** code: branch; doc_set: undefined. */
	branch?: string;
	kind: FilesystemKind;
	writeback: WriteBack;
	state: FsState;
	/** Connection display name (the auth axis) or null for bare-local / no-conn. */
	connection: string | null;
	/** Why it needs attention — only set when state === needs_attention. */
	attentionReason?: string;
}

const FILESYSTEMS: FilesystemView[] = [
	{
		id: "fs-acme-app",
		agentName: "Builder Bot",
		resource: "acme/storefront",
		branch: "main",
		kind: "code",
		writeback: "git",
		state: "reachable",
		connection: "GitHub",
	},
	{
		id: "fs-acme-notes",
		agentName: "Builder Bot",
		resource: "~/vaults/product-notes",
		kind: "doc_set",
		writeback: "file",
		state: "reachable",
		connection: null,
	},
	{
		id: "fs-marketing-site",
		agentName: "Acme PM",
		resource: "acme/marketing-site",
		branch: "release",
		kind: "code",
		writeback: "git",
		state: "needs_attention",
		connection: "GitHub",
		attentionReason: "GitHub connection not found — reconnect to author here",
	},
];

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function stateToStatus(s: FsState): Status | "unknown" {
	if (s === "reachable") return "healthy";
	if (s === "needs_attention") return "behind"; // amber = needs attention
	return "unknown"; // attached but not yet checked — neutral grey
}

function stateLabel(s: FsState): string {
	if (s === "reachable") return "Reachable";
	if (s === "needs_attention") return "Needs attention";
	return "Attached";
}

function kindLabel(k: FilesystemKind): string {
	return k === "code" ? "code" : "doc_set";
}

/** Where authored changes leave the sandbox. The capability axis, not the kind. */
function writebackNote(w: WriteBack): string {
	if (w === "git") return "Write-back via git · commit → PR";
	if (w === "file") return "Write-back via file · last write wins";
	return "Read-only reference";
}

/** Connection (auth axis) note. Filesystem ⟂ Connection — kept distinct from resource. */
function connectionNote(c: string | null): string {
	return c ? `Auth via ${c} connection` : "Local · no connection needed";
}

/** @lore AO1: inline single-use shape adapted from AN1 ServiceMark, not promoted. */
function KindMark({ kind }: { kind: FilesystemKind }): JSX.Element {
	const mark = kind === "code" ? "{ }" : "¶";
	return (
		<span className="inline-flex items-center justify-center h-[28px] w-[28px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[12px] font-[600] text-[var(--text-secondary)] shrink-0">
			{mark}
		</span>
	);
}

function rowMenuItems(): MenuItem[] {
	return [
		{ id: "reselect", label: "Re-select resource…", onSelect: () => {} },
		{ id: "detach", label: "Detach", onSelect: () => {}, destructive: true },
	];
}

/** Needs-attention floats to the top within a group. */
function bySeverity(a: FilesystemView, b: FilesystemView): number {
	const rank = (s: FsState) => (s === "needs_attention" ? 0 : 1);
	return rank(a.state) - rank(b.state) || a.resource.localeCompare(b.resource);
}

// ---------------------------------------------------------------------------
// Filesystem row
// ---------------------------------------------------------------------------

function FilesystemRow({ fs }: { fs: FilesystemView }): JSX.Element {
	const [menuOpen, setMenuOpen] = useState(false);
	return (
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
				<span className="flex items-center gap-[6px]">
					{connectionNote(fs.connection)}
					<span className="text-[var(--text-tertiary)]">· {writebackNote(fs.writeback)}</span>
				</span>
			}
			actions={
				<span className="flex items-center gap-[9px]">
					<StatusChip status={stateToStatus(fs.state) as Status} label={stateLabel(fs.state)} />
					<div className="relative">
						<Button
							variant="ghost"
							size="sm"
							aria-label={`Actions for ${fs.resource}`}
							onClick={() => setMenuOpen((o) => !o)}
						>
							⋯
						</Button>
						<Menu
							open={menuOpen}
							onClose={() => setMenuOpen(false)}
							items={rowMenuItems()}
							label={`Actions for ${fs.resource}`}
						/>
					</div>
				</span>
			}
		/>
	);
}

// ---------------------------------------------------------------------------
// Agent group — filesystems for one agent
// ---------------------------------------------------------------------------

function AgentGroup({
	agentName,
	role,
	filesystems,
}: {
	agentName: string;
	role: string;
	filesystems: FilesystemView[];
}): JSX.Element {
	const sorted = [...filesystems].sort(bySeverity);
	const needs = sorted.some((f) => f.state === "needs_attention");
	return (
		<section className="flex flex-col gap-[9px]">
			<div className="flex flex-col gap-[3px]">
				<SectionLabel
					label={agentName}
					trailing={
						<span className="flex items-center gap-[9px]">
							<span className="text-[11px] font-[400] tracking-normal normal-case text-[var(--text-tertiary)]">
								{role}
							</span>
							<Button variant="ghost" size="sm">
								+ Attach
							</Button>
						</span>
					}
				/>
				<p className="text-[12px] text-[var(--text-tertiary)]">
					{needs
						? "One filesystem needs attention — its connection can't be resolved."
						: "The repos and document sets this agent authors into."}
				</p>
			</div>
			<ItemList variant="contained" isEmpty={sorted.length === 0}>
				{sorted.map((fs) => (
					<FilesystemRow key={fs.id} fs={fs} />
				))}
			</ItemList>
		</section>
	);
}

// ---------------------------------------------------------------------------
// Attach dialog — kind → connection → resource
// ---------------------------------------------------------------------------

function AttachFilesystemDialog({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}): JSX.Element {
	const [kind, setKind] = useState<FilesystemKind>("code");
	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="Attach a filesystem"
			size="md"
			footer={
				<div className="flex justify-end gap-[9px]">
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary">Attach</Button>
				</div>
			}
		>
			<div className="flex flex-col gap-[18px]">
				<p className="text-[13px] text-[var(--text-secondary)]">
					Pick where this agent's work lives. A code repo writes back via git; a document set writes
					files. Auth comes from a connection you already made — the filesystem is just the
					resource.
				</p>
				<Select
					id="attach-agent"
					label="Agent"
					value="Builder Bot"
					onChange={() => {}}
					options={[
						{ value: "Builder Bot", label: "Builder Bot · builder" },
						{ value: "Acme PM", label: "Acme PM · product_manager" },
					]}
				/>
				<Select
					id="attach-kind"
					label="Kind"
					value={kind}
					onChange={(e) => setKind(e.target.value as FilesystemKind)}
					options={[
						{ value: "code", label: "Code repository (git)" },
						{ value: "doc_set", label: "Document set (markdown / Obsidian folder)" },
					]}
				/>
				{kind === "code" ? (
					<div className="flex flex-col gap-[9px]">
						<Select
							id="attach-conn"
							label="Connection (auth)"
							value="GitHub"
							onChange={() => {}}
							options={[
								{ value: "GitHub", label: "GitHub · inherited" },
								{ value: "local", label: "Local repo · no connection" },
							]}
						/>
						<Input label="Repository" placeholder="owner/name" value="acme/storefront" />
						<Input label="Branch" placeholder="main" value="main" />
						<p className="text-[12px] text-[var(--text-tertiary)]">
							The connection supplies forge auth; the repo + branch is the resource. No token is
							stored on the filesystem.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-[9px]">
						<Input label="Folder" placeholder="~/vaults/notes" value="~/vaults/product-notes" />
						<p className="text-[12px] text-[var(--text-tertiary)]">
							A local or connection-backed folder. Write-back is a plain file write — no custom
							sync engine.
						</p>
					</div>
				)}
			</div>
		</Dialog>
	);
}

export default {
	title: "SettingsFilesystems",
	group: "Settings" as const,
};

export const Populated = (): JSX.Element => {
	const [dialogOpen, setDialogOpen] = useState(false);
	const builder = FILESYSTEMS.filter((f) => f.agentName === "Builder Bot");
	const pm = FILESYSTEMS.filter((f) => f.agentName === "Acme PM");
	return (
		<div className="p-[24px] max-w-[760px] flex flex-col gap-[24px] bg-[var(--surface-page)]">
			<div className="flex items-start justify-between gap-[12px]">
				<div>
					<h2 className="text-[20px] font-[600] text-[var(--text-primary)]">Filesystems</h2>
					<p className="text-[13px] text-[var(--text-secondary)] mt-[3px] max-w-[520px]">
						Where each agent's work lives and accrues history — a code repository or a document set.
						Auth comes from a connection; the filesystem is the resource.
					</p>
				</div>
				<Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>
					+ Attach filesystem
				</Button>
			</div>
			<AgentGroup agentName="Builder Bot" role="builder" filesystems={builder} />
			<AgentGroup agentName="Acme PM" role="product_manager" filesystems={pm} />
			<AttachFilesystemDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
		</div>
	);
};
Populated.storyName = "Filesystems — by agent (Settings section)";
