import FocusTrap from "focus-trap-react";
import { type JSX, useCallback, useEffect, useState } from "react";

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

export type AutonomyLevel = "manual" | "supervised" | "autonomous";

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

export type Density = "comfortable" | "compact";

export interface AppearanceSettings {
	density: Density;
}

export interface SettingsData {
	profile: ProfileSettings;
	products: ProductSetting[];
	agents: AgentSetting[];
	notifications: NotificationSettings;
	appearance: AppearanceSettings;
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
}

type TabId = "profile" | "products" | "agents" | "notifications" | "appearance";

const TABS: { id: TabId; label: string }[] = [
	{ id: "profile", label: "Profile" },
	{ id: "products", label: "Products" },
	{ id: "agents", label: "Agents" },
	{ id: "notifications", label: "Notifications" },
	{ id: "appearance", label: "Appearance" },
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
 * @lore Theme (light/dark) is deferred to v2 per spec. The Appearance tab only
 * exposes density for now, with a note about theme being deferred.
 */

export function SettingsPanel({
	open,
	onClose,
	onSave,
	settings,
	onFeedback,
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

	const validate = useCallback((): string[] => {
		const errors: string[] = [];
		if (!isValid24hTime(draft.notifications.quietHoursStart)) {
			errors.push("Invalid time format for quiet hours start (use HH:MM)");
		}
		if (!isValid24hTime(draft.notifications.quietHoursEnd)) {
			errors.push("Invalid time format for quiet hours end (use HH:MM)");
		}
		return errors;
	}, [draft.notifications.quietHoursStart, draft.notifications.quietHoursEnd]);

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
		} catch {
			onFeedback?.({ type: "error", message: "Failed to save settings" });
		} finally {
			setSaving(false);
		}
	}, [validate, onSave, draft, onFeedback]);

	if (!open) {
		return null;
	}

	return (
		<div
			className="modal modal-open"
			// biome-ignore lint/a11y/useSemanticElements: DaisyUI modal pattern requires div with role="dialog" for CSS class approach
			role="dialog"
			aria-modal="true"
			aria-label="Settings"
		>
			<FocusTrap
				focusTrapOptions={{
					initialFocus: false,
					allowOutsideClick: true,
					escapeDeactivates: true,
					onDeactivate: onClose,
					fallbackFocus: ".modal-box",
					tabbableOptions: { displayCheck: "none" },
				}}
			>
				<div className="modal-box max-w-2xl p-0 flex flex-col max-h-[80vh]">
					{/* Tab bar */}
					<div className="px-3 pt-3">
						<div role="tablist" className="tabs tabs-bordered">
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
							<AppearanceTab appearance={draft.appearance} onDensityChange={updateDensity} />
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
					<div className="flex justify-end gap-2 p-3 border-t border-base-300">
						<button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
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
					<span className="label-text">Name</span>
				</label>
				<input
					id="settings-name"
					type="text"
					className="input input-sm input-bordered w-full"
					value={profile.name}
					onChange={(e) => onChange("name", e.target.value)}
				/>
			</div>
			<div className="form-control">
				<label className="label" htmlFor="settings-email">
					<span className="label-text">Email</span>
				</label>
				<input
					id="settings-email"
					type="email"
					className="input input-sm input-bordered w-full"
					value={profile.email}
					onChange={(e) => onChange("email", e.target.value)}
				/>
			</div>
			<div className="form-control">
				<label className="label" htmlFor="settings-avatar">
					<span className="label-text">Avatar URL</span>
				</label>
				<input
					id="settings-avatar"
					type="text"
					className="input input-sm input-bordered w-full"
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
						value={agent.autonomyLevel}
						onChange={(e) => onAutonomyChange(agent.id, e.target.value as AutonomyLevel)}
						aria-label={`Autonomy level for ${agent.name}`}
					>
						<option value="manual">Manual</option>
						<option value="supervised">Supervised</option>
						<option value="autonomous">Autonomous</option>
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
						<span className="label-text">Quiet hours start</span>
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
						<span className="label-text">Quiet hours end</span>
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
}: {
	appearance: AppearanceSettings;
	onDensityChange: (density: Density) => void;
}): JSX.Element {
	return (
		<div className="flex flex-col gap-3">
			<div className="form-control">
				<label className="label" htmlFor="settings-density">
					<span className="label-text">Density</span>
				</label>
				<select
					id="settings-density"
					className="select select-sm select-bordered w-full"
					value={appearance.density}
					onChange={(e) => onDensityChange(e.target.value as Density)}
				>
					<option value="comfortable">Comfortable</option>
					<option value="compact">Compact</option>
				</select>
			</div>

			<div className="form-control">
				<p className="label-text text-sm">Theme</p>
				<p className="text-sm text-[var(--text-lo)]">Theme switching (light/dark) deferred to v2</p>
			</div>
		</div>
	);
}
