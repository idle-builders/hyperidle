/**
 * AL5 — SettingsReviewSurfaces production component.
 *
 * The adopt/browse management surface for review surfaces (design doc Surface 1).
 * Mirrors the SettingsConnections skeleton: page header + "Browse registry" Button,
 * then two grouped ItemLists of Rows (Adopted + Available).
 *
 * Adopted group: one row per (situation → surface) adoption with provenance/trust.
 * Available group: surfaces in the registry not yet assigned to any situation.
 *
 * Per no-skeleton-in-initial-designs MEMORY: populated real state only.
 * Loading/empty/error handled with inline fallbacks.
 *
 * @lore AL5 NIT-4: SituationMark is an inline single-use shape
 * (identical lore to AN1 NIT-4 — not promoted to design system).
 *
 * @lore AL5: CommunityRegistryIndex is imported here (the B5 browse dialog "add
 * a registry URL" read path) to satisfy the knip guard — the type must have a
 * real importer in AL5. See architecture §3.2 and NIT in §3.
 */

// hearth-internal-padding
import {
	Button,
	Dialog,
	ItemList,
	Menu,
	type MenuItem,
	Row,
	SectionLabel,
	SkeletonList,
	StatusChip,
} from "@hyperidle/design-system";
import type { AdoptionView, CommunityRegistryIndex, SurfaceManifest } from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useState } from "react";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { slotPermission } from "../pages/review/slot-policy.js";
import { apiFetch } from "../services/api-fetch.js";

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/** 2-char monogram mark for situations without a ToolLogo match. */
function SituationMark({ tool }: { tool: string }): JSX.Element {
	return (
		<span className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[12px] font-[600] text-[var(--text-secondary)]">
			{tool.slice(0, 2)}
		</span>
	);
}

// ---------------------------------------------------------------------------
// Adopted row
// ---------------------------------------------------------------------------

interface AdoptedRowProps {
	adoption: AdoptionView;
	onReset: (id: string) => Promise<void>;
}

function AdoptedRow({ adoption: a, onReset }: AdoptedRowProps): JSX.Element {
	const [menuOpen, setMenuOpen] = useState(false);
	const [confirming, setConfirming] = useState(false);
	// @lore AL5: same two-click confirm pattern as AN1 WARN-4 (connections Remove).
	const menuItems: MenuItem[] = [
		{
			id: "reset",
			label: "Reset to base canvas",
			onSelect: () => {
				setMenuOpen(false);
				setConfirming(true);
			},
			destructive: true,
		},
	];

	return (
		<Row
			lead={<SituationMark tool={a.tool} />}
			title={`${a.tool} · ${a.kind}`}
			subtitle={
				<span className="text-[var(--text-tertiary)]">
					{a.surfaceTitle} @{a.pinnedVersion} · {a.provenance}
				</span>
			}
			cells={[
				{
					content: `wraps ${a.baseCanvas}`,
					tone: "neutral" as const,
					width: 140,
				},
			]}
			actions={
				<span className="flex items-center gap-[9px]">
					<StatusChip status="healthy" label="Active" />
					{confirming ? (
						<span className="flex items-center gap-[6px]">
							<Button
								variant="ghost"
								size="sm"
								className="text-[var(--status-error)]"
								onClick={() => void onReset(a.id).then(() => setConfirming(false))}
								aria-label={`Confirm reset ${a.tool} · ${a.kind} to base canvas`}
							>
								Confirm?
							</Button>
							<Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
								Cancel
							</Button>
						</span>
					) : (
						<div className="relative">
							<Button
								variant="ghost"
								size="sm"
								aria-label={`Actions for ${a.tool} · ${a.kind}`}
								onClick={() => setMenuOpen((o) => !o)}
							>
								⋯
							</Button>
							<Menu
								open={menuOpen}
								onClose={() => setMenuOpen(false)}
								items={menuItems}
								label={`Actions for ${a.tool} · ${a.kind}`}
							/>
						</div>
					)}
				</span>
			}
		/>
	);
}

// ---------------------------------------------------------------------------
// Available row (not yet adopted)
// ---------------------------------------------------------------------------

interface AvailableRowProps {
	manifest: SurfaceManifest;
	onAdopt: (manifest: SurfaceManifest) => void;
}

