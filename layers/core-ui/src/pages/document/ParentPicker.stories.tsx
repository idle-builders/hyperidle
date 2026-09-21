import { useState } from "react";
import { ParentPicker } from "./ParentPicker";

export default { title: "Page: Document/ParentPicker" };

export const Default = (): React.JSX.Element => {
	const [value, setValue] = useState("");
	return <ParentPicker value={value} onChange={setValue} childScopeKind="factory" />;
};

export const Disabled = (): React.JSX.Element => (
	<ParentPicker value="" onChange={() => {}} childScopeKind="factory" disabled />
);
