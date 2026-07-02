/**
 * AD8b — SettingsAssistant stories.
 *
 * AR4 — adds a `Configured` design variant: the proposed populated layout for the
 * assistant config surface (Harness + Model selects extracted from SettingsAgents,
 * above the persona textarea). This variant is PRESENTATIONAL (no fetch) — it is the
 * design artifact the visual review renders. Build wires the selects into the real
 * SettingsAssistant component + save path.
 */

import { Button, Input, Select, StatusChip } from "@hyperidle/design-system";
import type { JSX } from "react";
import { SettingsAssistant } from "./SettingsAssistant.js";

export default {
	title: "Settings/SettingsAssistant",
	component: SettingsAssistant,
};

export function Default(): JSX.Element {
	return <SettingsAssistant userId="u-demo" />;
}

export function WithExistingPrompt(): JSX.Element {
	return <SettingsAssistant userId="u-demo-2" />;
}

/**
 * AR4 design variant — populated state. The two selects are the verbatim
 * SettingsAgents edit-form pattern (constrained Harness + Model selects), lifted
 * into the assistant's own section above the persona textarea.
 */
export function Configured(): JSX.Element {
	const harnessOptions = [
		{ value: "", label: "Default" },
		{ value: "builtin", label: "Built-in Harness" },
		{ value: "claude-code", label: "Claude Code" },
		{ value: "codex", label: "Codex" },
		{ value: "opencode", label: "OpenCode" },
	];
	const modelOptions = [
		{ value: "", label: "System default" },
		{ value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
		{ value: "gpt-5.4-mini", label: "GPT-5.4 mini" },
	];

	return (
		<div className="p-[18px] max-w-[680px]">
			<div className="flex flex-col gap-[18px]">
				<p className="text-[13px] text-[var(--text-secondary)]">
					Configure your personal assistant — the agent that chats with you. It runs through your
					connected harness like any other agent.
				</p>

				{/* AR4: EXTRACTED Harness + Model select row (SettingsAgents pattern) */}
				<div className="flex gap-[9px] flex-wrap">
					<div className="flex-1 min-w-[140px]">
						<Select
							id="assistant-harness"
							label="Harness"
							size="sm"
							className="max-md:text-[16px]"
							value="codex"
							onChange={() => {}}
							aria-label="Harness"
							options={harnessOptions}
						/>
					</div>
					<div className="flex-1 min-w-[140px]">
						<Select
							id="assistant-model"
							label="Model"
							size="sm"
							className="max-md:text-[16px]"
							value="claude-sonnet-4-6"
							onChange={() => {}}
							aria-label="Model"
							options={modelOptions}
						/>
					</div>
				</div>

				<div className="flex flex-col gap-[12px]">
					<Input
						id="assistant-system-prompt"
						label="Persona instructions"
						textarea
						value="You are a concise, proactive assistant. Help shape work into clear bets and keep replies short."
						onChange={() => {}}
						rows={8}
					/>
				</div>

				<div className="flex items-center justify-end gap-[12px]">
					<Button aria-label="Save">Save</Button>
				</div>
			</div>
		</div>
	);
}

/**
 * AR4 design variant — saved harness no longer in the registry. Shows the amber
 * "Harness unavailable" chip pattern (lifted from SettingsAgents) beside the select.
 */
export function HarnessUnavailable(): JSX.Element {
	const harnessOptions = [
		{ value: "", label: "Default" },
		{ value: "builtin", label: "Built-in Harness" },
		{ value: "claude-code", label: "Claude Code" },
	];
	const modelOptions = [
		{ value: "", label: "System default" },
		{ value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
	];

	return (
		<div className="p-[18px] max-w-[680px]">
			<div className="flex flex-col gap-[18px]">
				<p className="text-[13px] text-[var(--text-secondary)]">
					Configure your personal assistant — the agent that chats with you. It runs through your
					connected harness like any other agent.
				</p>

				<div className="flex gap-[9px] flex-wrap">
					<div className="flex-1 min-w-[140px]">
						<div className="flex items-center gap-[6px]">
							<Select
								id="assistant-harness-unavailable"
								label="Harness"
								size="sm"
								className="max-md:text-[16px]"
								value="aider"
								onChange={() => {}}
								aria-label="Harness"
								options={[...harnessOptions, { value: "aider", label: "aider" }]}
							/>
							<span className="mt-[18px]">
								<StatusChip status="behind" label="Harness unavailable" />
							</span>
						</div>
					</div>
					<div className="flex-1 min-w-[140px]">
						<Select
							id="assistant-model-unavailable"
							label="Model"
							size="sm"
							className="max-md:text-[16px]"
							value="claude-sonnet-4-6"
							onChange={() => {}}
							aria-label="Model"
							options={modelOptions}
						/>
					</div>
				</div>

				<div className="flex flex-col gap-[12px]">
					<Input
						id="assistant-system-prompt-2"
						label="Persona instructions"
						textarea
						value="You are a concise, proactive assistant."
						onChange={() => {}}
						rows={8}
					/>
				</div>

				<div className="flex items-center justify-end gap-[12px]">
					<Button aria-label="Save">Save</Button>
				</div>
			</div>
		</div>
	);
}
