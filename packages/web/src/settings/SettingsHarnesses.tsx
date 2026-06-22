/**
 * SettingsHarnesses — Agent backends section (AM4, Variant C "Dense List").
 *
 * Fetches GET /api/harnesses on mount (and after re-detect/toggle).
 * Renders a PROVIDERS-labeled section header with a ghost Refresh button,
 * then ONE bordered container with hairline-divided rows — one per descriptor.
 *
 * Actionable-first row order: unauthenticated → installed → ready → missing → unavailable.
 *
 * @lore AM4: descriptors come from the route handler which stamps discovery.disabled
 * (CHANGE 3, Seam 3). The pool is DB-free; the toggle writes POST /:type/disabled and
 * refreshes from the response (the API returns the fresh list with re-stamped disabled).
 */

// hearth-internal-padding

import { Button, EmptyState, ErrorState, SkeletonList } from "@hyperidle/design-system";
import type { HarnessCapabilityDescriptor } from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import { HarnessCard } from "./HarnessCard.js";

// Row sort order: actionable states first
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

type LoadState = "loading" | "ready" | "error";

export function SettingsHarnesses(): JSX.Element {
	const [loadState, setLoadState] = useState<LoadState>("loading");
	const [descriptors, setDescriptors] = useState<HarnessCapabilityDescriptor[]>([]);
	const [redetecting, setRedetecting] = useState(false);

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
			// On error (e.g. 429 rate-limit) we don't overwrite the current list
		} finally {
			setRedetecting(false);
		}
	}, []);

	// ── Toggle ─────────────────────────────────────────────────────────────────

	const handleToggle = useCallback(async (type: string, disabled: boolean): Promise<void> => {
		try {
			const res = await apiFetch(`/api/harnesses/${encodeURIComponent(type)}/disabled`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ disabled }),
			});
			if (!res.ok) return; // silently fail — state is still correct from last load
			// API returns fresh descriptor list with discovery.disabled re-stamped
			const data = (await res.json()) as HarnessCapabilityDescriptor[];
			setDescriptors(data);
		} catch {
			// silently fail — re-load to sync state
		}
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

	return (
		<div className="flex flex-col gap-[12px]">
			{/* Section header: "PROVIDERS" label · "Checked just now" · Refresh */}
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

			{/* ONE bordered container with hairline-divided rows */}
			<div className="border border-[var(--border-subtle)] rounded-[var(--r-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)] overflow-hidden">
				{sorted.map((descriptor, index) => (
					<div key={descriptor.type}>
						{index > 0 && <div className="h-px bg-[var(--border-subtle)]" />}
						<HarnessCard
							descriptor={descriptor}
							onToggle={(type, disabled) => void handleToggle(type, disabled)}
						/>
					</div>
				))}
			</div>
		</div>
	);
}
