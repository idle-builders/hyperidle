/**
 * AO1 — SettingsFilesystems: the single design.
 *
 * DESIGN-CLASS = routine (extract). This is NOT a novel surface — it is the
 * next Settings section, extracted verbatim from the established Settings-section
 * grammar (SettingsHarnesses / SettingsModels / SettingsAgents). "List / attach /
 * inspect a thing in Settings" is already solved; Filesystems reuses that chrome.
 *
 * Grammar extracted from SettingsHarnesses.tsx (the closest dense-list sibling):
 *   - outer wrapper `flex flex-col gap-[12px]`;
 *   - a per-group uppercase section-label header (tracking-caps-sm, text-tertiary)
 *     with a trailing ghost `+ Attach` Button — same shape as the "PROVIDERS" /
 *     Refresh header;
 *   - ONE `--surface-elevated` bordered container per group with `h-px` hairline
 *     row dividers (`overflow-hidden`) — the AM4 "Agent backends" container rule
 *     (docs/ui-design/settings-consistency.md § Agent backends);
 *   - `StatusChip` for state (incl. needs_attention → behind/amber);
 *   - `Tag` for the kind label (as SettingsAgents tags role);
 *   - inline expand row for inspect (as SettingsAgents/SettingsModels expand for
 *     edit), revealing a `KeyValue` grid.
 *
 * Inspect uses the design-system `KeyValue` primitive (Kind / Resource / Branch /
 * Write-back / Connection / State). The Connection/auth fields are visually
 * grouped apart from the files fields by a hairline + cluster label, so
 * Filesystem ⟂ Connection stays structurally legible.
 *
 * @lore AO1: KeyValue renders its value at 15px SANS (KeyValue.tsx:23), so the
 * mono resource/branch identifiers in the inspect grid read sans, not mono.
 * Accepted — reusing the catalogued Settings primitive beats a bespoke mono
 * field; the row title still carries the mono resource for identity.
 *
 * Renders only the populated real state + a needs_attention row (AC). No
 * skeleton / empty / error here — those reuse Settings conventions at build
 * (SkeletonList / EmptyState compact / ErrorState compact).
 */

// hearth-internal-padding

import { Button, KeyValue, type Status, StatusChip, Tag } from "@hyperidle/design-system";
import { type JSX, useState } from "react";

// ---------------------------------------------------------------------------
// Fixture shape — the Filesystem as the UI sees it (mirrors the canonical shape
// in docs/process-layer/filesystem-primitive.md). No credential is ever in this
// shape — only the resource selection + the FACT of reachability.
// ---------------------------------------------------------------------------

type FilesystemKind = "code" | "doc_set";
type WriteBack = "git" | "file" | "none";
type FsState = "attached" | "reachable" | "needs_attention";

interface FilesystemView {
	id: string;
	agentName: string;
	role: string;
	/** repo "owner/name" (code) or folder path (doc_set) — the resource selection. */
	resource: string;
	/** code: branch; doc_set: undefined. */
	branch?: string;
	kind: FilesystemKind;
	writeback: WriteBack;
	state: FsState;
	/** Connection display name (the auth axis) or null for bare-local. */
	connection: string | null;
	/** Why it needs attention — only set when state === needs_attention. */
	attentionReason?: string;
}

