/**
 * AB3 — AgentSetupDialog: 3-step wizard for creating agents from the WorkTeam page.
 *
 * Steps:
 *   1. Role — select from 3 preset roles + Custom (with role sub-select)
 *   2. Identity — agent name (unique within team) + soul prompt textarea
 *   3. Harness & Model Tier — select execution harness + model tier
 *
 * After creation: success state with next-step links.
 *
 * @lore AB3: teamMembersId is data.teamMembers.id (team_members table PK),
 * NOT data.team.id. The POST /api/agents teamId field references users.teamId
 * which is a FK to team_members.id. Getting this wrong creates orphaned agents.
 *
 * @lore AB3: "Custom" is not a valid UserRole. When Custom is selected, a
 * sub-select appears so the user picks a real role (builder | growth | brand_voice).
 * The API call always sends a valid UserRole value.
 *
 * @lore AB3: Template fetch uses AbortController to prevent stale responses
 * from rapid role changes overwriting the current selection.
 *
 * @lore AB3: Dialog uses native <dialog> with showModal(). JSDOM (used by
 * Vitest/JSDOM) does not implement showModal() so we fall back to
 * setAttribute("open", "") — same pattern as BetCreateDialog.
 *
 * @lore AB3: Single <dialog> element with conditional content. Using two
 * separate <dialog> elements (one for wizard, one for success) causes the
 * first dialog to remain open in the DOM when the second renders, since
 * React remounts the ref onto the new element without calling showModal().
 */

// hearth-internal-padding
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../services/api-fetch.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Harness option derived from GET /api/workers AdapterInfo */
interface HarnessOption {
	type: string;
	name: string;
}

/** Gateway tier config derived from GET /api/model-gateway */
interface GatewayTierConfig {
	provider: string;
	model: string;
	baseUrl?: string;
	hasApiKey: boolean;
}

type GatewayConfig = Record<string, GatewayTierConfig>;

/** Role preset for Step 1 */
interface RolePreset {
	id: string; // USER_ROLES value or "custom"
	name: string;
	description: string;
	initials: string;
	hasTemplate: boolean;
}

const ROLE_PRESETS: readonly RolePreset[] = [
	{
		id: "product_manager",
		name: "Product Manager",
		description: "Shapes bets, writes pitches, defines done conditions",
		initials: "PM",
		hasTemplate: true,
	},
	{
		id: "practice_facilitator",
		name: "Practice Facilitator",
		description: "Curates knowledge, coaches skills, maintains standards",
		initials: "PF",
		hasTemplate: true,
	},
	{
		id: "chief_of_staff",
		name: "Chief of Staff",
		description: "Cross-team patterns, obstacle reports, principle stewardship",
		initials: "CS",
		hasTemplate: true,
	},
	{
		id: "custom",
		name: "Custom",
		description: "Write your own soul prompt for a specialized agent",
		initials: "?",
		hasTemplate: false,
	},
] as const;

/** Custom role options — valid UserRole values shown as sub-select when Custom is picked */
const CUSTOM_ROLE_OPTIONS = ["builder", "growth", "brand_voice"] as const;

