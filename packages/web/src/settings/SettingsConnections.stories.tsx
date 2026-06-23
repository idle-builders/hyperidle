/**
 * Canonical approved design fixture for the Connections settings surface.
 *
 * Single render — "Inherited-default": connections grouped by auth source, with
 * the harness/env group first (the first-class signal: HyperIdle stores nothing,
 * auth lives where the user set it up). Matches the visual contract implemented
 * in SettingsConnections.tsx.
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

export default {
	title: "SettingsConnections",
	group: "Settings" as const,
};

// ---------------------------------------------------------------------------
// Fixture shape — the per-(user × service) ServiceConnection as the UI sees it.
// Mirrors what GET /api/connections will return (architecture defines the type).
// No secret is ever in this shape — only the FACT of availability + health.
// ---------------------------------------------------------------------------

type AuthSource = "harness" | "token" | "mcp-oauth";
type Health = "usable" | "needs-attention" | "expired";
type TrustTier = "vetted" | "community";

interface ConnectionView {
	id: string;
	service: string; // display name: "GitHub", "Stripe"…
	/** Where its tools come from — for harness, the harness/CLI name; for mcp, the server URL. */
	via: string;
	authSource: AuthSource;
	health: Health;
	trustTier: TrustTier;
	/** Count of tools the connection exposes — concrete, scannable. */
	toolCount: number;
}

const CONNECTIONS: ConnectionView[] = [
	// Source 1 — harness/env native (the DEFAULT; HyperIdle stores nothing).
	{
		id: "c1",
		service: "GitHub",
		via: "Claude Code · gh CLI",
		authSource: "harness",
		health: "usable",
		trustTier: "vetted",
		toolCount: 23,
	},
	{
		id: "c2",
		service: "Git",
		via: "Claude Code · git",
		authSource: "harness",
		health: "usable",
		trustTier: "vetted",
		toolCount: 8,
	},
	{
		id: "c3",
		service: "Linear",
		via: "Harness MCP config",
		authSource: "harness",
		health: "usable",
		trustTier: "community",
		toolCount: 11,
	},
	// Source 2 — user-supplied token (HyperIdle holds ciphertext, resolves server-side).
	{
		id: "c4",
		service: "Stripe",
		via: "API key · held in vault",
		authSource: "token",
		health: "usable",
		trustTier: "vetted",
		toolCount: 14,
	},
	{
		id: "c5",
		service: "SendGrid",
		via: "API key · held in vault",
		authSource: "token",
		health: "expired",
		trustTier: "community",
		toolCount: 6,
	},
	// Source 3 — the MCP server's own OAuth (service is the provider; DCR/CIMD).
	{
		id: "c6",
		service: "Figma",
		via: "mcp.figma.com · service OAuth",
		authSource: "mcp-oauth",
		health: "needs-attention",
		trustTier: "vetted",
		toolCount: 9,
	},
];

// ---------------------------------------------------------------------------
// Shared mappers
// ---------------------------------------------------------------------------

function healthToStatus(h: Health): Status {
	switch (h) {
		case "usable":
			return "healthy";
		case "needs-attention":
			return "behind"; // amber
		case "expired":
			return "error";
	}
}

function healthLabel(h: Health): string {
	switch (h) {
		case "usable":
			return "Usable";
		case "needs-attention":
			return "Needs attention";
		case "expired":
			return "Expired";
	}
}

/** The trust signal that never implies agent visibility. */
function containmentNote(s: AuthSource): string | null {
	if (s === "token") return "Held in vault · server-side only";
	if (s === "mcp-oauth") return "Auth held by the service";
	return null; // harness: HyperIdle stores nothing
}

function ServiceMark({ service }: { service: string }): JSX.Element {
	// Neutral initial mark — NOT a branded logo (no "Connect with X" affordance).
	return (
		<span className="inline-flex items-center justify-center h-[28px] w-[28px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[12px] font-[600] text-[var(--text-secondary)] shrink-0">
			{service.slice(0, 2)}
		</span>
	);
}

function TrustTag({ tier }: { tier: TrustTier }): JSX.Element {
	if (tier === "vetted") {
		return (
			<span className="inline-flex items-center gap-[4px] text-[12px] text-[var(--accent-primary)]">
				<span className="h-[6px] w-[6px] rounded-full bg-[var(--accent-primary)]" />
				Vetted
			</span>
		);
	}
	return <Tag label="Community" />;
}

function rowMenuItems(): MenuItem[] {
	return [
		{ id: "details", label: "View details", onSelect: () => {} },
		{ id: "reconnect", label: "Reconnect", onSelect: () => {} },
		{ id: "remove", label: "Remove", onSelect: () => {}, destructive: true },
	];
}

// ---------------------------------------------------------------------------
// "Inherited-default": grouped by source, harness/env group FIRST and visually
// primary. Each group is a SectionLabel + ItemList, with an inline add affordance
// on the group header (SectionLabel.trailing). Harness group has NO add button
// (the harness already authed — that IS the first-class signal).
// ---------------------------------------------------------------------------

