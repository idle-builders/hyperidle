import {
	AUTONOMY_LEVEL_META,
	AUTONOMY_LEVELS,
	type AutonomyLevel,
	DEFAULT_UNDO_WINDOW_SECONDS,
	DEFAULT_VERDICT_DOUBLE_CLICK,
	isAutonomyLevel,
	type KillSwitchConfirmMode,
	UNDO_WINDOW_MAX,
	UNDO_WINDOW_MIN,
	UNDO_WINDOW_OPTIONS,
} from "@hyperidle/shared";
import FocusTrap from "focus-trap-react";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";

export {
	DEFAULT_UNDO_WINDOW_SECONDS,
	DEFAULT_VERDICT_DOUBLE_CLICK,
	UNDO_WINDOW_MAX,
	UNDO_WINDOW_MIN,
	UNDO_WINDOW_OPTIONS,
};

// --- Types ---

export interface ProfileSettings {
	name: string;
	email: string;
	avatarUrl: string;
}

export interface ProductSetting {
	id: string;
	name: string;
	active: boolean;
}

export interface AgentSetting {
	id: string;
	name: string;
	autonomyLevel: AutonomyLevel;
	paused: boolean;
}

export interface NotificationSettings {
	reviewAlerts: boolean;
	costAlerts: boolean;
	blockerAlerts: boolean;
	quietHoursStart: string;
	quietHoursEnd: string;
	mutedProducts: string[];
}

/**
 * L7 — Safety preferences (kill-switch confirmation mode + future
 * recovery prefs). Lives at the top level of SettingsData so AppShell
 * can read it when mounting `KillSwitchDialog`.
 *
 * @lore L7 (S4): the Safety tab's confirm-mode radio used to live in
 * a local useState that never propagated. AppShell read a hard-coded
 * `press_hold` regardless. Now SafetyTab writes into SettingsData and
 * AppShell threads it down.
 */
export interface SafetySettings {
	killSwitchConfirmMode: KillSwitchConfirmMode;
}

/**
 * @lore K7 / AESTHETICS.md § Mobile & Touch row "Density preference state":
 * tri-state preference. `"auto"` is the factory default and the only state
 * that fires the viewport-driven density auto-switch (≤ 1024px → comfortable).
 * Once the user picks `default` / `compact` / `comfortable`, that explicit
 * choice persists across breakpoint changes.
 */
export type Density = "auto" | "compact" | "default" | "comfortable";
export type ResolvedDensity = "compact" | "default" | "comfortable";
export type Theme = "light" | "dark" | "system";

export interface AppearanceSettings {
	density: Density;
	theme: Theme;
	/**
	 * L4: when true, a click on a primary verdict in `ReviewHeader` only
	 * pre-fills; a second click commits. When false, single click commits
	 * directly. Default true (matches keyboard pre-fill semantics).
	 */
	verdictDoubleClick: boolean;
	/**
	 * L4: configurable undo window in seconds; clamped to [3, 15]. Default 8.
	 */
	undoWindowSeconds: number;
}

export interface SettingsData {
	profile: ProfileSettings;
	products: ProductSetting[];
	agents: AgentSetting[];
	notifications: NotificationSettings;
	appearance: AppearanceSettings;
	safety: SafetySettings;
}

export interface FeedbackMessage {
	type: "success" | "error";
	message: string;
}

export interface SettingsPanelProps {
	open: boolean;
	onClose: () => void;
	onSave: (settings: SettingsData) => Promise<void>;
	settings: SettingsData;
	onFeedback?: (feedback: FeedbackMessage) => void;
	/**
	 * L7 (S4): when set, the Safety tab's "Pause Factory" CTA delegates
	 * to AppShell's KillSwitchDialog (which owns the pause flow + audit
	 * write). When unset, the CTA is hidden — the AvatarMenu and the
	 * `Cmd+Shift+.` shortcut remain entry points.
	 */
	onTriggerKillSwitch?: () => void;
}

