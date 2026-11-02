import { expect, it } from "vitest";
import { SIGN_IN_REDIRECT, signIn } from "../src/sign-in.js";

const PROVIDER = {
	clientId: "desktop",
	authorizationEndpoint: "https://id.example.com/authorize",
	tokenEndpoint: "https://id.example.com/token",
};

it("asks the sign-in service to let the person pick an account, so a browser already signed in as someone else does not join as them", async () => {
	let shown = "";
	const signingIn = signIn(PROVIDER, async (url) => {
		shown = url;
		// End the wait: the browser comes back without a valid answer.
		await fetch(`${SIGN_IN_REDIRECT}?code=x&state=not-ours`);
	});

	await expect(signingIn).rejects.toThrow("The sign-in did not finish.");
	expect(new URL(shown).searchParams.get("prompt")).toBe("select_account");
});
