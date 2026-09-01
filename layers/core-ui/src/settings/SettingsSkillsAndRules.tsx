/**
 * SettingsSkillsAndRules — the skills-and-rules list (live component).
 *
 * knowledge-attachment-slot §8: lists own create and delete; the knowledge
 * content view owns read and update. This is the human-side equivalent of a
 * plugin's batch install — anything a plugin can create, a person can too,
 * through the same path — and it is what makes removing the role selector
 * from the knowledge content view safe (role is now set here, at creation,
 * never edited afterward).
 *
 * Follows SettingsFilesystems.tsx's shape: `apiFetch`, local state, `Tag`,
 * honest empty and error states.
 */

import type { KnowledgeRole } from "@hyperidle/domain-model";
import { KNOWLEDGE_ROLE_LABEL } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
// hearth-internal-padding
import { Button, Input, Select, Tag } from "../ds";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { apiFetch } from "../services/api-fetch.js";

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

interface ApiKnowledgeItem {
	id: string;
	title: string;
	role?: string;
}

/** The two roles this surface creates. `KNOWLEDGE_ROLES` carries three more
 * (ordinary, agent_file, prompt) that never appear in this list — each has
 * its own home (the knowledge view, an agent's page, a routine's page). */
type SkillOrRuleRole = Extract<KnowledgeRole, "skill" | "rule">;
const CREATABLE_ROLES: readonly SkillOrRuleRole[] = ["skill", "rule"];

function isSkillOrRule(role: string | undefined): role is SkillOrRuleRole {
	return role === "skill" || role === "rule";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsSkillsAndRules(): JSX.Element {
	const navigate = useNavigate();
	const { user } = useCurrentUser();

	const [items, setItems] = useState<ApiKnowledgeItem[]>([]);
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

	const [newTitle, setNewTitle] = useState("");
	const [newRole, setNewRole] = useState<SkillOrRuleRole>("skill");
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);

	const load = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const res = await apiFetch("/api/knowledge");
			if (!res.ok) {
				setStatus("error");
				return;
			}
			const json = (await res.json()) as { items?: ApiKnowledgeItem[] };
			const filtered = (json.items ?? [])
				.filter((item) => isSkillOrRule(item.role))
				.sort((a, b) => a.title.localeCompare(b.title));
			setItems(filtered);
			setStatus("ready");
		} catch {
			setStatus("error");
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function handleCreate(): Promise<void> {
		const title = newTitle.trim();
		if (!title) return;
		setCreating(true);
		setCreateError(null);
		try {
			const res = await apiFetch("/api/knowledge", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title,
					body: "",
					format: "markdown",
					// The route defaults to "draft", and only "active" items reach a
					// session — a freshly created skill or rule must be live from the
					// start, not sit invisibly in triage.
					status: "active",
					scopeKind: "factory",
					role: newRole,
					updatedBy: user?.id ?? "human",
				}),
			});
			if (res.ok) {
				const created = (await res.json()) as { id: string };
				setNewTitle("");
				navigate(`/knowledge/${created.id}`);
				return;
			}
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			setCreateError(data.error ?? `Could not create it: ${res.status}`);
		} catch {
			setCreateError("Could not create it: network error");
		} finally {
			setCreating(false);
		}
	}

	async function handleDelete(id: string): Promise<void> {
		// Archive is what delete means everywhere in this system — a hard
		// delete is impossible (the audit tables hold RESTRICT FKs).
		await apiFetch(`/api/knowledge/${id}/archive`, { method: "POST" });
		await load();
	}

	if (status === "loading") {
		return (
			<div className="flex flex-col gap-[12px]">
				<p className="type-metadata  text-[var(--text-tertiary)]">Loading skills and rules…</p>
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex flex-col gap-[12px]">
				<p className="type-metadata  text-[var(--status-error)]">
					Failed to load skills and rules.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-[24px]">
			<p className="type-metadata max-w-[560px]  text-[var(--text-tertiary)]">
				Skills and rules an agent's session picks up — a skill lands in the harness's own skills
				directory; a rule is always present. Create one here, then write its body in the knowledge
				view.
			</p>

			<div className="flex flex-col gap-[12px]">
				<span className="type-label   uppercase  text-[var(--text-tertiary)]">
					Registered skills and rules
				</span>
				{items.length === 0 ? (
					<p className="type-metadata  text-[var(--text-tertiary)]">
						No skills or rules registered yet.
					</p>
				) : (
					<div className="border-width-thin overflow-hidden rounded-[var(--r-default)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]">
						{items.map((item, index) => (
							<div key={item.id} data-testid="skill-rule-row">
								{index > 0 ? <div className="h-px bg-[var(--border-subtle)]" /> : null}
								<div className="flex items-center gap-[12px] px-[12px] py-[12px]">
									<button
										type="button"
										className="type-data flex min-w-0 flex-1 items-center gap-[9px] truncate  bg-transparent border-none text-left cursor-pointer text-[var(--text-primary)]"
										onClick={() => navigate(`/knowledge/${item.id}`)}
									>
										<span className="truncate">{item.title}</span>
									</button>
									<div className="flex shrink-0 items-center gap-[9px]">
										<Tag
											label={KNOWLEDGE_ROLE_LABEL[isSkillOrRule(item.role) ? item.role : "skill"]}
										/>
										<Button
											variant="ghost"
											size="sm"
											aria-label={`Delete ${item.title}`}
											onClick={() => void handleDelete(item.id)}
										>
											Delete
										</Button>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<div className="flex flex-col gap-[12px]">
				<span className="type-label   uppercase  text-[var(--text-tertiary)]">
					Create a skill or rule
				</span>
				<div className="flex items-end gap-[9px]">
					<div className="flex-1">
						<Input
							label="Title"
							value={newTitle}
							onChange={(e) => setNewTitle(e.target.value)}
							disabled={creating}
						/>
					</div>
					<Select
						label="Type"
						value={newRole}
						onChange={(e) => setNewRole(e.target.value as SkillOrRuleRole)}
						disabled={creating}
						options={CREATABLE_ROLES.map((r) => ({ value: r, label: KNOWLEDGE_ROLE_LABEL[r] }))}
					/>
					<Button
						variant="primary"
						size="default"
						onClick={() => void handleCreate()}
						disabled={creating || newTitle.trim().length === 0}
					>
						Create
					</Button>
				</div>
				{createError !== null && (
					<p role="alert" className="type-small  text-[var(--status-error)]">
						{createError}
					</p>
				)}
			</div>
		</div>
	);
}
