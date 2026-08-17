import {
	Button,
	EmptyState,
	ErrorState,
	type FoldMode,
	Input,
	ItemList,
	KeyValue,
	Row,
	Select,
	SkeletonList,
	SplitView,
	StatusChip,
	Tag,
	Toggle,
} from "@hyperidle/design-system";
import type {
	AgentBehaviorConfigListResponse,
	AgentBehaviorConfigPatchResponse,
	AgentBehaviorConfigView,
	AgentBehaviorEditableField,
} from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useMemo, useState } from "react";
import { useUiPreference } from "../hooks/useUiPreference.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";

const CATEGORY_LABELS = {
	agent: "Agents",
	skill: "Skills",
	routine: "Routines",
	trigger: "Triggers",
	tool: "Tools",
	mcp: "MCP",
} as const satisfies Record<AgentBehaviorConfigView["kind"], string>;

const EVENT_LABELS: Record<string, string> = {
	"task.accepted": "Task accepted",
	"assistant.message": "Assistant message",
	"routine.fire": "Routine fired",
	"knowledge.action": "Knowledge action",
	"proposed_call.granted": "Proposed call granted",
	"fallback.no_match": "No matching trigger",
};

type LoadState = "loading" | "ready" | "error";

function eventLabel(event: string): string {
	return EVENT_LABELS[event] ?? event;
}

function chipStatus(item: AgentBehaviorConfigView): "healthy" | "behind" | "blocked" | "unknown" {
	if (item.statusLabel.includes("removed")) return "blocked";
	if (item.statusLabel.includes("disabled")) return "behind";
	if (item.valueSource === "user_override") return "healthy";
	return "unknown";
}

function kindTone(
	kind: AgentBehaviorConfigView["kind"],
): "pattern" | "decision" | "failure" | undefined {
	if (kind === "trigger") return "decision";
	if (kind === "mcp") return "pattern";
	if (kind === "tool") return "pattern";
	return undefined;
}

function defaultEvent(items: readonly AgentBehaviorConfigView[]): string {
	return items.find((item) => item.trigger)?.trigger?.occasionKind ?? "routine.fire";
}

function mergeFieldValue(
	fields: Record<string, string | boolean | null>,
	field: AgentBehaviorEditableField,
	value: string | boolean | null,
): Record<string, string | boolean | null> {
	return { ...fields, [field.id]: value };
}

