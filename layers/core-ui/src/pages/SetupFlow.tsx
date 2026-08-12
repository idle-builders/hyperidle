/**
 * SetupFlow — initial setup page at /setup.
 *
 * Simplified single-scroll form. A name, an agent engine, and one optional
 * field (repo path). Team is created silently with defaults. "Start HyperIdle"
 * is disabled until the chosen engine can actually run.
 *
 * Submits:
 * 1. POST /api/users — create human user (name only, no email)
 * 2. POST /api/teams — create first team + primaryHarness (from picker)
 * 3. PUT /api/credentials/:name — built-in gateway key, written before nav
 * 4. PATCH /api/model-gateway — only when that key is for a non-anthropic provider
 * 5. POST /api/filesystems (best-effort, if folder picked)
 * On success: navigate to /work?onboarding=true.
 *
 * @lore P4: Replaces Onboarding.tsx. Single-scroll layout from approved design.
 * @lore R2: Simplified from P4 — removed email, backend mode, team name fields.
 * Team name is derived from repo folder basename or defaults to "My Team".
 * Navigates to /work (was /work/portfolio, was /conversations). AD9: unconditional
 * → /work; WorkOverview handles 1-team short-circuit → team page.
 * @lore visual-parity: Redesigned to match onboarding.html exactly — 3-card
 * abstract visual, step title, step description, left-aligned layout, form-group
 * spacing of 18px, design-system Input + Button components.
 * @lore AE2: Added function selector (preset pills + custom chips) and roster preview.
 * Navigates to /work?onboarding=true to trigger assistant overlay auto-open.
 * @lore AV1: Harness picker added (greyed non-installed rows per Decision 4).
 * derivePrimaryHarness() wired into POST /api/teams body; builtin → omit primaryHarness.
 * Folder → inspect-path + register filesystem (best-effort, writeback:"none").
 * @lore AW1: The standalone Anthropic key field is gone. Credential entry belongs
 * to the built-in gateway row — it is the only harness whose key HyperIdle holds,
 * every CLI harness carries its own login — and it spans all three ModelProviders.
 */

