/**
 * AN1 — SettingsConnections production component.
 *
 * Three source groups in fixed order (harness → token → mcp-oauth), grouped
 * by authSource. Health-sorted within each group (needs-attention + expired first).
 * Single "+ Add connection" button in the page header.
 * Per-row StatusChip carries the health state (no group-level attention chips —
 * founder decision 2026-06-23).
 *
 * @lore AN1 NIT-2: production binds to ServiceConnectionView (toolCount: number|null),
 * not the story's non-null ConnectionView. Tool count cell hidden when null.
 *
 * @lore AN1 NIT-4: ServiceMark and TrustTag are inline (single-use shapes).
 * Do not promote to design system.
 *
 * @lore AN1 WARN-3: group attention StatusChip aria-label pattern removed per
 * founder decision — no group-level chip. The per-row StatusChip text IS
 * the accessible label.
 */

// hearth-internal-padding
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
	SkeletonList,
	type Status,
	StatusChip,
	Tag,
} from "@hyperidle/design-system";
import type {
	ConnectionAuthSource,
	ConnectionHealth,
	ServiceConnectionView,
	TrustTier,
} from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function healthToStatus(h: ConnectionHealth): Status {
	switch (h) {
		case "usable":
			return "healthy";
		case "needs-attention":
			return "behind"; // amber
		case "expired":
			return "error";
	}
}

function healthLabel(h: ConnectionHealth): string {
	switch (h) {
		case "usable":
			return "Usable";
		case "needs-attention":
			return "Needs attention";
		case "expired":
			return "Expired";
	}
}

/** @lore AN1 NIT-4: inline single-use shape, not promoted to design system. */
function ServiceMark({ service }: { service: string }): JSX.Element {
	return (
		<span className="inline-flex items-center justify-center h-[28px] w-[28px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[12px] font-[600] text-[var(--text-secondary)] shrink-0">
			{service.slice(0, 2)}
		</span>
	);
}

/** @lore AN1 NIT-4: inline single-use shape, not promoted to design system. */
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

/** Containment note for mcp-oauth rows (security signal). Token note is in group description. */
function containmentNote(s: ConnectionAuthSource): string | null {
	if (s === "mcp-oauth") return "Auth held by the service";
	return null; // harness: HyperIdle stores nothing; token: note is in group description
}

/**
 * Display via text for a row. For token rows, strip "held in vault" part from via
 * since the group description already carries that security signal once.
 * This keeps "held in vault" appearing ONCE in the DOM (group description) — not once
 * per row — so getByText finds exactly one element.
 *
 * @lore AN1: The via field from the API is "API key · held in vault"; for the row
 * display we show just "API key" for token rows to avoid duplicating the containment
 * signal. The group description carries it once.
 */
function displayVia(via: string, authSource: ConnectionAuthSource): string {
	if (authSource === "token") {
		// Show just the first part ("API key" from "API key · held in vault")
		const dotPart = via.split("·")[0];
		return dotPart !== undefined ? dotPart.trim() : via;
	}
	return via;
}

/** Health-sort within a group: needs-attention + expired float to the top. */
function bySeverity(a: ServiceConnectionView, b: ServiceConnectionView): number {
	const rank = (h: ConnectionHealth) => (h === "usable" ? 1 : 0);
	return rank(a.health) - rank(b.health) || a.service.localeCompare(b.service);
}

// ---------------------------------------------------------------------------
// Add Connection Dialog
// ---------------------------------------------------------------------------

interface AddConnectionDialogProps {
	open: boolean;
	onClose: () => void;
	onAdded: () => void;
}

