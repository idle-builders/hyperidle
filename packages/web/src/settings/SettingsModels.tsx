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

import { ErrorState, Input, Select, SkeletonList, StatusChip } from "@hyperidle/design-system";
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

// AH2: Updated to current catalog IDs. These power the system-level tier config
// (not per-agent model selection — that uses MODEL_CATALOG from @hyperidle/shared).
const KNOWN_ANTHROPIC_MODELS = [
	"claude-opus-4-8",
	"claude-sonnet-4-6",
	"claude-haiku-4-5",
	"claude-fable-5",
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
		<div className="flex flex-col gap-[12px] p-[12px] border border-[var(--border-subtle)] rounded-[var(--r-subtle)]">
			<div className="flex items-center gap-[12px] flex-wrap">
				<span className="text-[13px] font-medium text-[var(--text-primary)] w-[80px] shrink-0">
					{tierLabel(tier)}
				</span>

				{/* Provider select */}
				<div className="flex-1 min-w-[140px]">
					<Select
						id={`${tier}-provider`}
						label="Provider"
						size="sm"
						value={config.provider}
						onChange={(e) => onChange(tier, "provider", e.target.value)}
						aria-label="Provider"
						options={MODEL_PROVIDERS.map((p) => ({ value: p, label: p }))}
					/>
				</div>

				{/* Model input */}
				<div className="flex-1 min-w-[180px]">
					{config.provider === "anthropic" ? (
						<Select
							id={`${tier}-model`}
							label="Model"
							size="sm"
							value={config.model}
							onChange={(e) => onChange(tier, "model", e.target.value)}
							aria-label="Model"
							options={KNOWN_ANTHROPIC_MODELS.map((m) => ({ value: m, label: m }))}
						/>
					) : (
						<Input
							id={`${tier}-model`}
							label="Model"
							type="text"
							value={config.model}
							onChange={(e) => onChange(tier, "model", e.target.value)}
							placeholder="e.g. anthropic/claude-sonnet-4"
							aria-label="Model"
						/>
					)}
				</div>

				{/* Credential status chip for anthropic/openrouter.
				 * @lore AG7: "No credential" uses neutral "unknown" visual (grey chip)
				 * per design §1.9 (absence is not an error). StatusChip handles any
				 * string not in KNOWN_STATUSES by rendering the "unknown" style —
				 * this is the documented runtime escape hatch (StatusChip.tsx lore). */}
				{hasCredentialStatus && (
					<div className="self-end pb-[6px]">
						<StatusChip
							status={hasApiKey ? "healthy" : "unknown"}
							label={hasApiKey ? "Credential set" : "No credential"}
						/>
					</div>
				)}
			</div>

			{/* openai-compatible: baseUrl and apiKey */}
			{isOpenAiCompatible && (
				<div className="pl-[36px]">
					<div className="flex flex-col gap-[12px] pl-[48px]">
						<Input
							id={`${tier}-base-url`}
							label="Base URL"
							type="url"
							value={config.baseUrl}
							onChange={(e) => onChange(tier, "baseUrl", e.target.value)}
							placeholder="https://api.together.xyz/v1"
							aria-label="Base URL"
						/>

						<div className="flex items-center gap-[6px]">
							<div className="flex-1">
								<Input
									id={`${tier}-api-key`}
									label="API Key"
									type="password"
									value={config.apiKey}
									onChange={(e) => onChange(tier, "apiKey", e.target.value)}
									placeholder={hasApiKey ? "Key stored — enter to replace" : "Enter API key"}
									aria-label="API Key"
								/>
							</div>
							{hasApiKey && (
								<div className="self-end pb-[3px]">
									<StatusChip status="healthy" label="Stored" />
								</div>
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
		return <SkeletonList rows={3} ariaLabel="Loading model config" />;
	}

	if (status === "error") {
		return (
			<ErrorState
				compact
				title="Couldn't load model config"
				description="Failed to load model configuration. Please try again."
				onRetry={() => void loadConfig()}
			/>
		);
	}

	if (!editState) return <></>;

	return (
		<div className="flex flex-col gap-[12px]">
			{/* AH2: System default helper copy — clarifies scope */}
			<p className="text-[12px] text-[var(--text-tertiary)]">
				System default models. Used only when an agent has no per-agent model configured. Set
				per-agent models in Settings → Agents.
			</p>
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
