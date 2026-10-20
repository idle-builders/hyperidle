export type Need = "input" | "review";
export const NEED_WORDS: Record<Need, string> = { input: "Needs input", review: "Needs review" };

/** Where a person is needed: a question mark for input, an eye for a review. It marks the part, not an owner. */
export function NeedIcon({ kind }: { kind: Need }) {
	return (
		<span className="need" title={NEED_WORDS[kind]}>
			<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				{kind === "input" ? (
					<>
						<path d="M6 6.2a2 2 0 1 1 2.9 1.8c-.6.3-.9.7-.9 1.4" />
						<circle cx="8" cy="12" r="0.6" fill="currentColor" />
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
