import { AdminFlag, NewUser, PasswordSet, UserRename } from "#shared/user.ts";
import type { Api } from "../../core/api.ts";
import { parseId, readJson, routes, withToken } from "../http.ts";

export function createUserRoutes(api: Api) {
	return routes({
		"/api/users": {
			GET: withToken((token) => Response.json(api.listUsers(token))),
			POST: withToken(async (token, req) => Response.json(api.createUser(token, await readJson(req, NewUser)), { status: 201 })),
		},
		"/api/users/:userId/username": {
			PUT: withToken(async (token, req) =>
				Response.json(api.renameUser(token, parseId(req.params.userId), (await readJson(req, UserRename)).username)),
			),
		},
		"/api/users/:userId/admin": {
			PUT: withToken(async (token, req) =>
				Response.json(api.setAdmin(token, parseId(req.params.userId), (await readJson(req, AdminFlag)).admin)),
			),
		},
		"/api/users/:userId/password": {
			PUT: withToken(async (token, req) => {
				api.setPassword(token, parseId(req.params.userId), (await readJson(req, PasswordSet)).password);
				return new Response(null, { status: 204 });
			}),
		},
	});
}
