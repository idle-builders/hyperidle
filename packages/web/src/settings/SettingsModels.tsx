/**
 * SettingsModels — Model Gateway configuration section.
 *
 * X4: Allows the founder to configure which provider + model handles each
 * of the three model tiers (reasoning, workhorse, fast).
 *
 * - Fetches from GET /api/model-gateway on mount
 * - Renders 3 tier rows (one per ModelTier)
 * - Provider dropdown per tier; shows provider-specific fields
 * - openai-compatible: shows baseUrl + apiKey inputs
 * - openrouter: shows credential status dot (no navigation link — F-ERR-1)
 * - Changes auto-save via PATCH /api/model-gateway (debounced 500ms)
 *
 * @lore X4 DESIGN-DEV-1: Approved design specified collapsible tier rows with a
 * disclosure pattern. Simplified to always-expanded flat layout because 3 items
 * don't benefit from collapse — everything fits on screen without scrolling.
 * Avoids ARIA disclosure complexity (role="button", aria-expanded, focus management)
 * for no measurable UX gain at this item count.
 *
 * @lore X4 F-ERR-1: No navigation link to Credentials section — that section
 * is Electron-only (uses safeStorage bridge). In web/shared mode, credentials
 * for anthropic/openrouter are managed separately. The UI shows hasApiKey
 * status dots for these providers but does not link to credential management.
 *
 * @lore X4 A-SEC-2: GET /api/model-gateway never returns apiKey. The response
 * includes hasApiKey: boolean so the UI can show a status dot without
 * rendering the actual key value. PATCH accepts apiKey only for openai-compatible
 * providers; other providers reject apiKey in the request body.
 */

import { Select } from "@hyperidle/design-system";
import type { ModelProvider } from "@hyperidle/shared";
// hearth-internal-padding
import { MODEL_PROVIDERS } from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModelTier = "reasoning" | "workhorse" | "fast";

interface TierConfigResponse {
	provider: ModelProvider;
	model: string;
	baseUrl?: string;
	hasApiKey: boolean;
}

type GatewayConfigResponse = Record<ModelTier, TierConfigResponse>;

interface TierEditState {
	provider: ModelProvider;
	model: string;
	baseUrl: string;
	apiKey: string;
}

type GatewayEditState = Record<ModelTier, TierEditState>;

const ALL_TIERS: ModelTier[] = ["reasoning", "workhorse", "fast"];

