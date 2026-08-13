/**
 * WorkBetCreate — full-page bet create flow at /work/bet/new.
 *
 * Replaces BetCreateDialog with a full-page layout matching the KnowledgeCreate
 * chassis: bordered header (breadcrumb + derived-title preview + Cancel/Create)
 * over a two-column body (BodyEditor left, commitments aside right).
 *
 * @lore AU21 Increment 14a: the "Appetite" create-time input (amount +
 * currency, AG3) is HARD-DELETED along with the rest of the cost-cap feature
 * — `bets.costAppetiteMinor`/`costAppetiteCurrency` columns are dropped and
 * `createBetSchema` no longer accepts `costAppetite`, no replacement.
 *
 * @lore AG3: responsive collapse added explicitly — KnowledgeCreate has no responsive
 * switch (flat flex at all widths). Mobile single-column stack added here; does NOT
 * retrofit KnowledgeCreate (out of scope).
 */

// hearth-internal-padding
import {
	BodyEditor,
	Breadcrumb,
	Button,
	PageHeader,
	PageScaffold,
	Select,
} from "@hyperidle/design-system";
import { deriveTitleFromPitch } from "@hyperidle/presentation-format";
import { type JSX, useEffect, useState } from "react";
import { Link as RRLink, useNavigate, useSearchParams } from "react-router-dom";
import { useKnowledgeItem } from "../hooks/useKnowledgeItem.js";
import { useTeams } from "../hooks/useTeams.js";
import { apiFetch } from "../services/api-fetch.js";

