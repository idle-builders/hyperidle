/**
 * AN1 — SettingsConnections production component (design reference scaffold).
 *
 * Three source groups in fixed order (inherited → token → mcp), grouped by
 * authSource. Health-sorted within each group (needs-attention first). Single
 * "+ Add connection" button in the page header. Per-row StatusChip carries the
 * health state.
 *
 * Adapted from the founder-approved #353 design (commit 16c3fe62) per the locked
 * AN1 Connection concept:
 *   - authSource closed set { token, mcp, inherited }
 *   - health closed set { working, needs-attention }
 *   - NO trust tier (ETHOS §2 — no preemptive vetted/community badge)
 *   - NO "agents never see the secret" framing — the secret is resolved into the
 *     sandbox so tools can authenticate (concept hard-rule 2); it is only never
 *     *displayed* in this UI or *logged*.
 *   - The inherited group is live in AN1 (projected from the harness descriptor).
 *
 * @lore AN1: ServiceMark is an inline single-use shape. Do not promote to the
 * design system. The component composes only catalogued primitives otherwise.
 */

import type {
	ConnectionAuthSource,
	ConnectionHealth,
	ConnectionView,
	InheritedReachView,
} from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useState } from "react";
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
} from "../ds";
import { call } from "../services/call.js";

/**
 * @lore BC5 T10: the door swap — `open_user({}).connections` replaces `GET
 * /api/connections` (architecture.md §8). The inherited group is a distinct
 * shape (`InheritedReachView`: name/kind/source/health, no id) since it is
 * never held or removable; this adapter renders it through the same
 * `ConnectionRow` as the held groups.
 */
function inheritedAsConnection(reach: InheritedReachView): ConnectionView {
	return {
		id: reach.name,
		service: reach.name,
		via: `${reach.kind === "cli" ? "CLI" : "MCP server"} · ${reach.source}`,
		authSource: "inherited",
		health: reach.health === "unknown" ? "needs-attention" : reach.health,
		removable: false,
	};
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function healthToStatus(h: ConnectionHealth): Status {
	return h === "working" ? "healthy" : "behind"; // behind = amber "needs attention"
}

function healthLabel(h: ConnectionHealth): string {
	return h === "working" ? "Working" : "Needs attention";
}

/** Per-row note: where the auth lives. Never implies the secret is hidden from tools. */
function authNote(s: ConnectionAuthSource): string | null {
	if (s === "token") return "Stored encrypted · resolved server-side";
	if (s === "mcp") return "Auth held by the MCP server";
	return null; // inherited: HyperIdle stores nothing
}

/** @lore AN1: inline single-use shape, not promoted to design system. */
function ServiceMark({ service }: { service: string }): JSX.Element {
	return (
		<span className="type-metadata inline-flex items-center justify-center h-[28px] w-[28px] rounded-[var(--r-subtle)] bg-[var(--surface-container)]   text-[var(--text-secondary)] shrink-0">
			{service.slice(0, 2)}
		</span>
	);
}

/** Health-sort within a group: needs-attention floats to the top. */
function bySeverity(a: ConnectionView, b: ConnectionView): number {
	const rank = (h: ConnectionHealth) => (h === "working" ? 1 : 0);
	return rank(a.health) - rank(b.health) || a.service.localeCompare(b.service);
}

// ---------------------------------------------------------------------------
// Add Connection Dialog
// ---------------------------------------------------------------------------

interface AddConnectionDialogProps {
	open: boolean;
	userId: string;
	onClose: () => void;
	onAdded: () => void;
}

function AddConnectionDialog({
	open,
	userId,
	onClose,
	onAdded,
}: AddConnectionDialogProps): JSX.Element {
	const [source, setSource] = useState<"token" | "mcp">("token");
	const [service, setService] = useState("");
	const [token, setToken] = useState("");
	const [serverUrl, setServerUrl] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = useCallback(async () => {
		setSubmitting(true);
		setError(null);
		const entry =
			source === "token"
				? { service, authSource: "token" as const, token }
				: { service: service || undefined, authSource: "mcp" as const, serverUrl };
		try {
			const result = await call("edit_user", { id: userId, connections: { add: [entry] } });
			if (!result.ok) {
				setError(result.problems[0]?.message ?? "Failed to add connection");
				return;
			}
			onAdded();
			onClose();
			setService("");
			setToken("");
			setServerUrl("");
			setSource("token");
		} catch {
			setError("Network error");
		} finally {
			setSubmitting(false);
		}
	}, [source, service, token, serverUrl, userId, onAdded, onClose]);

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
				<p className="type-small  text-[var(--text-secondary)]">
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
						<p className="type-metadata  text-[var(--text-tertiary)]">
							Stored encrypted and resolved server-side. Your agents' tools use it to authenticate;
							it is never shown back here.
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
						<p className="type-metadata  text-[var(--text-tertiary)]">
							The server owns its own sign-in. HyperIdle registers no app and never appears on a
							consent screen.
						</p>
					</div>
				)}
				{error ? <p className="type-metadata  text-[var(--status-error)]">{error}</p> : null}
			</div>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Connection row
