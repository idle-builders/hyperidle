/**
 * AO1 — SettingsFilesystems: the TEAM FILESYSTEM REGISTRY (live component).
 *
 * Fetches from GET /api/filesystems?teamId=<id> (the team registry list).
 * Mirrors the static story shape in SettingsFilesystems.stories.tsx.
 *
 * @lore AO1: The registry is team-scoped (filesystems.team_id → teams.id).
 * The team's actual id (teams.id) is fetched from /api/org → teamActualId.
 * Per-bot injection lives on the agent's config panel in SettingsAgents.
 */

// hearth-internal-padding
import { Button, type Status, StatusChip, Tag } from "@hyperidle/design-system";
import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

// ---------------------------------------------------------------------------
// Wire types from the API (mirrors @hyperidle/shared Filesystem)
// ---------------------------------------------------------------------------

interface FilesystemApiItem {
	id: string;
	teamId: string;
	source: string;
	kind: string;
	connectionId: string | null;
	resourceRef: { kind: string; repo?: string; branch?: string; folder?: string };
	writeback: string;
	state: string;
	createdAt: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function stateToStatus(s: string): Status | "unknown" {
	if (s === "reachable") return "healthy";
	if (s === "needs_attention") return "behind";
	return "unknown";
}

function stateLabel(s: string): string {
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

function resourceDisplay(item: FilesystemApiItem): string {
	const ref = item.resourceRef;
	return ref.repo ?? ref.folder ?? "—";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsFilesystems(): JSX.Element {
	const [filesystems, setFilesystems] = useState<FilesystemApiItem[]>([]);
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

	const load = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			// AO1: must use teams.id (the registry scope). Get it from /api/org → teamActualId.
			const orgRes = await apiFetch("/api/org");
			if (!orgRes.ok) {
				setStatus("error");
				return;
			}
			const orgJson = (await orgRes.json()) as {
				teams?: Array<{ id: string; name: string; teamActualId?: string }>;
			};
			const firstTeamActualId = orgJson.teams?.[0]?.teamActualId;
			if (!firstTeamActualId) {
				// No team yet — empty list is correct
				setFilesystems([]);
				setStatus("ready");
				return;
			}

			const fsRes = await apiFetch(
				`/api/filesystems?teamId=${encodeURIComponent(firstTeamActualId)}`,
			);
			if (!fsRes.ok) {
				setStatus("error");
				return;
			}
			const fsJson = (await fsRes.json()) as { filesystems: FilesystemApiItem[] };
			setFilesystems(Array.isArray(fsJson.filesystems) ? fsJson.filesystems : []);
			setStatus("ready");
		} catch {
			setStatus("error");
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	if (status === "loading") {
		return (
			<div className="flex flex-col gap-[12px]">
				<p className="text-[12px] text-[var(--text-tertiary)]">Loading filesystems…</p>
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex flex-col gap-[12px]">
				<p className="text-[12px] text-[var(--status-error)]">Failed to load filesystems.</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-[24px]">
			<p className="max-w-[560px] text-[12px] text-[var(--text-tertiary)]">
				Filesystems your team has registered — a code repository or a document set where work lives
				and accrues history. Registered once here; inject into a bot from its config under Agents.
			</p>
			<div className="flex flex-col gap-[12px]">
				<div className="flex items-center justify-between">
					<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						Registered filesystems
					</span>
					<Button variant="ghost" size="sm" aria-label="Add a filesystem to the team registry">
						+ Add filesystem
					</Button>
				</div>
				{filesystems.length === 0 ? (
					<p className="text-[12px] text-[var(--text-tertiary)]">No filesystems registered yet.</p>
				) : (
					<div className="overflow-hidden rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]">
						{filesystems.map((fs, index) => (
							<div key={fs.id}>
								{index > 0 ? <div className="h-px bg-[var(--border-subtle)]" /> : null}
								<div className="flex items-center gap-[12px] px-[12px] py-[12px]">
									<div className="shrink-0">
										<Tag label={sourceLabel(fs.source)} />
									</div>
									<div className="flex min-w-0 flex-1 flex-col gap-[3px]">
										<div className="flex items-center gap-[9px]">
											<span className="truncate font-[family-name:var(--font-mono)] text-[13px] text-[var(--text-primary)]">
												{resourceDisplay(fs)}
											</span>
											{fs.resourceRef.branch ? (
												<span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-tertiary)]">
													@{fs.resourceRef.branch}
												</span>
											) : null}
											<Tag label={fs.kind} />
										</div>
										<span className="text-[12px] text-[var(--text-tertiary)]">
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