import { Button, Input, Select } from "@hyperidle/design-system";
import type { ModelProvider } from "@hyperidle/domain-model";
import {
	AGENT_ROLE_CATALOG,
	credentialNameForProvider,
	defaultRoster,
	MODEL_PROVIDERS,
	TEAM_FUNCTIONS,
} from "@hyperidle/domain-model";
import {
	derivePrimaryHarness,
	type HarnessCapabilityDescriptor,
} from "@hyperidle/harness-capability";
import {
	type ChangeEvent,
	type FormEvent,
	type JSX,
	useCallback,
	useEffect,
	useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../services/api-fetch.js";

/**
 * AE2: Preset configurations for team function selection.
 * Each preset maps to a set of TEAM_FUNCTIONS that drive defaultRoster().
 */
const PRESETS = [
	{ id: "software", label: "Software", functions: ["development", "product"] },
	{ id: "software_design", label: "Eng+UX", functions: ["development", "product", "design"] },
	{
		id: "full_team",
		label: "Full team",
		functions: ["development", "product", "design", "marketing"],
	},
	{ id: "marketing", label: "Growth", functions: ["marketing"] },
	{ id: "custom", label: "Custom", functions: [] },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

/**
 * Compute the roster preview label string from a set of functions.
 * Returns empty string when functions is empty.
 */
function rosterPreviewLabel(functions: readonly string[]): string {
	if (functions.length === 0) return "";
	const roles = defaultRoster(functions);
	if (roles.length === 0) return "";
	const labels = roles.map((role) => {
		const entry = AGENT_ROLE_CATALOG.find((e) => e.role === role);
		return entry?.label ?? role;
	});
	return `Creates: ${labels.join(", ")}`;
}

// ── Harness picker helpers ────────────────────────────────────────────────────

/**
 * A row is choosable (radio-selectable) when it's builtin OR state === "ready".
 * Missing/unavailable/installed/unauthenticated non-builtin rows are greyed.
 *
 * @lore AV1 Decision 4: greyed rows render but are NOT choosable; the greyed
 * affordance IS the actionable element (install hint), not a dead radio.
 */
function isChoosable(d: HarnessCapabilityDescriptor): boolean {
	if (d.type === "builtin") return true;
	return d.discovery.state === "ready";
}

/** Install-hint copy derived from authAction (greyed rows). */
function installHintText(d: HarnessCapabilityDescriptor): string {
	if (d.authAction.kind === "native_cli_login") return "Install to use";
	if (d.authAction.kind === "enter_api_key") return "Add API key to use";
	return "Not available";
}

/** State hint for choosable rows. */
function stateHintText(d: HarnessCapabilityDescriptor): string {
	if (d.type === "builtin") return "Built-in gateway";
	if (d.discovery.state === "ready") return "Ready";
	if (d.discovery.state === "unauthenticated") return "Sign in to use";
	if (d.discovery.state === "installed") return "Installed – sign in";
	return "Not installed";
}

// ── Built-in gateway providers ────────────────────────────────────────────────

/**
 * How each provider presents itself in the built-in gateway row.
 *
 * `needsEndpoint` marks the provider whose resolver cannot run on a key alone:
 * openai-compatible has no fixed host, so `resolveProvider` demands a baseUrl
 * and throws without one. Collecting it here is what keeps "drop a key" from
 * producing a gateway that fails on its first call.
 */
interface GatewayProviderMeta {
	readonly label: string;
	readonly keyPlaceholder: string;
	readonly needsEndpoint: boolean;
	/** Whether the provider publishes a model catalog we can offer as choices. */
	readonly hasCatalog: boolean;
}

/**
 * Keyed by provider so the lookup is total — a provider added to MODEL_PROVIDERS
 * without presentation here fails to compile rather than falling back to whatever
 * sits first in a list.
 */
const GATEWAY_PROVIDERS = {
	anthropic: {
		label: "Anthropic",
		keyPlaceholder: "sk-ant-...",
		needsEndpoint: false,
		hasCatalog: false,
	},
	openrouter: {
		label: "OpenRouter",
		keyPlaceholder: "sk-or-...",
		needsEndpoint: false,
		hasCatalog: true,
	},
	"openai-compatible": {
		label: "OpenAI-compatible",
		keyPlaceholder: "sk-...",
		needsEndpoint: true,
		hasCatalog: false,
	},
} as const satisfies Record<ModelProvider, GatewayProviderMeta>;

/** A model offered by a provider's public catalog. */
interface CatalogModel {
	readonly id: string;
	readonly label: string;
}

/**
 * OpenRouter's public model list. No key required and it serves
 * `access-control-allow-origin: *`, so the browser reads it directly rather
 * than round-tripping through our server (verified 2026-08-10).
 *
 * ⚠️ UNVERIFIED beyond the shape observed on that date: `{ data: [{ id, name,
 * context_length }] }`. Anything unparsable degrades to a typed model field —
 * setup must never be blocked by a third-party catalog being down.
 * https://openrouter.ai/docs/api-reference/list-available-models
 */
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

function parseOpenRouterCatalog(body: unknown): CatalogModel[] {
	const data = (body as { data?: unknown })?.data;
	if (!Array.isArray(data)) return [];
	return data.flatMap((item): CatalogModel[] => {
		if (typeof item !== "object" || item === null) return [];
		const entry = item as Record<string, unknown>;
		const id = typeof entry.id === "string" ? entry.id : "";
		if (!id) return [];
		return [{ id, label: typeof entry.name === "string" ? entry.name : id }];
	});
}

// ── Folder inspection result ──────────────────────────────────────────────────

interface FolderInfo {
	path: string;
	isGitRepo: boolean;
	branch: string | null;
}

/** Abstract 3-card welcome illustration matching onboarding.html welcome-visual */
function WelcomeVisual(): JSX.Element {
	const dotColors = [
		"var(--accent-primary)",
		"var(--accent-secondary)",
		"var(--status-info)",
	] as const;

	return (
		<div
			data-testid="onboarding-illustration"
			aria-hidden="true"
			className="flex gap-[9px] bg-[var(--surface-page)] rounded-[var(--r-subtle)] p-[12px] mb-[24px]"
		>
			{dotColors.map((dotColor, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static array, stable order
				<div
					key={i}
					className="flex-1 bg-[var(--surface-elevated)] rounded-[var(--r-subtle)] p-[9px]"
				>
					<div className="flex items-center gap-[6px] mb-[6px]">
						<span
							className="block w-[8px] h-[8px] rounded-[var(--r-pill)] shrink-0"
							style={{ background: dotColor }}
						/>
						<span className="block h-[6px] rounded-[var(--r-pill)] bg-[var(--border-subtle)] w-3/5" />
					</div>
					<span className="block h-[6px] bg-[var(--border-subtle)] rounded-[var(--r-pill)] w-[90%] mb-[3px]" />
					<span className="block h-[6px] bg-[var(--border-subtle)] rounded-[var(--r-pill)] w-3/5" />
				</div>
			))}
		</div>
	);
}

export function SetupFlow(): JSX.Element {
	const navigate = useNavigate();

	// Form state
	const [name, setName] = useState("");
	const [repoPath, setRepoPath] = useState("");

	// Built-in gateway credential — provider-scoped, not Anthropic-specific.
	const [gatewayProvider, setGatewayProvider] = useState<ModelProvider>("anthropic");
	const [apiKey, setApiKey] = useState("");
	const [gatewayModel, setGatewayModel] = useState("");
	const [gatewayBaseUrl, setGatewayBaseUrl] = useState("");
	const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
	const [catalogPending, setCatalogPending] = useState(false);

	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	// AE2: function selector state
	// Default preset is "software" (development + product).
	const [selectedPreset, setSelectedPreset] = useState<PresetId>("software");
	// Custom chips — only visible when selectedPreset === "custom".
	const [customFunctions, setCustomFunctions] = useState<string[]>([]);

	// AV1: Harness discovery — fetch on mount; degrade to builtin on failure.
	// @lore AV1: we never block setup on discovery; graceful-degrade to builtin.
	const [descriptors, setDescriptors] = useState<HarnessCapabilityDescriptor[]>([]);
	const [harnessLoaded, setHarnessLoaded] = useState(false);
	// The currently selected primary harness type. "builtin" is the default.
	const [selectedHarnessType, setSelectedHarnessType] = useState<string>("builtin");

	useEffect(() => {
		let cancelled = false;
		apiFetch("/api/harnesses")
			.then(async (res) => {
				if (cancelled) return;
				if (!res.ok) {
					setHarnessLoaded(true);
					return;
				}
				const data = (await res.json()) as HarnessCapabilityDescriptor[];
				if (!cancelled) {
					setDescriptors(Array.isArray(data) ? data : []);
					setHarnessLoaded(true);
				}
			})
			.catch(() => {
				if (!cancelled) setHarnessLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// AV1: Folder inspection result for confirmation row.
	const [folderInfo, setFolderInfo] = useState<FolderInfo | null>(null);

	const providerMeta = GATEWAY_PROVIDERS[gatewayProvider];

	// Fetch the chosen provider's public catalog so the model is picked, never guessed.
	// A failed fetch leaves catalogModels empty, which renders a typed model field.
	//
	// `catalogPending` exists so the field never changes KIND under the user: without
	// it the control renders as a text input while the request is in flight and swaps
	// to a select on arrival, discarding whatever was typed in between.
	useEffect(() => {
		if (!providerMeta.hasCatalog) {
			setCatalogModels([]);
			setCatalogPending(false);
			return;
		}
		let cancelled = false;
		setCatalogPending(true);
		apiFetch(OPENROUTER_MODELS_URL)
			.then(async (res) => (res.ok ? parseOpenRouterCatalog(await res.json()) : []))
			.catch(() => [])
			.then((models) => {
				if (cancelled) return;
				setCatalogModels(models);
				setCatalogPending(false);
			});
		return () => {
			cancelled = true;
		};
	}, [providerMeta.hasCatalog]);

	// Resolved functions array based on current preset selection.
	const resolvedFunctions: readonly string[] =
		selectedPreset === "custom"
			? customFunctions
			: (PRESETS.find((p) => p.id === selectedPreset)?.functions ?? ["development", "product"]);

	const toggleCustomFunction = useCallback((fn: string): void => {
		setCustomFunctions((prev) =>
			prev.includes(fn) ? prev.filter((f) => f !== fn) : [...prev, fn],
		);
	}, []);

	// AE2: submit requires functions when custom is selected (can't have empty roster).
	const functionsValid = selectedPreset !== "custom" || customFunctions.length > 0;

	// Built-in is the only harness whose credential HyperIdle holds; every CLI
	// harness carries its own login, so choosing one asks for no key at all.
	const usingBuiltin = selectedHarnessType === "builtin";
	const builtinDescriptor = descriptors.find((d) => d.type === "builtin");
	// A gateway that already resolved a credential (env or a prior run) needs no re-entry.
	const builtinAlreadyAuthed = builtinDescriptor?.discovery.state === "ready";
	const needsGatewayCredential = usingBuiltin && !builtinAlreadyAuthed;

	// A non-anthropic provider must also name its model — the built-in tier
	// defaults are Anthropic model IDs and mean nothing to another provider.
	const gatewayConfigComplete =
		apiKey.trim().length > 0 &&
		(gatewayProvider === "anthropic" || gatewayModel.trim().length > 0) &&
		(!providerMeta.needsEndpoint || gatewayBaseUrl.trim().length > 0);

	// R2: Start requires a name; the gateway fields only bind when built-in needs them.
	const canStart =
		name.trim().length > 0 &&
		functionsValid &&
		(!needsGatewayCredential || gatewayConfigComplete) &&
		!submitting;

	const handleFolderPick = useCallback(async (): Promise<void> => {
		const folder = await window.__HYPERIDLE__?.shell.selectFolder();
		if (!folder) return;
		setRepoPath(folder);
		// AV1: Probe the picked folder to determine git status + branch for confirm row.
		// Best-effort — failure just clears folderInfo (no confirmation row shown).
		try {
			const res = await apiFetch("/api/filesystems/inspect-path", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: folder }),
			});
			if (res.ok) {
				const info = (await res.json()) as {
					exists: boolean;
					isGitRepo: boolean;
					branch: string | null;
				};
				setFolderInfo({ path: folder, isGitRepo: info.isGitRepo, branch: info.branch });
			} else {
				setFolderInfo({ path: folder, isGitRepo: false, branch: null });
			}
		} catch {
			setFolderInfo({ path: folder, isGitRepo: false, branch: null });
		}
	}, []);

	// AV1: Derive the primaryHarness from the chosen picker row.
	// builtin is always present; derivePrimaryHarness is called on non-builtin ready descriptors.
	// When builtin is chosen, primaryHarness is omitted from the POST body (builtin is the default).
	const chosenDescriptor = descriptors.find((d) => d.type === selectedHarnessType);

	// AE2: Submit and navigate to /work?onboarding=true (AD9: was /work/portfolio)
	const handleSubmit = useCallback(
		async (e: FormEvent): Promise<void> => {
			e.preventDefault();
			if (!canStart) return;

			setSubmitting(true);
			setSubmitError(null);

			try {
				// Step 1: Create human user (no email)
				const userRes = await apiFetch("/api/users", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: name.trim() }),
				});

				if (!userRes.ok) {
					const body = (await userRes.json().catch(() => null)) as { error?: string } | null;
					throw new Error(body?.error ?? `Failed to create user (${userRes.status})`);
				}

				// AE2: Capture userId from user creation response to seed welcome message.
				// AK6 P4 CRITICAL-1: POST /api/users returns { user: { id, ... } } on both
				// 201 and 200 paths. Read .user.id — not the former flat .id.
				const userBody = (await userRes.json().catch(() => null)) as {
					user?: { id?: string };
				} | null;
				const createdUserId = userBody?.user?.id ?? undefined;

				// Step 2: Create first team — derive name from repo path or default
				// @lore R2: team name is not user-visible in setup. Derive from repo
				// folder basename if a path was given; otherwise use "My Team".
				// Z8-158: split on both / and \ to handle Windows paths (C:\repos\app).
				const derivedTeamName = repoPath.trim()
					? (repoPath.trim().split(/[/\\]/).filter(Boolean).pop() ?? "My Team")
					: "My Team";

				// AV1: Build primaryHarness for non-builtin choosable selections.
				// builtin → omit (the server default is builtin; omitting avoids polluting the
				// teams row with builtin values when users haven't explicitly picked anything).
				const primaryHarness =
					chosenDescriptor !== undefined && chosenDescriptor.type !== "builtin"
						? derivePrimaryHarness(chosenDescriptor)
						: undefined;

				const teamRes = await apiFetch("/api/teams", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: derivedTeamName,
						repoPath: repoPath.trim() || undefined,
						// AE2: pass resolved functions and userId for welcome message seeding.
						functions: [...resolvedFunctions],
						userId: createdUserId,
						// AV1: thread primaryHarness (omit when builtin so server applies builtin fallback)
						...(primaryHarness !== undefined ? { primaryHarness } : {}),
					}),
				});

				if (!teamRes.ok) {
					const body = (await teamRes.json().catch(() => null)) as { error?: string } | null;
					throw new Error(body?.error ?? `Failed to create team (${teamRes.status})`);
				}

				// Capture teamId for filesystem registration below.
				const teamBody = (await teamRes.json().catch(() => null)) as {
					team?: { id?: string };
				} | null;
				const createdTeamId = teamBody?.team?.id ?? undefined;

				// Step 3: Write the built-in gateway's key via HTTP (AH1 §5).
				// @lore AH1: Replaced bridge write (window.__HYPERIDLE__.credentials.set)
				// with HTTP write. apiFetch works in desktop-local AND web/E2E.
				// The DB write is the runtime + Settings truth.
				// The bridge mirror is dropped — no surviving non-resolution reader
				// of the safeStorage credential value after AH1 §3 resolver swap.
				// @lore AV1 AC4b: key PUT completes BEFORE navigate — ordering guarantee.
				// @lore AW1: the credential NAME follows the chosen provider. Writing an
				// OpenRouter key to anthropic_api_key stores it where nothing reads it.
				if (needsGatewayCredential && apiKey.trim()) {
					await apiFetch(`/api/credentials/${credentialNameForProvider(gatewayProvider)}`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ value: apiKey.trim() }),
					});

					// @lore AW1: storing the key is only half the wiring. BUILT_IN_GATEWAY_CONFIG
					// points every tier at an Anthropic model, so a key for any other provider
					// would sit unread while the gateway kept calling Anthropic and failing on a
					// missing anthropic_api_key. Repoint the tiers at the provider the key is for.
					if (gatewayProvider !== "anthropic") {
						const tier = {
							provider: gatewayProvider,
							model: gatewayModel.trim(),
							...(providerMeta.needsEndpoint ? { baseUrl: gatewayBaseUrl.trim() } : {}),
						};
						await apiFetch("/api/model-gateway", {
							method: "PATCH",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ reasoning: tier, workhorse: tier, fast: tier }),
						});
					}
				}

				// Step 4 (best-effort): Register folder as filesystem.
				// @lore AV1 Decision 3: inspect result determines kind (code+branch | doc_set).
				// writeback:"none" is the literal — WRITEBACK_MODES[0] is "git", never use index-0.
				// Failure is swallowed: team creation already succeeded.
				if (createdTeamId && repoPath.trim()) {
					const path = repoPath.trim();
					// Re-inspect if folderInfo is stale or wasn't fetched (typed path, not picked).
					let info = folderInfo?.path === path ? folderInfo : null;
					if (info === null) {
						try {
							const inspectRes = await apiFetch("/api/filesystems/inspect-path", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ path }),
							});
							if (inspectRes.ok) {
								const raw = (await inspectRes.json()) as {
									exists: boolean;
									isGitRepo: boolean;
									branch: string | null;
								};
								info = { path, isGitRepo: raw.isGitRepo, branch: raw.branch };
							}
						} catch {
							// inspection failed — degrade to doc_set
						}
					}

					try {
						const branch = info?.branch ?? null;
						const isCode = info?.isGitRepo === true && branch != null && branch !== "";
						const resourceRef = isCode
							? { kind: "code", repo: path, branch }
							: { kind: "doc_set", folder: path };

						await apiFetch("/api/filesystems", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								teamId: createdTeamId,
								kind: isCode ? "code" : "doc_set",
								resourceRef,
								writeback: "none",
								connectionId: null,
							}),
						});
					} catch {
						// filesystem registration is best-effort; swallow failure
					}
				}

				// AE2: Navigate to /work?onboarding=true to trigger assistant overlay auto-open.
				// AD9: was /work/portfolio; WorkOverview handles 1-team short-circuit.
				navigate("/work?onboarding=true");
			} catch (err: unknown) {
				setSubmitError(err instanceof Error ? err.message : "Something went wrong");
				setSubmitting(false);
			}
		},
		[
			canStart,
			name,
			repoPath,
			apiKey,
			resolvedFunctions,
			navigate,
			chosenDescriptor,
			folderInfo,
			needsGatewayCredential,
			gatewayProvider,
			gatewayModel,
			gatewayBaseUrl,
			providerMeta.needsEndpoint,
		],
	);

	return (
		<div className="flex items-center justify-center min-h-screen bg-[var(--surface-page)] p-[24px]">
			{/* W3 AC-53: Card with shadow */}
			<div
				data-testid="onboarding-card"
				className="w-full max-w-[520px] bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-elevated)] p-[48px]"
			>
				{/* Brand + tagline */}
				<div
					data-testid="onboarding-brand"
					className="text-[20px] font-[700] text-[var(--text-primary)] tracking-[-0.01em] mb-[6px]"
				>
					HyperIdle
				</div>
				<p className="text-[15px] text-[var(--text-secondary)] leading-[1.7] mb-[36px]">
					Your agentic operating system. Humans steer, agents build.
				</p>

				{/* W3 AC-53: Abstract 3-card illustration */}
				<WelcomeVisual />

				{/* Step heading */}
				<p className="text-[20px] font-[600] text-[var(--text-primary)] tracking-[-0.01em] mb-[9px]">
					Set up your workspace
				</p>
				<p className="text-[15px] text-[var(--text-secondary)] leading-[1.7] mb-[24px]">
					Tell us your name and pick the engine your agents think with. Bring an API key, or use a
					coding CLI you are already signed in to.
				</p>

				<form onSubmit={handleSubmit} className="flex flex-col">
					{/* W3 AC-54: "Your name" label (required) */}
					<div className="mb-[18px]">
						<Input
							id="setup-name"
							label="Your name"
							type="text"
							placeholder="Your name"
							value={name}
							onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
							required
							autoFocus
						/>
					</div>

					{/* AV1: Harness picker — agent engine selection */}
					<div className="mb-[18px]" role="radiogroup" aria-label="Agent harness">
						<p className="text-[13px] font-[500] text-[var(--text-primary)] mb-[6px]">
							Agent harness{" "}
							<span className="font-[400] text-[var(--text-tertiary)]">
								(the default engine for every agent on your team)
							</span>
						</p>
						{/* ONE bordered container with hairline-divided rows — same as SettingsHarnesses */}
						<div className="border border-[var(--border-subtle)] rounded-[var(--r-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)] overflow-hidden">
							{/* Built-in row — always first, always choosable. Owns its own
							    credential entry: this is the one harness whose key we hold. */}
							<div data-testid="harness-row-builtin">
								<label className="flex items-center gap-[9px] px-[12px] py-[12px] cursor-pointer">
									<input
										type="radio"
										data-testid="harness-radio-builtin"
										// The row's status line mentions the credential; without an
										// explicit label the radio's accessible name swallows it whole.
										aria-label="Built-in gateway"
										name="primary-harness"
										value="builtin"
										checked={usingBuiltin}
										onChange={() => setSelectedHarnessType("builtin")}
										className="shrink-0"
									/>
									<div className="flex-1 min-w-0">
										<span className="text-[14px] font-[600] text-[var(--text-primary)] leading-[1.2]">
											Built-in gateway
										</span>
										<p className="text-[12px] text-[var(--text-tertiary)] leading-[1.4] mt-[3px]">
											{builtinAlreadyAuthed
												? "Ready — using the credential already on this machine"
												: "Bring your own model credentials"}
										</p>
									</div>
								</label>

								{/* Credential fields belong to this row, and appear only when it
								    is the chosen engine and no key is already resolved. */}
								{needsGatewayCredential && (
									<div className="flex flex-col gap-[12px] px-[12px] pb-[12px] pl-[36px]">
										<Select
											id="setup-gateway-provider"
											label="Provider"
											size="sm"
											value={gatewayProvider}
											options={MODEL_PROVIDERS.map((p) => ({
												value: p,
												label: GATEWAY_PROVIDERS[p].label,
											}))}
											onChange={(e: ChangeEvent<HTMLSelectElement>) => {
												setGatewayProvider(e.target.value as ModelProvider);
												// A model ID is provider-specific; carrying one across
												// providers would send a slug the next one cannot resolve.
												setGatewayModel("");
											}}
										/>

										{providerMeta.needsEndpoint && (
											<Input
												id="setup-gateway-base-url"
												label="Base URL"
												type="url"
												placeholder="https://api.together.xyz/v1"
												value={gatewayBaseUrl}
												onChange={(e: ChangeEvent<HTMLInputElement>) =>
													setGatewayBaseUrl(e.target.value)
												}
												hint="The endpoint your provider serves the OpenAI API on."
												required
											/>
										)}

										<Input
											id="setup-api-key"
											label={`${providerMeta.label} API key`}
											type="password"
											placeholder={providerMeta.keyPlaceholder}
											value={apiKey}
											onChange={(e: ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
											hint="Your key stays on this device."
											required
										/>

										{/* Anthropic ships with tier defaults; every other provider
										    has to be told which model to run. */}
										{gatewayProvider !== "anthropic" &&
											(catalogPending ? (
												<Select
													id="setup-gateway-model"
													label="Model"
													size="sm"
													placeholder="Loading models…"
													value=""
													options={[]}
													disabled
													onChange={() => undefined}
												/>
											) : catalogModels.length > 0 ? (
												<Select
													id="setup-gateway-model"
													label="Model"
													size="sm"
													placeholder="Choose a model"
													value={gatewayModel}
													options={catalogModels.map((m) => ({ value: m.id, label: m.label }))}
													onChange={(e: ChangeEvent<HTMLSelectElement>) =>
														setGatewayModel(e.target.value)
													}
												/>
											) : (
												<Input
													id="setup-gateway-model"
													label="Model"
													type="text"
													placeholder="anthropic/claude-opus-5"
													value={gatewayModel}
													onChange={(e: ChangeEvent<HTMLInputElement>) =>
														setGatewayModel(e.target.value)
													}
													hint="The model ID your provider publishes."
													required
												/>
											))}
									</div>
								)}
							</div>
							{/* Discovered harness rows — rendered after discovery resolves */}
							{harnessLoaded &&
								descriptors
									.filter((d) => d.type !== "builtin")
									.map((d) => {
										const choosable = isChoosable(d);
										const isSelected = selectedHarnessType === d.type;
										return (
											<div key={d.type}>
												<div className="h-px bg-[var(--border-subtle)]" />
												{choosable ? (
													<label
														data-testid={`harness-row-${d.type}`}
														className="flex items-center gap-[9px] px-[12px] py-[12px] cursor-pointer"
													>
														<input
															type="radio"
															data-testid={`harness-radio-${d.type}`}
															name="primary-harness"
															value={d.type}
															checked={isSelected}
															onChange={() => setSelectedHarnessType(d.type)}
															className="shrink-0"
														/>
														<div className="flex-1 min-w-0">
															<span className="text-[14px] font-[600] leading-[1.2] text-[var(--text-primary)]">
																{d.name}
															</span>
															<p className="text-[12px] text-[var(--text-tertiary)] leading-[1.4] mt-[3px]">
																{stateHintText(d)}
															</p>
														</div>
													</label>
												) : (
													<div
														data-testid={`harness-row-${d.type}`}
														aria-disabled="true"
														className="flex items-center gap-[9px] px-[12px] py-[12px] opacity-60"
													>
														<span className="shrink-0 w-[16px] h-[16px]" aria-hidden="true" />
														<div className="flex-1 min-w-0">
															<span className="text-[14px] font-[600] leading-[1.2] text-[var(--text-secondary)]">
																{d.name}
															</span>
															<p className="text-[12px] text-[var(--text-tertiary)] leading-[1.4] mt-[3px]">
																{installHintText(d)}
															</p>
														</div>
													</div>
												)}
											</div>
										);
									})}
						</div>
					</div>

					{/* Repo path (optional) */}
					<div className="mb-[18px]">
						<div className="flex flex-col gap-[6px]">
							<label
								htmlFor="setup-repo"
								className="text-[13px] font-[500] text-[var(--text-primary)]"
							>
								Project folder{" "}
								<span className="font-[400] text-[var(--text-tertiary)]">(optional)</span>
							</label>
							{/*
							 * @lore AZ7 B2 (review round 1): was a hand-rolled <input>
							 * reproducing Input's own recipe (bg-surface-elevated,
							 * border-default 1.5px, rounded-default) plus a raw hex-alpha
							 * focus shadow instead of the --accent-primary-dim token, with
							 * the "browse folder" button absolutely positioned INSIDE the
							 * input's padding. Migrated to the design-system Input; the
							 * browse button moves beside the field (Button size="icon")
							 * instead of overlaying it — same affordance, no bespoke
							 * conditional padding needed to keep text clear of the icon.
							 */}
							<div className="flex items-center gap-[6px]">
								{window.__HYPERIDLE__?.shell?.selectFolder && (
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label="Browse for folder"
										onClick={handleFolderPick}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
											aria-hidden="true"
										>
											<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
										</svg>
									</Button>
								)}
								<Input
									id="setup-repo"
									type="text"
									className="flex-1"
									placeholder="/Users/you/my-project"
									value={repoPath}
									onChange={(e) => setRepoPath(e.target.value)}
								/>
							</div>
							<span className="text-[12px] text-[var(--text-tertiary)]">
								Path to a git repository for agents to work in.
							</span>
							{/* AV1 Step B: Folder confirm row — shows after folder picked/detected */}
							{folderInfo && (
								<div className="flex items-center gap-[6px] mt-[3px]">
									<span className="font-[family-name:var(--font-mono)] text-[13px] text-[var(--text-primary)]">
										{folderInfo.path.split(/[/\\]/).filter(Boolean).pop() ?? folderInfo.path}
									</span>
									{folderInfo.isGitRepo && folderInfo.branch ? (
										<span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-tertiary)]">
											@{folderInfo.branch}
										</span>
									) : (
										<span className="text-[11px] text-[var(--text-tertiary)]">folder</span>
									)}
								</div>
							)}
						</div>
					</div>

					{/* AE2: Function selector — preset pills */}
					<div className="mb-[18px]">
						<p className="text-[13px] font-[500] text-[var(--text-primary)] mb-[6px]">
							What are you building?{" "}
							<span className="font-[400] text-[var(--text-tertiary)]">(pick a team type)</span>
						</p>
						<div className="flex flex-wrap gap-[6px] mb-[9px]">
							{PRESETS.map((preset) => {
								const isSelected = selectedPreset === preset.id;
								return (
									<button
										key={preset.id}
										type="button"
										aria-pressed={isSelected}
										data-selected={isSelected ? "true" : undefined}
										onClick={() => {
											setSelectedPreset(preset.id);
											// Reset custom chips when switching away from custom.
											if (preset.id !== "custom") {
												setCustomFunctions([]);
											}
										}}
										// A pressed/selected TOGGLE in a preset picker group, not an
										// action Button (Button has no built-in pressed/selected
										// treatment distinct from its 4 action variants).
										className={[
											"min-h-[44px] px-[12px] py-[9px] rounded-[var(--r-pill)] text-[13px] font-[500]",
											"border-[1.5px] transition-[border-color,background-color] duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
											isSelected
												? // eslint-disable-next-line design/no-handrolled-control -- see comment above
													"border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
												: "border-[var(--border-default)] bg-[var(--surface-elevated)] text-[var(--text-primary)] hover:border-[var(--border-strong)]",
										].join(" ")}
									>
										{preset.label}
									</button>
								);
							})}
						</div>

						{/* AE2: Custom function chips — visible only when Custom is selected */}
						{selectedPreset === "custom" && (
							<div className="flex flex-wrap gap-[6px] mb-[9px]">
								{TEAM_FUNCTIONS.map((fn) => {
									const isActive = customFunctions.includes(fn);
									return (
										<button
											key={fn}
											type="button"
											aria-pressed={isActive}
											onClick={() => toggleCustomFunction(fn)}
											className={[
												"min-h-[44px] px-[12px] py-[9px] rounded-[var(--r-subtle)] text-[13px] capitalize",
												"border-[1.5px] transition-[border-color,background-color] duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
												isActive
													? "border-[var(--accent-deep)] bg-[var(--surface-elevated)] text-[var(--accent-deep)] font-[600]"
													: "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-default)]",
											].join(" ")}
										>
											{fn}
										</button>
									);
								})}
							</div>
						)}

						{/* AE2: Roster preview */}
						<p
							data-testid="roster-preview"
							className="text-[12px] text-[var(--text-tertiary)] min-h-[18px]"
						>
							{rosterPreviewLabel(resolvedFunctions)}
						</p>
					</div>

					{/* Validation / submit error */}
					{submitError && (
						<p
							role="alert"
							aria-live="polite"
							className="text-[13px] text-[var(--status-error)] mb-[18px]"
						>
							{submitError}
						</p>
					)}

					{/* Submit — left-aligned, no border separator */}
					<div>
						<Button type="submit" variant="primary" disabled={!canStart}>
							{submitting && <span className="loading loading-spinner loading-xs" />}
							Start HyperIdle
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}
