import type { BunRequest, Serve } from "bun";
import { z } from "zod";
import { ForbiddenError, InvalidOperationError, NotFoundError, UnauthorizedError } from "../core/errors.ts";

export const SESSION_COOKIE = "session";

/** An error the web layer raises itself, with the status it answers; core errors get theirs in `handle`. */
export class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "HttpError";
	}
}

type Handler<Path extends string> = (req: BunRequest<Path>) => Response | Promise<Response>;

/** Identity with a purpose: it types each handler's `req.params` from its path key, the way `Bun.serve` does. */
export function routes<R extends string>(table: Serve.Routes<undefined, R>): Serve.Routes<undefined, R> {
	return table;
}

export function errorResponse(status: number, message: string): Response {
	return Response.json({ error: message }, { status });
}

/** Map what a handler throws to a status: api and core errors and bad input become 4xx, anything else is logged and answered 500. */
export function handle<Path extends string>(handler: Handler<Path>): Handler<Path> {
	return async (req) => {
		try {
			return await handler(req);
		} catch (e) {
			if (e instanceof HttpError) return errorResponse(e.status, e.message);
			if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
			if (e instanceof ForbiddenError) return errorResponse(403, e.message);
			if (e instanceof NotFoundError) return errorResponse(404, e.message);
			if (e instanceof InvalidOperationError) return errorResponse(400, e.message);
			// Logged here, not in Bun's `error` hook: that hook gets only the error, and the request is what makes the log useful.
			console.error(`${req.method} ${new URL(req.url).pathname} failed`, e);
			return errorResponse(500, "Something went wrong.");
		}
	};
}

/** Like `handle`, for a route that needs a session: the handler gets the cookie's token, or "" when there is no cookie. */
export function withToken<Path extends string>(
	handler: (token: string, req: BunRequest<Path>) => Response | Promise<Response>,
): Handler<Path> {
	// A missing cookie and a dead token are the same 401 from Api, so the message has one source.
	return handle<Path>((req) => handler(req.cookies.get(SESSION_COOKIE) ?? "", req));
}

/** A route parameter as an integer; anything else is a 400 that names it, `id` unless told otherwise. */
export function parseId(param: string, name = "id"): number {
	const result = z.coerce.number().int().safeParse(param);
	if (!result.success) throw new HttpError(400, `The ${name} is not a number.`);
	return result.data;
}

/** Parse the search params with `schema`, a repeated param as a list when `lists` names it. A schema failure is 400. */
export function readQuery<T>(req: Request, schema: z.ZodType<T>, lists: string[] = []): T {
	const params = new URL(req.url).searchParams;
	const result = schema.safeParse({
		...Object.fromEntries(params),
		...Object.fromEntries(lists.map((name) => [name, params.getAll(name)])),
	});
	if (!result.success) throw new HttpError(400, z.prettifyError(result.error));
	return result.data;
}

/** Parse a JSON body with `schema`. A wrong content type is 415; unreadable JSON and a schema failure are 400. */
export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
	if (req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
		throw new HttpError(415, "Expected Content-Type: application/json.");
	}
	let body: unknown;
	try {
		body = await req.json();
	} catch (e) {
		throw new HttpError(400, "The body is not valid JSON.", { cause: e });
	}
	const result = schema.safeParse(body);
	if (!result.success) throw new HttpError(400, z.prettifyError(result.error));
	return result.data;
}
