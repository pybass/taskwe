import { NewSpace, OwnSpaceRole, SpaceMembers } from "#shared/space.ts";
import type { Api } from "../../core/api.ts";
import { parseId, readJson, routes, withToken } from "../http.ts";

export function createSpaceRoutes(api: Api) {
	return routes({
		"/api/spaces": {
			GET: withToken((token) => Response.json(api.listSpaces(token))),
			POST: withToken(async (token, req) =>
				Response.json(api.createSpace(token, await readJson(req, NewSpace)), { status: 201 }),
			),
		},
		"/api/spaces/:spaceId": {
			DELETE: withToken((token, req) => {
				api.deleteSpace(token, parseId(req.params.spaceId));
				return new Response(null, { status: 204 });
			}),
		},
		"/api/spaces/:spaceId/members": {
			PUT: withToken(async (token, req) => {
				const spaceId = parseId(req.params.spaceId);
				const { members } = await readJson(req, SpaceMembers);
				return Response.json(api.setSpaceMembers(token, spaceId, members));
			}),
		},
		"/api/admin/spaces": {
			GET: withToken((token) => Response.json(api.listAllSpaces(token))),
		},
		"/api/admin/spaces/counts": {
			GET: withToken((token) => Response.json(api.countOpenTasksInAllSpaces(token))),
		},
		"/api/admin/spaces/:spaceId/me": {
			PUT: withToken(async (token, req) => {
				const spaceId = parseId(req.params.spaceId);
				const { role } = await readJson(req, OwnSpaceRole);
				return Response.json(api.setOwnSpaceRole(token, spaceId, role));
			}),
		},
	});
}
