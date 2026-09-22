import { MemoryRouter } from "react-router-dom";
import { DocumentCreate } from "./DocumentCreate";

export default { title: "Page: Document/Create" };

export const Default = (): React.JSX.Element => (
	<MemoryRouter initialEntries={["/documents/new"]}>
		<DocumentCreate />
	</MemoryRouter>
);
