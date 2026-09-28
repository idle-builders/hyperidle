/**
 * @lore AppShell story renders inside existing router context; Outlet empty (no child routes) but shell chrome fully visible
 */
import { AppShell } from "./AppShell";

export default { title: "Layout: AppShell" };

export const Default = (): React.JSX.Element => (
	<div className="h-[600px]">
		<AppShell />
	</div>
);