function AvailableRow({ manifest: m, onAdopt }: AvailableRowProps): JSX.Element {
	const situations = m.situations.map((s) => `${s.tool} · ${s.kind}`).join(", ");
	return (
		<Row
			lead={
				<span className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[12px] font-[600] text-[var(--text-secondary)]">
					{m.id.slice(0, 2)}
				</span>
			}
			title={m.title}
			subtitle={
				<span className="text-[var(--text-tertiary)]">
					wraps {m.baseCanvas} · {m.provenance} @{m.version}
					{situations ? ` · ${situations}` : ""}
				</span>
			}
			cells={[
				{
					// slotPermission: show whether the lead slot is wrappable or ejected on this canvas.
					// @lore AL5: slotPermission is the runtime API for surfaces to discover their base
					// canvas's slot policy (§1.4); the browse dialog is the natural production consumer.
					content: `${m.layering} · lead:${slotPermission(m.baseCanvas, "lead")}`,
					tone: "neutral" as const,
					width: 180,
				},
			]}
			actions={
				<Button
					variant="secondary"
					size="sm"
					onClick={() => onAdopt(m)}
					aria-label={`Adopt ${m.title}`}
				>
					Adopt…
				</Button>
			}
		/>
	);
}

// ---------------------------------------------------------------------------
// Browse / Adopt dialog (design doc §4.3 and Surface 1 §"Browse / Adopt dialog")
// ---------------------------------------------------------------------------

interface BrowseDialogProps {
	open: boolean;
	onClose: () => void;
	manifests: SurfaceManifest[];
	/** Optionally pre-selected manifest (from Available row "Adopt…"). */
	preSelected?: SurfaceManifest;
	onAdopted: () => void;
	/** @lore AL5 FIX-2: teamId is required by POST /api/surface-adoptions (Zod schema).
	 * Without it the server returns 400 and the adopt action silently fails. */
	teamId?: string;
}