export function WorkBetCreate(): JSX.Element {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	// AK5: ?fromKnowledge=<id> pre-fill path (multi-team promotion route).
	// @lore AK5: carry-forward critique WARNING — this is the ONLY place sourceKnowledgeItemId
	// can silently drop on the multi-team path. Verify it reaches handleCreate's payload.
	const fromKnowledgeId = searchParams.get("fromKnowledge") ?? undefined;

	// useTeams() is called unconditionally (rules of hooks). Matches WorkPortfolio:72,86.
	const { data: teamsData } = useTeams();
	const teams = teamsData?.teams ?? [];
	const singleTeam = teams.length === 1;

	// AK5: fetch knowledge item body for pre-fill when ?fromKnowledge= is present.
	// @lore AK5: No fixture fallback here — unlike KnowledgeDetail, this is a CREATE form.
	// We show a loading state until the fetch resolves so the editor never mounts empty
	// and immediately re-mounts with content (see knowledgeLoading gate below). Fixture
	// fallback was removed because it masked the async-empty-editor bug (reviewer finding #1).
	const { data: knowledgeData, isLoading: knowledgeLoading } = useKnowledgeItem(fromKnowledgeId);
	const knowledgeBody = knowledgeData?.body ?? null;

	const [body, setBody] = useState(knowledgeBody ?? "");
	const [teamId, setTeamId] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// AK5: when the knowledge fetch resolves, seed body state so derivedTitle and
	// POST payload are correct. This runs after the editor mounts (the knowledgeLoading
	// ternary below defers BodyEditor mount until the body is available).
	useEffect(() => {
		if (knowledgeBody != null && body === "") {
			setBody(knowledgeBody);
		}
	}, [knowledgeBody, body]);

	const resolvedTeamId = singleTeam ? (teams[0]?.id ?? "") : teamId;
	const derivedTitle = body.trim() ? deriveTitleFromPitch(body, "") : "";
	// .length > 0 keeps canCreate a boolean (string && would return last operand),
	// mirroring KnowledgeCreate.tsx:69.
	const canCreate = resolvedTeamId.trim().length > 0 && body.trim().length > 0 && !submitting;
	const isDirty = body.trim().length > 0;

	const handleCreate = async (): Promise<void> => {
		const trimmedBody = body.trim();
		if (!(trimmedBody && resolvedTeamId.trim())) return;

		setSubmitting(true);
		setError(null);

		const payload: Record<string, unknown> = {
			teamId: resolvedTeamId,
			description: trimmedBody,
		};

		// AK5: carry sourceKnowledgeItemId into the POST payload — the ONLY place on the
		// multi-team path where provenance can silently drop (architecture-critique carry-forward #2).
		if (fromKnowledgeId !== undefined) {
			payload.sourceKnowledgeItemId = fromKnowledgeId;
		}

		const res = await apiFetch("/api/bets", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			setError(data.error ?? `Failed to create bet: ${res.status}`);
			setSubmitting(false);
			return;
		}

		const created = (await res.json()) as { id: string };
		setSubmitting(false);
		navigate(`/work/bet/${created.id}`);
	};

	const handleCancel = (): void => {
		if (isDirty) {
			// Lightweight dirty-guard: misclick content-loss is a UX regression vs. dialog.
			// Do NOT intercept browser-back — native back is a route-page win (AG4 direction).
			// @lore AG3: mirrors BetCreateDialog.tsx:113 isDirty guard (AI2 migration).
			const confirmed = window.confirm("Leave without saving? Your draft will be lost.");
			if (!confirmed) return;
		}
		navigate("/work");
	};

	return (
		<PageScaffold
			data-testid="bet-create-page"
			header={
				<PageHeader
					title={
						<span data-testid="bet-create-title-preview">{derivedTitle || "Untitled bet"}</span>
					}
					leading={
						<Breadcrumb
							segments={[{ label: "Work", to: "/work" }, { label: "New bet" }]}
							LinkComponent={RRLink}
						/>
					}
					actions={
						<>
							<Button variant="secondary" size="sm" onClick={handleCancel} disabled={submitting}>
								Cancel
							</Button>
							<Button
								variant="primary"
								size="sm"
								data-testid="bet-create-submit"
								onClick={() => void handleCreate()}
								disabled={!canCreate}
							>
								{submitting ? "Creating…" : "Create"}
							</Button>
						</>
					}
				/>
			}
		>
			{/* Responsive two-column layout */}
			<div
				className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col sm:flex-row gap-[24px] items-start"
				data-testid="bet-create-body"
			>
				{/* Left: editor */}
				<div className="flex-1 min-w-0 flex flex-col gap-[12px]">
					{error && (
						<p
							role="alert"
							data-testid="bet-create-error"
							className="text-[12px] text-[var(--status-error)]"
						>
							{error}
						</p>
					)}
					<div
						className="border-[1.5px] border-[var(--border-default)] rounded-[var(--r-default)] p-[18px]"
						style={{ minHeight: "300px" }}
					>
						{/*
						 * @lore AK5: On the ?fromKnowledge= path, defer mounting BodyEditor
						 * until the knowledge fetch settles. TipTap captures initialContent
						 * once at mount and never re-syncs (lore T1). Mounting with body=""
						 * before the fetch resolves would leave the editor permanently empty.
						 * On the normal create path (no fromKnowledgeId), render immediately.
						 * knowledgeLoading is always false when fromKnowledgeId is undefined.
						 *
						 * initialContent uses knowledgeBody directly (not body state) on the
						 * ?fromKnowledge= path: body state may still be "" when BodyEditor first
						 * mounts (the seeding useEffect runs after render). knowledgeBody is
						 * guaranteed non-null here because we gate on !knowledgeLoading and
						 * knowledgeData.body is set by the time isLoading flips false.
						 * The body state is still synced via onChange for POST payload.
						 */}
						{fromKnowledgeId != null && knowledgeLoading ? (
							<div
								className="flex items-center justify-center h-[260px] text-[13px] text-[var(--text-tertiary)]"
								data-testid="bet-create-knowledge-loading"
							>
								Loading…
							</div>
						) : (
							<BodyEditor
								initialContent={fromKnowledgeId != null ? (knowledgeBody ?? "") : body}
								onChange={(md: string) => setBody(md)}
								placeholder="Describe the bet — problem, appetite, no-gos…"
								variant="full"
								minHeight="260px"
								editable={!submitting}
							/>
						)}
					</div>
				</div>

				{/* Right: commitments aside — responsive: full-width on mobile, fixed on sm+ */}
				<aside
					className="w-full sm:w-[240px] shrink-0 flex flex-col gap-[12px]"
					data-testid="bet-create-commitments"
				>
					<div className="bg-[var(--surface-page)] rounded-[var(--r-default)] p-[18px] flex flex-col gap-[12px]">
						{/* Team — shown only when multiple teams; single-team auto-resolves */}
						{singleTeam ? (
							/* Single-team static line: labelled commitment, not bare inline text */
							<div className="flex flex-col gap-[6px]">
								<span className="text-[12px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
									Team
								</span>
								<span className="text-[13px] text-[var(--text-primary)]">
									{teams[0]?.name ?? ""}
								</span>
							</div>
						) : (
							<div className="flex flex-col gap-[6px]">
								<label
									htmlFor="bet-create-team"
									className="text-[12px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]"
								>
									Team <span aria-hidden>(required)</span>
								</label>
								<Select
									id="bet-create-team"
									size="sm"
									className="w-full"
									value={teamId}
									onChange={(e) => setTeamId(e.target.value)}
									disabled={submitting}
									placeholder="Select a team…"
									options={teams.map((t) => ({ value: t.id, label: t.name }))}
								/>
							</div>
						)}
					</div>
				</aside>
			</div>
		</PageScaffold>
	);
}
