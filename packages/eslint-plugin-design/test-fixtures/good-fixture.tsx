/**
 * Good fixture: passes every design/* rule.
 * Used by src/__tests__/fixtures.test.ts.
 *
 * Note: this file deliberately uses semantic tokens, on-grid spacing, the
 * closed radius scale, and the closed type scale. It is NOT a default-exported
 * design-system component, so design/require-ds-attribute does not fire.
 * It is also not a design-system or web/components path, so
 * design/require-stories-sibling does not fire.
 */
export const Good = (): JSX.Element => (
	<button
		type="button"
		onClick={() => {}}
		className="rounded-[8px] bg-surface-1 text-text-hi p-[8px] gap-[12px] text-[14px] shadow-sm"
	>
		Good
	</button>
);
