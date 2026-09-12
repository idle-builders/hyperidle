/**
 * AO1 — SettingsFilesystems: the TEAM FILESYSTEM REGISTRY (live component).
 *
 * Fetches from GET /api/filesystems?teamId=<id> (the team registry list).
 * Mirrors the static story shape in SettingsFilesystems.stories.tsx.
 *
 * @lore AO1: The registry is team-scoped (filesystems.team_id → teams.id).
 * The team's actual id (teams.id) is fetched from /api/org → teamActualId.
 * Per-bot injection lives on the agent's config panel in SettingsAgents.
 *
 * @lore BA5 §10: `+ Add filesystem` opens `AddFilesystemDialog`, built like the
 * unexported `AddConnectionDialog` in SettingsConnections.tsx — design-system
 * Dialog/Select/Input, apiFetch, inline error. Each row gets a Check button
 * (`POST /:id/check`); a `needs_attention` row shows its `attentionReason`
 * directly (it already names a missing CLI when that is the cause), so there is
 * no separate CLI line.
 */

import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";
// hearth-internal-padding
import { Button, Dialog, Input, Select, type Status, StatusChip, Tag } from "../ds";
import { apiFetch } from "../services/api-fetch.js";

// ---------------------------------------------------------------------------
// Wire types from the API (mirrors @hyperidle/filesystems' Filesystem view)
// ---------------------------------------------------------------------------

interface FilesystemApiItem {
	id: string;
	teamId: string;
	source: string;
	kind: string;
	connectionId: string | null;
	resourceRef: { kind: string; repo?: string; branch?: string; folder?: string };
	state: string;
	attentionReason: string | null;
	createdAt: string;
}

/** BA5 §2.7: `GET /api/connections` returns a flat array, inherited rows first. */
interface ConnectionApiItem {
	id: string;
	service: string;
	authSource: string;
}

interface FilesystemCheckResult {
	ok: boolean;
	reason: string | null;
}

const GITHUB_HTTPS_REPO = /^https:\/\/github\.com\//i;

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
		git: "Git",
	};
	return labels[s] ?? s;
}

function resourceDisplay(item: FilesystemApiItem): string {
	const ref = item.resourceRef;
	return ref.repo ?? ref.folder ?? "—";
}

// ---------------------------------------------------------------------------
// Add Filesystem Dialog
// ---------------------------------------------------------------------------

interface AddFilesystemDialogProps {
	open: boolean;
	onClose: () => void;
	onAdded: () => void;
	teamId: string | null;
}

