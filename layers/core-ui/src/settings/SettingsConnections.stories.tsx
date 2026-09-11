/**
 * AN1 — Connections settings surface. Canonical approved design fixture.
 *
 * Single render — "Inherited-default": connections grouped by auth source, with
 * the inherited (harness/environment) group FIRST (the first-class signal:
 * HyperIdle stores nothing — auth lives where the user already set it up). Then
 * the two held groups: token, then mcp.
 *
 * Adapted from the founder-approved #353 `VariantAInheritedDefault`
 * (commit 16c3fe62) per the locked AN1 Connection concept:
 *   - authSource closed set { token, mcp, inherited } (was harness/token/mcp-oauth)
 *   - health closed set { working, needs-attention } (was usable/needs-attention/expired)
 *   - NO trust tier — the vetted/community badge is removed (ETHOS §2)
 *   - NO "your agents never see the secret" framing — the secret IS resolved into
 *     the agent's sandbox so its tools can authenticate (concept hard-rule 2);
 *     the rule is only that it is never *displayed* or *logged*.
 *   - The inherited group is LIVE in AN1 (founder decision) and rendered populated.
 *
 * Composes only catalogued design-system primitives (Row, ItemList, SectionLabel,
 * StatusChip, Button, Menu, Dialog, Input, Select) — zero new shapes.
 */

import { type JSX, useState } from "react";
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
} from "../ds";

// ---------------------------------------------------------------------------
// Fixture shape — the per-(user × service) ServiceConnection as the UI sees it.
// Mirrors what GET /api/connections returns (architecture defines the type).
// No secret is ever in this shape — only the FACT of availability + health.
// ---------------------------------------------------------------------------

type AuthSource = "inherited" | "token" | "mcp";
type Health = "working" | "needs-attention";

interface ConnectionView {
	id: string;
	service: string; // display name: "GitHub", "Stripe"…
	/** Where its tools come from — for inherited, harness/CLI name; for mcp, the server host. */
	via: string;
	authSource: AuthSource;
	/**
	 * BA5 §18 (narrow cut): only ever set for authSource:"inherited" — live CLI
	 * detection. A held (stored) row carries no health of its own now that
	 * `service_connections.health` and the validate route are gone.
	 */
	health?: Health;
	/** Whether HyperIdle owns the row (held) — inherited rows are not removable. */
	removable: boolean;
}

const CONNECTIONS: ConnectionView[] = [
	// Inherited — reflected live from the harness/environment. HyperIdle stores nothing.
	{
		id: "inherited:claude-code:gh",
		service: "GitHub",
		via: "Claude Code · gh CLI",
		authSource: "inherited",
		health: "working",
		removable: false,
	},
	{
		id: "inherited:claude-code:git",
		service: "Git",
		via: "Claude Code · git",
		authSource: "inherited",
		health: "working",
		removable: false,
	},
	{
		id: "inherited:claude-code:linear",
		service: "Linear",
		via: "Claude Code · MCP server",
		authSource: "inherited",
		health: "working",
		removable: false,
	},
	// Held · token — HyperIdle holds the ciphertext, resolves it server-side at spawn.
	// No health field: it is a live-detection concept, and there is nothing left
	// to detect it with for a stored row.
	{
		id: "sc-stripe",
		service: "Stripe",
		via: "API key · stored encrypted",
		authSource: "token",
		removable: true,
	},
	{
		id: "sc-sendgrid",
		service: "SendGrid",
		via: "API key · stored encrypted",
		authSource: "token",
		removable: true,
	},
	// Held · mcp — a remote MCP server the user points at; the server owns its sign-in.
	{
		id: "sc-figma",
		service: "Figma",
		via: "mcp.figma.com",
		authSource: "mcp",
		removable: true,
	},
];

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function healthToStatus(h: Health): Status {
	return h === "working" ? "healthy" : "behind"; // behind = amber "needs attention"
}

function healthLabel(h: Health): string {
	return h === "working" ? "Working" : "Needs attention";
}

/** Per-row note: where the auth lives. Never implies the secret is hidden from tools. */
function authNote(s: AuthSource): string | null {
	if (s === "token") return "Stored encrypted · resolved server-side";
	if (s === "mcp") return "Auth held by the MCP server";
	return null; // inherited: HyperIdle stores nothing
}

/** Neutral initial mark — NOT a branded logo (no "Connect with X" affordance). */
function ServiceMark({ service }: { service: string }): JSX.Element {
	return (
		<span className="inline-flex items-center justify-center h-[28px] w-[28px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[12px] font-[600] text-[var(--text-secondary)] shrink-0">
			{service.slice(0, 2)}
		</span>
	);
}

