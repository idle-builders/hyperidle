/**
 * Credentials tab for SettingsPanel.
 *
 * AH1: Rewired to use HTTP /api/credentials in all environments (no bridge gate).
 * Shows 4 catalog rows (anthropic, openrouter, shared_backend, openai_compatible).
 * Uses the real design-system StatusChip with credential state → StatusChip status mapping.
 *
 * @lore AH1 §5: The bridge-only gate ("desktop app only") is removed.
 * apiFetch works in desktop-local AND web/E2E because the route is always mounted.
 * The bridge write (window.__HYPERIDLE__.credentials.set) is no longer the runtime truth.
 * @lore AH1 §6: Fail-loud warning uses --status-warning/--status-error tokens.
 * On GET error, rows render neutral "unknown" chips (graceful fallback, no error explosion).
 */

// hearth-internal-padding

import {
	CREDENTIAL_CATALOG,
	type CredentialName,
	type CredentialState,
} from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useState } from "react";
import type { Status } from "../ds";
import { Button, Input, ItemList, Row, StatusChip } from "../ds";
import { apiFetch } from "../services/api-fetch.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CredentialStatus {
	name: CredentialName;
	state: CredentialState;
	lastValidatedAt: string | null;
}

// ---------------------------------------------------------------------------
// State → StatusChip mapping
// ---------------------------------------------------------------------------

/**
 * Map a CredentialState to a StatusChip Status.
 * @lore AH1 design/approved.md: state map for StatusChip
 */
function credentialStateToStatus(state: CredentialState | "unknown"): Status {
	switch (state) {
		case "valid":
			return "healthy";
		case "invalid":
			return "error";
		case "present_untested":
			return "paused";
		case "absent":
			return "behind";
		case "unknown":
			return "paused"; // neutral fallback for load errors
		default:
			return "paused";
	}
}