const FILESYSTEMS: FilesystemView[] = [
	{
		id: "fs-acme-app",
		agentName: "Builder Bot",
		role: "builder",
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
		role: "builder",
		resource: "~/vaults/product-notes",
		kind: "doc_set",
		writeback: "file",
		state: "reachable",
		connection: null,
	},
	{
		id: "fs-marketing-site",
		agentName: "Acme PM",
		role: "product_manager",
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

/** Inspect-grid write-back value (the capability axis). */
function writebackValue(w: WriteBack): string {
	if (w === "git") return "git · commit → PR";
	if (w === "file") return "file · last write wins";
	return "none · read-only";
}

/** Needs-attention floats to the top within a group. */
function bySeverity(a: FilesystemView, b: FilesystemView): number {
	const rank = (s: FsState): number => (s === "needs_attention" ? 0 : 1);
	return rank(a.state) - rank(b.state) || a.resource.localeCompare(b.resource);
}

// ---------------------------------------------------------------------------
// Inline inspect — design-system KeyValue grid (Kind / Resource / Branch /
// Write-back / Connection / State). Two clusters split by a hairline so the
// Connection/auth axis sits visibly apart from the files axis (Filesystem ⟂
// Connection). Maps to GET /api/filesystems/:id.
// ---------------------------------------------------------------------------

function FilesystemInspect({ fs }: { fs: FilesystemView }): JSX.Element {
	return (
		<div className="flex flex-col gap-[12px] border-t border-[var(--border-subtle)] bg-[var(--surface-container)] px-[12px] py-[12px]">
			<div className="flex flex-col gap-[6px]">
				<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					Resource &amp; files
				</span>
				<KeyValue label="Kind" value={kindLabel(fs.kind)} />
				<KeyValue label="Resource" value={fs.resource} />
				<KeyValue label="Branch" value={fs.branch ?? "—"} />
				<KeyValue label="Write-back" value={writebackValue(fs.writeback)} />
			</div>
			{/* Auth axis — apart from the resource cluster (Filesystem ⟂ Connection). */}
			<div className="flex flex-col gap-[6px] border-t border-[var(--border-subtle)] pt-[12px]">
				<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					Auth &amp; connection
				</span>
				<KeyValue label="Connection" value={fs.connection ?? "Local (none)"} />
				<KeyValue label="State" value={stateLabel(fs.state)} />
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Filesystem row — flat display row inside the group container, with an inline
// Inspect expand. Mirrors the SettingsHarnesses row + SettingsAgents expand.
// ---------------------------------------------------------------------------

function FilesystemRow({
	fs,
	defaultExpanded = false,
}: {
	fs: FilesystemView;
	defaultExpanded?: boolean;
}): JSX.Element {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const inspectId = `fs-inspect-${fs.id}`;
	return (
		<div>
			<div className="flex items-center gap-[12px] px-[12px] py-[12px]">
				<div className="flex min-w-0 flex-1 flex-col gap-[3px]">
					<div className="flex items-center gap-[9px]">
						<span className="truncate font-[family-name:var(--font-mono)] text-[13px] text-[var(--text-primary)]">
							{fs.resource}
						</span>
						{fs.branch ? (
							<span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-tertiary)]">
								@{fs.branch}
							</span>
						) : null}
						<Tag label={kindLabel(fs.kind)} />
					</div>
					<span className="text-[12px] text-[var(--text-tertiary)]">
						{fs.connection ? `Auth via ${fs.connection} connection` : "Local · no connection"}
						{fs.attentionReason ? ` · ${fs.attentionReason}` : null}
					</span>
				</div>
				<div className="flex shrink-0 items-center gap-[9px]">
					<StatusChip status={stateToStatus(fs.state)} label={stateLabel(fs.state)} />
					<Button
						variant="ghost"
						size="sm"
						aria-expanded={expanded}
						aria-controls={inspectId}
						onClick={() => setExpanded((o) => !o)}
					>
						{expanded ? "Hide" : "Inspect"}
					</Button>
					<Button variant="ghost" size="sm" aria-label={`Detach ${fs.resource}`}>
						Detach
					</Button>
				</div>
			</div>
			{expanded ? (
				<div id={inspectId}>
					<FilesystemInspect fs={fs} />
				</div>
			) : null}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Agent group — one section header + one bordered container of rows.
// Extracted from SettingsHarnesses' header + container shape.
// ---------------------------------------------------------------------------

function AgentGroup({
	agentName,
	role,
	filesystems,
	expandedId,
}: {
	agentName: string;
	role: string;
	filesystems: FilesystemView[];
	/** Row to render expanded on first paint. */
	expandedId?: string;
}): JSX.Element {
	const sorted = [...filesystems].sort(bySeverity);
	return (
		<div className="flex flex-col gap-[12px]">
			{/* Section header — same shape as SettingsHarnesses' "PROVIDERS" / Refresh. */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-[9px]">
					<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						{agentName}
					</span>
					<Tag label={role} />
				</div>
				<Button variant="ghost" size="sm" aria-label={`Attach a filesystem to ${agentName}`}>
					+ Attach
				</Button>
			</div>
			{/* ONE bordered container with hairline-divided rows. */}
			<div className="overflow-hidden rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]">
				{sorted.map((fs, index) => (
					<div key={fs.id}>
						{index > 0 ? <div className="h-px bg-[var(--border-subtle)]" /> : null}
						<FilesystemRow fs={fs} defaultExpanded={fs.id === expandedId} />
					</div>
				))}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export default {
	title: "SettingsFilesystems",
	group: "Settings" as const,
};

export const Populated = (): JSX.Element => {
	const builder = FILESYSTEMS.filter((f) => f.agentName === "Builder Bot");
	const pm = FILESYSTEMS.filter((f) => f.agentName === "Acme PM");
	return (
		<div className="flex flex-col gap-[24px] bg-[var(--surface-page)] p-[24px]">
			{/* Section intro — same flat lede the other Settings sections use. */}
			<p className="max-w-[560px] text-[12px] text-[var(--text-tertiary)]">
				Where each agent's work lives and accrues history — a code repository or a document set.
				Auth comes from a connection; the filesystem is the resource it attaches.
			</p>
			<AgentGroup
				agentName="Builder Bot"
				role="builder"
				filesystems={builder}
				expandedId="fs-acme-app"
			/>
			<AgentGroup agentName="Acme PM" role="product_manager" filesystems={pm} />
		</div>
	);
};
Populated.storyName = "Filesystems — by agent (Settings section)";