type TabId =
	| "profile"
	| "products"
	| "agents"
	| "notifications"
	| "appearance"
	| "models"
	| "safety";

const TABS: { id: TabId; label: string }[] = [
	{ id: "profile", label: "Profile" },
	{ id: "products", label: "Products" },
	{ id: "agents", label: "Agents" },
	{ id: "notifications", label: "Notifications" },
	{ id: "models", label: "Models & Keys" },
	{ id: "appearance", label: "Appearance" },
	{ id: "safety", label: "Safety" },
];

const TIME_24H_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValid24hTime(value: string): boolean {
	return TIME_24H_RE.test(value);
}

/**
 * @lore SettingsPanel is a composition panel (like GlobalSearchPanel) that assembles
 * DaisyUI primitives. It is NOT one of the 19 custom components in the component
 * budget — it is a page-level composition.
 */

/**
 * @lore K3: theme persistence ships in this story. The Appearance tab now
 * exposes a Theme select (system / dark / light) wired through useTheme().
 * AppShell routes the chosen value through useTheme().setTheme on save so the
 * boot script in index.html paints correctly on the next reload.
 */

export function SettingsPanel({
	open,
	onClose,
	onSave,
	settings,
	onFeedback,
	onTriggerKillSwitch,
}: SettingsPanelProps): JSX.Element | null {
	const [activeTab, setActiveTab] = useState<TabId>("profile");
	const [draft, setDraft] = useState<SettingsData>(settings);
	const [saving, setSaving] = useState(false);
	const [validationErrors, setValidationErrors] = useState<string[]>([]);

	// Reset draft when settings prop changes or panel opens
	useEffect(() => {
		if (open) {
			setDraft(settings);
			setValidationErrors([]);
			setActiveTab("profile");
		}
	}, [open, settings]);

	const updateProfile = useCallback((field: keyof ProfileSettings, value: string): void => {
		setDraft((prev) => ({
			...prev,
			profile: { ...prev.profile, [field]: value },
		}));
	}, []);

	const toggleProduct = useCallback((productId: string): void => {
		setDraft((prev) => ({
			...prev,
			products: prev.products.map((p) => (p.id === productId ? { ...p, active: !p.active } : p)),
		}));
	}, []);

	const updateAgentAutonomy = useCallback((agentId: string, level: AutonomyLevel): void => {
		setDraft((prev) => ({
			...prev,
			agents: prev.agents.map((a) => (a.id === agentId ? { ...a, autonomyLevel: level } : a)),
		}));
	}, []);

	const toggleAgentPause = useCallback((agentId: string): void => {
		setDraft((prev) => ({
			...prev,
			agents: prev.agents.map((a) => (a.id === agentId ? { ...a, paused: !a.paused } : a)),
		}));
	}, []);

	const updateNotification = useCallback(
		(field: keyof NotificationSettings, value: boolean | string | string[]): void => {
			setDraft((prev) => ({
				...prev,
				notifications: { ...prev.notifications, [field]: value },
			}));
		},
		[],
	);

	const updateDensity = useCallback((density: Density): void => {
		setDraft((prev) => ({
			...prev,
			appearance: { ...prev.appearance, density },
		}));
	}, []);

	const updateTheme = useCallback((theme: Theme): void => {
		setDraft((prev) => ({
			...prev,
			appearance: { ...prev.appearance, theme },
		}));
	}, []);

	const updateVerdictDoubleClick = useCallback((value: boolean): void => {
		setDraft((prev) => ({
			...prev,
			appearance: { ...prev.appearance, verdictDoubleClick: value },
		}));
	}, []);

	const updateUndoWindowSeconds = useCallback((value: number): void => {
		setDraft((prev) => ({
			...prev,
			appearance: { ...prev.appearance, undoWindowSeconds: value },
		}));
	}, []);

	const updateKillSwitchConfirmMode = useCallback((mode: KillSwitchConfirmMode): void => {
		setDraft((prev) => ({
			...prev,
			safety: { ...prev.safety, killSwitchConfirmMode: mode },
		}));
	}, []);

	const validate = useCallback((): string[] => {
		const errors: string[] = [];
		if (!isValid24hTime(draft.notifications.quietHoursStart)) {
			errors.push("Invalid time format for quiet hours start (use HH:MM)");
		}
		if (!isValid24hTime(draft.notifications.quietHoursEnd)) {
			errors.push("Invalid time format for quiet hours end (use HH:MM)");
		}
		const window = draft.appearance.undoWindowSeconds;
		if (!Number.isFinite(window) || window < UNDO_WINDOW_MIN || window > UNDO_WINDOW_MAX) {
			errors.push(`Undo window must be between ${UNDO_WINDOW_MIN} and ${UNDO_WINDOW_MAX} seconds`);
		}
		return errors;
	}, [
		draft.notifications.quietHoursStart,
		draft.notifications.quietHoursEnd,
		draft.appearance.undoWindowSeconds,
	]);

	const handleSave = useCallback(async (): Promise<void> => {
		const errors = validate();
		if (errors.length > 0) {
			setValidationErrors(errors);
			return;
		}
		setValidationErrors([]);
		setSaving(true);
		try {
			await onSave(draft);
			onFeedback?.({ type: "success", message: "Settings saved" });
			// @lore I6: close the panel after successful save so the user
			// returns to the previous view with feedback toast visible.
			onClose();
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: observability surface — surface save failures
			console.error("[SettingsPanel] onSave failed", {
				message: err instanceof Error ? err.message : String(err),
			});
			onFeedback?.({ type: "error", message: "Failed to save settings" });
		} finally {
			setSaving(false);
		}
	}, [validate, onSave, draft, onFeedback, onClose]);

	// @lore React StrictMode double-mounts components. FocusTrap's onDeactivate
	// fires on the first unmount, which would call onClose and immediately close
	// the panel. To avoid this we disable escapeDeactivates + onDeactivate
	// entirely and handle Escape ourselves via the keydown listener below. The
	// FocusTrap stays active=true while `open` is true; deactivation happens
	// naturally when the component unmounts (open→false).
	// Handle Escape key manually so FocusTrap doesn't need onDeactivate.
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener("keydown", handler, true);
		return () => document.removeEventListener("keydown", handler, true);
	}, [open, onClose]);

	if (!open) {
		return null;
	}

	return (
		<div
			// J8: `transition-opacity duration-[var(--motion-slow)]` applies the
			// 320ms overlay token so open/close fades match the design spec.
			className="modal modal-open z-40 transition-opacity duration-[var(--motion-slow)]"
			role="dialog"
			aria-modal="true"
			aria-label="Settings"
		>
			<FocusTrap
				focusTrapOptions={{
					initialFocus: false,
					allowOutsideClick: true,
					escapeDeactivates: false,
					returnFocusOnDeactivate: false,
					fallbackFocus: ".modal-box",
					tabbableOptions: { displayCheck: "none" },
				}}
			>
				<div className="modal-box max-w-2xl p-0 flex flex-col max-h-[80vh]">
					{/* Tab bar + explicit close button (J3). Close button is
					 * distinct from the footer Cancel because the overlay is a
					 * focused panel, not a transient dialog — users expect an X
					 * in the header to dismiss. */}
					<div className="px-3 pt-3 flex items-start justify-between gap-2">
						<div role="tablist" className="tabs tabs-bordered flex-1">
							{TABS.map((tab) => (
								<button
									key={tab.id}
									type="button"
									role="tab"
									className={`tab ${activeTab === tab.id ? "tab-active" : ""}`}
									aria-selected={activeTab === tab.id}
									onClick={() => setActiveTab(tab.id)}
								>
									{tab.label}
								</button>
							))}
						</div>
						<button
							type="button"
							className="btn btn-ghost btn-xs btn-square"
							aria-label="Close settings"
							onClick={onClose}
						>
							<span aria-hidden="true">×</span>
						</button>
					</div>

					{/* Tab content */}
					<div className="flex-1 overflow-y-auto p-3">
						{activeTab === "profile" && (
							<ProfileTab profile={draft.profile} onChange={updateProfile} />
						)}
						{activeTab === "products" && (
							<ProductsTab products={draft.products} onToggle={toggleProduct} />
						)}
						{activeTab === "agents" && (
							<AgentsTab
								agents={draft.agents}
								onAutonomyChange={updateAgentAutonomy}
								onPauseToggle={toggleAgentPause}
							/>
						)}
						{activeTab === "notifications" && (
							<NotificationsTab
								notifications={draft.notifications}
								products={draft.products}
								onChange={updateNotification}
							/>
						)}
						{activeTab === "appearance" && (
							<AppearanceTab
								appearance={draft.appearance}
								onDensityChange={updateDensity}
								onThemeChange={updateTheme}
								onVerdictDoubleClickChange={updateVerdictDoubleClick}
								onUndoWindowSecondsChange={updateUndoWindowSeconds}
							/>
						)}
						{activeTab === "models" && <ModelsAndKeysTab />}
						{activeTab === "safety" && (
							<SafetyTab
								confirmMode={draft.safety.killSwitchConfirmMode}
								onConfirmModeChange={updateKillSwitchConfirmMode}
								onTriggerKillSwitch={onTriggerKillSwitch}
							/>
						)}
					</div>

					{/* Validation errors */}
					{validationErrors.length > 0 && (
						<div className="px-3 pb-1">
							{validationErrors.map((err) => (
								<p key={err} className="text-sm text-error">
									{err}
								</p>
							))}
						</div>
					)}

					{/* Footer with Save */}
					<div className="flex justify-end gap-2 p-3 border-t border-[var(--border-subtle)]">
						<button
							type="button"
							className="btn btn-ghost btn-sm text-[var(--text-mid)]"
							onClick={onClose}
						>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-primary btn-sm"
							disabled={saving}
							onClick={handleSave}
						>
							{saving && <span className="loading loading-spinner loading-xs" />}
							Save
						</button>
					</div>
				</div>
			</FocusTrap>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: Backdrop is a visual overlay; keyboard close is handled by Escape */}
			<div className="modal-backdrop" data-testid="settings-backdrop" onClick={onClose} />
		</div>
	);
}

