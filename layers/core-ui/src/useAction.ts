import type { Problem } from "@hyperidle/domain-model";
import { useCallback, useEffect, useState } from "react";
import { type ActionName, call, type InputOf, type OutputOf } from "./api";
import { listen } from "./live";

export interface ActionState<N extends ActionName> {
	/** The last good answer; `null` until the first one arrives. */
	readonly data: OutputOf<N> | null;
	readonly problems: readonly Problem[] | null;
	/** Ask again now, e.g. after this screen changed something. */
	readonly reload: () => void;
}

/**
 * Run an action and run it again whenever one of `topics` is nudged. No cache: each screen
 * asks for what it shows. `input` is compared by value, so an inline object is fine.
 */
export function useAction<N extends ActionName>(
	name: N,
	input: InputOf<N>,
	topics: readonly string[] = [],
): ActionState<N> {
	const [data, setData] = useState<OutputOf<N> | null>(null);
	const [problems, setProblems] = useState<readonly Problem[] | null>(null);
	const [turn, setTurn] = useState(0);
	const key = JSON.stringify(input);
	const topicKey = topics.join(" ");
	const reload = useCallback(() => setTurn((t) => t + 1), []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `input`; `turn` asks again
	useEffect(() => {
		let current = true;
		void call(name, JSON.parse(key) as InputOf<N>).then((result) => {
			if (!current) return;
			if (result.ok) {
				setData(result.data);
				setProblems(null);
			} else setProblems(result.problems);
		});
		return () => {
			current = false;
		};
	}, [name, key, turn]);

	useEffect(() => {
		if (!topicKey) return;
		return listen(topicKey.split(" "), reload);
	}, [topicKey, reload]);

	return { data, problems, reload };
}
