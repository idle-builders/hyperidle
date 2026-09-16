/**
 * Offline, real-git, real-`gh` stand-in for `https://github.com/`.
 *
 * @lore BA5 §14.1: git and `gh` both hard-require an actual `https://github.com/…`
 * URL to exercise the real credential path end to end (`gh auth git-credential`
 * refuses to answer for a host that is not really `github.com`). Rather than
 * special-case a test host in production code, this makes `github.com`
 * resolve locally: a raw TCP "proxy" answers the CONNECT git issues for
 * `github.com:443`, terminates TLS itself with a throwaway CA + leaf
 * certificate for that name, and behind that TLS, `git-http-backend` — git's
 * own CGI, already on any machine that has git — serves real bare repos.
 * git and `gh` see an entirely ordinary `https://github.com/` remote; only
 * the `http.https://github.com/.proxy` + `.sslCAInfo` git-config entries
 * (written into a throwaway `HOME`) reach into it, and only because
 * `GIT_CONFIG_GLOBAL=/dev/null` no longer nulls the person's own config
 * (§6.3) — the mechanism this stand-in leans on IS the production change.
 *
 * Verified locally (git 2.39.5, gh 2.92.0, LibreSSL 3.3.6): a public repo
 * needs no credential; a private repo answers 401 until a valid Basic
 * password (any username — "the server must check only the password, as
 * GitHub does") arrives via the `gh auth git-credential` helper or a
 * `GH_TOKEN`; a wrong token fails with `Authentication failed`; no helper at
 * all fails with `could not read Username`; `ls-remote --exit-code` against a
 * branch that does not exist exits 2.
 */
import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as tls from "node:tls";

