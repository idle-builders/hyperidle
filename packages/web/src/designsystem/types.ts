import type { ComponentType } from "react";

/**
 * A story module is a `.stories.tsx` file that exports:
 * - default: { title: string } — the component name shown in nav
 * - named exports: React components, each representing one variant/state
 *
 * Example:
 *   export default { title: "StatusChip" }
 *   export const Healthy = () => <StatusChip status="healthy" />
 *   export const Error = () => <StatusChip status="error" />
 */
export interface StoryMeta {
	title: string;
}

export interface StoryEntry {
	name: string;
	// biome-ignore lint/style/useNamingConvention: React component references use PascalCase by convention
	Component: ComponentType;
}

export interface StoryModule {
	meta: StoryMeta;
	variants: StoryEntry[];
}
