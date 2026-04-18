import { MemoryRouter } from "react-router-dom";
import { KnowledgeList } from "./KnowledgeList";

export default { title: "Page: Knowledge/List" };

export const Default = (): React.JSX.Element => (
	<MemoryRouter>
		<KnowledgeList />
	</MemoryRouter>
);
