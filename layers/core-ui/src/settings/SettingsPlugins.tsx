/**
 * SettingsPlugins — plugin install and management surface.
 *
 * Install from a git URL, zip path, or local folder path; choose factory
 * or team scope; list installed plugins; disable/enable/remove; restore
 * a contribution that was detached (user-overridden back to default).
 *
 * @lore BA9a scope-deferral: scope is stored and shown here, but team-scoped
 * plugins filter to the right team only during session materialisation (BA9b).
 * Operators can already see scope on each plugin row.
 *
 * @lore BA9a detached: a contribution is "detached" when the user has written
 * a configuration override on top of the plugin default (valueSource ===
 * "user_override"). Restore clears the override, returning to the plugin default.
 */

// hearth-internal-padding

import { type JSX, useCallback, useEffect, useState } from "react";
import {
	Button,
	Combobox,
	EmptyState,
	ErrorState,
	Input,
	ItemList,
	Row,
	Select,
	SkeletonList,
	StatusChip,
	Tag,
} from "../ds";
import { useTeams } from "../hooks/useTeams.js";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";

// ---------------------------------------------------------------------------
// Types (mirrors the route response shape)
// ---------------------------------------------------------------------------

type SourceKind = "git" | "zip" | "folder";
type ScopeKind = "factory" | "team";
type PluginState = "enabled" | "disabled";

/**
 * One thing a plugin contributed.
 *
 * @lore BA9g: `kind` covers the registry's kinds (agent, routine, knowledge) as
 * well as configuration kinds. The shipped plugin contributes an agent, three
 * routines and three skills and NONE of them are configuration defaults, so
 * this list used to render empty for it.
 */
interface ContributionView {
	kind: string;
	/** The contributed row's id, or the namespaced configuration key. */
	entityId: string;
	/** What a person calls it — an id is not a name. */
	label: string;
	key: string;
	manifestKey: string;
	detached: boolean;
}

interface PluginView {
	id: string;
	name: string;
	version: string;
	state: PluginState;
	scope: { kind: ScopeKind; teamId: string | null };
	installedAt: string;
	disabledAt: string | null;
	contributions: ContributionView[];
}

type LoadState = "loading" | "ready" | "error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateChipStatus(state: PluginState): "healthy" | "behind" {
	return state === "enabled" ? "healthy" : "behind";
}

function scopeLabel(scope: { kind: ScopeKind; teamId: string | null }): string {
	if (scope.kind === "factory") return "Factory";
	return scope.teamId ? `Team: ${scope.teamId}` : "Team";
}

// ---------------------------------------------------------------------------
// Install form
// ---------------------------------------------------------------------------

interface InstallFormProps {
	onInstalled: () => void;
}

function InstallForm({ onInstalled }: InstallFormProps): JSX.Element {
	const { showToast } = useToast();
	const { data: teamsData } = useTeams();
	const teamOptions = (teamsData?.teams ?? []).map((t) => ({ id: t.id, label: t.name }));
	const [sourceKind, setSourceKind] = useState<SourceKind>("git");
	const [value, setValue] = useState("");
	const [scopeKind, setScopeKind] = useState<ScopeKind>("factory");
	const [teamId, setTeamId] = useState("");
	const [installing, setInstalling] = useState(false);

	async function install(): Promise<void> {
		if (!value.trim()) return;
		if (scopeKind === "team" && !teamId.trim()) return;
		setInstalling(true);
		try {
			const source =
				sourceKind === "git"
					? { type: "git", url: value.trim() }
					: { type: sourceKind, path: value.trim() };
			const scope =
				scopeKind === "factory" ? { kind: "factory" } : { kind: "team", teamId: teamId.trim() };
			const res = await apiFetch("/api/plugins", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source, scope }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				showToast(body.error ?? `Install failed (${res.status})`);
				return;
			}
			setValue("");
			setTeamId("");
			showToast("Plugin installed.");
			onInstalled();
		} catch {
			showToast("Network error — install failed.");
		} finally {
			setInstalling(false);
		}
	}

	const sourceLabel =
		sourceKind === "git" ? "Git URL" : sourceKind === "zip" ? "Zip path" : "Folder path";
	const sourcePlaceholder =
		sourceKind === "git" ? "https://github.com/org/my-plugin" : "/path/to/plugin";

	return (
		<form
			className="flex flex-col gap-[12px]"
			data-testid="plugin-install-form"
			onSubmit={(e) => {
				e.preventDefault();
				void install();
			}}
		>
			<div className="flex gap-[9px]">
				<Select
					label="Source type"
					value={sourceKind}
					onChange={(e) => setSourceKind(e.target.value as SourceKind)}
					options={[
						{ value: "git", label: "Git URL" },
						{ value: "zip", label: "Zip file" },
						{ value: "folder", label: "Local folder" },
					]}
					data-testid="plugin-source-kind"
				/>
				<div className="flex-1">
					<Input
						label={sourceLabel}
						placeholder={sourcePlaceholder}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						data-testid="plugin-source-value"
					/>
				</div>
			</div>

			<div className="flex gap-[9px] items-end">
				<Select
					label="Scope"
					value={scopeKind}
					onChange={(e) => setScopeKind(e.target.value as ScopeKind)}
					options={[
						{ value: "factory", label: "Whole backend (factory)" },
						{ value: "team", label: "One team" },
					]}
					data-testid="plugin-scope-kind"
				/>
				{scopeKind === "team" && (
					<div className="flex-1" data-testid="plugin-scope-team-id">
						<Combobox
							id="plugin-scope-team-id-combobox"
							label="Team"
							options={teamOptions}
							value={teamId}
							onChange={setTeamId}
							placeholder="Select a team…"
							listAriaLabel="Teams"
							inputAriaLabel="Filter teams"
						/>
					</div>
				)}
				<Button
					type="submit"
					variant="primary"
					disabled={installing || !value.trim() || (scopeKind === "team" && !teamId.trim())}
					data-testid="plugin-install-btn"
				>
					{installing ? "Installing…" : "Install"}
				</Button>
			</div>
		</form>
	);
}

