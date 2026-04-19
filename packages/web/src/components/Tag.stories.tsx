import { Tag } from "./Tag.js";

export default { title: "Tag" };

export const Short = (): React.JSX.Element => <Tag label="v1" />;
export const Medium = (): React.JSX.Element => <Tag label="frontend" />;
export const Long = (): React.JSX.Element => <Tag label="infrastructure-migration" />;

export const Group = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-1">
		<Tag label="react" />
		<Tag label="typescript" />
		<Tag label="tailwind" />
		<Tag label="daisyui" />
	</div>
);

export const Pattern = (): React.JSX.Element => <Tag label="recurring" kind="pattern" />;
export const Decision = (): React.JSX.Element => <Tag label="approved" kind="decision" />;
export const Failure = (): React.JSX.Element => <Tag label="rollback" kind="failure" />;

export const KindGroup = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-1">
		<Tag label="plain" />
		<Tag label="recurring-layout" kind="pattern" />
		<Tag label="go with plan-A" kind="decision" />
		<Tag label="deploy broke" kind="failure" />
	</div>
);