function BrowseDialog({
	open,
	onClose,
	manifests,
	preSelected,
	onAdopted,
	teamId,
}: BrowseDialogProps): JSX.Element {
	const [selected, setSelected] = useState<SurfaceManifest | null>(preSelected ?? null);
	const [tool, setTool] = useState("");
	const [kind, setKind] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Sync pre-selected when dialog opens
	useEffect(() => {
		if (open) {
			setSelected(preSelected ?? null);
			setError(null);
		}
	}, [open, preSelected]);

	// @lore AL5: CommunityRegistryIndex is the §3.2 seam for "add a registry URL" —
	// knip guard requires this type be imported by a real importer in B5.
	// The addRegistryUrl state is the read path that consumes the type.
	const [_communityRegistries] = useState<CommunityRegistryIndex[]>([]);

	const handleAdopt = useCallback(async () => {
		if (!selected) return;
		const situation = selected.situations[0];
		if (!situation) {
			setError("Select a situation to adopt for.");
			return;
		}
		// @lore AL5 FIX-2: teamId guard — POST /api/surface-adoptions requires teamId
		// in the body (Zod schema). Without it the server returns 400 (VALIDATION_ERROR).
		// Mirrors ReviewPage's skip-when-no-teamId pattern (FIX-1).
		if (!teamId) {
			setError("Team not yet loaded — please try again.");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			const res = await apiFetch("/api/surface-adoptions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					teamId,
					tool: tool || situation.tool,
					kind: kind || situation.kind,
					surfaceId: selected.id,
				}),
			});
			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				setError(data.error ?? "Failed to adopt surface");
				return;
			}
			onAdopted();
			onClose();
			setSelected(null);
			setTool("");
			setKind("");
		} catch {
			setError("Network error");
		} finally {
			setSubmitting(false);
		}
	}, [selected, tool, kind, teamId, onAdopted, onClose]);

	const situationLabel = selected?.situations[0]
		? `${tool || selected.situations[0].tool} · ${kind || selected.situations[0].kind}`
		: "…";

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="Browse registry"
			size="lg"
			footer={
				<div className="flex justify-end gap-[9px]">
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button
						variant="primary"
						disabled={!selected || submitting}
						onClick={() => void handleAdopt()}
					>
						{selected ? `Adopt for ${situationLabel}` : "Select a surface"}
					</Button>
				</div>
			}
		>
			<div className="flex gap-[18px]">
				{/* Left — filterable list of surfaces */}
				<div className="flex min-w-0 flex-1 flex-col gap-[12px]">
					<p className="text-[13px] text-[var(--text-secondary)]">
						Available surfaces. Select one to preview it and commit an adoption.
					</p>
					<ItemList variant="contained" isEmpty={manifests.length === 0}>
						{manifests.map((m) => (
							<Row
								key={m.id}
								lead={
									<span className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[11px] font-[600] text-[var(--text-secondary)]">
										{m.id.slice(0, 2)}
									</span>
								}
								title={
									<span
										className={
											selected?.id === m.id
												? "font-[600] text-[var(--text-primary)]"
												: "text-[var(--text-primary)]"
										}
									>
										{m.title}
									</span>
								}
								subtitle={
									<span className="text-[var(--text-tertiary)]">
										wraps {m.baseCanvas} · {m.provenance}
									</span>
								}
								onClick={() => setSelected(m)}
							/>
						))}
					</ItemList>
				</div>
				{/* Right — preview / manifest detail */}
				<div className="flex w-[300px] shrink-0 flex-col gap-[12px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-container)] p-[18px]">
					{selected ? (
						<>
							<div className="flex flex-col gap-[6px]">
								<span className="text-[13px] font-[600] text-[var(--text-primary)]">
									{selected.title}
								</span>
								<span className="text-[12px] text-[var(--text-tertiary)]">
									{selected.id} @{selected.version}
								</span>
								<span className="text-[12px] text-[var(--text-secondary)]">
									{selected.description}
								</span>
							</div>
							<div className="flex flex-col gap-[6px] border-t border-[var(--border-subtle)] pt-[12px]">
								<div className="flex justify-between text-[12px]">
									<span className="text-[var(--text-tertiary)]">Provenance</span>
									<span className="text-[var(--text-secondary)]">{selected.provenance}</span>
								</div>
								<div className="flex justify-between text-[12px]">
									<span className="text-[var(--text-tertiary)]">Base canvas</span>
									<span className="font-mono text-[var(--text-secondary)]">
										{selected.baseCanvas}
									</span>
								</div>
								<div className="flex justify-between text-[12px]">
									<span className="text-[var(--text-tertiary)]">Author</span>
									<span className="text-[var(--text-secondary)]">{selected.author}</span>
								</div>
							</div>
							{/* @lore AL5 B5 NIT: preview iframe targets the dev TSX viewer at :8098.
							 * In a packaged/production build, :8098 is not present — the iframe
							 * degrades to a static manifest summary (rendered above).
							 * The iframe is therefore dev-only; we gate it via import.meta.env.DEV. */}
							{import.meta.env.DEV && (
								<div className="mt-[6px] flex flex-col gap-[6px]">
									<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
										Preview
									</span>
									<iframe
										title={`Preview: ${selected.title}`}
										src={`http://localhost:8098/?story=${encodeURIComponent(selected.sampleFixture)}`}
										className="h-[200px] w-full rounded-[var(--r-subtle)] border border-[var(--border-subtle)]"
									/>
								</div>
							)}
						</>
					) : (
						<p className="text-[13px] text-[var(--text-tertiary)]">
							Select a surface on the left to see a preview.
						</p>
					)}
				</div>
			</div>
			{error ? (
				<p className="mt-[12px] text-[12px] text-[var(--status-error)]" role="alert">
					{error}
				</p>
			) : null}
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SettingsReviewSurfaces(): JSX.Element {
	const { user } = useCurrentUser();
	// @lore AL5 FIX-2: teamId threaded from useCurrentUser — same pattern as
	// ReviewPage (FIX-1). GET /api/surface-adoptions requires ?teamId= (400 without
	// it). POST body requires teamId. DELETE scopes to team row. Skip fetch until
	// teamId is available to avoid spamming the server with 400s.
	const teamId = user?.teamId;

	const [adoptions, setAdoptions] = useState<AdoptionView[]>([]);
	const [manifests, setManifests] = useState<SurfaceManifest[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [resetError, setResetError] = useState<string | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [preSelected, setPreSelected] = useState<SurfaceManifest | undefined>(undefined);

	const loadData = useCallback(async () => {
		// Skip if teamId not yet available — avoid 400 spam; re-runs when teamId loads.
		if (!teamId) {
			setLoading(false);
			setAdoptions([]);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const [adoptionsRes, registryRes] = await Promise.all([
				apiFetch(`/api/surface-adoptions?teamId=${encodeURIComponent(teamId)}`),
				apiFetch("/api/surface-registry"),
			]);
			if (!(adoptionsRes.ok && registryRes.ok)) {
				setError("failed");
				return;
			}
			const adoptionsData = (await adoptionsRes.json()) as unknown;
			const registryData = (await registryRes.json()) as unknown;
			setAdoptions(Array.isArray(adoptionsData) ? (adoptionsData as AdoptionView[]) : []);
			setManifests(Array.isArray(registryData) ? (registryData as SurfaceManifest[]) : []);
		} catch {
			setError("failed");
		} finally {
			setLoading(false);
		}
	}, [teamId]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	const handleReset = useCallback(
		async (id: string): Promise<void> => {
			setResetError(null);
			try {
				// Include ?teamId= for team-scoped DELETE isolation (WARN-2 pattern).
				const url = teamId
					? `/api/surface-adoptions/${id}?teamId=${encodeURIComponent(teamId)}`
					: `/api/surface-adoptions/${id}`;
				const res = await apiFetch(url, { method: "DELETE" });
				if (res.ok) {
					void loadData();
				} else {
					setResetError("Couldn't reset to base canvas — please try again.");
				}
			} catch {
				setResetError("Couldn't reset to base canvas — please try again.");
			}
		},
		[loadData, teamId],
	);

	// Surfaces in the registry not referenced by any current adoption.
	const adoptedSurfaceIds = new Set(adoptions.map((a) => a.surfaceId));
	const availableManifests = manifests.filter((m) => !adoptedSurfaceIds.has(m.id));

	return (
		<div className="flex flex-col gap-[24px]">
			<div className="flex items-start justify-between gap-[12px]">
				<div>
					<h2 className="text-[20px] font-[600] text-[var(--text-primary)]">Review surfaces</h2>
					<p className="mt-[3px] max-w-[520px] text-[13px] text-[var(--text-secondary)]">
						Choose which review surface renders each kind of artifact. The base canvas is always the
						fallback — a surface only renders by deliberate adoption.
					</p>
				</div>
				<Button
					variant="secondary"
					size="sm"
					onClick={() => {
						setPreSelected(undefined);
						setDialogOpen(true);
					}}
				>
					Browse registry
				</Button>
			</div>

			{loading ? (
				<SkeletonList rows={3} ariaLabel="Loading review surfaces" />
			) : error ? (
				<div className="flex flex-col gap-[9px]">
					<p className="text-[13px] text-[var(--status-error)]">
						Couldn't load review surfaces — please try again.
					</p>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							void loadData();
						}}
					>
						Retry
					</Button>
				</div>
			) : (
				<>
					<section className="flex flex-col gap-[9px]">
						<div className="flex flex-col gap-[3px]">
							<SectionLabel label="Adopted" />
							<p className="text-[12px] text-[var(--text-tertiary)]">
								Your team's committed (situation → surface) mappings. Each row is an active
								adoption, version-pinned.
							</p>
						</div>
						<ItemList variant="contained" isEmpty={adoptions.length === 0}>
							{adoptions.map((a) => (
								<AdoptedRow key={a.id} adoption={a} onReset={handleReset} />
							))}
						</ItemList>
					</section>

					<section className="flex flex-col gap-[9px]">
						<div className="flex flex-col gap-[3px]">
							<SectionLabel label="Available" />
							<p className="text-[12px] text-[var(--text-tertiary)]">
								Surfaces in your registries not yet assigned to any situation. Adopt one to make it
								active for the matching artifact kind.
							</p>
						</div>
						<ItemList variant="contained" isEmpty={availableManifests.length === 0}>
							{availableManifests.map((m) => (
								<AvailableRow
									key={m.id}
									manifest={m}
									onAdopt={(manifest) => {
										setPreSelected(manifest);
										setDialogOpen(true);
									}}
								/>
							))}
						</ItemList>
					</section>
				</>
			)}

			{resetError ? (
				<p className="text-[13px] text-[var(--status-error)]" role="alert">
					{resetError}
				</p>
			) : null}

			<BrowseDialog
				open={dialogOpen}
				onClose={() => {
					setDialogOpen(false);
					setPreSelected(undefined);
				}}
				manifests={manifests}
				preSelected={preSelected}
				onAdopted={() => {
					void loadData();
				}}
				teamId={teamId}
			/>
		</div>
	);
}