function rowMenuItems(): MenuItem[] {
	return [{ id: "remove", label: "Remove", onSelect: () => {}, destructive: true }];
}

/** Health-sort within a group: needs-attention floats to the top. Held rows carry no health. */
function bySeverity(a: ConnectionView, b: ConnectionView): number {
	const rank = (h: Health | undefined) => (h === "working" ? 1 : 0);
	return rank(a.health) - rank(b.health) || a.service.localeCompare(b.service);
}

// ---------------------------------------------------------------------------
// Connection row
// ---------------------------------------------------------------------------

function ConnectionRow({ c }: { c: ConnectionView }): JSX.Element {
	const [menuOpen, setMenuOpen] = useState(false);
	const note = authNote(c.authSource);
	// BA5 §18 (narrow cut): health is live CLI detection, only ever computed for
	// inherited rows. A held (stored) row has none of its own, so it never shows
	// a chip at all.
	const chipHealth = c.authSource === "inherited" ? c.health : undefined;
	const showChip = chipHealth !== undefined && chipHealth !== "working";
	return (
		<Row
			lead={<ServiceMark service={c.service} />}
			title={c.service}
			subtitle={
				<span className="flex items-center gap-[6px]">
					{c.via}
					{note ? <span className="text-[var(--text-tertiary)]">· {note}</span> : null}
				</span>
			}
			actions={
				<span className="flex items-center gap-[9px]">
					{showChip && chipHealth ? (
						<StatusChip status={healthToStatus(chipHealth)} label={healthLabel(chipHealth)} />
					) : null}
					{c.removable ? (
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
					) : null}
				</span>
			}
		/>
	);
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
	/** inherited group: no add, "Auto-detected" caption — the first-class default signal. */
	autoDetected?: boolean;
}): JSX.Element {
	const sorted = [...connections].sort(bySeverity);
	return (
		<section className="flex flex-col gap-[9px]">
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
	const [source, setSource] = useState<"token" | "mcp">("token");
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
					onChange={(e) => setSource(e.target.value as "token" | "mcp")}
					options={[
						{ value: "token", label: "Paste a token (API key / PAT)" },
						{ value: "mcp", label: "Point at an MCP server" },
					]}
				/>
				{source === "token" ? (
					<div className="flex flex-col gap-[9px]">
						<Input label="Service" placeholder="e.g. Stripe" />
						<Input label="Token" type="password" placeholder="Paste your API key" />
						<p className="text-[12px] text-[var(--text-tertiary)]">
							Stored encrypted and resolved server-side. Your agents' tools use it to authenticate;
							it is never shown back here.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-[9px]">
						<Input label="Service (optional)" placeholder="e.g. Figma" />
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

export default {
	title: "SettingsConnections",
	group: "Settings" as const,
};

export const Populated = (): JSX.Element => {
	const [dialogOpen, setDialogOpen] = useState(false);
	const inherited = CONNECTIONS.filter((c) => c.authSource === "inherited");
	const token = CONNECTIONS.filter((c) => c.authSource === "token");
	const mcp = CONNECTIONS.filter((c) => c.authSource === "mcp");
	return (
		<div className="p-[24px] max-w-[760px] flex flex-col gap-[24px] bg-[var(--surface-page)]">
			<div className="flex items-start justify-between gap-[12px]">
				<div>
					<h2 className="text-[20px] font-[600] text-[var(--text-primary)]">Connections</h2>
					<p className="text-[13px] text-[var(--text-secondary)] mt-[3px] max-w-[520px]">
						External services your agents can use. A secret you paste is stored encrypted and never
						shown back — your agents' tools use it to authenticate.
					</p>
				</div>
				<Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>
					+ Add connection
				</Button>
			</div>
			<ConnectionGroup
				label="Inherited from your environment"
				help="Tools your harness and CLIs are already logged into. HyperIdle stores nothing — auth lives where you set it up."
				connections={inherited}
				autoDetected
			/>
			<ConnectionGroup
				label="Connected with a token"
				help="An API key or PAT you generated. Stored encrypted, resolved server-side so your agents' tools can authenticate."
				connections={token}
			/>
			<ConnectionGroup
				label="Connected via an MCP server"
				help="A remote MCP server that owns its own sign-in. HyperIdle registers no app and never appears on a consent screen."
				connections={mcp}
			/>
			<AddConnectionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
		</div>
	);
};
Populated.storyName = "Connections — Inherited-default (grouped by source)";