// --- Tab Components (internal, not exported) ---

function ProfileTab({
	profile,
	onChange,
}: {
	profile: ProfileSettings;
	onChange: (field: keyof ProfileSettings, value: string) => void;
}): JSX.Element {
	return (
		<div className="flex flex-col gap-3">
			<div className="form-control">
				<label className="label" htmlFor="settings-name">
					<span className="label-text text-[var(--text-mid)]">Name</span>
				</label>
				<input
					id="settings-name"
					type="text"
					className="input input-sm input-bordered w-full text-[var(--text-hi)]"
					value={profile.name}
					onChange={(e) => onChange("name", e.target.value)}
				/>
			</div>
			<div className="form-control">
				<label className="label" htmlFor="settings-email">
					<span className="label-text text-[var(--text-mid)]">Email</span>
				</label>
				<input
					id="settings-email"
					type="email"
					className="input input-sm input-bordered w-full text-[var(--text-hi)]"
					value={profile.email}
					onChange={(e) => onChange("email", e.target.value)}
				/>
			</div>
			<div className="form-control">
				<label className="label" htmlFor="settings-avatar">
					<span className="label-text text-[var(--text-mid)]">Avatar URL</span>
				</label>
				<input
					id="settings-avatar"
					type="text"
					className="input input-sm input-bordered w-full text-[var(--text-hi)]"
					value={profile.avatarUrl}
					placeholder="https://..."
					onChange={(e) => onChange("avatarUrl", e.target.value)}
				/>
			</div>
		</div>
	);
}