// ---------------------------------------------------------------------------
// Contribution list (shown expanded below a plugin row)
// ---------------------------------------------------------------------------

/** What each contribution kind is called in the list. */
const KIND_LABEL: Record<string, string> = {
	agent: "agent",
	routine: "routine",
	knowledge: "knowledge",
	mcp_server: "MCP server",
	harness_descriptor: "harness",
};

/** Kinds the registry names by row id rather than by manifest key. */
const REGISTRY_KINDS = new Set(["agent", "routine", "knowledge"]);

interface ContributionListProps {
	pluginId: string;
	contributions: ContributionView[];
	onRestore: (pluginId: string, c: ContributionView) => Promise<void>;
	restoring: string | null; // "pluginId/manifestKey" key being restored
}

function ContributionList({
	pluginId,
	contributions,
	onRestore,
	restoring,
}: ContributionListProps): JSX.Element | null {
	if (contributions.length === 0) return null;
	return (
		<ul
			className="flex flex-col gap-[6px] pl-[12px] border-l-[var(--bw-thin)] border-l-[var(--border-subtle)]"
			data-testid={`plugin-contributions-${pluginId}`}
		>
			{contributions.map((c) => {
				const key = `${pluginId}/${c.entityId}`;
				const isRestoring = restoring === key;
				return (
					<li key={c.entityId} className="flex items-center gap-[9px]">
						<span className="type-small text-[var(--text-secondary)] flex-1">
							<span className="type-label text-[var(--text-primary)]">{c.label}</span>·
							<span className="text-[var(--text-tertiary)]">{KIND_LABEL[c.kind] ?? c.kind}</span>
						</span>
						{c.detached && (
							<>
								<Tag label="detached" />
								<Button
									variant="ghost"
									size="sm"
									disabled={isRestoring}
									onClick={() => void onRestore(pluginId, c)}
									data-testid={`btn-restore-${c.entityId}`}
								>
									{isRestoring ? "Restoring…" : "Restore"}
								</Button>
							</>
						)}
					</li>
				);
			})}
		</ul>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SettingsPlugins(): JSX.Element {
	const { showToast } = useToast();
	const [plugins, setPlugins] = useState<PluginView[]>([]);
	const [loadState, setLoadState] = useState<LoadState>("loading");
	const [busy, setBusy] = useState<Set<string>>(new Set());
	const [restoring, setRestoring] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	const load = useCallback(async (): Promise<void> => {
		setLoadState("loading");
		try {
			const res = await apiFetch("/api/plugins");
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { plugins: PluginView[] };
			setPlugins(body.plugins ?? []);
			setLoadState("ready");
		} catch {
			setLoadState("error");
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function toggle(plugin: PluginView): Promise<void> {
		const action = plugin.state === "enabled" ? "disable" : "enable";
		setBusy((prev) => new Set([...prev, plugin.id]));
		try {
			const res = await apiFetch(`/api/plugins/${plugin.id}/${action}`, { method: "POST" });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				showToast(body.error ?? `${action} failed`);
				return;
			}
			await load();
		} catch {
			showToast("Network error.");
		} finally {
			setBusy((prev) => {
				const next = new Set(prev);
				next.delete(plugin.id);
				return next;
			});
		}
	}

	async function remove(plugin: PluginView): Promise<void> {
		setBusy((prev) => new Set([...prev, plugin.id]));
		try {
			const res = await apiFetch(`/api/plugins/${plugin.id}`, { method: "DELETE" });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				showToast(body.error ?? "Remove failed");
				return;
			}
			showToast(`${plugin.name} removed.`);
			await load();
		} catch {
			showToast("Network error.");
		} finally {
			setBusy((prev) => {
				const next = new Set(prev);
				next.delete(plugin.id);
				return next;
			});
		}
	}

	async function restore(pluginId: string, contribution: ContributionView): Promise<void> {
		const key = `${pluginId}/${contribution.entityId}`;
		setRestoring(key);
		try {
			const res = await apiFetch(`/api/plugins/${pluginId}/contributions/restore`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				// A registry-backed contribution is named by the row it points at; a
				// configuration default by its manifest key.
				body: JSON.stringify(
					REGISTRY_KINDS.has(contribution.kind)
						? { kind: contribution.kind, entityId: contribution.entityId }
						: { kind: contribution.kind, manifestKey: contribution.manifestKey },
				),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				showToast(body.error ?? "Restore failed");
				return;
			}
			showToast(`${contribution.label} restored to plugin default.`);
			await load();
		} catch {
			showToast("Network error.");
		} finally {
			setRestoring(null);
		}
	}

	function toggleExpand(id: string): void {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	if (loadState === "loading") return <SkeletonList rows={2} ariaLabel="Loading plugins…" />;
	if (loadState === "error")
		return (
			<ErrorState
				title="Failed to load plugins"
				description="Check the server connection and try again."
				onRetry={() => void load()}
			/>
		);

	return (
		<div className="flex flex-col gap-[18px]" data-testid="settings-plugins">
			<InstallForm onInstalled={() => void load()} />

			{plugins.length === 0 ? (
				<EmptyState
					title="No plugins installed"
					description="Paste a git URL, zip path, or folder path above to install a plugin."
					dataTestId="plugins-empty"
				/>
			) : (
				<div className="flex flex-col gap-[6px]" data-testid="plugins-list">
					<ItemList isEmpty={false}>
						{plugins.map((plugin) => {
							const isBusy = busy.has(plugin.id);
							const isExpanded = expanded.has(plugin.id);
							const hasContributions = plugin.contributions.length > 0;
							const hasDetached = plugin.contributions.some((c) => c.detached);
							return (
								<div key={plugin.id} className="flex flex-col">
									<Row
										title={
											<span>
												<span className="type-control text-[var(--text-primary)]">
													{plugin.name}
												</span>
												<span className="type-small text-[var(--text-secondary)] ml-[6px]">
													v{plugin.version}
												</span>
											</span>
										}
										lead={
											<StatusChip status={stateChipStatus(plugin.state)} label={plugin.state} />
										}
										actions={
											<div className="flex items-center gap-[6px]">
												<Tag label={scopeLabel(plugin.scope)} />
												{hasContributions && (
													<Button
														variant="ghost"
														size="sm"
														onClick={() => toggleExpand(plugin.id)}
														data-testid={`plugin-expand-${plugin.id}`}
														aria-expanded={isExpanded}
													>
														{hasDetached && !isExpanded
															? "Contributions (detached)"
															: "Contributions"}
													</Button>
												)}
												<Button
													variant="ghost"
													size="sm"
													disabled={isBusy}
													onClick={() => void toggle(plugin)}
													data-testid={`plugin-toggle-${plugin.id}`}
												>
													{plugin.state === "enabled" ? "Disable" : "Enable"}
												</Button>
												<Button
													variant="ghost"
													size="sm"
													disabled={isBusy}
													onClick={() => void remove(plugin)}
													data-testid={`plugin-remove-${plugin.id}`}
												>
													Remove
												</Button>
											</div>
										}
										data-testid={`plugin-row-${plugin.id}`}
									/>
									{isExpanded && hasContributions && (
										<div className="px-[12px] pb-[9px]">
											<ContributionList
												pluginId={plugin.id}
												contributions={plugin.contributions}
												onRestore={restore}
												restoring={restoring}
											/>
										</div>
									)}
								</div>
							);
						})}
					</ItemList>
				</div>
			)}
		</div>
	);
}