export function SettingsAgentBehavior(): JSX.Element {
	const { showToast } = useToast();
	const [items, setItems] = useState<AgentBehaviorConfigView[]>([]);
	const [status, setStatus] = useState<LoadState>("loading");
	const [selectedEvent, setSelectedEvent] = useState("routine.fire");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [draft, setDraft] = useState<Record<string, string | boolean | null>>({});
	const [saving, setSaving] = useState(false);
	const [editing, setEditing] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [splitMode, setSplitMode] = useState<FoldMode>("fold-back");
	const [ratio, setRatio] = useUiPreference("settings.agentBehavior", 0.42);
	const { sidebarMobile } = useViewportBreakpoint();

	const load = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const res = await apiFetch("/api/settings/agent-behavior/config");
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as AgentBehaviorConfigListResponse;
			const nextItems = [...body.items];
			setItems(nextItems);
			const nextEvent = defaultEvent(nextItems);
			setSelectedEvent((current) => (current ? current : nextEvent));
			setStatus("ready");
		} catch {
			setStatus("error");
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const counts = useMemo(() => {
		const byKind = new Map<AgentBehaviorConfigView["kind"], number>();
		for (const item of items) {
			byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
		}
		return byKind;
	}, [items]);

	const events = useMemo(() => {
		const values = new Set<string>();
		for (const item of items) {
			if (item.trigger) values.add(item.trigger.occasionKind);
		}
		return values.size > 0 ? [...values] : ["routine.fire"];
	}, [items]);

	const visibleItems = useMemo(() => {
		const triggerItems = items.filter(
			(item) => item.trigger?.occasionKind === selectedEvent || item.valueSource === "fallback",
		);
		const triggerNames = new Set(triggerItems.map((item) => item.name));
		const nonTriggerItems = items.filter(
			(item) =>
				item.kind !== "trigger" && !(item.kind === "routine" && triggerNames.has(item.name)),
		);
		return [...triggerItems, ...nonTriggerItems];
	}, [items, selectedEvent]);

	const selected = selectedId ? (items.find((item) => item.id === selectedId) ?? null) : null;

	function selectItem(item: AgentBehaviorConfigView): void {
		setSelectedId(item.id);
		setSplitMode("split");
		setSaveError(null);
		setEditing(false);
		setDraft(
			Object.fromEntries(item.editableFields.map((field) => [field.id, field.value])) as Record<
				string,
				string | boolean | null
			>,
		);
	}

	function cancelEditing(): void {
		if (!selected) return;
		setDraft(
			Object.fromEntries(selected.editableFields.map((field) => [field.id, field.value])) as Record<
				string,
				string | boolean | null
			>,
		);
		setSaveError(null);
		setEditing(false);
	}

	async function saveSelected(): Promise<void> {
		if (!selected) return;
		setSaving(true);
		setSaveError(null);
		try {
			const res = await apiFetch(
				`/api/settings/agent-behavior/config/${encodeURIComponent(selected.id)}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ fields: draft }),
				},
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as AgentBehaviorConfigPatchResponse;
			setItems((current) => current.map((item) => (item.id === body.item.id ? body.item : item)));
			setSelectedId(body.item.id);
			setDraft(
				Object.fromEntries(
					body.item.editableFields.map((field) => [field.id, field.value]),
				) as Record<string, string | boolean | null>,
			);
			setEditing(false);
			showToast("Agent behavior saved");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not save agent behavior.";
			setSaveError(message);
			showToast(message);
		} finally {
			setSaving(false);
		}
	}

	if (status === "loading") {
		return <SkeletonList rows={4} ariaLabel="Loading agent behavior configuration" />;
	}

	if (status === "error") {
		return (
			<ErrorState
				compact
				title="Couldn't load agent behavior"
				description="Could not load agent behavior configuration."
				onRetry={() => void load()}
			/>
		);
	}

	if (items.length === 0) {
		return (
			<EmptyState
				compact
				title="No agent behavior configuration"
				description="Defaults still attach eligible agents when no trigger matches."
			/>
		);
	}

	const origin = (
		<div className="flex flex-col gap-[18px] p-[12px]">
			<p className="type-small  text-[var(--text-tertiary)]">
				Inspect and edit the configuration that controls agent work.
			</p>

			<div className="grid grid-cols-2 gap-[6px] min-[720px]:grid-cols-3">
				{Object.entries(CATEGORY_LABELS).map(([kind, label]) => (
					<div
						key={kind}
						className="border-width-thin rounded-[var(--r-subtle)]  border-[var(--border-subtle)] bg-[var(--surface-container)] px-[9px] py-[6px]"
					>
						<div className="type-metadata   text-[var(--text-primary)]">{label}</div>
						<div className="type-label  text-[var(--text-tertiary)]">
							{counts.get(kind as AgentBehaviorConfigView["kind"]) ?? 0} items
						</div>
					</div>
				))}
			</div>

			<fieldset className="flex flex-wrap gap-[6px]" aria-label="Agent behavior events">
				{events.map((event) => (
					<Button
						key={event}
						size="sm"
						variant={event === selectedEvent ? "primary" : "secondary"}
						onClick={() => {
							setSelectedEvent(event);
							setSelectedId(null);
							setSplitMode("fold-back");
						}}
					>
						{eventLabel(event)}
					</Button>
				))}
			</fieldset>

			<ItemList
				variant="flush"
				isEmpty={visibleItems.length === 0}
				empty={{
					title: "No trigger rules for this event",
					description:
						"The fallback still uses the default eligible agent with no event-specific prompt.",
				}}
				data-testid="agent-behavior-list"
			>
				{visibleItems.map((item) => (
					<Row
						key={item.id}
						title={item.name}
						subtitle={`${item.statusLabel} · ${item.activeSummary}`}
						lead={<Tag label={rowKindLabel(item.kind)} kind={kindTone(item.kind)} />}
						selected={selectedId === item.id}
						onClick={() => selectItem(item)}
					/>
				))}
			</ItemList>
		</div>
	);

	const destination = (
		<div className="flex min-h-full flex-col gap-[12px] p-[18px] pt-[48px]">
			{selected ? (
				<>
					<div className="flex items-start justify-between gap-[12px]">
						<div className="min-w-0">
							<div className="type-label  uppercase  text-[var(--text-tertiary)]">Rule detail</div>
							<div className="type-small  text-[var(--text-secondary)]">
								{selected.description ?? selected.activeSummary}
							</div>
						</div>
						<StatusChip status={chipStatus(selected)} label={selected.statusLabel} />
					</div>

					<div className="flex flex-col gap-[6px]">
						{selected.trigger && (
							<>
								<KeyValue label="Event" value={eventLabel(selected.trigger.occasionKind)} />
								<KeyValue
									label="Agent"
									value={selected.trigger.selectedAgentLabel ?? "Default eligible agent"}
								/>
								<KeyValue label="Prompt source" value={selected.trigger.promptSource} />
							</>
						)}
						<KeyValue label="Origin" value={selected.origin.label} />
						<KeyValue label="Active value" value={selected.activeSummary} layout="stacked" />
						{selected.defaultSummary && (
							<KeyValue label="Default value" value={selected.defaultSummary} layout="stacked" />
						)}
					</div>

					{selected.editableFields.length > 0 && editing ? (
						<div className="flex flex-col gap-[9px]">
							{selected.editableFields.map((field) => (
								<EditableField
									key={field.id}
									field={field}
									value={draft[field.id] ?? field.value}
									onChange={(value) =>
										setDraft((current) => mergeFieldValue(current, field, value))
									}
								/>
							))}
							{saveError && (
								<p className="type-metadata   text-[var(--status-error)]">{saveError}</p>
							)}
							<div className="flex flex-wrap gap-[6px]">
								<Button size="sm" onClick={() => void saveSelected()} disabled={saving}>
									{saving ? "Saving" : "Save"}
								</Button>
								<Button
									size="sm"
									variant="ghost"
									aria-label="Cancel agent behavior editing"
									onClick={cancelEditing}
									disabled={saving}
								>
									Cancel
								</Button>
							</div>
						</div>
					) : (
						<div className="flex flex-wrap gap-[6px]">
							{selected.editableFields.length > 0 && (
								<Button size="sm" onClick={() => setEditing(true)}>
									Edit agent behavior
								</Button>
							)}
							{selected.links?.map((link) => (
								<a
									key={link.href}
									href={link.href}
									className="type-control border-width-thin inline-flex min-h-[32px] items-center rounded-[var(--r-pill)]  border-[var(--border-default)] px-[12px]   text-[var(--text-primary)]"
								>
									{link.label}
								</a>
							))}
						</div>
					)}
				</>
			) : (
				<EmptyState
					compact
					title="Select a behavior row"
					description="Choose a trigger, agent, skill, routine, tool, or MCP row to inspect its active value."
				/>
			)}
		</div>
	);

	/* @lore FR-11: removed h-[720px] wrapper — SettingsPage is overflow-hidden per AppShell
	 * contract; a fixed-height child created a nested scroll region. SplitView grows
	 * naturally inside the section's flex-col. */
	return (
		<div data-testid="settings-agent-behavior">
			<SplitView
				surfaceKey="settings.agentBehavior"
				mode={splitMode}
				onModeChange={setSplitMode}
				dividerRatio={ratio}
				onRatioChange={setRatio}
				origin={origin}
				destination={destination}
				compact={sidebarMobile}
				originLabel="agent behavior"
			/>
		</div>
	);
}

function EditableField({
	field,
	value,
	onChange,
}: {
	field: AgentBehaviorEditableField;
	value: string | boolean | null;
	onChange: (value: string | boolean | null) => void;
}): JSX.Element {
	if (field.kind === "select") {
		const options =
			field.options && field.options.length > 0
				? [...field.options]
				: typeof value === "string"
					? [{ value, label: value }]
					: [];
		return (
			<Select
				label={field.label}
				value={typeof value === "string" ? value : ""}
				options={options}
				onChange={(event) => onChange(event.currentTarget.value)}
			/>
		);
	}
	if (field.kind === "toggle") {
		return (
			<Toggle
				on={Boolean(value)}
				label={field.label}
				onChange={(nextValue) => onChange(nextValue)}
			/>
		);
	}
	return (
		<Input
			label={field.label}
			type={field.kind === "url" ? "url" : "text"}
			textarea={field.kind === "textarea"}
			rows={field.kind === "textarea" ? 4 : undefined}
			value={typeof value === "string" ? value : ""}
			maxLength={field.maxLength}
			onChange={(event) => onChange(event.currentTarget.value)}
		/>
	);
}

function rowKindLabel(kind: AgentBehaviorConfigView["kind"]): string {
	if (kind === "mcp") return "Server";
	return CATEGORY_LABELS[kind].replace(/s$/, "");
}
