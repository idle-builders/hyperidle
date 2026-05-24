import type { CreateProductResponse } from "@hyperidle/shared";
import { type FormEvent, type JSX, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../services/api-fetch.js";

export function Onboarding(): JSX.Element {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [repoPath, setRepoPath] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = useCallback(
		async (e: FormEvent): Promise<void> => {
			e.preventDefault();
			if (!name.trim()) return;

			setSubmitting(true);
			setError(null);

			try {
				const res = await apiFetch("/api/products", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: name.trim(),
						repoPath: repoPath.trim() || undefined,
					}),
				});

				if (!res.ok) {
					const body = (await res.json().catch(() => null)) as { error?: string } | null;
					throw new Error(body?.error ?? `Failed to create product (${res.status})`);
				}

				const data = (await res.json()) as CreateProductResponse;
				navigate(`/work/product/${encodeURIComponent(data.product.id)}`);
			} catch (err: unknown) {
				setError(err instanceof Error ? err.message : "Something went wrong");
				setSubmitting(false);
			}
		},
		[name, repoPath, navigate],
	);

	return (
		<div className="flex items-center justify-center h-screen bg-base-100">
			<div className="w-full max-w-md p-[var(--density-page-gutter)]">
				<h1 className="text-lg font-heading font-semibold text-[var(--text-hi)] mb-1">
					Welcome to HyperIdle
				</h1>
				<p className="text-sm text-[var(--text-mid)] mb-6">
					Create your first product to get started. A product is a codebase that your AI team will
					work on.
				</p>

				<form onSubmit={handleSubmit} className="flex flex-col gap-[var(--density-gap)]">
					<div className="form-control">
						<label className="label" htmlFor="onboarding-name">
							<span className="label-text text-[var(--text-mid)]">Product name</span>
						</label>
						<input
							id="onboarding-name"
							type="text"
							className="input input-sm input-bordered w-full text-[var(--text-hi)]"
							placeholder="My App"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>

					<div className="form-control">
						<label className="label" htmlFor="onboarding-repo">
							<span className="label-text text-[var(--text-mid)]">Repository path</span>
						</label>
						<div className="flex gap-2">
							<input
								id="onboarding-repo"
								type="text"
								className="input input-sm input-bordered flex-1 text-[var(--text-hi)]"
								placeholder="/Users/you/projects/my-app"
								value={repoPath}
								onChange={(e) => setRepoPath(e.target.value)}
							/>
							{window.__HYPERIDLE__?.shell?.selectFolder && (
								<button
									type="button"
									className="btn btn-sm btn-ghost"
									onClick={async () => {
										const folder = await window.__HYPERIDLE__?.shell.selectFolder();
										if (folder) setRepoPath(folder);
									}}
								>
									Browse
								</button>
							)}
						</div>
						<label className="label" htmlFor="onboarding-repo">
							<span className="label-text-alt text-[var(--text-lo)]">
								Local path to the git repository (optional)
							</span>
						</label>
					</div>

					{error && <p className="text-sm text-error">{error}</p>}

					<button
						type="submit"
						className="btn btn-primary btn-sm w-full mt-2"
						disabled={submitting || !name.trim()}
					>
						{submitting && <span className="loading loading-spinner loading-xs" />}
						Create product
					</button>
				</form>
			</div>
		</div>
	);
}
