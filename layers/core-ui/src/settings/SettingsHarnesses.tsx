/**
 * SettingsHarnesses — Agent backends section (AV2 SplitView rewrite).
 *
 * AV2: Converted from HarnessCard list to ItemList/Row + SplitView.
 * - Left pane: ItemList of harness rows (one Row per descriptor)
 * - Right pane (destination): builtin → SettingsModels tier rows + CredentialsTab;
 *   non-builtin configurable → auth/capability detail; empty caps+models → no pane
 * - SplitView ratio persisted via useUiPreference("settings.backends", 0.42)
 *
 * Row sort order: actionable states first (unauthenticated → installed → ready → missing → unavailable)
 *
 * @lore AV2: SplitView ratio persistence requires container-owned wiring:
 *   const [ratio, setRatio] = useUiPreference("settings.backends", 0.42)
 *   then dividerRatio={ratio} onRatioChange={setRatio}
 * surfaceKey alone is informational only (SplitView.tsx:45 @lore AM5 T6).
 *
 * @lore AV2: hasCaps/models check gates split-open on click — a descriptor with
 * no caps AND no models does not open a destination pane (AC-4 spec).
 */

// hearth-internal-padding

import type { FoldMode } from "@hyperidle/design-system";
import {
	Button,
	EmptyState,
	ErrorState,
	ItemList,
	Row,
	RowDot,
	SkeletonList,
	SplitView,
	StatusChip,
} from "@hyperidle/design-system";
import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { type JSX, useCallback, useEffect, useState } from "react";
import { CredentialsTab } from "../components/CredentialsTab.js";
import { useUiPreference } from "../hooks/useUiPreference.js";
import { apiFetch } from "../services/api-fetch.js";
import { hasCaps, statusLine } from "./harness-presentation.js";
import { SettingsModels } from "./SettingsModels.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const STATE_ORDER: Record<string, number> = {
	unauthenticated: 0,
	installed: 1,
	ready: 2,
	missing: 3,
	unavailable: 4,
};

function sortDescriptors(
	descriptors: HarnessCapabilityDescriptor[],
): HarnessCapabilityDescriptor[] {
	return [...descriptors].sort((a, b) => {
		const aOrder = STATE_ORDER[a.discovery.state] ?? 99;
		const bOrder = STATE_ORDER[b.discovery.state] ?? 99;
		return aOrder - bOrder;
	});
}

/** Returns true if a descriptor has meaningful detail to show in the split pane. */
function hasDetail(d: HarnessCapabilityDescriptor): boolean {
	return hasCaps(d) || d.models.length > 0 || d.type === "builtin";
}

/** Map discovery state to StatusChip status. */
function discoveryStateToStatus(
	state: string,
): "healthy" | "behind" | "paused" | "error" | "unknown" {
	switch (state) {
		case "ready":
			return "healthy";
		case "unauthenticated":
		case "installed":
			return "behind";
		case "missing":
			return "error";
		default:
			return "unknown";
	}
}

// ---------------------------------------------------------------------------
// BuiltinDetail — tiers + credentials in the split pane
// ---------------------------------------------------------------------------

function BuiltinDetail(): JSX.Element {
	return (
		<div className="flex flex-col gap-[18px] p-[18px] overflow-y-auto h-full">
			<div>
				<p className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)] mb-[12px]">
					Model Tiers
				</p>
				<SettingsModels />
			</div>
			<div>
				<p className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)] mb-[12px]">
					Credentials
				</p>
				<CredentialsTab />
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// HarnessDetail — generic harness detail for non-builtin
// ---------------------------------------------------------------------------

interface HarnessDetailProps {
	descriptor: HarnessCapabilityDescriptor;
}

function HarnessDetail({ descriptor }: HarnessDetailProps): JSX.Element {
	const d = descriptor;
	const sl = statusLine(d);
	const version = d.discovery.version;

	return (
		<div className="flex flex-col gap-[12px] p-[18px] overflow-y-auto h-full">
			{/* Header */}
			<div className="flex items-center gap-[9px]">
				<p className="text-[15px] font-[600] text-[var(--text-primary)]">{d.name}</p>
				{version && (
					<span className="text-[12px] font-mono text-[var(--text-tertiary)]">v{version}</span>
				)}
				<StatusChip status={discoveryStateToStatus(d.discovery.state)} label={sl.text} />
			</div>

			{/* Models list */}
			{d.models.length > 0 && (
				<div>
					<p className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)] mb-[9px]">
						Models
					</p>
					<div className="flex flex-col gap-[6px]">
						{d.models.map((m) => (
							<div
								key={m.id}
								className="flex items-center justify-between text-[13px] text-[var(--text-secondary)] py-[3px]"
							>
								<span className="font-mono text-[12px]">{m.id}</span>
								{m.label && <span className="text-[var(--text-tertiary)]">{m.label}</span>}
							</div>
						))}
					</div>
				</div>
			)}

			{/* Auth action — show login command when kind is native_cli_login */}
			{d.authAction.kind === "native_cli_login" && d.authAction.command && (
				<div>
					<p className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)] mb-[9px]">
						Login
					</p>
					<code className="text-[12px] font-mono text-[var(--text-tertiary)] bg-[var(--surface-container)] px-[9px] py-[6px] rounded-[var(--r-subtle)] select-all block">
						{[...d.authAction.command].join(" ")}
					</code>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// SettingsHarnesses
// ---------------------------------------------------------------------------

type LoadState = "loading" | "ready" | "error";

