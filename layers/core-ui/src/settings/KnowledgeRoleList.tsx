/**
 * KnowledgeRoleList — shared list surface for knowledge items scoped to a
 * fixed set of roles.
 *
 * Owns create and delete; the knowledge content view owns read and update —
 * this is the human-side equivalent of a plugin's batch install, anything a
 * plugin can create a person can too, through the same path. Built on the
 * ItemList/Row primitives, following the idiom already shared by
 * SettingsPlugins, SettingsHarnesses, SettingsConnections and SettingsAgents.
 *
 * @lore knowledge-attachment-slot: one list, parameterised by role — not one
 * bespoke screen per role. `role` is set once here, at creation, and never
 * edited afterward (the knowledge content view's role selector is gone),
 * which is what makes this the single writer of role for the roles it lists.
 * Skills and rules are the only knowledge-item type with a *list* today —
 * a routine's prompt and an agent's identity are singular 1:1 bindings shown
 * inline in their own editor (AgentEditor's identity link, the routine
 * prompt field), not a create/list/delete surface — so this component is not
 * wired into them. Wiring is a one-line instantiation (see
 * SettingsSkillsAndRules.tsx) whenever a type gets a real list.
 */

import type { KnowledgeRole } from "@hyperidle/domain-model";
import { KNOWLEDGE_ROLE_LABEL } from "@hyperidle/domain-model";
import type { JSX, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
// hearth-internal-padding
import {
	Button,
	EmptyState,
	ErrorState,
	Input,
	ItemList,
	Row,
	Select,
	SkeletonList,
	Tag,
} from "../ds";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { apiFetch } from "../services/api-fetch.js";

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

interface ApiKnowledgeItem {
	id: string;
	title: string;
	role?: string;
	status?: string;
}

type RoleItem = ApiKnowledgeItem & { role: KnowledgeRole };

export interface KnowledgeRoleListProps {
	/** Which roles this list shows, and which roles the create form offers. */
	roles: readonly KnowledgeRole[];
	/** Lede paragraph explaining what the list is for. */
	description: ReactNode;
	/** Uppercase header above the row list. */
	sectionLabel: string;
	/** Shown in place of the list when there are no items. */
	emptyMessage: string;
	/** Uppercase header above the create form. */
	createLabel: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KnowledgeRoleList({
	roles,
	description,
	sectionLabel,
	emptyMessage,
	createLabel,
}: KnowledgeRoleListProps): JSX.Element {
	const navigate = useNavigate();
	const { user } = useCurrentUser();

	const [items, setItems] = useState<RoleItem[]>([]);
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

	const [newTitle, setNewTitle] = useState("");
	const [newRole, setNewRole] = useState<KnowledgeRole>(roles[0] ?? "ordinary");
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const load = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const res = await apiFetch("/api/knowledge");
			if (!res.ok) {
				setStatus("error");
				return;
			}
			const json = (await res.json()) as { items?: ApiKnowledgeItem[] };
			// GET /api/knowledge has no role or status query param — it returns
			// every item visible to the viewer, so this "what's live" surface
			// filters to its own roles and drops archived items client-side
			// rather than widening the shared route.
			const filtered = (json.items ?? [])
				.filter((item): item is RoleItem => roles.includes(item.role as KnowledgeRole))
				.filter((item) => item.status !== "archived")
				.sort((a, b) => a.title.localeCompare(b.title));
			setItems(filtered);
			setStatus("ready");
		} catch {
			setStatus("error");
		}
	}, [roles]);

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
					// session — a freshly created item must be live from the start,
					// not sit invisibly in triage.
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
		setDeleteError(null);
		try {
			// Archive is what delete means everywhere in this system — a hard
			// delete is impossible (the audit tables hold RESTRICT FKs).
			const res = await apiFetch(`/api/knowledge/${id}/archive`, { method: "POST" });
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				setDeleteError(data.error ?? `Could not delete it: ${res.status}`);
				return;
			}
			await load();
		} catch {
			setDeleteError("Could not delete it: network error");
		}
	}

	if (status === "loading") {
		return <SkeletonList rows={3} ariaLabel={`Loading ${sectionLabel.toLowerCase()}`} />;
	}

	if (status === "error") {
		return (
			<ErrorState
				compact
				title={`Couldn't load ${sectionLabel.toLowerCase()}`}
				description="Please check your connection and try again."
				onRetry={() => void load()}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-[24px]">
			<p className="type-metadata max-w-[560px]  text-[var(--text-tertiary)]">{description}</p>

			<div className="flex flex-col gap-[12px]">
				<span className="type-label   uppercase  text-[var(--text-tertiary)]">{sectionLabel}</span>
				{items.length === 0 ? (
					<EmptyState
						title={sectionLabel}
						description={emptyMessage}
						dataTestId="knowledge-role-empty"
					/>
				) : (
					// @lore FR-14 (matches SettingsHarnesses): contract = hairline-border
					// container, no shadow beyond the default. ItemList's own "flush"
					// variant paints no outer box — the box is this wrapper's job.
					<div className="border-width-thin overflow-hidden rounded-[var(--r-default)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]">
						<ItemList variant="flush" isEmpty={false}>
							{items.map((item) => (
								<Row
									key={item.id}
									data-testid="knowledge-role-row"
									title={item.title}
									actions={
										<>
											<Tag label={KNOWLEDGE_ROLE_LABEL[item.role]} />
											<Button
												variant="ghost"
												size="sm"
												aria-label={`Delete ${item.title}`}
												onClick={(e) => {
													e.stopPropagation();
													void handleDelete(item.id);
												}}
											>
												Delete
											</Button>
										</>
									}
									onClick={() => navigate(`/knowledge/${item.id}`)}
								/>
							))}
						</ItemList>
					</div>
				)}
				{deleteError !== null && (
					<p role="alert" className="type-small  text-[var(--status-error)]">
						{deleteError}
					</p>
				)}
			</div>

			<div className="flex flex-col gap-[12px]">
				<span className="type-label   uppercase  text-[var(--text-tertiary)]">{createLabel}</span>
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
						onChange={(e) => setNewRole(e.target.value as KnowledgeRole)}
						disabled={creating}
						options={roles.map((r) => ({ value: r, label: KNOWLEDGE_ROLE_LABEL[r] }))}
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
