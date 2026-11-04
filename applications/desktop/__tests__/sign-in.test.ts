import { expect, it } from "vitest";
import { cancelSignIn, SIGN_IN_REDIRECT, SignInCancelled, signIn } from "../src/sign-in.js";

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
		await fetch(`${SIGN_IN_REDIRECT}?code=x&state=not-ours`, { headers: { Connection: "close" } });
	});

	await expect(signingIn).rejects.toThrow("The sign-in did not finish.");
	expect(new URL(shown).searchParams.get("prompt")).toBe("select_account");
});

const token = (url: string) => new URL(url).searchParams.get("state") ?? "";

async function answer(state: string): Promise<void> {
	await fetch(`${SIGN_IN_REDIRECT}?code=x&state=${state}`, { headers: { Connection: "close" } });
}

it("a second sign-in ends the one still waiting, so an abandoned attempt never blocks a retry", async () => {
	const first = signIn(PROVIDER, async () => undefined);
	const firstEnded = first.catch((e: Error) => e);
	await new Promise((r) => setTimeout(r, 50));

	let shown = "";
	const second = signIn(PROVIDER, async (url) => {
		shown = url;
	});
	const secondEnded = second.catch((e: Error) => e);
	expect(await firstEnded).toBeInstanceOf(SignInCancelled);

	await new Promise((r) => setTimeout(r, 50));
	await answer("not-ours");
	expect(((await secondEnded) as Error).message).toBe("The sign-in did not finish.");
	expect(token(shown)).not.toBe("");
});

it("cancelling closes the port so it can be used again", async () => {
	const waiting = signIn(PROVIDER, async () => undefined).catch((e: Error) => e);
	await new Promise((r) => setTimeout(r, 50));
	cancelSignIn();
	expect(await waiting).toBeInstanceOf(SignInCancelled);

	const again = signIn(PROVIDER, async () => undefined).catch((e: Error) => e);
	await new Promise((r) => setTimeout(r, 50));
	await answer("not-ours");
	expect(((await again) as Error).message).toBe("The sign-in did not finish.");
});

it("says plainly when something else holds the port, never the raw code", async () => {
	const http = await import("node:http");
	const blocker = http.createServer().listen(52817, "127.0.0.1");
	await new Promise((r) => blocker.once("listening", r));
	try {
		const err = (await signIn(PROVIDER, async () => undefined).catch((e: Error) => e)) as Error;
		expect(err.message).toMatch(/another program/i);
		expect(err.message).not.toMatch(/EADDRINUSE/);
	} finally {
		blocker.close();
	}
});