function isOnPath(binary: string): boolean {
	try {
		execFileSync("which", [binary], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

/** Hard-fails naming each missing binary — same shape as `require-binary.ts`. */
function assertStandInBinariesPresent(): void {
	const missing = ["git", "gh", "openssl"].filter((bin) => !isOnPath(bin));
	let execPath: string | null = null;
	try {
		execPath = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
	} catch {
		/* git itself already missing, reported below */
	}
	if (execPath == null || !fs.existsSync(path.join(execPath, "git-http-backend"))) {
		missing.push("git-http-backend");
	}
	if (missing.length > 0) {
		throw new Error(
			`github-stand-in: ${missing.join(", ")} not installed — this integration test cannot complete. ` +
				"Install the CLI, or demote the test to a *.test.ts unit. (Never skipIf to green.)",
		);
	}
}

function processEnvRecord(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (typeof v === "string") env[k] = v;
	}
	return env;
}

/** A bare repo registered behind the stand-in. */
interface StandInRepo {
	readonly repoDir: string;
	readonly private: boolean;
	readonly token: string | null;
}

export interface GithubStandIn {
	/** `http.<url>.proxy` value for `https://github.com/`. */
	readonly proxyUrl: string;
	/** `http.<url>.sslCAInfo` value for `https://github.com/`. */
	readonly caPath: string;
	/**
	 * Register a bare repo at `https://github.com/<name>.git`, seeded with one
	 * commit on `branch` (default `main`). `token`, when given, is the ONLY
	 * password the stand-in accepts for this repo — any username.
	 */
	createRepo(
		name: string,
		opts?: { private?: boolean; token?: string; branch?: string },
	): { url: string; repoDir: string };
	/** Branch names present on a registered repo. */
	branches(name: string): string[];
	/**
	 * A fresh throwaway `HOME` whose `.gitconfig` points `https://github.com/`
	 * at this stand-in. `ghLogin`, when given, also writes a `gh` `hosts.yml`
	 * so `gh auth git-credential` / `gh auth status` answer as a logged-in
	 * account holding that token — without ever setting `GH_TOKEN`.
	 */
	home(opts?: { ghLogin?: { token: string } }): string;
	close(): Promise<void>;
}

const GITHUB_CONNECT_HOST = "github.com";
const AUTH_REALM = 'Basic realm="github-stand-in"';

export async function startGithubStandIn(): Promise<GithubStandIn> {
	assertStandInBinariesPresent();

	const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "github-stand-in-"));
	const reposRoot = path.join(workDir, "repos");
	fs.mkdirSync(reposRoot, { recursive: true });

	const { certPath, keyPath, caPath } = generateCertificates(workDir);
	const cert = fs.readFileSync(certPath);
	const key = fs.readFileSync(keyPath);

	const repos = new Map<string, StandInRepo>();
	const execPath = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
	const backendPath = path.join(execPath, "git-http-backend");

	const httpServer = http.createServer((req, res) => {
		handleGitHttpBackendRequest(req, res, { reposRoot, backendPath, repos });
	});

	const proxyServer = net.createServer((socket) => {
		socket.once("data", (chunk: Buffer) => {
			const requestLine = chunk.toString("utf8");
			const connectMatch = /^CONNECT ([^:\s]+):(\d+)/.exec(requestLine);
			if (!connectMatch) {
				socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
				return;
			}
			socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
			const tlsSocket = new tls.TLSSocket(socket, { isServer: true, cert, key });
			tlsSocket.on("secure", () => {
				httpServer.emit("connection", tlsSocket);
			});
			tlsSocket.on("error", () => {
				/* a broken tunnel is a test failure elsewhere, not here */
			});
		});
	});

	const proxyPort = await new Promise<number>((resolve, reject) => {
		proxyServer.once("error", reject);
		proxyServer.listen(0, "127.0.0.1", () => {
			const address = proxyServer.address();
			if (address === null || typeof address === "string") {
				reject(new Error("github-stand-in: proxy did not bind to a TCP port"));
				return;
			}
			resolve(address.port);
		});
	});

	return {
		proxyUrl: `http://127.0.0.1:${proxyPort}`,
		caPath,
		createRepo(name, opts) {
			const repoDir = path.join(reposRoot, `${name}.git`);
			execFileSync("git", ["init", "--bare", "--quiet", "-b", opts?.branch ?? "main", repoDir]);
			execFileSync("git", ["-C", repoDir, "config", "http.receivepack", "true"]);
			seedInitialCommit(repoDir, opts?.branch ?? "main");
			repos.set(name, {
				repoDir,
				private: opts?.private ?? false,
				token: opts?.token ?? null,
			});
			return { url: `https://${GITHUB_CONNECT_HOST}/${name}.git`, repoDir };
		},
		branches(name) {
			const repo = repos.get(name);
			if (!repo) throw new Error(`github-stand-in: no repo registered as '${name}'`);
			const out = execFileSync("git", ["-C", repo.repoDir, "branch", "--format=%(refname:short)"], {
				encoding: "utf8",
			});
			return out.split("\n").filter((line) => line.trim().length > 0);
		},
		home(opts) {
			const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "github-stand-in-home-"));
			fs.writeFileSync(
				path.join(homeDir, ".gitconfig"),
				[
					`[http "https://${GITHUB_CONNECT_HOST}/"]`,
					`\tproxy = http://127.0.0.1:${proxyPort}`,
					`\tsslCAInfo = ${caPath}`,
					"",
				].join("\n"),
			);
			if (opts?.ghLogin) {
				const ghConfigDir = path.join(homeDir, ".config", "gh");
				fs.mkdirSync(ghConfigDir, { recursive: true });
				fs.writeFileSync(
					path.join(ghConfigDir, "hosts.yml"),
					[
						`${GITHUB_CONNECT_HOST}:`,
						`    oauth_token: ${opts.ghLogin.token}`,
						"    user: github-stand-in",
						"    git_protocol: https",
						"",
					].join("\n"),
				);
			}
			return homeDir;
		},
		async close() {
			await Promise.all([
				new Promise<void>((resolve) => proxyServer.close(() => resolve())),
				new Promise<void>((resolve) => httpServer.close(() => resolve())),
			]);
			fs.rmSync(workDir, { recursive: true, force: true });
		},
	};
}

function generateCertificates(workDir: string): {
	certPath: string;
	keyPath: string;
	caPath: string;
} {
	const caKey = path.join(workDir, "ca.key");
	const caPath = path.join(workDir, "ca.pem");
	const leafKey = path.join(workDir, "leaf.key");
	const leafCsr = path.join(workDir, "leaf.csr");
	const leafPath = path.join(workDir, "leaf.pem");
	const extFile = path.join(workDir, "leaf.ext.cnf");

	execFileSync("openssl", ["genrsa", "-out", caKey, "2048"], { stdio: "ignore" });
	execFileSync(
		"openssl",
		[
			"req",
			"-x509",
			"-new",
			"-nodes",
			"-key",
			caKey,
			"-sha256",
			"-days",
			"2",
			"-out",
			caPath,
			"-subj",
			"/CN=hyperidle-test-ca",
		],
		{ stdio: "ignore" },
	);
	execFileSync("openssl", ["genrsa", "-out", leafKey, "2048"], { stdio: "ignore" });
	execFileSync(
		"openssl",
		["req", "-new", "-key", leafKey, "-out", leafCsr, "-subj", `/CN=${GITHUB_CONNECT_HOST}`],
		{ stdio: "ignore" },
	);
	fs.writeFileSync(extFile, `subjectAltName=DNS:${GITHUB_CONNECT_HOST}\n`);
	execFileSync(
		"openssl",
		[
			"x509",
			"-req",
			"-in",
			leafCsr,
			"-CA",
			caPath,
			"-CAkey",
			caKey,
			"-CAcreateserial",
			"-out",
			leafPath,
			"-days",
			"2",
			"-sha256",
			"-extfile",
			extFile,
		],
		{ stdio: "ignore" },
	);
	return { certPath: leafPath, keyPath: leafKey, caPath };
}