export function SettingsHarnesses(): JSX.Element {
	const [loadState, setLoadState] = useState<LoadState>("loading");
	const [descriptors, setDescriptors] = useState<HarnessCapabilityDescriptor[]>([]);
	const [redetecting, setRedetecting] = useState(false);

	// SplitView state
	const [splitMode, setSplitMode] = useState<FoldMode>("fold-back");
	const [ratio, setRatio] = useUiPreference("settings.backends", 0.42);
	const [selectedType, setSelectedType] = useState<string | null>(null);

	// ── Fetch ──────────────────────────────────────────────────────────────────

	const loadDescriptors = useCallback(async (): Promise<void> => {
		setLoadState("loading");
		try {
			const res = await apiFetch("/api/harnesses");
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as HarnessCapabilityDescriptor[];
			setDescriptors(data);
			setLoadState("ready");
		} catch {
			setLoadState("error");
		}
	}, []);

	useEffect(() => {
		void loadDescriptors();
	}, [loadDescriptors]);

	// ── Re-detect ──────────────────────────────────────────────────────────────

	const handleRedetect = useCallback(async (): Promise<void> => {
		setRedetecting(true);
		try {
			const res = await apiFetch("/api/harnesses/redetect", { method: "POST" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as HarnessCapabilityDescriptor[];
			setDescriptors(data);
			setLoadState("ready");
		} catch {
			// On error (e.g. 429 rate-limit) don't overwrite the current list
		} finally {
			setRedetecting(false);
		}
	}, []);

	// ── Row click ──────────────────────────────────────────────────────────────

	const handleRowClick = useCallback((descriptor: HarnessCapabilityDescriptor): void => {
		if (!hasDetail(descriptor)) return;
		setSelectedType(descriptor.type);
		setSplitMode("split");
	}, []);

	const handleClose = useCallback((): void => {
		setSelectedType(null);
		setSplitMode("fold-back");
	}, []);

	// ── Render ─────────────────────────────────────────────────────────────────

	if (loadState === "loading") {
		return <SkeletonList rows={3} ariaLabel="Loading agent backends" />;
	}

	if (loadState === "error") {
		return (
			<ErrorState
				compact
				title="Couldn't detect backends"
				description="Please check your connection and try again."
				onRetry={() => void loadDescriptors()}
			/>
		);
	}

	if (descriptors.length === 0) {
		return (
			<EmptyState
				title="No agent backends detected"
				description="The built-in backend is always available as a fallback."
			/>
		);
	}

	const sorted = sortDescriptors(descriptors);
	const selectedDescriptor = selectedType
		? (sorted.find((d) => d.type === selectedType) ?? null)
		: null;

	return (
		<SplitView
			surfaceKey="settings.backends"
			dividerRatio={ratio}
			onRatioChange={setRatio}
			mode={splitMode}
			onModeChange={setSplitMode}
			origin={
				<div className="flex flex-col gap-[12px] p-[3px]">
					{/* Section header */}
					<div className="flex items-center justify-between">
						<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
							Providers
						</span>
						<div className="flex items-center gap-[9px]">
							<span className="text-[12px] text-[var(--text-tertiary)]">Checked just now</span>
							<Button
								variant="ghost"
								size="sm"
								aria-label="Re-detect backends"
								onClick={() => void handleRedetect()}
								disabled={redetecting}
							>
								{redetecting ? "Detecting…" : "Refresh"}
							</Button>
						</div>
					</div>

					{/* Backend rows */}
					<div className="border border-[var(--border-subtle)] rounded-[var(--r-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)] overflow-hidden">
						<ItemList as="ul" isEmpty={sorted.length === 0} variant="flush">
							{sorted.map((descriptor) => {
								const sl = statusLine(descriptor);
								const clickable = hasDetail(descriptor);
								// @lore AZ7 E7: Status → RowTone mapping mirrors the
								// original hand-rolled ladder exactly (healthy→success,
								// behind→warning, error|blocked→error, else→info); the dot itself
								// is now RowDot, not a private span + private color ladder.
								const dotTone =
									sl.tone === "healthy"
										? ("success" as const)
										: sl.tone === "behind"
											? ("warning" as const)
											: sl.tone === "error" || sl.tone === "blocked"
												? ("error" as const)
												: ("info" as const);
								const titleNode = (
									<span className="flex items-center gap-[6px]">
										<span className="text-[14px] font-[600] text-[var(--text-primary)]">
											{descriptor.name}
										</span>
										{descriptor.discovery.version && (
											<span className="text-[12px] font-mono text-[var(--text-tertiary)]">
												v{descriptor.discovery.version}
											</span>
										)}
									</span>
								);
								return (
									<Row
										key={descriptor.type}
										as="li"
										title={titleNode}
										subtitle={sl.text}
										lead={<RowDot tone={dotTone} title={sl.text} />}
										selected={selectedType === descriptor.type}
										onClick={clickable ? () => handleRowClick(descriptor) : undefined}
									/>
								);
							})}
						</ItemList>
					</div>
				</div>
			}
			destination={
				selectedDescriptor ? (
					<div className="flex flex-col h-full">
						<div className="flex items-center justify-between px-[18px] py-[12px] border-b border-[var(--border-subtle)]">
							<p className="text-[13px] font-[600] text-[var(--text-primary)]">
								{selectedDescriptor.name}
							</p>
							<Button variant="ghost" size="sm" aria-label="Close detail" onClick={handleClose}>
								✕
							</Button>
						</div>
						<div className="flex-1 min-h-0 overflow-y-auto">
							{selectedDescriptor.type === "builtin" ? (
								<BuiltinDetail />
							) : (
								<HarnessDetail descriptor={selectedDescriptor} />
							)}
						</div>
					</div>
				) : (
					<></>
				)
			}
		/>
	);
}
