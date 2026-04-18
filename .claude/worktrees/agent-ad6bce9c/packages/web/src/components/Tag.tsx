import type { JSX } from "react";

export interface TagProps {
	label: string;
}

export function Tag({ label }: TagProps): JSX.Element {
	return <span className="badge badge-neutral badge-sm border-0">{label}</span>;
}
