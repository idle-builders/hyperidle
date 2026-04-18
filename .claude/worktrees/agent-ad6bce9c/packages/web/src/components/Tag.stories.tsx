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
