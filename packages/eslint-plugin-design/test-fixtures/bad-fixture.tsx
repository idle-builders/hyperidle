/**
 * Bad fixture: triggers EVERY design/* rule (one violation per rule, except
 * design/require-ds-attribute and design/require-stories-sibling which are
 * filename-scoped and asserted separately by the rule's unit tests + the
 * extra fixture asserts in fixtures.test.ts).
 *
 * Each violation is annotated with `// expect: design/<rule-name>` so it is
 * obvious from the source which line targets which rule.
 */

const HEX_COLOR = "#ff00aa"; // expect: design/no-hardcoded-color

export const Bad = (): JSX.Element => (
	<div onClick={() => {}}> {/* expect: design/require-focus-on-interactive */}
		<span className="p-[5px]" /> {/* expect: design/no-off-grid-spacing */}
		<span className="rounded-[10px]" /> {/* expect: design/no-off-scale-radius */}
		<span className="text-[17px]" /> {/* expect: design/no-off-scale-font-size */}
		<span className="rounded-2xl" /> {/* expect: design/no-ai-aesthetic */}
		<span className="bg-blue-500" /> {/* expect: design/no-raw-tailwind-color */}
		<span>{HEX_COLOR}</span>
	</div>
);
