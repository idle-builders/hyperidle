import { useState } from "react";
import { TaskDependencyField } from "./TaskDependencyField.js";

export default {
	title: "TaskDependencyField",
	tier: "component" as const,
};

export const Empty = (): React.JSX.Element => {
	const [dependencies, setDependencies] = useState<readonly string[]>([]);
	return <TaskDependencyField dependencies={dependencies} onChange={setDependencies} />;
};

export const WithDependencies = (): React.JSX.Element => {
	const [dependencies, setDependencies] = useState<readonly string[]>([
		"task-a1b2c3",
		"task-d4e5f6",
	]);
	return <TaskDependencyField dependencies={dependencies} onChange={setDependencies} />;
};

export const Disabled = (): React.JSX.Element => (
	<TaskDependencyField dependencies={["task-a1b2c3"]} onChange={() => undefined} disabled />
);
