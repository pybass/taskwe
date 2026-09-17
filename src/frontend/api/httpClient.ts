import { z } from "zod";
import { setOffline } from "./connection.ts";

/** A non-2xx answer. The message is the server's `error` text, or the status when the body has none. */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

/** The request never reached the server: no network, or the host is unreachable. */
export class NetworkError extends Error {
	constructor(cause: unknown) {
		super("No connection to the server.", { cause });
		this.name = "NetworkError";
	}
}

const errorBodySchema = z.object({ error: z.string() });

/**
 * Send a request and return the JSON answer unparsed; the caller validates it. A body goes as JSON, a `FormData` as
 * multipart with the boundary the browser sets. A 204 gives undefined.
 */
async function request(method: string, path: string, body?: unknown): Promise<unknown> {
	const res = await fetch(path, {
		method,
		headers: body === undefined || body instanceof FormData ? undefined : { "content-type": "application/json" },
		body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
	}).catch((cause: unknown) => {
		setOffline(true);
		throw new NetworkError(cause);
	});
	setOffline(false);
	if (!res.ok) {
		// A crash page or a proxy answer is not JSON; then the status is the message.
		const parsed = errorBodySchema.safeParse(await res.json().catch(() => undefined));
		throw new ApiError(res.status, parsed.success ? parsed.data.error : `HTTP ${res.status}`);
	}
	return res.status === 204 ? undefined : await res.json();
}

export const httpClient = {
	get: (path: string) => request("GET", path),
	post: (path: string, body?: unknown) => request("POST", path, body),
	put: (path: string, body: unknown) => request("PUT", path, body),
	patch: (path: string, body: unknown) => request("PATCH", path, body),
	delete: (path: string) => request("DELETE", path),
};
