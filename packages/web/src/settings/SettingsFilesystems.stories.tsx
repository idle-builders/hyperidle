/**
 * AO1 (reworked to the corrected IA) — SettingsFilesystems: the TEAM REGISTRY.
 *
 * DESIGN-CLASS = routine (extract). NOT a novel surface — it is the next Settings
 * section, extracted verbatim from the established Settings-section grammar
 * (SettingsHarnesses / SettingsModels / SettingsAgents). "List / register / inspect
 * a thing in Settings" is already solved; Filesystems reuses that chrome.
 *
 * Corrected model (docs/process-layer/canonical-shapes.md § Filesystem):
 *   - A filesystem is REGISTERED ONCE, team-scoped, with a first-class `source`
 *     (local / github / gdrive / obsidian …) — parallel to a connector.
 *   - It is NOT owned by a single agent. This registry is a FLAT list of the
 *     team's registered filesystems (NOT grouped by bot).
 *   - Per-bot INJECTION lives on the bot's config (SettingsAgents), not here.
 *
 * Grammar extracted from SettingsHarnesses.tsx (the closest dense-list sibling):
 *   - outer wrapper `flex flex-col gap-[12px]`;
 *   - ONE uppercase section-label header (tracking-caps-sm, text-tertiary) with a
 *     trailing ghost `+ Add filesystem` Button — same shape as "PROVIDERS" / Refresh;
 *   - ONE `--surface-elevated` bordered container with `h-px` hairline row dividers
 *     (`overflow-hidden`) — the AM4 "Agent backends" container rule;
 *   - inline Inspect-expand below a row (as SettingsAgents/SettingsModels expand).
 *
 * Reused DS primitives (zero new shapes):
 *   - `Tag` for the `source` mark — the existing easy-to-detect type/source chip
 *     the agent surfaces use to mark type (role in SettingsAgents; kind here). It
 *     leads each row, prominent. NO hand-rolled logo/provider component exists in
 *     the DS — `Tag` IS the catalogued mark, so we reuse it.
 *   - `Tag` (neutral) for the `kind` label;
 *   - `StatusChip` for state (incl. needs_attention → behind/amber);
 *   - `KeyValue` for the inspect grid (source / resource / branch / kind / write-back
 *     / connection / state), split into a files cluster and an auth cluster by a
 *     hairline so Filesystem ⟂ Connection stays structurally legible.
 *
 * @lore AO1: KeyValue renders its value at 15px SANS (KeyValue.tsx:23), so the
 * mono resource/branch identifiers in the inspect grid read sans, not mono.
 * Accepted — reusing the catalogued Settings primitive beats a bespoke mono field;
 * the row title still carries the mono resource for identity.
 *
 * Renders only the populated real state + a needs_attention row (AC). No skeleton /
 * empty / error here — those reuse Settings conventions at build.
 */

// hearth-internal-padding

import { Button, KeyValue, type Status, StatusChip, Tag } from "@hyperidle/design-system";
import { type JSX, useState } from "react";

// ---------------------------------------------------------------------------
// Fixture shape — the registered Filesystem as the UI sees it (mirrors the
// canonical shape in docs/process-layer/canonical-shapes.md § Filesystem).
// No credential is ever in this shape — only the resource selection, the source
// type, and the FACT of reachability.
// ---------------------------------------------------------------------------

type FsSource = "local" | "github" | "gdrive" | "obsidian";
type FilesystemKind = "code" | "doc_set";
type WriteBack = "git" | "file" | "none";
type FsState = "attached" | "reachable" | "needs_attention";

interface FilesystemView {
	id: string;
	/** The SOURCE TYPE — leads each row as the prominent, easy-to-detect mark. */
	source: FsSource;
	/** repo "owner/name" (code) or folder path (doc_set) — the resource selection. */
	resource: string;
	/** code: branch; doc_set: undefined. */
	branch?: string;
	kind: FilesystemKind;
	writeback: WriteBack;
	state: FsState;
	/** Connection display name (the auth axis) or null for bare-local. */
	connection: string | null;
	/** How many bots this registered filesystem is injected into (registry stat). */
	injectedInto: number;
	/** Why it needs attention — only set when state === needs_attention. */
	attentionReason?: string;
}