const KNOWN_ANTHROPIC_MODELS = [
	"claude-opus-4-20250514",
	"claude-sonnet-4-20250514",
	"claude-haiku-3-5-20241022",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function responseToEditState(config: GatewayConfigResponse): GatewayEditState {
	return {
		reasoning: {
			provider: config.reasoning.provider,
			model: config.reasoning.model,
			baseUrl: config.reasoning.baseUrl ?? "",
			apiKey: "",
		},
		workhorse: {
			provider: config.workhorse.provider,
			model: config.workhorse.model,
			baseUrl: config.workhorse.baseUrl ?? "",
			apiKey: "",
		},
		fast: {
			provider: config.fast.provider,
			model: config.fast.model,
			baseUrl: config.fast.baseUrl ?? "",
			apiKey: "",
		},
	};
}

function tierLabel(tier: ModelTier): string {
	return tier.charAt(0).toUpperCase() + tier.slice(1);
}

// ---------------------------------------------------------------------------
// TierRow
// ---------------------------------------------------------------------------

interface TierRowProps {
	tier: ModelTier;
	config: TierEditState;
	hasApiKey: boolean;
	onChange: (tier: ModelTier, field: keyof TierEditState, value: string) => void;
}

function TierRow({ tier, config, hasApiKey, onChange }: TierRowProps): JSX.Element {
	const isOpenAiCompatible = config.provider === "openai-compatible";
	const hasCredentialStatus = config.provider === "openrouter" || config.provider === "anthropic";

	return (
		<div className="flex flex-col gap-3 p-[12px] border border-[var(--border-subtle)] rounded-[var(--r-subtle)]">
			<div className="flex items-center gap-[12px] flex-wrap">
				<span className="text-sm font-medium text-[var(--text-primary)] w-[80px] shrink-0">
					{tierLabel(tier)}
				</span>

				{/* Provider select */}
				<div className="form-control flex-1 min-w-[140px]">
					<label className="label" htmlFor={`${tier}-provider`}>
						<span className="label-text text-[var(--text-secondary)] text-[12px]">Provider</span>
					</label>
					<Select
						id={`${tier}-provider`}
						size="sm"
						value={config.provider}
						onChange={(e) => onChange(tier, "provider", e.target.value)}
						aria-label="Provider"
						options={MODEL_PROVIDERS.map((p) => ({ value: p, label: p }))}
					/>
				</div>

				{/* Model input */}
				<div className="form-control flex-1 min-w-[180px]">
					<label className="label" htmlFor={`${tier}-model`}>
						<span className="label-text text-[var(--text-secondary)] text-[12px]">Model</span>
					</label>
					{config.provider === "anthropic" ? (
						<Select
							id={`${tier}-model`}
							size="sm"
							value={config.model}
							onChange={(e) => onChange(tier, "model", e.target.value)}
							aria-label="Model"
							options={KNOWN_ANTHROPIC_MODELS.map((m) => ({ value: m, label: m }))}
						/>
					) : (
						<input
							id={`${tier}-model`}
							type="text"
							className="input input-sm input-bordered"
							value={config.model}
							onChange={(e) => onChange(tier, "model", e.target.value)}
							placeholder="e.g. anthropic/claude-sonnet-4"
							aria-label="Model"
						/>
					)}
				</div>

				{/* Credential status dot for anthropic/openrouter */}
				{hasCredentialStatus && (
					<div className="flex items-center gap-[6px] self-end pb-[6px]">
						<span
							className={`inline-block w-2 h-2 rounded-full ${hasApiKey ? "bg-success" : "bg-warning"}`}
							title={hasApiKey ? "Credential present" : "Credential not configured"}
						/>
						<span className="text-[12px] text-[var(--text-tertiary)]">
							{hasApiKey ? "Credential set" : "No credential"}
						</span>
					</div>
				)}
			</div>

			{/* openai-compatible: baseUrl and apiKey */}
			{isOpenAiCompatible && (
				<div className="flex flex-col gap-3 pl-[80px]">
					<div className="form-control">
						<label className="label" htmlFor={`${tier}-base-url`}>
							<span className="label-text text-[var(--text-secondary)] text-[12px]">Base URL</span>
						</label>
						<input
							id={`${tier}-base-url`}
							type="url"
							className="input input-sm input-bordered"
							value={config.baseUrl}
							onChange={(e) => onChange(tier, "baseUrl", e.target.value)}
							placeholder="https://api.together.xyz/v1"
							aria-label="Base URL"
						/>
					</div>

					<div className="form-control">
						<label className="label" htmlFor={`${tier}-api-key`}>
							<span className="label-text text-[var(--text-secondary)] text-[12px]">API Key</span>
						</label>
						<div className="flex items-center gap-[6px]">
							<input
								id={`${tier}-api-key`}
								type="password"
								className="input input-sm input-bordered flex-1"
								value={config.apiKey}
								onChange={(e) => onChange(tier, "apiKey", e.target.value)}
								placeholder={hasApiKey ? "Key stored — enter to replace" : "Enter API key"}
								aria-label="API Key"
							/>
							{hasApiKey && (
								<span
									className="inline-block w-2 h-2 rounded-full bg-success shrink-0"
									title="API key stored"
								/>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// SettingsModels
// ---------------------------------------------------------------------------

export function SettingsModels(): JSX.Element {
	const { showToast } = useToast();
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [editState, setEditState] = useState<GatewayEditState | null>(null);
	const [hasApiKeyMap, setHasApiKeyMap] = useState<Record<ModelTier, boolean>>({
		reasoning: false,
		workhorse: false,
		fast: false,
	});
	const [saving, setSaving] = useState(false);

	// Debounce timer ref for auto-save
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// ---------------------------------------------------------------------------
	// Load
	// ---------------------------------------------------------------------------

	const loadConfig = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const res = await apiFetch("/api/model-gateway");
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = (await res.json()) as GatewayConfigResponse;
			setEditState(responseToEditState(json));
			setHasApiKeyMap({
				reasoning: json.reasoning.hasApiKey,
				workhorse: json.workhorse.hasApiKey,
				fast: json.fast.hasApiKey,
			});
			setStatus("ready");
		} catch {
			setStatus("error");
		}
	}, []);

	useEffect(() => {
		void loadConfig();
	}, [loadConfig]);

	// ---------------------------------------------------------------------------
	// Save
	// ---------------------------------------------------------------------------

	const saveConfig = useCallback(
		async (state: GatewayEditState): Promise<void> => {
			setSaving(true);
			try {
				// Build the PATCH body — only include apiKey for openai-compatible
				const body = Object.fromEntries(
					ALL_TIERS.map((tier) => {
						const tc = state[tier];
						const tierBody: Record<string, string | undefined> = {
							provider: tc.provider,
							model: tc.model,
						};
						if (tc.provider === "openai-compatible") {
							if (tc.baseUrl) tierBody.baseUrl = tc.baseUrl;
							if (tc.apiKey) tierBody.apiKey = tc.apiKey;
						}
						return [tier, tierBody];
					}),
				);

				const res = await apiFetch("/api/model-gateway", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const saved = (await res.json()) as GatewayConfigResponse;
				// Update hasApiKey map from saved response
				setHasApiKeyMap({
					reasoning: saved.reasoning.hasApiKey,
					workhorse: saved.workhorse.hasApiKey,
					fast: saved.fast.hasApiKey,
				});
				showToast("Models saved");
			} catch {
				showToast("Failed to save model config");
			} finally {
				setSaving(false);
			}
		},
		[showToast],
	);

	// ---------------------------------------------------------------------------
	// Change handler — auto-save with debounce
	// ---------------------------------------------------------------------------

	const handleChange = useCallback(
		(tier: ModelTier, field: keyof TierEditState, value: string): void => {
			setEditState((prev) => {
				if (!prev) return prev;
				const updated = {
					...prev,
					[tier]: { ...prev[tier], [field]: value },
				};

				// Debounce save
				if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
				saveTimerRef.current = setTimeout(() => {
					void saveConfig(updated);
					saveTimerRef.current = null;
				}, 500);

				return updated;
			});
		},
		[saveConfig],
	);

	// Cleanup debounce on unmount
	useEffect(() => {
		return () => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		};
	}, []);

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	if (status === "loading") {
		return (
			<div className="flex flex-col gap-3">
				<div className="skeleton h-[60px] w-full" />
				<div className="skeleton h-[60px] w-full" />
				<div className="skeleton h-[60px] w-full" />
			</div>
		);
	}

	if (status === "error") {
		return (
			<p className="text-sm text-error">Failed to load model configuration. Please try again.</p>
		);
	}

	if (!editState) return <></>;

	return (
		<div className="flex flex-col gap-3">
			{saving && <p className="text-[12px] text-[var(--text-tertiary)]">Saving…</p>}
			{ALL_TIERS.map((tier) => (
				<TierRow
					key={tier}
					tier={tier}
					config={editState[tier]}
					hasApiKey={hasApiKeyMap[tier]}
					onChange={handleChange}
				/>
			))}
		</div>
	);
}
