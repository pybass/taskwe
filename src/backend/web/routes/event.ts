import type { Api } from "../../core/api.ts";
import { parseId, routes, withToken } from "../http.ts";

export function createEventRoutes(api: Api) {
	return routes({
		"/api/activity": {
			GET: withToken((token) => Response.json(api.listActivity(token))),
		},
		"/api/tasks/:taskId/events": {
			GET: withToken((token, req) => Response.json(api.listTaskEvents(token, parseId(req.params.taskId)))),
		},
	});
}
