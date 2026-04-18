import { MemoryRouter } from "react-router-dom";
import { ConversationsChat } from "./ConversationsChat";

export default { title: "Page: Conversations/Chat" };

export const Default = (): React.JSX.Element => (
	<MemoryRouter>
		<div className="h-[600px]">
			<ConversationsChat />
		</div>
	</MemoryRouter>
);
