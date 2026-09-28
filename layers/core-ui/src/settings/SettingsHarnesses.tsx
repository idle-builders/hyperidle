// hearth-internal-padding

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { type JSX, useCallback, useEffect, useState } from "react";
import type { FoldMode } from "../ds";
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
} from "../ds";
import { useUiPreference } from "../hooks/useUiPreference.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { call } from "../services/call.js";
import { hasCaps, statusLine } from "./harness-presentation.js";

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

function hasDetail(d: HarnessCapabilityDescriptor): boolean {
	const hasLoginCommand = d.authAction.kind === "native_cli_login" && !!d.authAction.command;
	return hasCaps(d) || d.models.length > 0 || hasLoginCommand;
}

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

interface HarnessDetailProps {
	descriptor: HarnessCapabilityDescriptor;
}

function HarnessDetail({ descriptor }: HarnessDetailProps): JSX.Element {
	const d = descriptor;
	const sl = statusLine(d);
	const version = d.discovery.version;

	return (
		<div className="flex flex-col gap-[12px] p-[18px] overflow-y-auto h-full">
			{/* header */}
			<div className="flex items-center gap-[9px]">
				<p className="type-copy   text-[var(--text-primary)]">{d.name}</p>
				{version && <span className="type-data   text-[var(--text-tertiary)]">v{version}</span>}
				<StatusChip status={discoveryStateToStatus(d.discovery.state)} label={sl.text} />
			</div>

			{/* models list */}
			{d.models.length > 0 && (
				<div>
					<p className="type-label   uppercase  text-[var(--text-tertiary)] mb-[9px]">Models</p>
					<div className="flex flex-col gap-[6px]">
						{d.models.map((m) => (
							<div
								key={m.id}
								className="type-small flex items-center justify-between  text-[var(--text-secondary)] py-[3px]"
							>
								<span className="type-data  ">{m.id}</span>
								{m.label && <span className="text-[var(--text-tertiary)]">{m.label}</span>}
							</div>
						))}
					</div>
				</div>
			)}

			{/* auth action — show login command when kind is native_cli_login */}
			{d.authAction.kind === "native_cli_login" && d.authAction.command && (
				<div>
					<p className="type-label   uppercase  text-[var(--text-tertiary)] mb-[9px]">Login</p>
					<code className="type-data   text-[var(--text-tertiary)] bg-[var(--surface-container)] px-[9px] py-[6px] rounded-[var(--r-subtle)] select-all block">
						{[...d.authAction.command].join(" ")}
					</code>
				</div>
			)}
		</div>
	);
}

type LoadState = "loading" | "ready" | "error";

export function SettingsHarnesses(): JSX.Element {
	const [loadState, setLoadState] = useState<LoadState>("loading");
	const [descriptors, setDescriptors] = useState<HarnessCapabilityDescriptor[]>([]);
	const [redetecting, setRedetecting] = useState(false);
	const [selfId, setSelfId] = useState<string | null>(null);

	// SplitView state
	const [splitMode, setSplitMode] = useState<FoldMode>("fold-back");
	const [ratio, setRatio] = useUiPreference("settings.backends", 0.42);
	const [selectedType, setSelectedType] = useState<string | null>(null);
	const { sidebarMobile } = useViewportBreakpoint();

	// ── Fetch ──────────────────────────────────────────────────────────────────

	const loadDescriptors = useCallback(async (): Promise<void> => {
		setLoadState("loading");
		try {
			const result = await call("open_user", {});
			if (!result.ok || result.data.user === null) {
				setLoadState("error");
				return;
			}
			setSelfId(result.data.user.id);
			setDescriptors([...result.data.runsOn]);
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
		if (!selfId) return;
		setRedetecting(true);
		try {
			const result = await call("edit_user", { id: selfId, redetectHarnesses: true });
			if (result.ok) {
				setDescriptors([...result.data.runsOn]);
				setLoadState("ready");
			}
			// On error (e.g. 429 rate-limit) don't overwrite the current list
		} catch {
			// On error don't overwrite the current list
		} finally {
			setRedetecting(false);
		}
	}, [selfId]);

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
				description="HyperIdle runs your agents through a coding CLI you install and sign into. Install one, sign in, then re-detect."
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
			compact={sidebarMobile}
			originLabel="agent backends"
			origin={
				<div className="flex flex-col gap-[12px] p-[3px]">
					{/* section header */}
					<div className="flex items-center justify-between">
						<span className="type-label   uppercase  text-[var(--text-tertiary)]">Providers</span>
						<div className="flex items-center gap-[9px]">
							<span className="type-metadata  text-[var(--text-tertiary)]">Checked just now</span>
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

					{/* backend rows — variant="boxed" is the one hairline-border-container spelling */}
					<ItemList as="ul" isEmpty={sorted.length === 0} variant="boxed">
						{sorted.map((descriptor) => {
							const sl = statusLine(descriptor);
							const clickable = hasDetail(descriptor);
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
									<span className="type-copy   text-[var(--text-primary)]">{descriptor.name}</span>
									{descriptor.discovery.version && (
										<span className="type-data   text-[var(--text-tertiary)]">
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
			}
			destination={
				selectedDescriptor ? (
					<div className="flex flex-col h-full">
						<div className="border-width-thin-b flex items-center justify-between px-[18px] py-[12px]  border-[var(--border-subtle)]">
							<p className="type-small   text-[var(--text-primary)]">{selectedDescriptor.name}</p>
							<Button variant="ghost" size="sm" aria-label="Close detail" onClick={handleClose}>
								<svg
									viewBox="0 0 16 16"
									fill="currentColor"
									style={{ width: 12, height: 12 }}
									aria-hidden="true"
								>
									<path d="M4.2 3.1L3.1 4.2 6.9 8l-3.8 3.8 1.1 1.1L8 9.1l3.8 3.8 1.1-1.1L9.1 8l3.8-3.8-1.1-1.1L8 6.9 4.2 3.1z" />
								</svg>
							</Button>
						</div>
						<div className="flex-1 min-h-0 overflow-y-auto">
							<HarnessDetail descriptor={selectedDescriptor} />
						</div>
					</div>
				) : (
					// biome-ignore lint/complexity/noUselessFragments: SplitView.destination is typed JSX.Element (non-nullable) — an empty fragment is the only valid "render nothing" value.
					<></>
				)
			}
		/>
	);
}