function ProductsTab({
	products,
	onToggle,
}: {
	products: ProductSetting[];
	onToggle: (id: string) => void;
}): JSX.Element {
	return (
		<div className="flex flex-col gap-2">
			{products.map((product) => (
				<div key={product.id} className="flex items-center justify-between py-1">
					<span className="text-sm">{product.name}</span>
					<input
						type="checkbox"
						className="toggle toggle-sm toggle-primary"
						checked={product.active}
						onChange={() => onToggle(product.id)}
						aria-label={`Toggle ${product.name}`}
					/>
				</div>
			))}
		</div>
	);
}

function AgentsTab({
	agents,
	onAutonomyChange,
	onPauseToggle,
}: {
	agents: AgentSetting[];
	onAutonomyChange: (id: string, level: AutonomyLevel) => void;
	onPauseToggle: (id: string) => void;
}): JSX.Element {
	return (
		<div className="flex flex-col gap-3">
			{agents.map((agent) => (
				<div key={agent.id} className="flex items-center gap-3 py-1">
					<span className="text-sm flex-1">{agent.name}</span>
					<select
						className="select select-sm select-bordered"
						value={String(agent.autonomyLevel)}
						onChange={(e) => {
							const parsed = Number(e.target.value);
							if (isAutonomyLevel(parsed)) {
								onAutonomyChange(agent.id, parsed);
							}
						}}
						aria-label={`Autonomy level for ${agent.name}`}
					>
						{AUTONOMY_LEVELS.map((level) => (
							<option key={level} value={String(level)}>
								{AUTONOMY_LEVEL_META[level].code} — {AUTONOMY_LEVEL_META[level].label}
							</option>
						))}
					</select>
					<button
						type="button"
						className={`btn btn-xs ${agent.paused ? "btn-warning" : "btn-ghost"}`}
						onClick={() => onPauseToggle(agent.id)}
					>
						{agent.paused ? "Reactivate" : "Pause"}
					</button>
				</div>
			))}
		</div>
	);
}