// ---------------------------------------------------------------------------

interface ConnectionRowProps {
	connection: ConnectionView;
	onRemove: (id: string) => Promise<void>;
}

function ConnectionRow({ connection: c, onRemove }: ConnectionRowProps): JSX.Element {
	const [menuOpen, setMenuOpen] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const note = authNote(c.authSource);

	const menuItems: MenuItem[] = c.removable
		? [
				{
					id: "remove",
					label: "Remove",
					onSelect: () => {
						setMenuOpen(false);
						setConfirming(true);
					},
					destructive: true,
				},
			]
		: [];

	// Inherited rows are auto-detected and expected to work — suppress the chip when
	// working; show it only when one needs attention. Held rows always show it.
	const showChip = c.authSource !== "inherited" || c.health !== "working";

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
					{showChip ? (
						<StatusChip status={healthToStatus(c.health)} label={healthLabel(c.health)} />
					) : null}
					{c.removable ? (
						confirming ? (
							<span className="flex items-center gap-[6px]">
								{/* @lore UI-066: one destructive variant app-wide */}
								<Button
									variant="destructive"
									size="sm"
									onClick={() => {
										void onRemove(c.id).then(() => setConfirming(false));
									}}
									aria-label={`Confirm remove ${c.service}`}
								>
									Confirm?
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setConfirming(false)}
									aria-label="Cancel remove"
								>
									Cancel
								</Button>
							</span>
						) : (
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
						)
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
	connections: ConnectionView[];
	autoDetected?: boolean;
	onRemove: (id: string) => Promise<void>;
}

function SourceGroup({
	label,
	help,
	connections,
	autoDetected = false,
	onRemove,
}: SourceGroupProps): JSX.Element | null {
	const sorted = [...connections].sort(bySeverity);
	// D8 (POLISH-060): hide fully-empty groups — no bare grey box for groups with
	// zero connections. The group header adds no value without any rows beneath it.
	if (sorted.length === 0) return null;
	return (
		<section className="flex flex-col gap-[9px]">
			<div className="flex flex-col gap-[3px]">
				<SectionLabel
					label={label}
					trailing={
						autoDetected ? (
							<span className="type-label    normal-case text-[var(--text-tertiary)]">
								Auto-detected
							</span>
						) : undefined
					}
				/>
				<p className="type-metadata  text-[var(--text-tertiary)]">{help}</p>
			</div>
			<ItemList variant="flush" isEmpty={false}>
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
	const [connections, setConnections] = useState<ConnectionView[]>([]);
	const [userId, setUserId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [removeError, setRemoveError] = useState<string | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);

	const loadConnections = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await call("open_user", {});
			if (!result.ok || result.data.user === null || result.data.connections === null) {
				setError("failed");
				return;
			}
			setUserId(result.data.user.id);
			setConnections([
				...result.data.connections.connections,
				...result.data.connections.inherited.map(inheritedAsConnection),
			]);
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
		async (id: string): Promise<void> => {
			if (!userId) return;
			setRemoveError(null);
			try {
				const result = await call("edit_user", { id: userId, connections: { remove: [id] } });
				if (result.ok) {
					void loadConnections();
				} else {
					setRemoveError("Couldn't remove connection — please try again.");
				}
			} catch {
				setRemoveError("Couldn't remove connection — please try again.");
			}
		},
		[userId, loadConnections],
	);

	const inherited = connections.filter((c) => c.authSource === "inherited");
	const token = connections.filter((c) => c.authSource === "token");
	const mcp = connections.filter((c) => c.authSource === "mcp");

	return (
		<div className="flex flex-col gap-[24px]">
			<div className="flex items-start justify-between gap-[12px]">
				<div>
					<h2 className="type-title   text-[var(--text-primary)]">Connections</h2>
					<p className="type-small  text-[var(--text-secondary)] mt-[3px] max-w-[520px]">
						External services your agents can use. A secret you paste is stored encrypted and never
						shown back — your agents' tools use it to authenticate.
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
					<p className="type-small  text-[var(--status-error)]">
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
						connections={inherited}
						autoDetected
						onRemove={handleRemove}
					/>
					<SourceGroup
						label="Connected with a token"
						help="An API key or PAT you generated. Stored encrypted, resolved server-side so your agents' tools can authenticate."
						connections={token}
						onRemove={handleRemove}
					/>
					<SourceGroup
						label="Connected via an MCP server"
						help="A remote MCP server that owns its own sign-in. HyperIdle registers no app and never appears on the consent screen."
						connections={mcp}
						onRemove={handleRemove}
					/>
				</>
			)}

			{removeError ? (
				<p className="type-small  text-[var(--status-error)]" role="alert">
					{removeError}
				</p>
			) : null}

			{userId ? (
				<AddConnectionDialog
					open={dialogOpen}
					userId={userId}
					onClose={() => setDialogOpen(false)}
					onAdded={() => {
						void loadConnections();
					}}
				/>
			) : null}
		</div>
	);
}
