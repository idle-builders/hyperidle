/**
 * Credentials tab for SettingsPanel.
 *
 * Uses window.__HYPERIDLE__.credentials when running inside Electron.
 * Shows a "desktop app only" message in the browser.
 */

import { type JSX, useCallback, useEffect, useState } from "react";

interface CredentialEntry {
	name: string;
}

// @lore N4: CredentialsTab only calls credentials.list() for display — never
// credentials.get(). The get() API is for runtime API calls, not for display.
// Decrypting all credentials on every tab open exposes plaintext in renderer
// memory unnecessarily. We show a static mask (••••••••) instead.
// Architecture §10.5: "The full value is retrievable only via credentials.get()
// (which the renderer uses when making API calls, not for display)."

export function CredentialsTab(): JSX.Element {
	const bridge = window.__HYPERIDLE__;

	const [credentials, setCredentials] = useState<CredentialEntry[]>([]);
	const [name, setName] = useState("");
	const [value, setValue] = useState("");
	const [warning, setWarning] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const loadCredentials = useCallback(async (): Promise<void> => {
		if (!bridge) return;
		const names = await bridge.credentials.list();
		const entries = names.map((n) => ({ name: n }));
		setCredentials(entries);
	}, []); // eslint-disable-line react-hooks/exhaustive-deps -- bridge is stable (window property)

	useEffect(() => {
		void loadCredentials();
	}, [loadCredentials]);

	const handleSave = useCallback(async (): Promise<void> => {
		if (!(bridge && name.trim())) return;
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
	}, [name, value, loadCredentials]); // eslint-disable-line react-hooks/exhaustive-deps -- bridge is stable

	const handleDelete = useCallback(
		async (credName: string): Promise<void> => {
			if (!bridge) return;
			await bridge.credentials.delete(credName);
			await loadCredentials();
		},
		[loadCredentials], // eslint-disable-line react-hooks/exhaustive-deps -- bridge is stable
	);

	if (!bridge) {
		return (
			<div className="flex flex-col gap-3">
				<p className="text-sm text-[var(--text-mid)]">
					Credential storage is available in the desktop app.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{/* Stored credentials list */}
			{credentials.length > 0 && (
				<div className="flex flex-col gap-2">
					{credentials.map((cred) => (
						<div key={cred.name} className="flex items-center justify-between py-1 gap-3">
							<span className="text-sm font-medium text-[var(--text-hi)]">{cred.name}</span>
							<span className="text-sm font-mono text-[var(--text-lo)] flex-1">••••••••</span>
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
						<span className="label-text text-[var(--text-mid)]">Credential name</span>
					</label>
					<input
						id="cred-name"
						type="text"
						className="input input-sm input-bordered w-full text-[var(--text-hi)]"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="MY_API_KEY"
					/>
				</div>
				<div className="form-control">
					<label className="label" htmlFor="cred-value">
						<span className="label-text text-[var(--text-mid)]">Credential value</span>
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