function seedInitialCommit(repoDir: string, branch: string): void {
	const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), "github-stand-in-seed-"));
	execFileSync("git", ["init", "--quiet", "-b", branch, seedDir]);
	execFileSync("git", ["-C", seedDir, "config", "user.email", "stand-in@hyperidle.test"]);
	execFileSync("git", ["-C", seedDir, "config", "user.name", "github-stand-in"]);
	fs.writeFileSync(path.join(seedDir, "README.md"), `seed for ${path.basename(repoDir)}\n`);
	execFileSync("git", ["-C", seedDir, "add", "-A"]);
	execFileSync("git", ["-C", seedDir, "commit", "--quiet", "-m", "seed"]);
	execFileSync("git", ["-C", seedDir, "push", "--quiet", repoDir, branch]);
	fs.rmSync(seedDir, { recursive: true, force: true });
}

/** True when the password half of a `Basic` Authorization header matches. GitHub itself
 * only checks the password, so a request naming any username with the right token passes. */
function acceptsAuthorization(header: string | undefined, expectedToken: string): boolean {
	if (!header?.startsWith("Basic ")) return false;
	const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
	const separatorIndex = decoded.indexOf(":");
	const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : decoded;
	return password === expectedToken;
}

function handleGitHttpBackendRequest(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	deps: { reposRoot: string; backendPath: string; repos: ReadonlyMap<string, StandInRepo> },
): void {
	const url = new URL(req.url ?? "/", `https://${GITHUB_CONNECT_HOST}`);
	const repoNameMatch = /^\/([^/]+)\.git\//.exec(`${url.pathname}/`);
	const repoName = repoNameMatch?.[1];
	const repo = repoName ? deps.repos.get(repoName) : undefined;

	if (repo?.private) {
		const token = repo.token;
		if (!(token && acceptsAuthorization(req.headers.authorization, token))) {
			res.writeHead(401, { "WWW-Authenticate": AUTH_REALM });
			res.end("authentication required");
			return;
		}
	}

	const child = spawn(deps.backendPath, [], {
		env: {
			...processEnvRecord(),
			GIT_PROJECT_ROOT: deps.reposRoot,
			GIT_HTTP_EXPORT_ALL: "1",
			REQUEST_METHOD: req.method ?? "GET",
			PATH_INFO: url.pathname,
			QUERY_STRING: url.search.replace(/^\?/, ""),
			CONTENT_TYPE: req.headers["content-type"] ?? "",
			CONTENT_LENGTH: req.headers["content-length"] ?? "0",
			REMOTE_ADDR: "127.0.0.1",
		},
	});
	req.pipe(child.stdin);

	let headerBuffer = Buffer.alloc(0);
	let headersSent = false;
	child.stdout.on("data", (chunk: Buffer) => {
		if (headersSent) {
			res.write(chunk);
			return;
		}
		headerBuffer = Buffer.concat([headerBuffer, chunk]);
		const separator = headerBuffer.indexOf("\r\n\r\n");
		if (separator === -1) return;
		headersSent = true;
		const headerText = headerBuffer.subarray(0, separator).toString("utf8");
		const body = headerBuffer.subarray(separator + 4);
		let status = 200;
		const headers: Record<string, string> = {};
		for (const line of headerText.split("\r\n")) {
			const statusMatch = /^Status:\s*(\d+)/i.exec(line);
			if (statusMatch?.[1]) {
				status = Number(statusMatch[1]);
				continue;
			}
			const headerMatch = /^([^:]+):\s*(.*)$/.exec(line);
			if (headerMatch?.[1] && headerMatch[2] !== undefined) {
				headers[headerMatch[1]] = headerMatch[2];
			}
		}
		res.writeHead(status, headers);
		if (body.length > 0) res.write(body);
	});
	child.on("close", () => res.end());
}
