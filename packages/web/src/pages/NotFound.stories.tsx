import type { JSX } from "react";
import { MemoryRouter } from "react-router-dom";
import { NotFound } from "./NotFound";

export default { title: "NotFound" };

export const Default: () => JSX.Element = (): JSX.Element => (
	<MemoryRouter>
		<NotFound />
	</MemoryRouter>
);