type WizardStep = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AgentSetupDialogProps {
	open: boolean;
	onClose: () => void;
	onCreated: () => void;
	/** team_members.id — passed to POST /api/agents as teamId */
	teamMembersId: string;
	/** Existing agent names on this team — for uniqueness validation */
	existingAgentNames: string[];
	/**
	 * Called when the user clicks "View in settings" in the success state.
	 * If provided, called before onCreated + onClose.
	 */
	onViewInSettings?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentSetupDialog({
	open,
	onClose,
	onCreated,
	teamMembersId,
	existingAgentNames,
	onViewInSettings,
}: AgentSetupDialogProps): JSX.Element {
	const dialogRef = useRef<HTMLDialogElement>(null);

	// Wizard navigation
	const [step, setStep] = useState<WizardStep>(1);

	// Step 1 state
	const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
	const [customRoleValue, setCustomRoleValue] = useState<string>("builder");

	// Step 2 state
	const [agentName, setAgentName] = useState("");
	const [soulPrompt, setSoulPrompt] = useState("");

	// Step 3 state
	const [harnessType, setHarnessType] = useState("");
	const [modelTier, setModelTier] = useState("workhorse");

	// Fetched data
	const [workers, setWorkers] = useState<HarnessOption[]>([]);
	const [workersLoading, setWorkersLoading] = useState(false);
	const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig | null>(null);
	const [templateLoading, setTemplateLoading] = useState(false);

	// Submission
	const [creating, setCreating] = useState(false);
	const [created, setCreated] = useState(false);
	const [createdAgentName, setCreatedAgentName] = useState("");
	const [createdRole, setCreatedRole] = useState("");
	const [submitError, setSubmitError] = useState<string | null>(null);

	// AbortController for template fetches (prevent race conditions on rapid role changes)
	const templateAbortRef = useRef<AbortController | null>(null);

	// ---------------------------------------------------------------------------
	// Dialog lifecycle — mirrors BetCreateDialog pattern exactly
	// ---------------------------------------------------------------------------
	useEffect(() => {
		if (!dialogRef.current) return;
		if (open) {
			// Reset all state on open
			setStep(1);
			setSelectedRoleId(null);
			setCustomRoleValue("builder");
			setAgentName("");
			setSoulPrompt("");
			setHarnessType("");
			setModelTier("workhorse");
			setWorkers([]);
			setWorkersLoading(false);
			setGatewayConfig(null);
			setTemplateLoading(false);
			setCreating(false);
			setCreated(false);
			setCreatedAgentName("");
			setCreatedRole("");
			setSubmitError(null);

			if (!dialogRef.current.open) {
				if (typeof dialogRef.current.showModal === "function") {
					dialogRef.current.showModal();
				} else {
					dialogRef.current.setAttribute("open", "");
				}
			}
		} else if (dialogRef.current.open) {
			if (typeof dialogRef.current.close === "function") {
				dialogRef.current.close();
			} else {
				dialogRef.current.removeAttribute("open");
			}
		}
	}, [open]);

	// ---------------------------------------------------------------------------
	// Fetch workers + gateway on open (parallel)
	// ---------------------------------------------------------------------------
	useEffect(() => {
		if (!open) return;

		setWorkersLoading(true);

		const fetchWorkers = async (): Promise<void> => {
			try {
				const res = await apiFetch("/api/workers");
				if (!res.ok) return;
				const data = (await res.json()) as Array<{
					id: string;
					name: string;
					type: string;
					paused: boolean;
				}>;
				const available = data
					.filter((w) => !w.paused)
					.map((w) => ({ type: w.type, name: w.name }));
				setWorkers(available);
				if (available.length > 0 && available[0]) {
					setHarnessType(available[0].type);
				}
			} catch {
				// best-effort — workers may be unavailable
			} finally {
				setWorkersLoading(false);
			}
		};

		const fetchGateway = async (): Promise<void> => {
			try {
				const res = await apiFetch("/api/model-gateway");
				if (!res.ok) return;
				const data = (await res.json()) as GatewayConfig;
				setGatewayConfig(data);
			} catch {
				// best-effort
			}
		};

		void fetchWorkers();
		void fetchGateway();
	}, [open]);

	// ---------------------------------------------------------------------------
	// Escape key closes dialog
	// ---------------------------------------------------------------------------
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [open, onClose]);

	// ---------------------------------------------------------------------------
	// Template fetch on role select
	// ---------------------------------------------------------------------------
	const fetchTemplate = useCallback(async (roleId: string): Promise<void> => {
		// Abort any in-flight template fetch
		if (templateAbortRef.current) {
			templateAbortRef.current.abort();
		}
		const controller = new AbortController();
		templateAbortRef.current = controller;

		setTemplateLoading(true);
		setSoulPrompt(""); // clear while loading

		try {
			const res = await apiFetch(`/api/agents/templates/${encodeURIComponent(roleId)}`, {
				signal: controller.signal,
			});
			if (!res.ok) {
				// No template for this role — leave empty
				return;
			}
			const data = (await res.json()) as { role: string; content: string };
			setSoulPrompt(data.content);
		} catch (err) {
			// Ignore abort errors — expected on rapid role changes
			if (err instanceof Error && err.name === "AbortError") return;
			// Leave soul prompt empty on other errors
		} finally {
			if (templateAbortRef.current === controller) {
				templateAbortRef.current = null;
				setTemplateLoading(false);
			}
		}
	}, []);

	// ---------------------------------------------------------------------------
	// Role card selection
	// ---------------------------------------------------------------------------
	const handleRoleSelect = useCallback(
		(roleId: string): void => {
			setSelectedRoleId(roleId);
			if (roleId !== "custom") {
				void fetchTemplate(roleId);
			} else {
				// Custom: clear soul prompt, abort any pending template fetch
				if (templateAbortRef.current) {
					templateAbortRef.current.abort();
					templateAbortRef.current = null;
				}
				setTemplateLoading(false);
				setSoulPrompt("");
			}
		},
		[fetchTemplate],
	);

	// ---------------------------------------------------------------------------
	// Validation helpers
	// ---------------------------------------------------------------------------
	const nameIsEmpty = agentName.trim().length === 0;
	const nameAlreadyExists = existingAgentNames.some(
		(n) => n.toLowerCase() === agentName.trim().toLowerCase(),
	);
	const nameIsValid = !nameIsEmpty && !nameAlreadyExists;

	const noHarnessAvailable = !workersLoading && workers.length === 0;

	// Tier validation: check if selected tier has a configured provider + API key
	const tierIsConfigured = (tier: string): boolean => {
		if (!gatewayConfig) return true; // optimistic while loading
		const config = gatewayConfig[tier];
		if (!config) return false;
		const { provider, hasApiKey } = config;
		if (provider === "none" || !provider) return false;
		return hasApiKey;
	};

	const selectedTierConfigured = tierIsConfigured(modelTier);

	// The actual UserRole to send — "custom" maps to the sub-select value
	const resolvedRole =
		selectedRoleId === "custom" ? customRoleValue : (selectedRoleId ?? "builder");

	// ---------------------------------------------------------------------------
	// Submit
	// ---------------------------------------------------------------------------
	const handleCreate = async (): Promise<void> => {
		if (!nameIsValid || noHarnessAvailable) return;
		setCreating(true);
		setSubmitError(null);

		try {
			const res = await apiFetch("/api/agents", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: agentName.trim(),
					role: resolvedRole,
					soulPrompt: soulPrompt || null,
					harnessType: harnessType || null,
					modelTierPreference: modelTier || null,
					maxConcurrentSessions: 1,
					teamId: teamMembersId,
				}),
			});

			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				setSubmitError(data.error ?? `Failed to create agent: ${res.status}`);
				setCreating(false);
				return;
			}

			// Snapshot the values we need for the success state before they reset
			setCreatedAgentName(agentName.trim());
			setCreatedRole(resolvedRole);
			setCreating(false);
			// onCreated() is called when the user explicitly dismisses (Done / next-step links)
			setCreated(true);
		} catch {
			setSubmitError("Failed to create agent. Please try again.");
			setCreating(false);
		}
	};

	// ---------------------------------------------------------------------------
	// Render helpers
	// ---------------------------------------------------------------------------

	/** Stepper dot */
	const StepDot = ({ dotStep }: { dotStep: WizardStep }): JSX.Element => {
		const isDone = step > dotStep;
		const isActive = step === dotStep;
		return (
			<div
				className={[
					"w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold",
					isDone
						? "bg-[rgba(22,118,79,0.08)] text-[var(--accent-primary)]"
						: isActive
							? "bg-[var(--accent-primary)] text-[var(--text-on-accent,#fff)]"
							: "bg-[var(--surface-container)] text-[var(--text-tertiary)]",
				].join(" ")}
				aria-current={isActive ? "step" : undefined}
			>
				{isDone ? "✓" : String(dotStep)}
			</div>
		);
	};

	// ---------------------------------------------------------------------------
	// Render: single <dialog> element, content switches on `created`
	// ---------------------------------------------------------------------------
	return (
		<dialog
			ref={dialogRef}
			aria-modal="true"
			aria-label="Create new agent"
			style={{
				background: "var(--surface-elevated)",
				boxShadow: "var(--shadow-elevated)",
			}}
		>
			{open && created && (
				/* ── Success state ── */
				<div className="flex flex-col gap-[18px] p-[24px] min-w-[320px] max-w-[520px] w-full">
					<div className="flex flex-col items-center gap-[12px] py-[24px]">
						<div className="w-12 h-12 rounded-full bg-[rgba(22,118,79,0.08)] flex items-center justify-center">
							<svg
								aria-hidden="true"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="var(--accent-primary)"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<polyline points="20 6 9 17 4 12" />
							</svg>
						</div>
						<h2
							className="text-[20px] font-semibold text-[var(--text-primary)]"
							style={{ letterSpacing: "-0.01em" }}
						>
							Agent created
						</h2>
						<p className="text-[13px] text-[var(--text-secondary)]">
							<span className="font-medium">{createdAgentName}</span>{" "}
							<span
								className="inline-flex items-center px-[9px] py-[3px] rounded-full text-[12px] font-medium"
								style={{ background: "rgba(22,118,79,0.08)", color: "var(--accent-primary)" }}
							>
								{createdRole.replace(/_/g, " ")}
							</span>
						</p>
					</div>

					<div className="flex flex-col gap-[9px]">
						<p className="text-[12px] text-[var(--text-secondary)]">What's next?</p>
						<div className="flex flex-col gap-[6px]">
							<button
								type="button"
								className="btn btn-ghost btn-sm min-h-[44px] justify-start"
								style={{ borderRadius: "var(--r-pill)" }}
								onClick={() => {
									onCreated();
									onClose();
								}}
							>
								Assign to a bet
							</button>
							<button
								type="button"
								className="btn btn-ghost btn-sm min-h-[44px] justify-start"
								style={{ borderRadius: "var(--r-pill)" }}
								onClick={() => {
									onViewInSettings?.();
									onCreated();
									onClose();
								}}
							>
								View in settings
							</button>
						</div>
					</div>

					<div className="flex justify-end pt-[6px] border-t border-[var(--border-subtle)]">
						<button
							type="button"
							className="btn btn-sm btn-primary min-h-[44px]"
							style={{ borderRadius: "var(--r-pill)" }}
							onClick={() => {
								onCreated();
								onClose();
							}}
						>
							Done
						</button>
					</div>
				</div>
			)}

			{open && !created && (
				/* ── Wizard steps ── */
				<div
					className="flex flex-col min-w-[320px] max-w-[520px] w-full"
					style={{ maxHeight: "min(85vh, 640px)" }}
				>
					{/* Header */}
					<div className="px-[24px] pt-[24px] pb-[18px] border-b border-[var(--border-subtle)]">
						<h2
							className="text-[20px] font-semibold text-[var(--text-primary)] mb-[12px]"
							style={{ letterSpacing: "-0.01em" }}
						>
							New agent
						</h2>
						{/* Stepper */}
						<div className="flex items-center gap-[6px]">
							<StepDot dotStep={1} />
							<div
								className="flex-1 h-px"
								style={{ background: step > 1 ? "var(--accent-primary)" : "var(--border-subtle)" }}
							/>
							<StepDot dotStep={2} />
							<div
								className="flex-1 h-px"
								style={{ background: step > 2 ? "var(--accent-primary)" : "var(--border-subtle)" }}
							/>
							<StepDot dotStep={3} />
						</div>
					</div>

					{/* Body (scrollable) */}
					<div className="flex-1 overflow-y-auto px-[24px] py-[18px]">
						{/* Step 1: Role */}
						{step === 1 && (
							<div className="flex flex-col gap-[12px]">
								<p
									className="text-[15px] text-[var(--text-secondary)]"
									style={{ lineHeight: "1.7" }}
								>
									Choose a role for the new agent. Each role comes with a soul prompt template.
								</p>
								<div className="grid grid-cols-2 gap-[9px]">
									{ROLE_PRESETS.map((preset) => {
										const isSelected = selectedRoleId === preset.id;
										return (
											<button
												key={preset.id}
												type="button"
												role="radio"
												aria-checked={isSelected}
												onClick={() => handleRoleSelect(preset.id)}
												className="flex flex-col gap-[9px] p-[12px] rounded-[var(--r-subtle)] text-left transition-colors"
												style={{
													background: isSelected
														? "rgba(22,118,79,0.04)"
														: "var(--surface-container)",
													border: isSelected
														? "1.5px solid var(--accent-primary)"
														: preset.id === "custom"
															? "1.5px dashed var(--border-default)"
															: "1.5px solid transparent",
												}}
											>
												{/* Header row */}
												<div className="flex items-center gap-[9px]">
													{preset.id !== "custom" ? (
														<div
															className="flex-none w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold"
															style={{
																background: "rgba(22,118,79,0.08)",
																color: "var(--accent-primary)",
															}}
														>
															{preset.initials}
														</div>
													) : (
														<div
															className="flex-none w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold"
															style={{
																background: "var(--surface-elevated)",
																color: "var(--text-tertiary)",
															}}
														>
															?
														</div>
													)}
													<span className="text-[13px] font-semibold text-[var(--text-primary)]">
														{preset.name}
													</span>
												</div>
												{/* Description */}
												<p
													className="text-[12px] text-[var(--text-tertiary)]"
													style={{ lineHeight: "1.5" }}
												>
													{preset.description}
												</p>
											</button>
										);
									})}
								</div>

								{/* Custom role sub-select — shown when Custom is selected */}
								{selectedRoleId === "custom" && (
									<label className="flex flex-col gap-[6px]">
										<span className="text-[13px] font-medium text-[var(--text-primary)]">
											Role type
										</span>
										<select
											className="select select-sm select-bordered"
											value={customRoleValue}
											onChange={(e) => setCustomRoleValue(e.target.value)}
											aria-label="Role type"
										>
											{CUSTOM_ROLE_OPTIONS.map((r) => (
												<option key={r} value={r}>
													{r.replace(/_/g, " ")}
												</option>
											))}
										</select>
									</label>
								)}
							</div>
						)}

						{/* Step 2: Identity */}
						{step === 2 && (
							<div className="flex flex-col gap-[12px]">
								{/* Agent name */}
								<label className="flex flex-col gap-[6px]">
									<span className="text-[13px] font-medium text-[var(--text-primary)]">
										Agent name
									</span>
									<input
										type="text"
										className="input input-sm input-bordered"
										placeholder="e.g., Atlas"
										value={agentName}
										onChange={(e) => setAgentName(e.target.value)}
										aria-label="Agent name"
									/>
									{nameAlreadyExists && agentName.trim().length > 0 && (
										<p className="text-[12px] text-[var(--status-error,#c0392b)]">
											An agent with this name already exists on this team.
										</p>
									)}
								</label>

								{/* Soul prompt */}
								<div className="flex flex-col gap-[6px]">
									<label
										htmlFor="soul-prompt-textarea"
										className="text-[13px] font-medium text-[var(--text-primary)]"
									>
										Soul prompt
									</label>
									{templateLoading ? (
										<div className="skeleton h-[120px] w-full" />
									) : (
										<textarea
											id="soul-prompt-textarea"
											className="textarea textarea-bordered text-sm"
											rows={8}
											value={soulPrompt}
											onChange={(e) => setSoulPrompt(e.target.value)}
											placeholder={
												selectedRoleId === "custom"
													? "Describe your agent's personality, expertise, and approach..."
													: "Loading template..."
											}
											aria-label="Soul prompt"
										/>
									)}
									<p className="text-[12px] text-[var(--text-tertiary)]">
										{selectedRoleId === "custom"
											? "Write a soul prompt for your custom agent."
											: soulPrompt
												? `Pre-filled from the ${ROLE_PRESETS.find((p) => p.id === selectedRoleId)?.name ?? ""} template. Edit freely.`
												: "Template unavailable — write a soul prompt manually."}
									</p>
								</div>
							</div>
						)}

						{/* Step 3: Harness & Model Tier */}
						{step === 3 && (
							<div className="flex flex-col gap-[12px]">
								{/* Review summary */}
								<div
									className="rounded-[var(--r-subtle)] p-[18px] flex flex-col gap-[6px]"
									style={{ background: "var(--surface-container)" }}
								>
									<div className="flex gap-[12px]">
										<span
											className="text-[12px] font-semibold uppercase text-[var(--text-tertiary)] w-20 flex-none"
											style={{ letterSpacing: "var(--tracking-caps-sm, 0.06em)" }}
										>
											Role
										</span>
										<span
											className="inline-flex items-center px-[9px] py-[3px] rounded-full text-[12px] font-medium"
											style={{
												background: "rgba(22,118,79,0.08)",
												color: "var(--accent-primary)",
											}}
										>
											{resolvedRole.replace(/_/g, " ")}
										</span>
									</div>
									<div className="flex gap-[12px]">
										<span
											className="text-[12px] font-semibold uppercase text-[var(--text-tertiary)] w-20 flex-none"
											style={{ letterSpacing: "var(--tracking-caps-sm, 0.06em)" }}
										>
											Name
										</span>
										<span className="text-[13px] text-[var(--text-primary)]">{agentName}</span>
									</div>
									{soulPrompt && (
										<div className="flex gap-[12px]">
											<span
												className="text-[12px] font-semibold uppercase text-[var(--text-tertiary)] w-20 flex-none"
												style={{ letterSpacing: "var(--tracking-caps-sm, 0.06em)" }}
											>
												Prompt
											</span>
											<span className="text-[12px] text-[var(--text-secondary)] truncate flex-1">
												{soulPrompt.split("\n")[0]}
											</span>
										</div>
									)}
								</div>

								{/* Harness select */}
								<div className="flex flex-col gap-[6px]">
									<span className="text-[13px] font-medium text-[var(--text-primary)]">
										Execution harness
									</span>
									{noHarnessAvailable ? (
										<p className="text-[12px] text-[var(--accent-secondary,#b7791f)]">
											No harness adapters available. Start a worker process first.
										</p>
									) : (
										<>
											<select
												className="select select-sm select-bordered"
												value={harnessType}
												onChange={(e) => setHarnessType(e.target.value)}
												aria-label="Execution harness"
											>
												{workers.map((w) => (
													<option key={w.type} value={w.type}>
														{w.name}
													</option>
												))}
											</select>
											<p className="text-[12px] text-[var(--text-tertiary)]">
												Determines how the agent executes tasks.
											</p>
										</>
									)}
								</div>

								{/* Model tier select */}
								<label className="flex flex-col gap-[6px]">
									<span className="text-[13px] font-medium text-[var(--text-primary)]">
										Model tier
									</span>
									<select
										className="select select-sm select-bordered"
										value={modelTier}
										onChange={(e) => setModelTier(e.target.value)}
										aria-label="Model tier"
									>
										<option value="workhorse">workhorse — Daily tasks, good balance</option>
										<option value="reasoning">reasoning — Complex decisions, expensive</option>
										<option value="fast">fast — Quick responses, cheapest</option>
									</select>
									{!selectedTierConfigured && (
										<p className="text-[12px] text-[var(--accent-secondary,#b7791f)]">
											No provider configured for the {modelTier} tier. Configure it in Settings &gt;
											Models.
										</p>
									)}
									<p className="text-[12px] text-[var(--text-tertiary)]">
										Determines which AI model handles this agent's tasks.
									</p>
								</label>

								{/* Validation summary */}
								{noHarnessAvailable || !selectedTierConfigured ? (
									<div className="flex flex-col gap-[6px]">
										{noHarnessAvailable && (
											<div className="flex items-start gap-[6px]">
												<span
													className="w-[6px] h-[6px] rounded-full flex-none mt-[4px]"
													style={{ background: "var(--accent-secondary, #b7791f)" }}
												/>
												<p className="text-[12px] text-[var(--accent-secondary,#b7791f)]">
													Harness unavailable — start a worker process before creating.
												</p>
											</div>
										)}
										{!selectedTierConfigured && (
											<div className="flex items-start gap-[6px]">
												<span
													className="w-[6px] h-[6px] rounded-full flex-none mt-[4px]"
													style={{ background: "var(--accent-secondary, #b7791f)" }}
												/>
												<p className="text-[12px] text-[var(--accent-secondary,#b7791f)]">
													Model tier not configured — set up a provider in Settings &gt; Models.
												</p>
											</div>
										)}
									</div>
								) : (
									<div className="flex items-center gap-[6px]">
										<span
											className="w-[6px] h-[6px] rounded-full flex-none"
											style={{ background: "var(--status-success, #16764f)" }}
										/>
										<p className="text-[12px] text-[var(--status-success,#16764f)]">
											All checks passed — ready to create
										</p>
									</div>
								)}

								{submitError && (
									<p role="alert" className="text-[12px] text-error">
										{submitError}
									</p>
								)}
							</div>
						)}
					</div>

					{/* Footer */}
					<div className="px-[18px] py-[18px] border-t border-[var(--border-subtle)] flex items-center justify-between gap-[9px]">
						{/* Left: Cancel */}
						<button
							type="button"
							className="btn btn-ghost btn-sm min-h-[44px]"
							style={{ borderRadius: "var(--r-pill)" }}
							onClick={onClose}
							disabled={creating}
						>
							Cancel
						</button>

						{/* Right: Back + Next/Create */}
						<div className="flex items-center gap-[9px]">
							{step > 1 && (
								<button
									type="button"
									className="btn btn-ghost btn-sm min-h-[44px]"
									style={{ borderRadius: "var(--r-pill)" }}
									onClick={() => setStep((prev) => (prev - 1) as WizardStep)}
									disabled={creating}
								>
									Back
								</button>
							)}

							{step < 3 ? (
								<button
									type="button"
									className="btn btn-sm btn-primary min-h-[44px]"
									style={{ borderRadius: "var(--r-pill)" }}
									disabled={(step === 1 && selectedRoleId === null) || (step === 2 && !nameIsValid)}
									onClick={() => setStep((prev) => (prev + 1) as WizardStep)}
								>
									Next
								</button>
							) : (
								<button
									type="button"
									className="btn btn-sm btn-primary min-h-[44px]"
									style={{ borderRadius: "var(--r-pill)" }}
									disabled={!nameIsValid || noHarnessAvailable || creating}
									onClick={() => void handleCreate()}
								>
									{creating && <span className="loading loading-spinner loading-xs" />}
									Create agent
								</button>
							)}
						</div>
					</div>
				</div>
			)}
		</dialog>
	);
}
