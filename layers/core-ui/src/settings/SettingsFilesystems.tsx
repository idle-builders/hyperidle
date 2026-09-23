/**
 * AO1 — SettingsFilesystems: the folders a person's team can reach.
 *
 * @lore BC5 T10: the door swap — `call("open_user", {})` replaces the
 * `/api/org` + `/api/filesystems?teamId=` pair (architecture.md §8). A
 * person's `folders` on `UserView` is already their team's registry — no
 * second call to resolve the team id first.
 */

import type { FolderView } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";
// hearth-internal-padding
import { type Status, StatusChip, Tag } from "../ds";
import { call } from "../services/call.js";

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function stateToStatus(s: FolderView["state"]): Status | "unknown" {
	if (s === "reachable") return "healthy";
	if (s === "needs_attention") return "behind";
	return "unknown";
}

function stateLabel(s: FolderView["state"]): string {
	if (s === "reachable") return "Reachable";
	if (s === "needs_attention") return "Needs attention";
	return "Attached";
}

function sourceLabel(s: string): string {
	const labels: Record<string, string> = {
		github: "GitHub",
		gdrive: "Google Drive",
		obsidian: "Obsidian",
		local: "Local",
	};
	return labels[s] ?? s;
}

function resourceDisplay(item: FolderView): string {
	return item.resourceRef.kind === "code" ? item.resourceRef.repo : item.resourceRef.folder;
}

function resourceBranch(item: FolderView): string | null {
	return item.resourceRef.kind === "code" ? item.resourceRef.branch : null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsFilesystems(): JSX.Element {
	const [filesystems, setFilesystems] = useState<FolderView[]>([]);
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

	const load = useCallback(async (): Promise<void> => {
		setStatus("loading");
		const result = await call("open_user", {});
		if (!result.ok) {
			setStatus("error");
			return;
		}
		setFilesystems([...result.data.folders]);
		setStatus("ready");
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	if (status === "loading") {
		return (
			<div className="flex flex-col gap-[12px]">
				<p className="type-metadata  text-[var(--text-tertiary)]">Loading filesystems…</p>
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex flex-col gap-[12px]">
				<p className="type-metadata  text-[var(--status-error)]">Failed to load filesystems.</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-[24px]">
			<p className="type-metadata max-w-[560px]  text-[var(--text-tertiary)]">
				Filesystems your team has registered — a code repository or a document set where work lives
				and accrues history. Registered once here; inject into a bot from its config under Agents.
			</p>
			<div className="flex flex-col gap-[12px]">
				<div className="flex items-center justify-between">
					<span className="type-label   uppercase  text-[var(--text-tertiary)]">
						Registered filesystems
					</span>
				</div>
				{filesystems.length === 0 ? (
					<p className="type-metadata  text-[var(--text-tertiary)]">
						No filesystems registered yet.
					</p>
				) : (
					<div className="border-width-thin overflow-hidden rounded-[var(--r-default)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]">
						{filesystems.map((fs, index) => (
							<div key={fs.id}>
								{index > 0 ? <div className="h-px bg-[var(--border-subtle)]" /> : null}
								<div className="flex items-center gap-[12px] px-[12px] py-[12px]">
									<div className="shrink-0">
										<Tag label={sourceLabel(fs.source)} />
									</div>
									<div className="flex min-w-0 flex-1 flex-col gap-[3px]">
										<div className="flex items-center gap-[9px]">
											<span className="type-data truncate   text-[var(--text-primary)]">
												{resourceDisplay(fs)}
											</span>
											{resourceBranch(fs) ? (
												<span className="type-data   text-[var(--text-tertiary)]">
													@{resourceBranch(fs)}
												</span>
											) : null}
											<Tag label={fs.kind} />
										</div>
										<span className="type-metadata  text-[var(--text-tertiary)]">
											{fs.connectionId ? `Connection: ${fs.connectionId}` : "Local (no connection)"}
										</span>
									</div>
									<div className="flex shrink-0 items-center gap-[9px]">
										<StatusChip status={stateToStatus(fs.state)} label={stateLabel(fs.state)} />
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