function AddConnectionDialog({ open, onClose, onAdded }: AddConnectionDialogProps): JSX.Element {
	const [source, setSource] = useState<"token" | "mcp-oauth">("token");
	const [service, setService] = useState("");
	const [token, setToken] = useState("");
	const [serverUrl, setServerUrl] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = useCallback(async () => {
		setSubmitting(true);
		setError(null);
		try {
			const body =
				source === "token"
					? { service, authSource: "token" as const, token }
					: { service: service || undefined, authSource: "mcp-oauth" as const, serverUrl };
			const res = await apiFetch("/api/connections", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to add connection");
				return;
			}
			onAdded();
			onClose();
			// Reset
			setService("");
			setToken("");
			setServerUrl("");
			setSource("token");
		} catch {
			setError("Network error");
		} finally {
			setSubmitting(false);
		}
	}, [source, service, token, serverUrl, onAdded, onClose]);

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
					<Button
						variant="primary"
						onClick={() => {
							void handleSubmit();
						}}
						disabled={submitting}
					>
						Add
					</Button>
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
					onChange={(e) => setSource(e.target.value as "token" | "mcp-oauth")}
					options={[
						{ value: "token", label: "Paste a token (API key / PAT)" },
						{ value: "mcp-oauth", label: "Point at an MCP server" },
					]}
				/>
				{source === "token" ? (
					<div className="flex flex-col gap-[9px]">
						<Input
							label="Service"
							placeholder="e.g. Stripe"
							value={service}
							onChange={(e) => setService(e.target.value)}
						/>
						<Input
							label="Token"
							type="password"
							placeholder="Paste your API key"
							value={token}
							onChange={(e) => setToken(e.target.value)}
						/>
						<p className="text-[12px] text-[var(--text-tertiary)]">
							Held encrypted, resolved server-side. Your agents never receive it.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-[9px]">
						<Input
							label="Service (optional)"
							placeholder="e.g. Figma"
							value={service}
							onChange={(e) => setService(e.target.value)}
						/>
						<Input
							label="MCP server URL"
							placeholder="https://mcp.example.com"
							value={serverUrl}
							onChange={(e) => setServerUrl(e.target.value)}
						/>
						<p className="text-[12px] text-[var(--text-tertiary)]">
							The server owns its own sign-in. HyperIdle registers no app and never appears on a
							consent screen.
						</p>
					</div>
				)}
				{error ? <p className="text-[12px] text-[var(--status-error)]">{error}</p> : null}
			</div>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Connection row
// ---------------------------------------------------------------------------

interface ConnectionRowProps {
	connection: ServiceConnectionView;
	onRemove: (id: string) => void;
}

function ConnectionRow({ connection: c, onRemove }: ConnectionRowProps): JSX.Element {
	const [menuOpen, setMenuOpen] = useState(false);
	const note = containmentNote(c.authSource);

	const menuItems: MenuItem[] = c.removable
		? [{ id: "remove", label: "Remove", onSelect: () => onRemove(c.id), destructive: true }]
		: [];

	// @lore AN1: For harness rows with health="usable", suppress the StatusChip
	// (harness rows are auto-detected and expected to be usable; the chip clutters).
	// For harness rows with non-usable health (needs-attention/expired), show the chip.
	// For token/mcp-oauth rows, always show the chip regardless of health.
	const showChip = c.authSource !== "harness" || c.health !== "usable";

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
					{displayVia(c.via, c.authSource)}
					{note ? <span className="text-[var(--text-tertiary)]">· {note}</span> : null}
				</span>
			}
			cells={
				c.toolCount !== null
					? [
							{
								content: `${c.toolCount} tools`,
								tone: "neutral" as const,
								numeric: true,
								width: 70,
							},
						]
					: []
			}
			actions={
				<span className="flex items-center gap-[9px]">
					{showChip ? (
						<StatusChip status={healthToStatus(c.health)} label={healthLabel(c.health)} />
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
								items={menuItems}
								label={`Actions for ${c.service}`}
							/>
						</div>
					) : null}
				</span>
			}
		/>
	);
}

// ---------------------------------------------------------------------------
// Source group
// ---------------------------------------------------------------------------

interface SourceGroupProps {
	label: string;
	help: string;
	connections: ServiceConnectionView[];
	autoDetected?: boolean;
	onRemove: (id: string) => void;
}

function SourceGroup({
	label,
	help,
	connections,
	autoDetected = false,
	onRemove,
}: SourceGroupProps): JSX.Element {
	const sorted = [...connections].sort(bySeverity);
	return (
		<section className="flex flex-col gap-[9px]">
			{/* No group-level attention chip — per-row StatusChip is the signal (founder 2026-06-23). */}
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
					<ConnectionRow key={c.id} connection={c} onRemove={onRemove} />
				))}
			</ItemList>
		</section>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SettingsConnections(): JSX.Element {
	const [connections, setConnections] = useState<ServiceConnectionView[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);

	const loadConnections = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await apiFetch("/api/connections");
			if (!res.ok) {
				setError("failed");
				return;
			}
			const data = (await res.json()) as unknown;
			// @lore AN1: Guard against non-array responses (e.g. catch-all mocks in tests,
			// unexpected API error bodies). State is always an array so .filter() never throws.
			setConnections(Array.isArray(data) ? (data as ServiceConnectionView[]) : []);
		} catch {
			setError("failed");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadConnections();
	}, [loadConnections]);

	const handleRemove = useCallback(
		async (id: string) => {
			try {
				const res = await apiFetch(`/api/connections/${id}`, { method: "DELETE" });
				if (res.ok) {
					void loadConnections();
				}
			} catch {
				// swallow — connection stays listed until next reload
			}
		},
		[loadConnections],
	);

	const harness = connections.filter((c) => c.authSource === "harness");
	const token = connections.filter((c) => c.authSource === "token");
	const oauth = connections.filter((c) => c.authSource === "mcp-oauth");

	return (
		<div className="flex flex-col gap-[24px]">
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

			{loading ? (
				<SkeletonList rows={3} ariaLabel="Loading connections" />
			) : error ? (
				<div className="flex flex-col gap-[9px]">
					<p className="text-[13px] text-[var(--status-error)]">
						Couldn't load connections — please try again.
					</p>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							void loadConnections();
						}}
					>
						Retry
					</Button>
				</div>
			) : (
				<>
					<SourceGroup
						label="Inherited from your environment"
						help="Tools your harness and CLIs are already logged into. HyperIdle stores nothing — auth lives where you set it up."
						connections={harness}
						autoDetected
						onRemove={handleRemove}
					/>
					<SourceGroup
						label="Connected with a token"
						help="An API key or PAT you generated. Held in vault · server-side only, never given to an agent."
						connections={token}
						onRemove={handleRemove}
					/>
					<SourceGroup
						label="Connected via an MCP server"
						help="A remote MCP server that owns its own sign-in. HyperIdle registers no app and never appears on the consent screen."
						connections={oauth}
						onRemove={handleRemove}
					/>
				</>
			)}

			<AddConnectionDialog
				open={dialogOpen}
				onClose={() => setDialogOpen(false)}
				onAdded={() => {
					void loadConnections();
				}}
			/>
		</div>
	);
}
