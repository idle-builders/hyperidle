import { MemoryRouter } from "react-router-dom";
import { KnowledgeCreate } from "./KnowledgeCreate";

export default { title: "Page: Knowledge/Create" };

export const Default = (): React.JSX.Element => (
	<MemoryRouter initialEntries={["/knowledge/new"]}>
		<KnowledgeCreate />
	</MemoryRouter>
);
