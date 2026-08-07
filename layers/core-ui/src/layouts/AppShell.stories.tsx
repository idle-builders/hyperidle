/**
 * @lore I6-fix: the AppShell story renders the shell directly inside the
 * existing router context (the story viewer is already within a router).
 * The Outlet renders empty since the story has no child routes, but the
 * shell chrome (IconRail, Submenu, Rail) is fully visible and interactive.
 */
import { AppShell } from "./AppShell";

export default { title: "Layout: AppShell" };

export const Default = (): React.JSX.Element => (
	<div className="h-[600px]">
		<AppShell />
	</div>
);
