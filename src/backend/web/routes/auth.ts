import { Credentials, PasswordChange } from "#shared/user.ts";
import type { Api } from "../../core/api.ts";
import { SESSION_MS } from "../../core/features/session/service.ts";
import { errorResponse, HttpError, handle, readJson, routes, SESSION_COOKIE, withToken } from "../http.ts";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

/**
 * `maxAge` 0 clears the cookie. `Secure` comes from the server's site URL, since behind the proxy every request is
 * plain HTTP.
 */
function sessionCookie(secure: boolean, token: string, maxAge: number): string {
	return Bun.Cookie.from(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge, secure }).serialize();
}

/**
 * The times of the failed logins per username within the window, in memory: a restart forgets them. Keyed by
 * username, not by address, since behind the proxy every request has one address. Only a known username costs a
 * password hash, so the cap bounds the hashing an attacker can cause per user; it also locks a user out after 5
 * wrong passwords. Swept on every login, so the map holds at most the usernames tried in the last window.
 */
const loginFailures = new Map<string, number[]>();

function sweepLoginFailures(now: number): void {
	for (const [username, times] of loginFailures) {
		const recent = times.filter((time) => now - time < LOGIN_WINDOW_MS);
		if (recent.length === 0) loginFailures.delete(username);
		else loginFailures.set(username, recent);
	}
}

export function createAuthRoutes(api: Api, secureCookie: boolean) {
	return routes({
		"/api/login": {
			POST: handle(async (req) => {
				const { username, password } = await readJson(req, Credentials);
				const now = Date.now();
				sweepLoginFailures(now);
				const failures = loginFailures.get(username) ?? [];
				if (failures.length >= LOGIN_MAX_FAILURES) {
					throw new HttpError(429, "Too many failed logins. Try again in 15 minutes.");
				}
				const result = api.login(username, password);
				if (result === null) {
					loginFailures.set(username, [...failures, now]);
					return errorResponse(401, "Wrong username or password.");
				}
				loginFailures.delete(username);
				return Response.json(result.user, {
					headers: { "Set-Cookie": sessionCookie(secureCookie, result.token, SESSION_MS / 1000) },
				});
			}),
		},
		"/api/logout": {
			// No session needed: a stale or missing cookie still ends cleared.
			POST: handle((req) => {
				const token = req.cookies.get(SESSION_COOKIE);
				if (token !== null) api.logout(token);
				return new Response(null, { status: 204, headers: { "Set-Cookie": sessionCookie(secureCookie, "", 0) } });
			}),
		},
		"/api/me": {
			// Called on every load of the app, so the cookie is set again with a full Max-Age: the server moves the
			// session's expiry forward on use, and the cookie must not end before it.
			GET: withToken((token) =>
				Response.json(api.getCurrentUser(token), {
					headers: { "Set-Cookie": sessionCookie(secureCookie, token, SESSION_MS / 1000) },
				}),
			),
		},
		"/api/me/password": {
			PUT: withToken(async (token, req) => {
				api.changePassword(token, await readJson(req, PasswordChange));
				return new Response(null, { status: 204 });
			}),
		},
	});
}