function ConnectionRow({ c }: { c: ConnectionView }): JSX.Element {
	const [menuOpen, setMenuOpen] = useState(false);
	const note = containmentNote(c.authSource);
	return (
		<Row
			lead={<ServiceMark service={c.service} />}
			title={
				<span className="flex items-center gap-[9px]">
					{c.service}
					<TrustTag tier={c.trustTier} />
				</span>
			}
			subtitle={
				<span className="flex items-center gap-[6px]">
					{c.via}
					{note ? <span className="text-[var(--text-tertiary)]">· {note}</span> : null}
				</span>
			}
			cells={[{ content: `${c.toolCount} tools`, tone: "neutral", numeric: true, width: 70 }]}
			actions={
				<span className="flex items-center gap-[9px]">
					<StatusChip status={healthToStatus(c.health)} label={healthLabel(c.health)} />
					<div className="relative">
						<Button
							variant="ghost"
							size="sm"
							aria-label={`Actions for ${c.service}`}
							onClick={() => setMenuOpen((o) => !o)}
						>
							⋯
						</Button>
						<Menu
							open={menuOpen}
							onClose={() => setMenuOpen(false)}
							items={rowMenuItems()}
							label={`Actions for ${c.service}`}
						/>
					</div>
				</span>
			}
		/>
	);
}

/** Health-sort within a group: needs-attention + expired float to the top. */
function bySeverity(a: ConnectionView, b: ConnectionView): number {
	const rank = (h: Health) => (h === "usable" ? 1 : 0);
	return rank(a.health) - rank(b.health) || a.service.localeCompare(b.service);
}

function ConnectionGroup({
	label,
	help,
	connections,
	autoDetected = false,
}: {
	label: string;
	help: string;
	connections: ConnectionView[];
	/** harness/env group: no add, "Auto-detected" caption — the first-class default signal. */
	autoDetected?: boolean;
}): JSX.Element {
	const sorted = [...connections].sort(bySeverity);
	return (
		<section className="flex flex-col gap-[9px]">
			{/* Label + its description as one tight stack (gap-[3px] = --space-1),
			    so help reads as the SectionLabel's description without a negative margin.
			    No group-header rollup attention chip — the per-row StatusChip (whose
			    visible "Needs attention"/"Expired" text is its accessible name) is the
			    single source of the needs-attention signal (founder decision 2026-06-23). */}
			<div className="flex flex-col gap-[3px]">
				<SectionLabel
					label={label}
					trailing={
						autoDetected ? (
							<span className="text-[11px] font-[400] tracking-normal normal-case text-[var(--text-tertiary)]">
								Auto-detected
							</span>
						) : undefined
					}
				/>
				<p className="text-[12px] text-[var(--text-tertiary)]">{help}</p>
			</div>
			<ItemList variant="contained" isEmpty={sorted.length === 0}>
				{sorted.map((c) => (
					<ConnectionRow key={c.id} c={c} />
				))}
			</ItemList>
		</section>
	);
}

function AddConnectionDialog({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}): JSX.Element {
	const [source, setSource] = useState<AuthSource>("token");
	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="Add a connection"
			size="md"
			footer={
				<div className="flex justify-end gap-[9px]">
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary">Add</Button>
				</div>
			}
		>
			<div className="flex flex-col gap-[18px]">
				<p className="text-[13px] text-[var(--text-secondary)]">
					Tools your harness is already logged into appear automatically — nothing to add here. Use
					this to add a token or point at an MCP server.
				</p>
				<Select
					id="add-source"
					label="Source"
					value={source}
					onChange={(e) => setSource(e.target.value as AuthSource)}
					options={[
						{ value: "token", label: "Paste a token (API key / PAT)" },
						{ value: "mcp-oauth", label: "Point at an MCP server" },
					]}
				/>
				{source === "token" ? (
					<div className="flex flex-col gap-[9px]">
						<Input label="Service" placeholder="e.g. Stripe" />
						<Input label="Token" type="password" placeholder="Paste your API key" />
						<p className="text-[12px] text-[var(--text-tertiary)]">
							Held encrypted, resolved server-side. Your agents never receive it.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-[9px]">
						<Input label="MCP server URL" placeholder="https://mcp.example.com" />
						<p className="text-[12px] text-[var(--text-tertiary)]">
							The server owns its own sign-in. HyperIdle registers no app and never appears on a
							consent screen.
						</p>
					</div>
				)}
			</div>
		</Dialog>
	);
}

export const Populated = (): JSX.Element => {
	const [dialogOpen, setDialogOpen] = useState(false);
	const harness = CONNECTIONS.filter((c) => c.authSource === "harness");
	const token = CONNECTIONS.filter((c) => c.authSource === "token");
	const oauth = CONNECTIONS.filter((c) => c.authSource === "mcp-oauth");
	return (
		<div className="p-[24px] max-w-[760px] flex flex-col gap-[24px] bg-[var(--surface-page)]">
			<div className="flex items-start justify-between gap-[12px]">
				<div>
					<h2 className="text-[20px] font-[600] text-[var(--text-primary)]">Connections</h2>
					<p className="text-[13px] text-[var(--text-secondary)] mt-[3px] max-w-[520px]">
						External services your agents can act on. Your agents never see a secret — only that a
						service is available.
					</p>
				</div>
				<Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>
					+ Add connection
				</Button>
			</div>
			<ConnectionGroup
				label="Inherited from your environment"
				help="Tools your harness and CLIs are already logged into. HyperIdle stores nothing — auth lives where you set it up."
				connections={harness}
				autoDetected
			/>
			<ConnectionGroup
				label="Connected with a token"
				help="An API key or PAT you generated. Held encrypted, resolved server-side, never given to an agent."
				connections={token}
			/>
			<ConnectionGroup
				label="Connected via an MCP server"
				help="A remote MCP server that owns its own sign-in. HyperIdle registers no app and never appears on the consent screen."
				connections={oauth}
			/>
			<AddConnectionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
		</div>
	);
};
Populated.storyName = "Connections — Inherited-default (grouped by source)";
