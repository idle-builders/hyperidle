import { MemoryRouter } from "react-router-dom";
import { WorkPortfolio } from "./WorkPortfolio";

export default { title: "Page: Work/Portfolio" };

export const Default = (): React.JSX.Element => (
	<MemoryRouter>
		<WorkPortfolio />
	</MemoryRouter>
);