function NotificationsTab({
	notifications,
	products,
	onChange,
}: {
	notifications: NotificationSettings;
	products: ProductSetting[];
	onChange: (field: keyof NotificationSettings, value: boolean | string | string[]) => void;
}): JSX.Element {
	return (
		<div className="flex flex-col gap-3">
			{/* Alert toggles */}
			<div className="flex items-center justify-between py-1">
				<span className="text-sm">Review alerts</span>
				<input
					type="checkbox"
					className="toggle toggle-sm toggle-primary"
					checked={notifications.reviewAlerts}
					onChange={(e) => onChange("reviewAlerts", e.target.checked)}
					aria-label="Toggle review alerts"
				/>
			</div>
			<div className="flex items-center justify-between py-1">
				<span className="text-sm">Cost alerts</span>
				<input
					type="checkbox"
					className="toggle toggle-sm toggle-primary"
					checked={notifications.costAlerts}
					onChange={(e) => onChange("costAlerts", e.target.checked)}
					aria-label="Toggle cost alerts"
				/>
			</div>
			<div className="flex items-center justify-between py-1">
				<span className="text-sm">Blocker alerts</span>
				<input
					type="checkbox"
					className="toggle toggle-sm toggle-primary"
					checked={notifications.blockerAlerts}
					onChange={(e) => onChange("blockerAlerts", e.target.checked)}
					aria-label="Toggle blocker alerts"
				/>
			</div>

			{/* Quiet hours */}
			<div className="divider text-xs text-[var(--text-lo)]">Quiet Hours</div>
			<div className="flex gap-3">
				<div className="form-control flex-1">
					<label className="label" htmlFor="quiet-start">
						<span className="label-text text-[var(--text-mid)]">Quiet hours start</span>
					</label>
					<input
						id="quiet-start"
						type="text"
						className="input input-sm input-bordered"
						placeholder="22:00"
						value={notifications.quietHoursStart}
						onChange={(e) => onChange("quietHoursStart", e.target.value)}
					/>
				</div>
				<div className="form-control flex-1">
					<label className="label" htmlFor="quiet-end">
						<span className="label-text text-[var(--text-mid)]">Quiet hours end</span>
					</label>
					<input
						id="quiet-end"
						type="text"
						className="input input-sm input-bordered"
						placeholder="08:00"
						value={notifications.quietHoursEnd}
						onChange={(e) => onChange("quietHoursEnd", e.target.value)}
					/>
				</div>
			</div>

			{/* Product mutes */}
			{products.length > 0 && (
				<>
					<div className="divider text-xs text-[var(--text-lo)]">Mute by Product</div>
					{products.map((p) => (
						<div key={p.id} className="flex items-center justify-between py-1">
							<span className="text-sm">{p.name}</span>
							<input
								type="checkbox"
								className="toggle toggle-sm"
								checked={notifications.mutedProducts.includes(p.id)}
								onChange={(e) => {
									const next = e.target.checked
										? [...notifications.mutedProducts, p.id]
										: notifications.mutedProducts.filter((id) => id !== p.id);
									onChange("mutedProducts", next);
								}}
								aria-label={`Mute ${p.name}`}
							/>
						</div>
					))}
				</>
			)}
		</div>
	);
}