function credentialStateLabel(state: CredentialState | "unknown"): string {
	switch (state) {
		case "valid":
			return "Valid";
		case "invalid":
			return "Invalid";
		case "present_untested":
			return "Untested";
		case "absent":
			return "Not set";
		case "unknown":
			return "Unknown";
		default:
			return "Unknown";
	}
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CredentialsTab(): JSX.Element {
	const [statuses, setStatuses] = useState<CredentialStatus[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [editingName, setEditingName] = useState<CredentialName | null>(null);
	const [editValue, setEditValue] = useState("");
	const [savingName, setSavingName] = useState<CredentialName | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [validatingName, setValidatingName] = useState<CredentialName | null>(null);
	const [missingSecret, setMissingSecret] = useState(false);

	const loadStatuses = useCallback(async (): Promise<void> => {
		try {
			const res = await apiFetch("/api/credentials");
			if (!res.ok) {
				setLoadError(`Failed to load credentials (${res.status})`);
				return;
			}
			const raw = await res.json();
			const data = Array.isArray(raw) ? (raw as CredentialStatus[]) : [];
			setStatuses(data);
			setLoadError(null);
		} catch {
			setLoadError("Could not reach server");
		}
	}, []);

	useEffect(() => {
		void loadStatuses();
	}, [loadStatuses]);

	const handleSave = useCallback(
		async (name: CredentialName): Promise<void> => {
			if (!editValue.trim()) return;
			setSavingName(name);
			setSaveError(null);
			setMissingSecret(false);
			try {
				const res = await apiFetch(`/api/credentials/${name}`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ value: editValue.trim() }),
				});
				if (res.status === 500) {
					const body = (await res.json().catch(() => null)) as { code?: string } | null;
					if (body?.code === "MISSING_ROOT_SECRET") {
						setMissingSecret(true);
						return;
					}
				}
				if (!res.ok) {
					const body = (await res.json().catch(() => null)) as { error?: string } | null;
					setSaveError(body?.error ?? `Save failed (${res.status})`);
					return;
				}
				setEditingName(null);
				setEditValue("");
				await loadStatuses();
			} catch {
				setSaveError("Network error");
			} finally {
				setSavingName(null);
			}
		},
		[editValue, loadStatuses],
	);

	const handleDelete = useCallback(
		async (name: CredentialName): Promise<void> => {
			try {
				await apiFetch(`/api/credentials/${name}`, { method: "DELETE" });
				await loadStatuses();
			} catch {
				// Deletion errors are non-fatal; reload to show current state
				await loadStatuses();
			}
		},
		[loadStatuses],
	);

	const handleValidate = useCallback(
		async (name: CredentialName): Promise<void> => {
			setValidatingName(name);
			try {
				await apiFetch(`/api/credentials/${name}/validate`, { method: "POST" });
				await loadStatuses();
			} catch {
				// Validation errors update DB state; reload regardless
				await loadStatuses();
			} finally {
				setValidatingName(null);
			}
		},
		[loadStatuses],
	);

	// Build a state map from loaded statuses (or "unknown" for load errors)
	const stateMap: Map<CredentialName, CredentialState | "unknown"> = new Map(
		CREDENTIAL_CATALOG.map((entry) => {
			if (loadError || statuses === null) {
				return [entry.name, "unknown" as const];
			}
			const found = statuses.find((s) => s.name === entry.name);
			return [entry.name, found?.state ?? "absent"];
		}),
	);

	return (
		<div className="flex flex-col gap-[12px]">
			{/* Fail-loud warning for missing root secret */}
			{missingSecret && (
				<div
					className="flex items-start gap-[9px] p-[12px] rounded-[var(--r-subtle)] bg-[color-mix(in_oklab,var(--status-warning)_10%,transparent)]"
					role="alert"
				>
					<span className="type-small text-[var(--status-warning)]  ">
						Encryption secret not configured. Set{" "}
						<code className="type-data  ">HYPERIDLE_CREDENTIAL_KEY</code> to store credentials.
					</span>
				</div>
			)}

			{/* Load error — show neutral chips, not an explosion */}
			{loadError && !missingSecret && (
				<p className="type-small  text-[var(--status-warning)] " role="alert">
					{loadError}
				</p>
			)}

			{/* Credential rows */}
			<ItemList variant="flush" isEmpty={CREDENTIAL_CATALOG.length === 0}>
				{CREDENTIAL_CATALOG.map((entry) => {
					const state = stateMap.get(entry.name) ?? "unknown";
					const isPresent = state !== "absent" && state !== "unknown";
					const isEditing = editingName === entry.name;
					const chipStatus = credentialStateToStatus(state);
					const chipLabel = credentialStateLabel(state);

					return (
						<div key={entry.name} className="flex flex-col">
							<Row
								data-testid={`credential-row-${entry.name}`}
								title={entry.label}
								subtitle={entry.description}
								actions={
									<div className="flex items-center gap-[9px] shrink-0">
										<span data-testid="credential-state-chip">
											<StatusChip status={chipStatus} label={chipLabel} />
										</span>

										{isPresent && entry.testable && (
											<Button
												variant="ghost"
												size="sm"
												disabled={validatingName === entry.name}
												onClick={() => void handleValidate(entry.name)}
											>
												{validatingName === entry.name ? "Validating…" : "Validate"}
											</Button>
										)}

										<Button
											variant="ghost"
											size="sm"
											onClick={() => {
												setEditingName(isEditing ? null : entry.name);
												setEditValue("");
												setSaveError(null);
											}}
										>
											{isPresent ? "Update" : "Set"}
										</Button>

										{isPresent && (
											<Button
												variant="ghost"
												size="sm"
												className="text-[var(--status-error)]"
												onClick={() => void handleDelete(entry.name)}
											>
												Remove
											</Button>
										)}
									</div>
								}
							/>

							{/* Inline edit form — stays as sibling div below Row */}
							{isEditing && (
								<div className="flex flex-col gap-[9px] py-[9px] px-[12px]">
									<Input
										type="password"
										value={editValue}
										onChange={(e) => setEditValue(e.target.value)}
										placeholder={`Enter ${entry.label}`}
									/>
									{saveError && editingName === entry.name && (
										<p className="type-metadata  text-[var(--status-error)] " role="alert">
											{saveError}
										</p>
									)}
									<div className="flex gap-[9px]">
										<Button
											variant="primary"
											size="sm"
											disabled={savingName === entry.name || !editValue.trim()}
											onClick={() => void handleSave(entry.name)}
										>
											{savingName === entry.name ? "Saving…" : "Save"}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => {
												setEditingName(null);
												setEditValue("");
												setSaveError(null);
											}}
										>
											Cancel
										</Button>
									</div>
								</div>
							)}
						</div>
					);
				})}
			</ItemList>
		</div>
	);
}
