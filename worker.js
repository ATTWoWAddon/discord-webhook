const ALLOWED_BRANCHES = new Set([
	"master",
]);

export default {
	/**
	 * @param {Request} request
	 * @param {{ GITHUB_WEBHOOK_SECRET?: string, DISCORD_WEBHOOK_URL?: string }} env
	 */
	async fetch(request, env) {
		if (request.method !== "POST") {
			return new Response("Method Not Allowed", { status: 405 });
		}

		// Ensure all required secrets are configured.
		if (!env.GITHUB_WEBHOOK_SECRET || !env.DISCORD_WEBHOOK_URL) {
			return new Response("Missing secrets", { status: 500 });
		}

		// Read the raw payload for signature verification and forwarding.
		const body = await request.arrayBuffer();
		const signature = request.headers.get("X-Hub-Signature-256");

		if (!signature || !/^sha256=[0-9a-f]{64}$/.test(signature)) {
			return new Response("Invalid signature", { status: 403 });
		}

		// Import the GitHub webhook secret as an HMAC-SHA256 key.
		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(env.GITHUB_WEBHOOK_SECRET),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["verify"]
		);

		// Decode the hexadecimal signature into bytes.
		const signatureBytes = new Uint8Array(
			signature.slice(7).match(/.{2}/g).map(x => parseInt(x, 16))
		);

		// Verify that the payload matches the GitHub signature.
		const valid = await crypto.subtle.verify(
			"HMAC",
			key,
			signatureBytes,
			body
		);

		if (!valid) {
			return new Response("Forbidden", { status: 403 });
		}

		const event = request.headers.get("X-GitHub-Event");

		// Acknowledge GitHub webhook ping events.
		if (event === "ping") {
			return new Response("OK");
		}

		// Ignore all events except push events.
		if (event !== "push") {
			return new Response("Ignored event");
		}

		// Parse the GitHub webhook payload.
		let payload;
		try {
			payload = JSON.parse(new TextDecoder().decode(body));
		} catch {
			return new Response("Invalid JSON", { status: 400 });
		}

		// Ignore pushes that do not target a branch.
		if (typeof payload.ref !== "string" ||
				!payload.ref.startsWith("refs/heads/")) {
			return new Response("Ignored ref");
		}

		// Extract and validate the target branch.
		const branch = payload.ref.slice("refs/heads/".length);

		if (!ALLOWED_BRANCHES.has(branch)) {
			return new Response(`Ignored branch: ${branch}`);
		}

		// Forward the original payload to Discord's GitHub-compatible endpoint.
		const url = new URL(env.DISCORD_WEBHOOK_URL);
		url.pathname = url.pathname.replace(/\/+$/, "") + "/github";

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-GitHub-Event": event,
			},
			body,
		});

		if (!response.ok) {
			return new Response(
				`Discord error: ${response.status}`,
				{ status: 502 }
			);
		}

		return new Response("Forwarded", { status: 200 });
	},
};
