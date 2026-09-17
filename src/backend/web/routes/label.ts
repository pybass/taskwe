import { LabelPatch, NewLabel } from "#shared/label.ts";
import type { Api } from "../../core/api.ts";
import { parseId, readJson, routes, withToken } from "../http.ts";

export function createLabelRoutes(api: Api) {
	return routes({
		"/api/spaces/:spaceId/labels": {
			POST: withToken(async (token, req) =>
				Response.json(api.createLabel(token, parseId(req.params.spaceId), await readJson(req, NewLabel)), { status: 201 }),
			),
		},
		"/api/labels": {
			GET: withToken((token) => Response.json(api.listLabels(token))),
		},
		// The static paths win over /api/labels/:labelId, so "global" never reaches parseId.
		"/api/labels/global": {
			POST: withToken(async (token, req) =>
				Response.json(api.createGlobalLabel(token, await readJson(req, NewLabel)), { status: 201 }),
			),
		},
		"/api/labels/:labelId": {
			PATCH: withToken(async (token, req) =>
				Response.json(api.updateLabel(token, parseId(req.params.labelId), await readJson(req, LabelPatch))),
			),
			DELETE: withToken((token, req) => {
				api.deleteLabel(token, parseId(req.params.labelId));
				return new Response(null, { status: 204 });
			}),
		},
	});
}
