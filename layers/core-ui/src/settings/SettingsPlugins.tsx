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
 *
 * @lore BC6: `/api/plugins` (six routes) replaced by `call("search_plugins",
 * …)`/`call("edit_plugin", …)` — the door swap, not a redesign, this page's
 * own header now says. Install/enable/disable/remove/restore are each one
 * `edit_plugin` change field (architecture.md §1, §6; D-vpjf2k/D-fphch8).
 * Restore used to branch on `REGISTRY_KINDS` to decide whether to name a
 * contribution by its entity id or its manifest key — the action's own
 * `PluginContributionView.key` is already the one namespaced key both
 * `entityId` and a configuration default's key collapse to, so the branch is
 * gone: every restore names the contribution with `key`.
 */

// hearth-internal-padding

import type {
	EditPluginSource,
	PluginContributionView,
	PluginListState,
	PluginScope,
	PluginView,
} from "@hyperidle/domain-model";
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
import { call } from "../services/call.js";
import { useToast } from "../shell/ToastRegion.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SourceKind = EditPluginSource["kind"];
type ScopeKind = PluginScope["kind"];

type LoadState = "loading" | "ready" | "error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateChipStatus(state: PluginListState): "healthy" | "behind" {
	return state === "enabled" ? "healthy" : "behind";
}

function scopeLabel(scope: PluginScope): string {
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
			const scope: PluginScope =
				scopeKind === "factory"
					? { kind: "factory", teamId: null }
					: { kind: "team", teamId: teamId.trim() };
			const source: EditPluginSource =
				sourceKind === "git"
					? { kind: "git", url: value.trim(), scope }
					: { kind: sourceKind, path: value.trim(), scope };
			const result = await call("edit_plugin", { source });
			if (!result.ok) {
				showToast(result.problems[0]?.message ?? "Install failed");
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
	document: "document",
	mcp_server: "MCP server",
	harness_descriptor: "harness",
};

interface ContributionListProps {
	pluginId: string;
	contributions: PluginContributionView[];
	onRestore: (pluginId: string, c: PluginContributionView) => Promise<void>;
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
			const result = await call("search_plugins", {});
			if (!result.ok) {
				setLoadState("error");
				return;
			}
			setPlugins(result.data);
			setLoadState("ready");
		} catch {
			setLoadState("error");
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function toggle(plugin: PluginView): Promise<void> {
		const nextState: PluginListState = plugin.state === "enabled" ? "disabled" : "enabled";
		setBusy((prev) => new Set([...prev, plugin.id]));
		try {
			const result = await call("edit_plugin", { id: plugin.id, state: nextState });
			if (!result.ok) {
				const verb = nextState === "enabled" ? "enable" : "disable";
				showToast(result.problems[0]?.message ?? `${verb} failed`);
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
			const result = await call("edit_plugin", { id: plugin.id, remove: true });
			if (!result.ok) {
				showToast(result.problems[0]?.message ?? "Remove failed");
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

	async function restore(pluginId: string, contribution: PluginContributionView): Promise<void> {
		const key = `${pluginId}/${contribution.entityId}`;
		setRestoring(key);
		try {
			const result = await call("edit_plugin", {
				id: pluginId,
				restore: { contribution: contribution.key },
			});
			if (!result.ok) {
				showToast(result.problems[0]?.message ?? "Restore failed");
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
