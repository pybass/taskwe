import { MarkTaskRead } from "#shared/notification.ts";
import { NewTask, TaskListQuery, TaskMove, TaskPatch } from "#shared/task.ts";
import type { Api } from "../../core/api.ts";
import { parseId, readJson, readQuery, routes, withToken } from "../http.ts";

export function createTaskRoutes(api: Api) {
	return routes({
		"/api/spaces/:spaceId/tasks": {
			GET: withToken((token, req) =>
				Response.json(api.listTasks(token, parseId(req.params.spaceId), readQuery(req, TaskListQuery, ["label"]))),
			),
			POST: withToken(async (token, req) =>
				Response.json(api.createTask(token, parseId(req.params.spaceId), await readJson(req, NewTask)), { status: 201 }),
			),
		},
		"/api/tasks/counts": {
			GET: withToken((token) => Response.json(api.countOpenTasks(token))),
		},
		"/api/tasks/mine": {
			GET: withToken((token) => Response.json(api.listMyTasks(token))),
		},
		"/api/admin/tasks/:taskId": {
			GET: withToken((token, req) => Response.json(api.getTaskAsAdmin(token, parseId(req.params.taskId)))),
		},
		"/api/tasks/:taskId": {
			GET: withToken((token, req) => Response.json(api.getTask(token, parseId(req.params.taskId)))),
			PATCH: withToken(async (token, req) =>
				Response.json(api.updateTask(token, parseId(req.params.taskId), await readJson(req, TaskPatch))),
			),
			DELETE: withToken((token, req) => {
				api.deleteTask(token, parseId(req.params.taskId));
				return new Response(null, { status: 204 });
			}),
		},
		"/api/tasks/:taskId/mention": {
			GET: withToken((token, req) => Response.json(api.getTaskMention(token, parseId(req.params.taskId)))),
		},
		"/api/tasks/:taskId/repeat/dones/:eventId": {
			DELETE: withToken((token, req) =>
				Response.json(api.removeRepeatDone(token, parseId(req.params.taskId), parseId(req.params.eventId, "done id"))),
			),
		},
		"/api/tasks/:taskId/move": {
			POST: withToken(async (token, req) =>
				Response.json(api.moveTask(token, parseId(req.params.taskId), await readJson(req, TaskMove))),
			),
		},
		"/api/tasks/:taskId/read": {
			POST: withToken(async (token, req) => {
				const { upToEventId } = await readJson(req, MarkTaskRead);
				api.markTaskRead(token, parseId(req.params.taskId), upToEventId);
				return new Response(null, { status: 204 });
			}),
		},
	});
}
