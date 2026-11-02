export type Need = "input" | "review";
export const NEED_WORDS: Record<Need, string> = { input: "Needs input", review: "Needs review" };

/** Where a person is needed: a question mark for input, an eye for a review. It marks the part, not an owner; `label` says it in the caller's words. */
export function NeedIcon({ kind, label }: { kind: Need; label?: string }) {
	return (
		<span className="need" title={label ?? NEED_WORDS[kind]}>
			<svg
				width="14"
				height="14"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				{kind === "input" ? (
					<>
						<circle cx="8" cy="8" r="6.6" />
						<path d="M6.2 6.3a1.85 1.85 0 1 1 2.7 1.65c-.55.3-.9.65-.9 1.3" />
						<circle cx="8" cy="11.3" r="0.6" fill="currentColor" />
					</>
				) : (
					<>
						<path d="M1.5 8s2.4-4.3 6.5-4.3S14.5 8 14.5 8s-2.4 4.3-6.5 4.3S1.5 8 1.5 8z" />
						<circle cx="8" cy="8" r="1.8" />
					</>
				)}
			</svg>
		</span>
	);
}
