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
 */

import { type FormEvent, type JSX, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../services/api-fetch.js";

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

	const handleFolderPick = useCallback(async () => {
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
		<div className="flex items-center justify-center min-h-screen bg-[var(--surface-page)] px-[24px] py-[36px]">
			{/* W3 AC-53: Card with shadow */}
			<div
				data-testid="onboarding-card"
				className="w-full max-w-[480px] bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-elevated)] px-[24px] py-[36px] flex flex-col gap-6"
			>
				{/* Brand + tagline */}
				<div className="flex flex-col items-center gap-2 text-center">
					{/* W3 AC-53: Illustration */}
					<div
						data-testid="onboarding-illustration"
						aria-hidden="true"
						className="w-12 h-12 rounded-full bg-[color-mix(in_oklab,var(--accent-primary)_16%,transparent)] flex items-center justify-center text-[24px]"
					>
						⬡
					</div>
					{/* W3 AC-53: Brand name */}
					<h1
						data-testid="onboarding-brand"
						className="text-[24px] font-semibold text-[var(--text-primary)]"
					>
						HyperIdle
					</h1>
					{/* W3 AC-53: Tagline */}
					<p className="text-[13px] text-[var(--text-secondary)]">
						Your agentic operating system. Humans steer, agents build.
					</p>
				</div>

				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					{/* W3 AC-54: "Your name" label (required) */}
					<div className="form-control">
						<label className="label" htmlFor="setup-name">
							<span className="label-text text-[var(--text-secondary)]">Your name</span>
						</label>
						<input
							id="setup-name"
							type="text"
							className="input input-sm input-bordered w-full text-[var(--text-primary)] text-base"
							placeholder="Alice"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							// biome-ignore lint/a11y/noAutofocus: Focus on page load per design spec
							autoFocus
						/>
					</div>

					{/* Anthropic API Key field (required) */}
					<div className="form-control">
						<label className="label" htmlFor="setup-api-key">
							<span className="label-text text-[var(--text-secondary)]">Anthropic API key</span>
						</label>
						<input
							id="setup-api-key"
							type="password"
							className="input input-sm input-bordered w-full text-[var(--text-primary)] text-base"
							placeholder="sk-ant-..."
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							required
						/>
						<p className="text-[12px] text-[var(--text-tertiary)] mt-1">
							Your agents need this to work.
						</p>
					</div>

					{/* Repo path (optional) */}
					<div className="form-control">
						<label className="label" htmlFor="setup-repo">
							<span className="label-text text-[var(--text-secondary)]">Project folder</span>
						</label>
						<div className="relative">
							{window.__HYPERIDLE__?.shell?.selectFolder && (
								<button
									type="button"
									aria-label="Browse for folder"
									className="absolute inset-y-0 left-0 flex items-center pl-2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer"
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
								className={`input input-sm input-bordered w-full text-[var(--text-primary)]${window.__HYPERIDLE__?.shell?.selectFolder ? " pl-7" : ""}`}
								placeholder="/Users/you/projects/my-app"
								value={repoPath}
								onChange={(e) => setRepoPath(e.target.value)}
							/>
						</div>
					</div>

					{/* Validation / submit error */}
					{submitError && (
						<p role="alert" aria-live="polite" className="text-sm text-error">
							{submitError}
						</p>
					)}

					{/* Footer */}
					<div className="flex justify-end mt-8 pt-4 border-t border-[var(--border-subtle)]">
						<button type="submit" className="btn btn-primary btn-sm" disabled={!canStart}>
							{submitting && <span className="loading loading-spinner loading-xs" />}
							Start HyperIdle
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
