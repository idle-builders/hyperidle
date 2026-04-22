import { ConversationsChat } from "./ConversationsChat";

export default { title: "Page: Conversations/Chat" };

export const Default = (): React.JSX.Element => (
	<div className="h-[600px]">
		<ConversationsChat />
	</div>
);

export const Empty = (): React.JSX.Element => (
	<div className="h-[600px]">
		<ConversationsChat threads={[]} />
	</div>
);
