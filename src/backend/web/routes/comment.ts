import { CommentPatch } from "#shared/comment.ts";
import type { Api } from "../../core/api.ts";
import { parseId, readJson, routes, withToken } from "../http.ts";

export function createCommentRoutes(api: Api) {
	return routes({
		"/api/comments/:commentId": {
			PATCH: withToken(async (token, req) =>
				Response.json(api.updateComment(token, parseId(req.params.commentId), await readJson(req, CommentPatch))),
			),
		},
	});
}