function AppearanceTab({
	appearance,
	onDensityChange,
	onThemeChange,
	onVerdictDoubleClickChange,
	onUndoWindowSecondsChange,
}: {
	appearance: AppearanceSettings;
	onDensityChange: (density: Density) => void;
	onThemeChange: (theme: Theme) => void;
	onVerdictDoubleClickChange: (value: boolean) => void;
	onUndoWindowSecondsChange: (value: number) => void;
}): JSX.Element {
	return (
		<div className="flex flex-col gap-3">
			<div className="form-control">
				<label className="label" htmlFor="settings-theme">
					<span className="label-text text-[var(--text-mid)]">Theme</span>
				</label>
				<select
					id="settings-theme"
					className="select select-sm select-bordered w-full"
					value={appearance.theme}
					onChange={(e) => onThemeChange(e.target.value as Theme)}
				>
					<option value="system">System</option>
					<option value="dark">Dark</option>
					<option value="light">Light</option>
				</select>
			</div>

			<div className="form-control">
				<label className="label" htmlFor="settings-density">
					<span className="label-text text-[var(--text-mid)]">Density</span>
				</label>
				<select
					id="settings-density"
					className="select select-sm select-bordered w-full"
					value={appearance.density}
					onChange={(e) => onDensityChange(e.target.value as Density)}
				>
					<option value="auto">Auto (mobile = comfortable)</option>
					<option value="compact">Compact</option>
					<option value="default">Default</option>
					<option value="comfortable">Comfortable</option>
				</select>
			</div>

			{/* L4: Verdict double-click — pre-fill confirm pattern. */}
			<div className="form-control">
				<label
					className="cursor-pointer label flex items-center justify-between"
					htmlFor="settings-verdict-double-click"
				>
					<span className="label-text text-[var(--text-mid)]">Verdict double-click</span>
					<input
						id="settings-verdict-double-click"
						type="checkbox"
						className="toggle toggle-sm toggle-primary"
						checked={appearance.verdictDoubleClick}
						onChange={(e) => onVerdictDoubleClickChange(e.target.checked)}
						aria-label="Verdict double-click"
					/>
				</label>
				{/* @lore L4 review (design C5): when the user opts into
				    single-click, the spec mandates a *written warning*. The
				    descriptive subtitle alone fails the AC; this surface
				    raises the warning role and uses the warning token so the
				    user sees the risk language before they save. */}
				{appearance.verdictDoubleClick ? (
					<p className="text-xs text-[var(--text-lo)] mt-1">
						Click twice to commit a verdict (recommended).
					</p>
				) : (
					<div
						role="alert"
						className="mt-1 flex items-start gap-2 rounded border border-warning bg-[var(--surface-2)] p-2"
					>
						<span aria-hidden="true" className="text-warning font-semibold">
							!
						</span>
						<p className="text-xs text-warning">
							<strong>Warning:</strong> Single-click is irreversible — only the undo toast can
							revert it. Destructive verdicts ship in one click.
						</p>
					</div>
				)}
			</div>

			{/* L4: Undo window in seconds. Closed allowlist 3..15. */}
			<div className="form-control">
				<label className="label" htmlFor="settings-undo-window">
					<span className="label-text text-[var(--text-mid)]">Undo window (seconds)</span>
				</label>
				<select
					id="settings-undo-window"
					className="select select-sm select-bordered w-full"
					value={String(appearance.undoWindowSeconds)}
					onChange={(e) => onUndoWindowSecondsChange(Number.parseInt(e.target.value, 10))}
				>
					{UNDO_WINDOW_OPTIONS.map((seconds) => (
						<option key={seconds} value={String(seconds)}>
							{seconds}s
						</option>
					))}
				</select>
			</div>
		</div>
	);
}