function AddFilesystemDialog({
	open,
	onClose,
	onAdded,
	teamId,
}: AddFilesystemDialogProps): JSX.Element {
	const [kind, setKind] = useState<"code" | "doc_set">("code");
	const [location, setLocation] = useState("");
	const [branch, setBranch] = useState("");
	const [connectionId, setConnectionId] = useState("");
	const [connections, setConnections] = useState<ConnectionApiItem[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isGithubUrl = kind === "code" && GITHUB_HTTPS_REPO.test(location.trim());

	// BA5 §10: the GitHub token connection Select is populated from held token
	// connections for the "github" service — fetched once the dialog opens.
	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		apiFetch("/api/connections")
			.then(async (res) => {
				if (!res.ok || cancelled) return;
				const data = (await res.json()) as unknown;
				if (!cancelled) setConnections(Array.isArray(data) ? (data as ConnectionApiItem[]) : []);
			})
			.catch(() => {
				// Best-effort: an empty list just means no connection can be picked.
			});
		return () => {
			cancelled = true;
		};
	}, [open]);

	const githubTokenConnections = connections.filter(
		(c) => c.authSource === "token" && c.service.toLowerCase() === "github",
	);

	// BA5 §10: prefill Branch through inspect-path for a local path — a github.com
	// URL cannot be probed this way (no local filesystem to inspect).
	const handleLocationBlur = useCallback(async (): Promise<void> => {
		const path = location.trim();
		if (kind !== "code" || path === "" || /^https?:\/\//i.test(path)) return;
		try {
			const res = await apiFetch("/api/filesystems/inspect-path", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path }),
			});
			if (!res.ok) return;
			const info = (await res.json()) as { isGitRepo: boolean; branch: string | null };
			if (info.isGitRepo && info.branch) setBranch(info.branch);
		} catch {
			// Best-effort — the person can still type a branch by hand.
		}
	}, [location, kind]);

	const reset = useCallback((): void => {
		setKind("code");
		setLocation("");
		setBranch("");
		setConnectionId("");
		setError(null);
	}, []);

	const handleSubmit = useCallback(async (): Promise<void> => {
		if (teamId == null) {
			setError("No team to register this filesystem for yet");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			const resourceRef =
				kind === "code"
					? { kind: "code" as const, repo: location.trim(), branch: branch.trim() }
					: { kind: "doc_set" as const, folder: location.trim() };
			const body = {
				teamId,
				kind,
				connectionId: isGithubUrl && connectionId ? connectionId : null,
				resourceRef,
			};
			const res = await apiFetch("/api/filesystems", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null;
				setError(data?.error ?? "Failed to add filesystem");
				return;
			}
			onAdded();
			onClose();
			reset();
		} catch {
			setError("Network error");
		} finally {
			setSubmitting(false);
		}
	}, [teamId, kind, location, branch, connectionId, isGithubUrl, onAdded, onClose, reset]);

	return (
		<Dialog
			open={open}
			onClose={() => {
				onClose();
				reset();
			}}
			title="Add a filesystem"
			size="md"
			footer={
				<div className="flex justify-end gap-[9px]">
					<Button
						variant="ghost"
						onClick={() => {
							onClose();
							reset();
						}}
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={() => {
							void handleSubmit();
						}}
						disabled={
							submitting || location.trim() === "" || (kind === "code" && branch.trim() === "")
						}
					>
						Add
					</Button>
				</div>
			}
		>
			<div className="flex flex-col gap-[18px]">
				<Select
					id="add-filesystem-kind"
					label="Kind"
					value={kind}
					onChange={(e) => setKind(e.target.value as "code" | "doc_set")}
					options={[
						{ value: "code", label: "Git repository" },
						{ value: "doc_set", label: "Folder" },
					]}
				/>
				<Input
					id="add-filesystem-location"
					label="Location"
					placeholder={
						kind === "code" ? "https://github.com/acme/app or /path/to/repo" : "/path/to/folder"
					}
					value={location}
					onChange={(e) => setLocation(e.target.value)}
					onBlur={() => {
						void handleLocationBlur();
					}}
				/>
				{kind === "code" ? (
					<Input
						id="add-filesystem-branch"
						label="Branch"
						placeholder="main"
						value={branch}
						onChange={(e) => setBranch(e.target.value)}
					/>
				) : null}
				{isGithubUrl ? (
					<Select
						id="add-filesystem-connection"
						label="GitHub token (optional)"
						value={connectionId}
						onChange={(e) => setConnectionId(e.target.value)}
						placeholder="No token — use my gh login"
						options={githubTokenConnections.map((c) => ({ value: c.id, label: c.service }))}
					/>
				) : null}
				{error ? <p className="type-metadata  text-[var(--status-error)]">{error}</p> : null}
			</div>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsFilesystems(): JSX.Element {
	const [filesystems, setFilesystems] = useState<FilesystemApiItem[]>([]);
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [teamId, setTeamId] = useState<string | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [checkingId, setCheckingId] = useState<string | null>(null);

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
				setTeamId(null);
				setFilesystems([]);
				setStatus("ready");
				return;
			}
			setTeamId(firstTeamActualId);

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

	const handleCheck = useCallback(async (id: string): Promise<void> => {
		setCheckingId(id);
		try {
			const res = await apiFetch(`/api/filesystems/${id}/check`, { method: "POST" });
			if (!res.ok) return;
			const data = (await res.json()) as {
				filesystem: FilesystemApiItem;
				check: FilesystemCheckResult;
			};
			setFilesystems((prev) => prev.map((fs) => (fs.id === id ? data.filesystem : fs)));
		} finally {
			setCheckingId(null);
		}
	}, []);

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
					<Button
						variant="ghost"
						size="sm"
						aria-label="Add a filesystem to the team registry"
						disabled={teamId == null}
						onClick={() => setDialogOpen(true)}
					>
						+ Add filesystem
					</Button>
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
											{fs.resourceRef.branch ? (
												<span className="type-data   text-[var(--text-tertiary)]">
													@{fs.resourceRef.branch}
												</span>
											) : null}
											<Tag label={fs.kind} />
										</div>
										<span className="type-metadata  text-[var(--text-tertiary)]">
											{fs.state === "needs_attention" && fs.attentionReason
												? fs.attentionReason
												: fs.connectionId
													? `Connection: ${fs.connectionId}`
													: "Local (no connection)"}
										</span>
									</div>
									<div className="flex shrink-0 items-center gap-[9px]">
										<StatusChip status={stateToStatus(fs.state)} label={stateLabel(fs.state)} />
										<Button
											variant="ghost"
											size="sm"
											aria-label={`Check ${resourceDisplay(fs)}`}
											disabled={checkingId === fs.id}
											onClick={() => {
												void handleCheck(fs.id);
											}}
										>
											Check
										</Button>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
			<AddFilesystemDialog
				open={dialogOpen}
				onClose={() => setDialogOpen(false)}
				onAdded={() => {
					void load();
				}}
				teamId={teamId}
			/>
		</div>
	);
}
