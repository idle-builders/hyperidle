import { useState } from "react";
import { IconRail } from "./IconRail";
import type { ViewId } from "./shell-types";

export default { title: "IconRail" };

export const Default = (): React.JSX.Element => {
	const [active, setActive] = useState<ViewId>("conversations");
	return <IconRail activeView={active} onViewChange={setActive} />;
};

export const WorkActive = (): React.JSX.Element => (
	<IconRail activeView="work" onViewChange={() => {}} />
);

export const KnowledgeActive = (): React.JSX.Element => (
	<IconRail activeView="knowledge" onViewChange={() => {}} />
);

export const WithAvatar = (): React.JSX.Element => {
	const [active, setActive] = useState<ViewId>("conversations");
	return (
		<IconRail
			activeView={active}
			onViewChange={setActive}
			onAvatarClick={() => {}}
			avatarUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23374151'/%3E%3Ccircle cx='16' cy='12' r='6' fill='%239ca3af'/%3E%3Cpath d='M4 28a12 12 0 0124 0' fill='%239ca3af'/%3E%3C/svg%3E"
		/>
	);
};

export const WithAvatarNoImage = (): React.JSX.Element => (
	<IconRail activeView="conversations" onViewChange={() => {}} onAvatarClick={() => {}} />
);

// J2: unread dot on inactive views.
export const WithUnread = (): React.JSX.Element => (
	<IconRail
		activeView="work"
		onViewChange={() => {}}
		unreadByView={{ conversations: 3, knowledge: 12 }}
	/>
);

// J2: active view suppresses its own dot but shows the edge indicator; other
// views with unread still display dots.
export const ActiveWithOthersUnread = (): React.JSX.Element => (
	<IconRail
		activeView="conversations"
		onViewChange={() => {}}
		unreadByView={{ conversations: 3, knowledge: 12 }}
	/>
);
