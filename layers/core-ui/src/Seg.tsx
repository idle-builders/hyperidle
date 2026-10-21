/** One of a few, all visible: find or ask, a folder or a service, an agent or a person. */
export function Seg<T extends string>({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: readonly T[];
	value: T | null;
	onChange: (v: T) => void;
}): React.ReactElement {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset brings its own frame; this is one row of buttons
		<div className="seg" role="group" aria-label={label}>
			{options.map((o) => (
				<button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}>
					{o}
				</button>
			))}
		</div>
	);
}
