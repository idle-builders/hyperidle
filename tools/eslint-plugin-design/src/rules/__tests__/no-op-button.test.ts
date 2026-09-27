/**
 * Tests for design/no-op-button rule.
 *
 * Verifies:
 *   (a) <button onClick=...> is always valid
 *   (b) <button type="submit"> inside <form onSubmit=...> or <form method="dialog"> is valid
 *   (c) <button> as headless-control trigger child is valid
 *   Failing: <button type="button"> with no onClick (real no-op)
 *   Failing: <button> with no type and no onClick (implicit no-op)
 *   Failing: <button type="submit"> outside an onSubmit/method=dialog form (dangling submit)
 *
 * The hard rule: no button is a no-op.
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noOpButton } from "../no-op-button.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-op-button", noOpButton, {
	valid: [
		// (a) onClick present — always valid regardless of type
		{
			filename: "pages/Foo.tsx",
			code: `const J = <button onClick={handleClick}>Click</button>;`,
		},
		{
			filename: "pages/Foo.tsx",
			code: `const J = <button type="button" onClick={() => doSomething()}>Act</button>;`,
		},
		{
			filename: "pages/Foo.tsx",
			code: `const J = <button type="submit" onClick={submit}>Submit</button>;`,
		},

		// (b) type="submit" inside form with onSubmit
		{
			filename: "pages/Foo.tsx",
			code: `
const J = (
  <form onSubmit={handleSubmit}>
    <button type="submit">Submit</button>
  </form>
);`,
		},
		// (b) type="submit" inside form with method="dialog" (DaisyUI modal backdrop close)
		{
			filename: "pages/Foo.tsx",
			code: `
const J = (
  <form method="dialog" className="modal-backdrop">
    <button type="submit">close</button>
  </form>
);`,
		},
		// (b) nested inside form — form is ancestor, not direct parent
		{
			filename: "pages/Foo.tsx",
			code: `
const J = (
  <form onSubmit={handleSubmit}>
    <div>
      <button type="submit">Submit</button>
    </div>
  </form>
);`,
		},

		// (c) headless trigger child — MenuButton parent
		{
			filename: "pages/Foo.tsx",
			code: `
const J = (
  <MenuButton>
    <button type="button">Open menu</button>
  </MenuButton>
);`,
		},
		// (c) headless trigger child — Disclosure parent
		{
			filename: "pages/Foo.tsx",
			code: `
const J = (
  <Disclosure>
    <button>Toggle</button>
  </Disclosure>
);`,
		},
	],

	invalid: [
		// Real no-op: type="button" with no onClick
		{
			filename: "pages/Foo.tsx",
			code: `const J = <button type="button">No handler</button>;`,
			errors: [{ messageId: "noOp" }],
		},
		// Real no-op: no type and no onClick
		{
			filename: "pages/Foo.tsx",
			code: `const J = <button>Bare no-op</button>;`,
			errors: [{ messageId: "noOp" }],
		},
		// Dangling submit: type="submit" but no enclosing form
		{
			filename: "pages/Foo.tsx",
			code: `const J = <div><button type="submit">Orphan submit</button></div>;`,
			errors: [{ messageId: "danglingSubmit" }],
		},
		// Dangling submit: inside a form but form has no onSubmit / method="dialog"
		{
			filename: "pages/Foo.tsx",
			code: `
const J = (
  <form className="my-form">
    <button type="submit">Submit</button>
  </form>
);`,
			errors: [{ messageId: "danglingSubmit" }],
		},
		// type="button" with no onClick is a no-op even if other attrs present
		{
			filename: "pages/Foo.tsx",
			code: `const J = <button type="button" className="btn btn-primary">Looks active</button>;`,
			errors: [{ messageId: "noOp" }],
		},
	],
});
