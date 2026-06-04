/**
 * KnowledgeCreate — full-page create flow at /knowledge/new.
 *
 * Replaces the KnowledgeCreateDialog overlay with a full-page layout matching
 * the knowledge-edit.html mockup (create variant).
 *
 * Layout: bordered header (breadcrumb + title input + action buttons) + two-column
 * body (BodyEditor left, metadata card right).
 *
 * @lore visual-parity W-01: this is a CREATE page, not a copy of the edit page.
 * Differences from KnowledgeDetail:
 * - Title is an editable <input> (not a static heading)
 * - No "Saved" indicator (nothing to save yet)
 * - "Create" button (disabled until title + body have content) replaces "Done"
 * - Metadata aside: Kind selector + Scope inputs (not static badges)
 * - No Backlinks card (new item has none)
 * - No Discussion section (new item has no thread)
 */

// hearth-internal-padding
import { BodyEditor } from "@hyperidle/design-system";
import { SCOPE_KINDS, SCOPES_REQUIRING_ID, type ScopeKind } from "@hyperidle/shared";
import { type JSX, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { apiFetch } from "../services/api-fetch.js";

const KNOWLEDGE_KINDS = ["pattern", "decision", "failure", "brief"] as const;
type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

interface CreateKnowledgePayload {
	title: string;
	body: string;
	format: string;
	scopeKind: ScopeKind;
	scopeId?: string;
	updatedBy: string;
}

interface CreateKnowledgeResponse {
	id: string;
}

export function KnowledgeCreate(): JSX.Element {
	const navigate = useNavigate();
	const { user } = useCurrentUser();

	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [kind, setKind] = useState<KnowledgeKind>("pattern");
	const [scopeKind, setScopeKind] = useState<ScopeKind>("factory");
	const [scopeId, setScopeId] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const needsScopeId = SCOPES_REQUIRING_ID.has(scopeKind);
	const canCreate = title.trim().length > 0 && body.trim().length > 0 && !submitting;

	const handleCreate = async (): Promise<void> => {
		const trimmedTitle = title.trim();
		const trimmedBody = body.trim();
		if (!(trimmedTitle && trimmedBody)) return;

		setSubmitting(true);
		setError(null);

		const payload: CreateKnowledgePayload = {
			title: trimmedTitle,
			body: trimmedBody,
			format: "markdown",
			scopeKind,
			updatedBy: user?.id ?? "human",
		};

		if (needsScopeId && scopeId.trim()) {
			payload.scopeId = scopeId.trim();
		}

		const res = await apiFetch("/api/knowledge", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			setError(data.error ?? `Failed to create item: ${res.status}`);
			setSubmitting(false);
			return;
		}

		const created = (await res.json()) as CreateKnowledgeResponse;
		setSubmitting(false);
		navigate(`/knowledge/${created.id}`);
	};

	const handleCancel = (): void => {
		navigate("/knowledge");
	};

	return (
		<div className="flex flex-col h-full" data-testid="knowledge-create-page">
			{/* Bordered header */}
			<header className="shrink-0 px-[24px] py-[18px] border-b border-[var(--border-subtle)]">
				{/* Breadcrumb */}
				<nav aria-label="Breadcrumb" className="text-[13px] text-[var(--text-tertiary)] mb-[6px]">
					<Link
						to="/knowledge"
						className="hover:text-[var(--accent-primary)] transition-colors duration-[var(--motion-fast)]"
					>
						Knowledge
					</Link>{" "}
					/ New
				</nav>
				{/* Title input + actions row */}
				<div className="flex items-center justify-between gap-[12px]">
					<input
						type="text"
						aria-label="Knowledge item title"
						data-testid="knowledge-create-title"
						placeholder="Untitled"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						disabled={submitting}
						maxLength={500}
						style={{
							fontSize: "20px",
							fontWeight: 600,
							letterSpacing: "-0.01em",
							color: "var(--text-primary)",
							background: "transparent",
							border: "none",
							outline: "none",
							flex: 1,
							minWidth: 0,
							padding: 0,
							fontFamily: "var(--font-sans)",
						}}
					/>
					<div className="flex items-center gap-[9px] shrink-0">
						<button
							type="button"
							className="inline-flex items-center text-[13px] font-[500] px-[12px] py-[7px] rounded-[var(--r-pill)] bg-transparent border-[1.5px] border-[var(--border-default)] text-[var(--text-secondary)] cursor-pointer hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] transition-colors duration-[var(--motion-fast)]"
							onClick={handleCancel}
							disabled={submitting}
						>
							Cancel
						</button>
						<button
							type="button"
							data-testid="knowledge-create-submit"
							className="inline-flex items-center text-[13px] font-[500] px-[12px] py-[7px] rounded-[var(--r-pill)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-[var(--motion-fast)]"
							onClick={() => void handleCreate()}
							disabled={!canCreate}
						>
							{submitting ? "Creating…" : "Create"}
						</button>
					</div>
				</div>
			</header>

			{/* Scrollable body — two-column layout */}
			<div className="flex-1 overflow-y-auto">
				<div
					className="max-w-[960px] mx-auto w-full p-[24px] flex gap-[24px] items-start"
					data-testid="knowledge-create-body"
				>
					{/* Left: editor */}
					<div className="flex-1 min-w-0 flex flex-col gap-[12px]">
						{error && (
							<p
								role="alert"
								data-testid="knowledge-create-error"
								className="text-[12px] text-[var(--status-error)]"
							>
								{error}
							</p>
						)}
						<div
							className="border-[1.5px] border-[var(--border-default)] rounded-[var(--r-default)] p-[18px]"
							style={{ minHeight: "300px" }}
						>
							<BodyEditor
								initialContent=""
								onChange={(md) => setBody(md)}
								placeholder="Describe it in markdown…"
								variant="full"
								minHeight="260px"
								editable={!submitting}
							/>
						</div>
					</div>

					{/* Right: metadata card */}
					<aside className="shrink-0 flex flex-col gap-[12px]" style={{ width: "240px" }}>
						<div
							className="bg-[var(--surface-page)] rounded-[var(--r-default)] p-[18px] flex flex-col gap-[12px]"
							data-testid="knowledge-create-metadata"
						>
							{/* Kind selector */}
							<div className="flex flex-col gap-[6px]">
								<span className="text-[12px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
									Kind
								</span>
								<select
									aria-label="Knowledge kind"
									data-testid="knowledge-create-kind"
									value={kind}
									onChange={(e) => setKind(e.target.value as KnowledgeKind)}
									disabled={submitting}
									style={{
										fontFamily: "var(--font-sans)",
										fontSize: "13px",
										padding: "7px 10px",
										border: "1.5px solid var(--border-default)",
										borderRadius: "var(--r-default)",
										background: "var(--surface-elevated)",
										color: "var(--text-primary)",
										outline: "none",
										width: "100%",
									}}
								>
									{KNOWLEDGE_KINDS.map((k) => (
										<option key={k} value={k}>
											{k.charAt(0).toUpperCase() + k.slice(1)}
										</option>
									))}
								</select>
							</div>

							{/* Scope kind selector */}
							<div className="flex flex-col gap-[6px]">
								<span className="text-[12px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
									Scope
								</span>
								<select
									aria-label="Scope kind"
									data-testid="knowledge-create-scope-kind"
									value={scopeKind}
									onChange={(e) => {
										setScopeKind(e.target.value as ScopeKind);
										setScopeId("");
									}}
									disabled={submitting}
									style={{
										fontFamily: "var(--font-sans)",
										fontSize: "13px",
										padding: "7px 10px",
										border: "1.5px solid var(--border-default)",
										borderRadius: "var(--r-default)",
										background: "var(--surface-elevated)",
										color: "var(--text-primary)",
										outline: "none",
										width: "100%",
									}}
								>
									{SCOPE_KINDS.map((sk) => (
										<option key={sk} value={sk}>
											{sk.charAt(0).toUpperCase() + sk.slice(1)}
										</option>
									))}
								</select>
							</div>

							{/* Scope ID — only when the selected scope requires an id */}
							{needsScopeId && (
								<div className="flex flex-col gap-[6px]">
									<span className="text-[12px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
										{scopeKind.charAt(0).toUpperCase() + scopeKind.slice(1)} ID
									</span>
									<input
										type="text"
										aria-label={`${scopeKind} ID`}
										data-testid="knowledge-create-scope-id"
										placeholder={`Enter ${scopeKind} ID…`}
										value={scopeId}
										onChange={(e) => setScopeId(e.target.value)}
										disabled={submitting}
										style={{
											fontFamily: "var(--font-sans)",
											fontSize: "13px",
											padding: "7px 10px",
											border: "1.5px solid var(--border-default)",
											borderRadius: "var(--r-default)",
											background: "var(--surface-elevated)",
											color: "var(--text-primary)",
											outline: "none",
											width: "100%",
										}}
									/>
								</div>
							)}
						</div>
					</aside>
				</div>
			</div>
		</div>
	);
}