// The TEAM's registry — a flat list, NOT grouped by bot. One filesystem is
// registered once and injected into 0..N bots (the injectedInto count).
const FILESYSTEMS: FilesystemView[] = [
	{
		id: "fs-storefront",
		source: "github",
		resource: "acme/storefront",
		branch: "main",
		kind: "code",
		writeback: "git",
		state: "reachable",
		connection: "GitHub · acme-bot",
		injectedInto: 3,
	},
	{
		id: "fs-marketing-site",
		source: "github",
		resource: "acme/marketing-site",
		branch: "release",
		kind: "code",
		writeback: "git",
		state: "needs_attention",
		connection: "GitHub · acme-bot",
		injectedInto: 1,
		attentionReason: "Connection expired — reconnect to author here",
	},
	{
		id: "fs-product-notes",
		source: "obsidian",
		resource: "~/vaults/product-notes",
		kind: "doc_set",
		writeback: "file",
		state: "reachable",
		connection: null,
		injectedInto: 2,
	},
	{
		id: "fs-brand-docs",
		source: "gdrive",
		resource: "Marketing / Brand",
		kind: "doc_set",
		writeback: "file",
		state: "reachable",
		connection: "Google Drive · acme.com",
		injectedInto: 1,
	},
	{
		id: "fs-scratch",
		source: "local",
		resource: "~/work/scratch",
		kind: "doc_set",
		writeback: "none",
		state: "attached",
		connection: null,
		injectedInto: 0,
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

function sourceLabel(s: FsSource): string {
	if (s === "github") return "GitHub";
	if (s === "gdrive") return "Google Drive";
	if (s === "obsidian") return "Obsidian";
	return "Local";
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

function injectionLabel(n: number): string {
	if (n === 0) return "Injected into no bots yet";
	if (n === 1) return "Injected into 1 bot";
	return `Injected into ${n} bots`;
}

/** Needs-attention floats to the top of the registry. */
function bySeverity(a: FilesystemView, b: FilesystemView): number {
	const rank = (s: FsState): number => (s === "needs_attention" ? 0 : 1);
	return rank(a.state) - rank(b.state) || a.resource.localeCompare(b.resource);
}

// ---------------------------------------------------------------------------
// Inline inspect — design-system KeyValue grid (Source / Resource / Branch /
// Kind / Write-back / Connection / State). Two clusters split by a hairline so
// the Connection/auth axis sits visibly apart from the files axis (Filesystem ⟂
// Connection). Maps to GET /api/filesystems/:id.
// ---------------------------------------------------------------------------

function FilesystemInspect({ fs }: { fs: FilesystemView }): JSX.Element {
	return (
		<div className="flex flex-col gap-[12px] border-t border-[var(--border-subtle)] bg-[var(--surface-container)] px-[12px] py-[12px]">
			<div className="flex flex-col gap-[6px]">
				<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					Resource &amp; files
				</span>
				<KeyValue label="Source" value={sourceLabel(fs.source)} />
				<KeyValue label="Resource" value={fs.resource} />
				<KeyValue label="Branch" value={fs.branch ?? "—"} />
				<KeyValue label="Kind" value={kindLabel(fs.kind)} />
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
// Filesystem row — flat display row inside the ONE registry container, with an
// inline Inspect expand. The `source` Tag leads the row as the prominent mark.
// Mirrors the SettingsHarnesses row + SettingsAgents expand.
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
				{/* Source mark — the prominent, easy-to-detect type chip leads the row. */}
				<div className="shrink-0">
					<Tag label={sourceLabel(fs.source)} />
				</div>
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
						{injectionLabel(fs.injectedInto)}
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
					<Button variant="ghost" size="sm" aria-label={`Remove ${fs.resource}`}>
						Remove
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
// Story
// ---------------------------------------------------------------------------

export default {
	title: "SettingsFilesystems",
	group: "Settings" as const,
};

export const Populated = (): JSX.Element => {
	const sorted = [...FILESYSTEMS].sort(bySeverity);
	return (
		<div className="flex flex-col gap-[24px] bg-[var(--surface-page)] p-[24px]">
			{/* Section intro — same flat lede the other Settings sections use. */}
			<p className="max-w-[560px] text-[12px] text-[var(--text-tertiary)]">
				Filesystems your team has registered — a code repository or a document set where work lives
				and accrues history. Registered once here; inject into a bot from its config under Agents.
				Auth comes from a connection; the filesystem is the resource it points at.
			</p>
			<div className="flex flex-col gap-[12px]">
				{/* Section header — same shape as SettingsHarnesses' "PROVIDERS" / Refresh. */}
				<div className="flex items-center justify-between">
					<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						Registered filesystems
					</span>
					<Button variant="ghost" size="sm" aria-label="Add a filesystem to the team registry">
						+ Add filesystem
					</Button>
				</div>
				{/* ONE bordered container with hairline-divided rows — the whole registry. */}
				<div className="overflow-hidden rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]">
					{sorted.map((fs, index) => (
						<div key={fs.id}>
							{index > 0 ? <div className="h-px bg-[var(--border-subtle)]" /> : null}
							<FilesystemRow fs={fs} defaultExpanded={fs.id === "fs-marketing-site"} />
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
Populated.storyName = "Filesystems registry (Settings section)";
