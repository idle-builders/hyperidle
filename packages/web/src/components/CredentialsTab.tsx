/**
 * Credentials tab for SettingsPanel.
 *
 * P3: Refactored to a fixed catalog display when bridge.credentials.status() is available.
 * Falls back to the N4 list-based freeform UI when status() is not exposed by the bridge.
 * This allows P3 and N4 tests to coexist.
 *
 * Uses window.__HYPERIDLE__.credentials when running inside Electron.
 * Shows a "desktop app only" message in the browser.
 *
 * @lore P3: The catalog is fixed — three known credentials with state indicators.
 * The new bridge API exposes credentials.status() and credentials.validate().
 * @lore N4: When running against an older bridge (no status()), falls back to
 * list()-based display with static masks and freeform name/value entry.
 * This backward-compat shim is needed so N4 test contracts remain satisfied
 * while P3 AC-13 catalog UI tests also pass.
 */

import { type JSX, useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// P3 catalog UI types
// ---------------------------------------------------------------------------

/** Catalog entries in display order. */
const CATALOG_ENTRIES = [
	{
		name: "anthropic_api_key" as const,
		label: "Anthropic API Key",
		description: "Required for AI agents to run.",
	},
	{
		name: "openrouter_api_key" as const,
		label: "OpenRouter API Key",
		description: "Alternative model provider. Optional.",
	},
	{
		name: "shared_backend_key" as const,
		label: "Shared Backend Key",
		description: "Authenticates against a shared remote backend.",
	},
] as const;

type CatalogName = (typeof CATALOG_ENTRIES)[number]["name"];
type CredentialState = "absent" | "present_untested" | "valid" | "invalid";

function stateLabel(state: CredentialState): string {
	switch (state) {
		case "absent":
			return "Not set";
		case "present_untested":
			return "Present (untested)";
		case "valid":
			return "Valid";
		case "invalid":
			return "Invalid";
	}
}

function isPresent(state: CredentialState): boolean {
	return state !== "absent";
}

// ---------------------------------------------------------------------------
// P3 catalog mode component
// ---------------------------------------------------------------------------

interface CatalogModeProps {
	bridge: NonNullable<Window["__HYPERIDLE__"]>;
}

function CatalogModeCredentials({ bridge }: CatalogModeProps): JSX.Element {
	const [statusMap, setStatusMap] = useState<Record<string, CredentialState>>({});
	const [editingName, setEditingName] = useState<CatalogName | null>(null);
	const [editValue, setEditValue] = useState("");
	const [savingName, setSavingName] = useState<CatalogName | null>(null);
	const [validatingName, setValidatingName] = useState<CatalogName | null>(null);
	const [warning, setWarning] = useState<string | null>(null);

	const loadStatus = useCallback(async (): Promise<void> => {
		const s = await bridge.credentials.status();
		setStatusMap(s as Record<string, CredentialState>);
	}, [bridge]);

	useEffect(() => {
		void loadStatus();
	}, [loadStatus]);

	const handleSave = useCallback(
		async (name: CatalogName): Promise<void> => {
			if (!editValue.trim()) return;
			setSavingName(name);
			setWarning(null);
			try {
				const result = await bridge.credentials.set(name, editValue.trim());
				if (!result.stored && result.warning) {
					setWarning(result.warning);
				} else {
					setEditingName(null);
					setEditValue("");
					await loadStatus();
				}
			} finally {
				setSavingName(null);
			}
		},
		[bridge, editValue, loadStatus],
	);

	const handleDelete = useCallback(
		async (name: CatalogName): Promise<void> => {
			await bridge.credentials.delete(name);
			await loadStatus();
		},
		[bridge, loadStatus],
	);

	const handleValidate = useCallback(
		async (name: CatalogName): Promise<void> => {
			setValidatingName(name);
			setWarning(null);
			try {
				const result = await bridge.credentials.validate(name);
				if (!result.valid && result.error) {
					setWarning(result.error);
				}
				await loadStatus();
			} finally {
				setValidatingName(null);
			}
		},
		[bridge, loadStatus],
	);

	return (
		<div className="flex flex-col gap-4">
			{CATALOG_ENTRIES.map((entry) => {
				const state: CredentialState = (statusMap[entry.name] as CredentialState) ?? "absent";
				const present = isPresent(state);
				const isEditing = editingName === entry.name;

				return (
					<div
						key={entry.name}
						className="flex flex-col gap-2 py-2 border-b border-[var(--border)]"
					>
						<div className="flex items-center justify-between gap-3">
							<div className="flex flex-col gap-0.5">
								<span className="text-sm font-medium text-[var(--text-primary)]">
									{entry.label}
								</span>
								<span className="text-xs text-[var(--text-tertiary)]">
									{state === "absent" ? "Absent" : stateLabel(state)}
								</span>
							</div>
							<div className="flex items-center gap-2">
								{(state === "present_untested" || state === "invalid") && (
									<button
										type="button"
										className="btn btn-ghost btn-xs"
										disabled={validatingName === entry.name}
										onClick={() => void handleValidate(entry.name)}
									>
										{validatingName === entry.name ? (
											<span className="loading loading-spinner loading-xs" />
										) : (
											"Validate"
										)}
									</button>
								)}
								<button
									type="button"
									className="btn btn-ghost btn-xs"
									onClick={() => {
										setEditingName(isEditing ? null : entry.name);
										setEditValue("");
										setWarning(null);
									}}
								>
									{present ? "Update" : "Set"}
								</button>
								{present && (
									<button
										type="button"
										className="btn btn-ghost btn-xs text-error"
										onClick={() => void handleDelete(entry.name)}
									>
										Remove
									</button>
								)}
							</div>
						</div>

						{isEditing && (
							<div className="flex flex-col gap-2 mt-1">
								<input
									type="password"
									className="input input-sm input-bordered w-full"
									value={editValue}
									onChange={(e) => setEditValue(e.target.value)}
									placeholder={`Enter ${entry.label}`}
								/>
								{warning && editingName === entry.name && (
									<p className="text-xs text-warning">{warning}</p>
								)}
								<div className="flex gap-2">
									<button
										type="button"
										className="btn btn-primary btn-xs"
										disabled={savingName === entry.name || !editValue.trim()}
										onClick={() => void handleSave(entry.name)}
									>
										{savingName === entry.name ? (
											<span className="loading loading-spinner loading-xs" />
										) : (
											"Save"
										)}
									</button>
									<button
										type="button"
										className="btn btn-ghost btn-xs"
										onClick={() => {
											setEditingName(null);
											setEditValue("");
											setWarning(null);
										}}
									>
										Cancel
									</button>
								</div>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

// ---------------------------------------------------------------------------
// N4 legacy list mode component (backward compat)
// ---------------------------------------------------------------------------

interface LegacyModeProps {
	bridge: NonNullable<Window["__HYPERIDLE__"]>;
}

interface CredentialEntry {
	name: string;
}

function LegacyModeCredentials({ bridge }: LegacyModeProps): JSX.Element {
	const [credentials, setCredentials] = useState<CredentialEntry[]>([]);
	const [name, setName] = useState("");
	const [value, setValue] = useState("");
	const [warning, setWarning] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const loadCredentials = useCallback(async (): Promise<void> => {
		const names = await bridge.credentials.list();
		const entries = names.map((n) => ({ name: n }));
		setCredentials(entries);
	}, [bridge]);

	useEffect(() => {
		void loadCredentials();
	}, [loadCredentials]);

	const handleSave = useCallback(async (): Promise<void> => {
		if (!name.trim()) return;
		setLoading(true);
		setWarning(null);
		try {
			const result = await bridge.credentials.set(name.trim(), value);
			if (!result.stored && result.warning) {
				setWarning(result.warning);
			}
			setName("");
			setValue("");
			await loadCredentials();
		} finally {
			setLoading(false);
		}
	}, [bridge, name, value, loadCredentials]);

	const handleDelete = useCallback(
		async (credName: string): Promise<void> => {
			await bridge.credentials.delete(credName);
			await loadCredentials();
		},
		[bridge, loadCredentials],
	);

	return (
		<div className="flex flex-col gap-4">
			{/* Stored credentials list */}
			{credentials.length > 0 && (
				<div className="flex flex-col gap-2">
					{credentials.map((cred) => (
						<div key={cred.name} className="flex items-center justify-between py-1 gap-3">
							<span className="text-sm font-medium text-[var(--text-primary)]">{cred.name}</span>
							<span className="text-sm font-mono text-[var(--text-tertiary)] flex-1">••••••••</span>
							<button
								type="button"
								className="btn btn-ghost btn-xs text-error"
								onClick={() => void handleDelete(cred.name)}
							>
								Remove
							</button>
						</div>
					))}
				</div>
			)}

			{/* Add credential form */}
			<div className="flex flex-col gap-3">
				<div className="form-control">
					<label className="label" htmlFor="cred-name">
						<span className="label-text text-[var(--text-secondary)]">Credential name</span>
					</label>
					<input
						id="cred-name"
						type="text"
						className="input input-sm input-bordered w-full text-[var(--text-primary)]"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="MY_API_KEY"
					/>
				</div>
				<div className="form-control">
					<label className="label" htmlFor="cred-value">
						<span className="label-text text-[var(--text-secondary)]">Credential value</span>
					</label>
					<input
						id="cred-value"
						type="password"
						className="input input-sm input-bordered w-full"
						value={value}
						onChange={(e) => setValue(e.target.value)}
					/>
				</div>
				{warning && <p className="text-sm text-warning">{warning}</p>}
				<button
					type="button"
					className="btn btn-primary btn-sm self-start"
					disabled={loading || !name.trim()}
					onClick={() => void handleSave()}
				>
					{loading && <span className="loading loading-spinner loading-xs" />}
					Save
				</button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main CredentialsTab — switches based on bridge capability
// ---------------------------------------------------------------------------

export function CredentialsTab(): JSX.Element {
	const bridge = window.__HYPERIDLE__;

	if (!bridge) {
		return (
			<div className="flex flex-col gap-3">
				<p className="text-sm text-[var(--text-secondary)]">
					Credential storage is available in the desktop app only.
				</p>
			</div>
		);
	}

	// P3: if the bridge exposes status(), use the catalog UI.
	// Fall back to legacy list-based UI for older bridges (N4 compat).
	if (typeof bridge.credentials.status === "function") {
		return <CatalogModeCredentials bridge={bridge} />;
	}

	return <LegacyModeCredentials bridge={bridge} />;
}
