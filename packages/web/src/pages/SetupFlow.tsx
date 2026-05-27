/**
 * SetupFlow — initial setup page at /setup.
 *
 * Full-page single-scroll form. All 4 sections visible. "Start HyperIdle"
 * button disabled until name + email + product name are filled.
 *
 * Submits:
 * 1. POST /api/users — create human user
 * 2. POST /api/products — create first product
 * 3. Optionally set credential via bridge (window.__HYPERIDLE__.credentials.set)
 * On success: navigate to /conversations.
 *
 * @lore P4: Replaces Onboarding.tsx. Single-scroll layout from approved design.
 * No wizard dots or progress indicators (design decision per approved.md).
 */

import { type FormEvent, type JSX, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../services/api-fetch.js";

type BackendMode = "local" | "shared";

function isValidEmail(email: string): boolean {
	// Basic email format validation matching server-side Zod check
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function SetupFlow(): JSX.Element {
	const navigate = useNavigate();

	// Form state
	const [backendMode, setBackendMode] = useState<BackendMode>("local");
	const [serverUrl, setServerUrl] = useState("");
	const [sharedKey, setSharedKey] = useState("");
	const [testConnectionStatus, setTestConnectionStatus] = useState<
		"idle" | "testing" | "ok" | "error"
	>("idle");

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [emailError, setEmailError] = useState<string | null>(null);

	const [productName, setProductName] = useState("");
	const [repoPath, setRepoPath] = useState("");

	const [apiKey, setApiKey] = useState("");

	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	// AC-7: Start button enabled only when name + email + product name are filled
	const canStart =
		name.trim().length > 0 &&
		email.trim().length > 0 &&
		productName.trim().length > 0 &&
		!submitting;

	const handleEmailBlur = useCallback(() => {
		if (email.trim() && !isValidEmail(email.trim())) {
			setEmailError("Invalid email format");
		} else {
			setEmailError(null);
		}
	}, [email]);

	const handleTestConnection = useCallback(async () => {
		setTestConnectionStatus("testing");
		try {
			const res = await fetch(`${serverUrl}/api/health`);
			setTestConnectionStatus(res.ok ? "ok" : "error");
		} catch {
			setTestConnectionStatus("error");
		}
	}, [serverUrl]);

	const handleFolderPick = useCallback(async () => {
		const folder = await window.__HYPERIDLE__?.shell.selectFolder();
		if (folder) setRepoPath(folder);
	}, []);

	// AC-8: Submit and navigate to /conversations
	const handleSubmit = useCallback(
		async (e: FormEvent): Promise<void> => {
			e.preventDefault();
			if (!canStart) return;

			setSubmitting(true);
			setSubmitError(null);

			try {
				// Step 1: Create human user
				const userRes = await apiFetch("/api/users", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: name.trim(), email: email.trim() }),
				});

				if (!userRes.ok) {
					const body = (await userRes.json().catch(() => null)) as { error?: string } | null;
					throw new Error(body?.error ?? `Failed to create user (${userRes.status})`);
				}

				// Step 2: Create first product
				const productRes = await apiFetch("/api/products", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: productName.trim(),
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

				// Navigate to /conversations on success
				navigate("/conversations");
			} catch (err: unknown) {
				setSubmitError(err instanceof Error ? err.message : "Something went wrong");
				setSubmitting(false);
			}
		},
		[canStart, name, email, productName, repoPath, apiKey, navigate],
	);

	return (
		<div className="flex items-start justify-center min-h-screen bg-[var(--surface-0)]">
			<div className="w-full max-w-md py-16 px-[var(--density-page-gutter)]">
				<h1 className="text-[length:var(--density-text-h1)] font-medium text-[var(--text-hi)] mb-8">
					HyperIdle Setup
				</h1>

				<form onSubmit={handleSubmit} className="space-y-6">
					{/* Section 1: Backend Mode */}
					<div>
						<h2 className="text-xs font-heading uppercase tracking-wider text-[var(--text-lo)] mb-3">
							Backend Mode
						</h2>
						<div className="form-control">
							<label className="label sr-only" htmlFor="setup-backend-mode">
								<span className="label-text">Backend Mode</span>
							</label>
							<select
								id="setup-backend-mode"
								aria-label="Backend Mode"
								className="select select-sm select-bordered w-full"
								value={backendMode}
								onChange={(e) => {
									setBackendMode(e.target.value as BackendMode);
									setTestConnectionStatus("idle");
								}}
								// biome-ignore lint/a11y/noAutofocus: Focus on page load per design spec
								autoFocus
							>
								<option value="local">Run locally</option>
								<option value="shared">Connect to shared backend</option>
							</select>
						</div>

						{backendMode === "shared" && (
							<div className="mt-2 space-y-2">
								<div className="form-control">
									<label className="label" htmlFor="setup-server-url">
										<span className="label-text text-[var(--text-mid)]">Server URL</span>
									</label>
									<input
										id="setup-server-url"
										type="url"
										className="input input-sm input-bordered w-full text-[var(--text-hi)]"
										placeholder="https://..."
										value={serverUrl}
										onChange={(e) => setServerUrl(e.target.value)}
									/>
								</div>
								<div className="form-control">
									<label className="label" htmlFor="setup-shared-key">
										<span className="label-text text-[var(--text-mid)]">Shared Backend Key</span>
									</label>
									<input
										id="setup-shared-key"
										type="password"
										className="input input-sm input-bordered w-full text-[var(--text-hi)]"
										placeholder="key..."
										value={sharedKey}
										onChange={(e) => setSharedKey(e.target.value)}
									/>
								</div>
								<div className="flex items-center gap-2">
									<button
										type="button"
										className="btn btn-ghost btn-xs"
										onClick={handleTestConnection}
										disabled={testConnectionStatus === "testing" || !serverUrl}
									>
										{testConnectionStatus === "testing" && (
											<span className="loading loading-spinner loading-xs" />
										)}
										Test Connection
									</button>
									{testConnectionStatus === "ok" && (
										<span className="text-xs text-[var(--text-mid)]">Connected</span>
									)}
									{testConnectionStatus === "error" && (
										<span className="text-xs text-error">Connection failed</span>
									)}
								</div>
							</div>
						)}
					</div>

					{/* Section 2: Your Identity */}
					<div>
						<h2 className="text-xs font-heading uppercase tracking-wider text-[var(--text-lo)] mb-3">
							Your Identity
						</h2>
						<div className="flex flex-col gap-3">
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
								/>
							</div>
							<div className="form-control">
								<label className="label" htmlFor="setup-email">
									<span className="label-text text-[var(--text-mid)]">Email</span>
								</label>
								<input
									id="setup-email"
									type="email"
									className="input input-sm input-bordered w-full text-[var(--text-hi)]"
									placeholder="you@example.com"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									onBlur={handleEmailBlur}
									required
								/>
								{emailError && (
									<p role="alert" aria-live="polite" className="text-sm text-error mt-1">
										{emailError}
									</p>
								)}
							</div>
						</div>
					</div>

					{/* Section 3: First Product */}
					<div>
						<h2 className="text-xs font-heading uppercase tracking-wider text-[var(--text-lo)] mb-3">
							First Product
						</h2>
						<div className="flex flex-col gap-3">
							<div className="form-control">
								<label className="label" htmlFor="setup-product-name">
									<span className="label-text text-[var(--text-mid)]">Product Name</span>
								</label>
								<input
									id="setup-product-name"
									type="text"
									className="input input-sm input-bordered w-full text-[var(--text-hi)]"
									placeholder="My Product"
									value={productName}
									onChange={(e) => setProductName(e.target.value)}
									required
								/>
							</div>
							<div className="form-control">
								<label className="label" htmlFor="setup-repo">
									<span className="label-text text-[var(--text-mid)]">Repo Path (optional)</span>
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
						</div>
					</div>

					{/* Section 4: API Credentials */}
					<div>
						<h2 className="text-xs font-heading uppercase tracking-wider text-[var(--text-lo)] mb-3">
							API Credentials
						</h2>
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
						</div>
						<p className="text-sm text-[var(--text-lo)] mt-2">Without a key, agents cannot run.</p>
					</div>

					{/* Validation / submit error */}
					{submitError && (
						<p role="alert" aria-live="polite" className="text-sm text-error">
							{submitError}
						</p>
					)}

					{/* Footer */}
					<div className="flex justify-between items-center mt-8 pt-4 border-t border-[var(--border-subtle)]">
						<button
							type="button"
							className="btn btn-ghost btn-sm text-[var(--text-mid)]"
							onClick={() => navigate("/conversations")}
						>
							Skip credentials
						</button>
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
