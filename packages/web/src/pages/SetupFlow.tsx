/**
 * SetupFlow — initial setup page at /setup.
 *
 * Simplified single-scroll form. Two required fields (name + API key) and one
 * optional field (repo path). Product is created silently with defaults.
 * "Start HyperIdle" button disabled until name + API key are filled.
 *
 * Submits:
 * 1. POST /api/users — create human user (name only, no email)
 * 2. POST /api/products — create first product (name derived from repo path or "My Product")
 * 3. Set credential via bridge (window.__HYPERIDLE__.credentials.set)
 * On success: navigate to /work/portfolio.
 *
 * @lore P4: Replaces Onboarding.tsx. Single-scroll layout from approved design.
 * @lore R2: Simplified from P4 — removed email, backend mode, product name fields.
 * Product name is derived from repo folder basename or defaults to "My Product".
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

				// Step 2: Create first product — derive name from repo path or default
				// @lore R2: product name is not user-visible in setup. Derive from repo
				// folder basename if a path was given; otherwise use "My Product".
				const derivedProductName = repoPath.trim()
					? (repoPath.trim().split("/").filter(Boolean).pop() ?? "My Product")
					: "My Product";

				const productRes = await apiFetch("/api/products", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: derivedProductName,
						repoPath: repoPath.trim() || undefined,
					}),
				});

				if (!productRes.ok) {
					const body = (await productRes.json().catch(() => null)) as { error?: string } | null;
					throw new Error(body?.error ?? `Failed to create product (${productRes.status})`);
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
		<div className="flex items-start justify-center min-h-screen bg-[var(--surface-0)]">
			<div className="w-full max-w-md py-16 px-[var(--density-page-gutter)]">
				<h1 className="text-[length:var(--density-text-h1)] font-medium text-[var(--text-hi)] mb-8">
					HyperIdle Setup
				</h1>

				<form onSubmit={handleSubmit} className="space-y-6">
					{/* Name field */}
					<div className="form-control">
						<label className="label" htmlFor="setup-name">
							<span className="label-text text-[var(--text-mid)]">Name</span>
						</label>
						<input
							id="setup-name"
							type="text"
							className="input input-sm input-bordered w-full text-[var(--text-hi)]"
							placeholder="Your name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							// biome-ignore lint/a11y/noAutofocus: Focus on page load per design spec
							autoFocus
						/>
					</div>

					{/* Anthropic API Key field */}
					<div className="form-control">
						<label className="label" htmlFor="setup-api-key">
							<span className="label-text text-[var(--text-mid)]">Anthropic API Key</span>
						</label>
						<input
							id="setup-api-key"
							type="password"
							className="input input-sm input-bordered w-full text-[var(--text-hi)]"
							placeholder="sk-ant-..."
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
						/>
						<p className="text-sm text-[var(--text-lo)] mt-2">Your agents need this to work.</p>
					</div>

					{/* Repo path (optional) */}
					<div className="form-control">
						<label className="label" htmlFor="setup-repo">
							<span className="label-text text-[var(--text-mid)]">Project folder (optional)</span>
						</label>
						<div className="relative">
							{window.__HYPERIDLE__?.shell?.selectFolder && (
								<button
									type="button"
									aria-label="Browse for folder"
									className="absolute inset-y-0 left-0 flex items-center pl-2 text-[var(--text-lo)] hover:text-[var(--text-mid)] cursor-pointer"
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
								className={`input input-sm input-bordered w-full text-[var(--text-hi)]${window.__HYPERIDLE__?.shell?.selectFolder ? " pl-7" : ""}`}
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
