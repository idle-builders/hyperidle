import * as crypto from "node:crypto";
import * as http from "node:http";

/**
 * Signing in through the person's own browser (OAuth code flow with PKCE): the sign-in service
 * sends the browser back to a page this app serves on the loopback address, and the app trades
 * the code for an ID token. The address is fixed because the sign-in service only sends people
 * back to addresses it knows.
 */
export const SIGN_IN_REDIRECT = "http://127.0.0.1:52817/callback";
const WAIT_MS = 5 * 60 * 1000;

const base64Url = (buf: Buffer): string => buf.toString("base64url");

function waitForCode(state: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const server = http.createServer((req, res) => {
			const url = new URL(req.url ?? "/", SIGN_IN_REDIRECT);
			if (url.pathname !== "/callback") return void res.writeHead(404).end();
			const code = url.searchParams.get("code");
			const ok = code !== null && url.searchParams.get("state") === state;
			res.writeHead(ok ? 200 : 400, { "Content-Type": "text/plain; charset=utf-8" });
			res.end(ok ? "Signed in. You can close this tab." : "Sign-in did not finish.");
			finish(ok ? null : new Error("The sign-in did not finish."), code ?? "");
		});
		const timer = setTimeout(() => finish(new Error("The sign-in took too long.")), WAIT_MS);
		const finish = (error: Error | null, code = ""): void => {
			clearTimeout(timer);
			server.close();
			if (error) reject(error);
			else resolve(code);
		};
		server.on("error", (error) => finish(error));
		server.listen(52817, "127.0.0.1");
	});
}

/** The ID token for whoever signs in, after `openBrowser` shows them the sign-in page. */
export async function signIn(
	issuer: string,
	clientId: string,
	openBrowser: (url: string) => Promise<void>,
): Promise<string> {
	const verifier = base64Url(crypto.randomBytes(32));
	const state = base64Url(crypto.randomBytes(16));
	const authorize = new URL(`${issuer}/oauth/v2/authorize`);
	authorize.search = new URLSearchParams({
		response_type: "code",
		client_id: clientId,
		redirect_uri: SIGN_IN_REDIRECT,
		scope: "openid email profile",
		code_challenge: base64Url(crypto.createHash("sha256").update(verifier).digest()),
		code_challenge_method: "S256",
		state,
	}).toString();
	const code = waitForCode(state);
	code.catch(() => undefined);
	await openBrowser(authorize.toString());
	const res = await fetch(`${issuer}/oauth/v2/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code: await code,
			redirect_uri: SIGN_IN_REDIRECT,
			client_id: clientId,
			code_verifier: verifier,
		}),
	});
	const body = (await res.json().catch(() => ({}))) as { id_token?: string };
	if (!body.id_token) throw new Error("The sign-in service gave no ID token.");
	return body.id_token;
}
