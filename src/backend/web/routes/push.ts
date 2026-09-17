import { PushDevice } from "#shared/push.ts";
import type { Api } from "../../core/api.ts";
import { readJson, routes, withToken } from "../http.ts";

export function createPushRoutes(api: Api) {
	return routes({
		"/api/push/config": {
			GET: withToken((token) => Response.json(api.getPushConfig(token))),
		},
		"/api/push/subscription": {
			PUT: withToken(async (token, req) => {
				api.setPushSubscription(token, await readJson(req, PushDevice));
				return new Response(null, { status: 204 });
			}),
			DELETE: withToken((token) => {
				api.removePushSubscription(token);
				return new Response(null, { status: 204 });
			}),
		},
	});
}
