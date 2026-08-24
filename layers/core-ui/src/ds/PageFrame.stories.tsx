import { PageFrame } from "./PageFrame.js";

export default { title: "PageFrame", group: "Layout" as const };

export function Default(): React.JSX.Element {
	return (
		<PageFrame>
			<div className="border border-[var(--border-subtle)] py-[18px]">Stable page content</div>
		</PageFrame>
	);
}
