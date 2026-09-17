import type { Api } from "../../core/api.ts";
import { routes, withToken } from "../http.ts";

export function createNotificationRoutes(api: Api) {
	return routes({
		"/api/notifications": {
			GET: withToken((token) => Response.json(api.listUnreadNotifications(token))),
		},
		"/api/notifications/count": {
			GET: withToken((token) => Response.json(api.countUnreadTasks(token))),
		},
		"/api/notifications/read-all": {
			POST: withToken((token) => {
				api.markAllNotificationsRead(token);
				return new Response(null, { status: 204 });
			}),
		},
	});
}