/**
 * L7 — Safety tab. Exposes the kill switch as a third entry point
 * (alongside the avatar menu + `Cmd+Shift+.`) and the confirmation-mode
 * preference. The `recovery_audit` listing is rendered as a region so
 * screen-reader users can navigate to it directly.
 *
 * @lore L7: the live recovery-audit feed is fetched by the parent
 * (AppShell) and threaded down once Track-L L8 lands the
 * `/api/recovery_audit` listing endpoint. Until then the region renders
 * an empty state — the test asserts the region is reachable, not that
 * it is populated.
 */
interface SafetyTabProps {
	confirmMode: KillSwitchConfirmMode;
	onConfirmModeChange: (mode: KillSwitchConfirmMode) => void;
	/**
	 * @lore L7 (S4): the "Pause Factory" CTA delegates to AppShell so a
	 * single KillSwitchDialog instance owns the pause flow + audit
	 * write. Without this delegation the inline dialog used to swallow
	 * confirmation locally and never actually paused the factory.
	 */
	onTriggerKillSwitch?: () => void;
}

function SafetyTab(props: SafetyTabProps): JSX.Element {
	const { confirmMode, onConfirmModeChange, onTriggerKillSwitch } = props;

	return (
		<div className="flex flex-col gap-4">
			<section aria-labelledby="settings-safety-kill" className="space-y-2">
				<h3 id="settings-safety-kill" className="text-sm font-medium">
					Kill switch
				</h3>
				<p className="text-xs text-[var(--text-lo)]">
					Pauses every running session and blocks queued tasks until you resume.
				</p>
				{onTriggerKillSwitch ? (
					<button type="button" className="btn btn-error btn-sm" onClick={onTriggerKillSwitch}>
						Pause Factory
					</button>
				) : null}
			</section>

			<section aria-labelledby="settings-safety-mode" className="space-y-2">
				<h3 id="settings-safety-mode" className="text-sm font-medium">
					Confirmation mode
				</h3>
				<div className="flex gap-3 text-xs">
					<label className="flex items-center gap-2">
						<input
							type="radio"
							name="kill-switch-mode"
							value="type_name"
							checked={confirmMode === "type_name"}
							onChange={() => onConfirmModeChange("type_name")}
							className="radio radio-xs"
						/>
						<span>Type factory name</span>
					</label>
					<label className="flex items-center gap-2">
						<input
							type="radio"
							name="kill-switch-mode"
							value="press_hold"
							checked={confirmMode === "press_hold"}
							onChange={() => onConfirmModeChange("press_hold")}
							className="radio radio-xs"
						/>
						<span>Press and hold</span>
					</label>
				</div>
			</section>

			<section aria-label="Recent recovery actions" className="space-y-2">
				<h3 className="text-sm font-medium">Recent recovery actions</h3>
				<p className="text-xs text-[var(--text-lo)]">No recovery actions recorded yet.</p>
			</section>
		</div>
	);
}

/**
 * @lore L10: Models & Keys tab — read-only surface for the
 * already-stored Anthropic key (masked) plus a "Rotate key" button that
 * opens the same `/api/first-run/api-key` ping endpoint. The settings
 * panel save flow is NOT used here — key persistence happens server-side
 * the moment a green ping returns. This sidesteps the J3 "draft-and-save"
 * pattern for a surface that must validate before persisting.
 */
