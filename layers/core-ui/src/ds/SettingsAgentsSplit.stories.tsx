/**
 * AV2 design artifact — Settings → Agents rendered as an ItemList + SplitView.
 *
 * The chosen IA (IA-B): the Agents section body is
 * a SplitView — an ItemList(flush) of agent Rows on the left (origin), the shared
 * agent editor on the right (destination). The Assistant is just a row. Populated
 * real state only (no empty/loading/error) per
 * feedback_no_skeleton_error_in_initial_designs.
 *
 * This composes ONLY existing DS primitives (SplitView, ItemList, Row, Input,
 * Select, StatusChip, Button, Combobox) — no invention. It is the
 * design reference the human review renders at /designsystem; production wiring
 * (fetches, save routing) is the builder's job.
 *
 */

import { useState } from "react";
import { Button } from "./Button.js";
import { Combobox, type ComboboxOption } from "./Combobox.js";
import { Input } from "./Input.js";
import { ItemList } from "./ItemList.js";
import { Row } from "./Row.js";
import { Select } from "./Select.js";
import { SplitView } from "./SplitView.js";
import { StatusChip } from "./StatusChip.js";

export default {
	title: "SettingsAgentsSplit",
	group: "Settings" as const,
};

interface DemoAgent {
	id: string;
	name: string;
	discipline: string;
	disciplineLabel: string;
	harness: string;
	model: string;
	/** A person's own agent (`ownerUserId`), not a craft. */
	owned?: boolean;
	harnessUnavailable?: boolean;
}

const AGENTS: DemoAgent[] = [
	{
		id: "ast-u1",
		name: "Nova",
		discipline: "ops",
		disciplineLabel: "Ops",
		harness: "claude-code",
		model: "Sonnet 4.6",
		owned: true,
	},
	{
		id: "a1",
		name: "Atlas",
		discipline: "builder",
		disciplineLabel: "Builder",
		harness: "claude-code",
		model: "Opus 4.8",
	},
	{
		id: "a2",
		name: "Iris",
		discipline: "designer",
		disciplineLabel: "Designer",
		harness: "opencode",
		model: "Sonnet 4.6",
	},
	{
		id: "a3",
		name: "Sol",
		discipline: "product_manager",
		disciplineLabel: "Product Manager",
		harness: "codex",
		model: "Haiku 4.5",
		harnessUnavailable: true,
	},
];

const DISCIPLINES: readonly ComboboxOption[] = [
	{
		id: "builder",
		label: "Builder",
		description: "Engineer. Implements features, writes code, tests, deploys.",
	},
	{
		id: "designer",
		label: "Designer",
		description: "Product designer. UX research, interaction & visual design.",
	},
	{
		id: "product_manager",
		label: "Product Manager",
		description: "Team lead. Shapes pitches, coordinates cycles.",
	},
	{
		id: "qa_engineer",
		label: "QA Engineer",
		description: "Quality assurance. Test plans, regression, bug triage.",
	},
];

// Model options for the SELECTED harness only (the AV2 harness-filter behavior):
// this agent is on a provider-agnostic CLI harness → whole catalog is offered.
const MODELS_FOR_HARNESS = [
	{ value: "claude-opus-4-8", label: "Opus 4.8" },
	{ value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
	{ value: "claude-haiku-4-5", label: "Haiku 4.5" },
];

const HARNESSES = [
	{ value: "opencode", label: "OpenCode" },
	{ value: "claude-code", label: "Claude Code" },
	{ value: "codex", label: "Codex" },
];

function AgentEditor({ agent }: { agent: DemoAgent }): React.JSX.Element {
	const [discipline, setDiscipline] = useState(agent.discipline);
	const [harness, setHarness] = useState(agent.harness);
	const [model, setModel] = useState(
		agent.model === "Opus 4.8"
			? "claude-opus-4-8"
			: agent.model === "Haiku 4.5"
				? "claude-haiku-4-5"
				: "claude-sonnet-4-6",
	);
	return (
		<div className="flex flex-col gap-[18px] p-[24px]">
			<h3 className="text-[15px] font-[600] text-[var(--text-primary)]">{agent.name}</h3>

			<Input id="ed-name" label="Name" type="text" value={agent.name} onChange={() => {}} />

			<Combobox
				label="Discipline"
				options={DISCIPLINES}
				value={discipline}
				onChange={setDiscipline}
				disabled={agent.owned}
				allowCustomValue
				placeholder="Filter disciplines or type a new one…"
				listAriaLabel="Disciplines"
			/>

			<div className="flex flex-wrap gap-[12px]">
				<div className="min-w-[160px] flex-1">
					<Select
						id="ed-harness"
						label="Harness"
						size="sm"
						value={harness}
						onChange={(e) => setHarness(e.target.value)}
						options={HARNESSES}
					/>
				</div>
				<div className="min-w-[160px] flex-1">
					{/* AV2: model options are already filtered to the selected harness's providers. */}
					<Select
						id="ed-model"
						label="Model"
						size="sm"
						value={model}
						onChange={(e) => setModel(e.target.value)}
						options={MODELS_FOR_HARNESS}
					/>
				</div>
			</div>

			<Input
				id="ed-prompt"
				label="System prompt"
				textarea
				rows={8}
				value="You implement features end to end: read the spec, write the code, run the tests, and open a PR."
				onChange={() => {}}
			/>

			<div className="flex justify-end gap-[9px]">
				<Button variant="ghost" size="sm">
					Cancel
				</Button>
				<Button variant="primary" size="sm">
					Save
				</Button>
			</div>
		</div>
	);
}

/**
 * The Agents section: list on the left (Assistant is a row), editor on the right.
 * Iris is selected and open in the destination pane.
 */
export function AgentsListWithEditor(): React.JSX.Element {
	const [selectedId, setSelectedId] = useState("a2");
	const selected = AGENTS.find((a) => a.id === selectedId) ?? AGENTS[1];

	return (
		<div className="h-[560px] w-full">
			<SplitView
				surfaceKey="settings.agents"
				mode="split"
				dividerRatio={0.42}
				origin={
					<div className="flex flex-col">
						<div className="flex items-center justify-between px-[24px] py-[18px]">
							<span className="text-[13px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
								Agents
							</span>
							<Button variant="ghost" size="sm">
								+ Add agent
							</Button>
						</div>
						<ItemList variant="flush" isEmpty={false} as="ul">
							{AGENTS.map((a) => (
								<Row
									key={a.id}
									as="li"
									title={a.name}
									subtitle={a.owned ? `${a.disciplineLabel} · Yours` : a.disciplineLabel}
									selected={a.id === selectedId}
									onClick={() => setSelectedId(a.id)}
									cells={[
										{ content: a.harness, "data-testid": "harness-cell" },
										...(a.harnessUnavailable
											? [{ content: <StatusChip status="behind" label="Harness unavailable" /> }]
											: []),
									]}
								/>
							))}
						</ItemList>
					</div>
				}
				destination={selected ? <AgentEditor agent={selected} /> : <div />}
			/>
		</div>
	);
}
