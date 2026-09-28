import { Tag } from "./Tag.js";

export default {
	title: "Tag",
	tier: "1" as const,
	order: [
		"PlainTagsNoKind",
		"KindVariants",
		"AccentTone",
		"SolidTone",
		"MixedGroup",
		"TagCloud",
		"InContextDemoCard",
	],
};

export const PlainTagsNoKind = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-3">
		<Tag label="v1" />
		<Tag label="frontend" />
		<Tag label="infrastructure-migration" />
	</div>
);

export const KindVariants = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-3">
		<Tag label="recurring-layout" kind="pattern" />
		<Tag label="go with plan-A" kind="decision" />
		<Tag label="deploy broke" kind="failure" />
	</div>
);

export const AccentTone = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-3">
		<Tag label="task" tone="accent" />
		<Tag label="2" tone="accent" />
		<Tag label="agent" tone="accent" />
	</div>
);

export const SolidTone = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-3">
		<Tag label="23" tone="solid" />
		<Tag label="99+" tone="solid" />
	</div>
);

export const MixedGroup = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-3">
		<Tag label="plain" />
		<Tag label="recurring-layout" kind="pattern" />
		<Tag label="go with plan-A" kind="decision" />
		<Tag label="deploy broke" kind="failure" />
	</div>
);

export const TagCloud = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-3">
		<Tag label="react" />
		<Tag label="typescript" />
		<Tag label="tailwind" />
		<Tag label="daisyui" />
		<Tag label="hono" />
		<Tag label="drizzle" />
	</div>
);

export const InContextDemoCard = (): React.JSX.Element => (
	<div className="rounded-lg bg-[var(--surface-container)] p-4">
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
					Tags:
				</span>
				<Tag label="api-refactor" />
				<Tag label="schema-change" kind="pattern" />
				<Tag label="approved" kind="decision" />
			</div>
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
					Issues:
				</span>
				<Tag label="timeout on deploy" kind="failure" />
				<Tag label="flaky test" kind="failure" />
			</div>
		</div>
	</div>
);