function ModelsAndKeysTab(): JSX.Element {
	const [last4, setLast4] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [draft, setDraft] = useState("");
	const [testing, setTesting] = useState(false);
	const [result, setResult] = useState<
		{ ok: true; last4: string } | { ok: false; status: number; message: string } | null
	>(null);
	// C4: ref mutex blocks fast double-click double-fire.
	const mutexRef = useRef<boolean>(false);

	useEffect(() => {
		void fetch("/api/first-run/status")
			.then((r) => r.json())
			.then((body: unknown) => {
				if (body && typeof body === "object" && "apiKeyLast4" in body) {
					const v = (body as { apiKeyLast4: unknown }).apiKeyLast4;
					setLast4(typeof v === "string" ? v : null);
				}
			})
			.catch(() => undefined)
			.finally(() => setLoading(false));
	}, []);

	const test = useCallback(async (): Promise<void> => {
		if (mutexRef.current) return;
		mutexRef.current = true;
		setTesting(true);
		setResult(null);
		try {
			const res = await fetch("/api/first-run/api-key", {
				method: "POST",
				headers: { "Content-Type": "application/json", "X-Requested-With": "hyperidle-web" },
				body: JSON.stringify({ key: draft }),
			});
			const body = (await res.json()) as
				| { ok: true; status: number; last4: string }
				| { ok: false; status: number; message: string };
			if (body.ok) {
				setResult({ ok: true, last4: body.last4 });
				setLast4(body.last4);
				setDraft("");
			} else {
				setResult({ ok: false, status: body.status, message: body.message });
			}
		} catch (err) {
			setResult({
				ok: false,
				status: 0,
				message: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setTesting(false);
			mutexRef.current = false;
		}
	}, [draft]);

	return (
		<div className="flex flex-col gap-4" data-testid="settings-models-tab">
			<div>
				<h3 className="text-xs uppercase tracking-wider mb-2">Anthropic key</h3>
				{loading ? (
					<p className="text-sm text-[var(--text-mid)]">Loading…</p>
				) : last4 ? (
					<p className="text-sm" data-testid="settings-models-current-key">
						Stored: <code className="font-mono">sk-ant-•••••{last4}</code>
					</p>
				) : (
					<p className="text-sm text-[var(--text-mid)]">No key configured.</p>
				)}
			</div>
			<div>
				<h3 className="text-xs uppercase tracking-wider mb-2">Rotate key</h3>
				<input
					type="password"
					className="input input-bordered input-sm font-mono w-full"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					placeholder="sk-ant-…"
					autoComplete="off"
					data-testid="settings-models-input"
				/>
				<div className="flex gap-2 mt-2">
					<button
						type="button"
						className="btn btn-sm btn-primary"
						disabled={testing || draft.length === 0}
						onClick={() => void test()}
						data-testid="settings-models-test"
					>
						{testing ? "Testing…" : "Test & save"}
					</button>
				</div>
				{result?.ok && (
					<p className="text-success text-sm mt-2" data-testid="settings-models-success">
						Key updated.
					</p>
				)}
				{result && !result.ok && (
					<p role="alert" className="text-error text-sm mt-2" data-testid="settings-models-error">
						Test failed ({result.status}): {result.message}
					</p>
				)}
			</div>
			<div>
				<h3 className="text-xs uppercase tracking-wider mb-2">Model tier mapping</h3>
				<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
					<dt className="font-mono">opus</dt>
					<dd>claude-opus-4-x — high-stakes shaping, reviews</dd>
					<dt className="font-mono">sonnet</dt>
					<dd>claude-sonnet-4-x — default builder</dd>
					<dt className="font-mono">haiku</dt>
					<dd>claude-haiku-4-x — routine ops, low-cost batches</dd>
				</dl>
			</div>
		</div>
	);
}
