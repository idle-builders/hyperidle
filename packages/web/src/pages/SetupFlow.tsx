/**
 * SetupFlow — initial setup page at /setup.
 *
 * Simplified single-scroll form. Two required fields (name + API key) and one
 * optional field (repo path). Team is created silently with defaults.
 * "Start HyperIdle" button disabled until name + API key are filled.
 *
 * Submits:
 * 1. POST /api/users — create human user (name only, no email)
 * 2. POST /api/teams — create first team (name derived from repo path or "My Team")
 * 3. Set credential via bridge (window.__HYPERIDLE__.credentials.set)
 * On success: navigate to /work/portfolio.
 *
 * @lore P4: Replaces Onboarding.tsx. Single-scroll layout from approved design.
 * @lore R2: Simplified from P4 — removed email, backend mode, team name fields.
 * Team name is derived from repo folder basename or defaults to "My Team".
 * Navigates to /work/portfolio (was /conversations).
 * @lore visual-parity: Redesigned to match onboarding.html exactly — 3-card
 * abstract visual, step title, step description, left-aligned layout, form-group
 * spacing of 18px, design-system Input + Button components.
 */

import { Button, Input } from "@hyperidle/design-system";
import { type FormEvent, type JSX, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../services/api-fetch.js";

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
							className="block w-[8px] h-[8px] rounded-full shrink-0"
							style={{ background: dotColor }}
						/>
						<span className="block h-[6px] rounded-full bg-[var(--border-subtle)] w-3/5" />
					</div>
					<span className="block h-[6px] bg-[var(--border-subtle)] rounded-full w-[90%] mb-[3px]" />
					<span className="block h-[6px] bg-[var(--border-subtle)] rounded-full w-3/5" />
				</div>
			))}
		</div>
	);
}

export function SetupFlow(): JSX.Element {
	const navigate = useNavigate();

	// Form state
	const [name, setName] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [repoPath, setRepoPath] = useState("");

	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	// R2: Start button enabled only when name + API key are filled
	const canStart = name.trim().length > 0 && apiKey.trim().length > 0 && !submitting;

	const handleFolderPick = useCallback(async (): Promise<void> => {
		const folder = await window.__HYPERIDLE__?.shell.selectFolder();
		if (folder) setRepoPath(folder);
	}, []);

	// R2: Submit and navigate to /work/portfolio
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

				// Step 2: Create first team — derive name from repo path or default
				// @lore R2: team name is not user-visible in setup. Derive from repo
				// folder basename if a path was given; otherwise use "My Team".
				const derivedTeamName = repoPath.trim()
					? (repoPath.trim().split("/").filter(Boolean).pop() ?? "My Team")
					: "My Team";

				const teamRes = await apiFetch("/api/teams", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: derivedTeamName,
						repoPath: repoPath.trim() || undefined,
					}),
				});

				if (!teamRes.ok) {
					const body = (await teamRes.json().catch(() => null)) as { error?: string } | null;
					throw new Error(body?.error ?? `Failed to create team (${teamRes.status})`);
				}

				// Step 3: Optionally set API credential via bridge
				if (apiKey.trim() && window.__HYPERIDLE__?.credentials?.set) {
					await window.__HYPERIDLE__.credentials.set("anthropic", apiKey.trim());
				}

				// Navigate to /work/portfolio on success (R2: was /conversations)
				navigate("/work/portfolio");
			} catch (err: unknown) {
				setSubmitError(err instanceof Error ? err.message : "Something went wrong");
				setSubmitting(false);
			}
		},
		[canStart, name, repoPath, apiKey, navigate],
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
					Enter your name and API key to get started. Your agents need the API key to think and act
					on your behalf.
				</p>

				<form onSubmit={handleSubmit} className="flex flex-col">
					{/* W3 AC-54: "Your name" label (required) */}
					<div className="mb-[18px]">
						<Input
							id="setup-name"
							label="Your name"
							type="text"
							placeholder="Tobias Grundtner"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							autoFocus
						/>
					</div>

					{/* Anthropic API Key field (required) */}
					<div className="mb-[18px]">
						<Input
							id="setup-api-key"
							label="Anthropic API key"
							type="password"
							placeholder="sk-ant-..."
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							hint="Required. Your key stays on this device."
							required
						/>
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
							<div className="relative">
								{window.__HYPERIDLE__?.shell?.selectFolder && (
									<button
										type="button"
										aria-label="Browse for folder"
										className="absolute inset-y-0 left-0 flex items-center pl-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer z-10"
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
									</button>
								)}
								<input
									id="setup-repo"
									type="text"
									className={[
										"w-full text-[15px] px-[12px] py-[10px]",
										"bg-[var(--surface-elevated)] border-[1.5px] border-[var(--border-default)]",
										"rounded-[var(--r-default)] text-[var(--text-primary)]",
										"placeholder:text-[var(--text-placeholder)]",
										"transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
										"outline-none focus:border-[var(--accent-primary)] focus:shadow-[0_0_0_3px_rgba(22,118,79,0.1)]",
										window.__HYPERIDLE__?.shell?.selectFolder ? "pl-[36px]" : "",
									].join(" ")}
									placeholder="/Users/you/my-project"
									value={repoPath}
									onChange={(e) => setRepoPath(e.target.value)}
								/>
							</div>
							<span className="text-[12px] text-[var(--text-tertiary)]">
								Path to a git repository for agents to work in.
							</span>
						</div>
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
