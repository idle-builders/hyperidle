import { MemoryRouter } from "react-router-dom";
import { ConversationsReview } from "./ConversationsReview";

export default { title: "Page: Conversations/Review" };

export const Default = (): React.JSX.Element => (
	<MemoryRouter>
		<div className="h-[600px]">
			<ConversationsReview />
		</div>
	</MemoryRouter>
);
