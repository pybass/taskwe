import { SearchQuery } from "#shared/search.ts";
import type { Api } from "../../core/api.ts";
import { readQuery, routes, withToken } from "../http.ts";

export function createSearchRoutes(api: Api) {
	return routes({
		"/api/search": {
			GET: withToken((token, req) => Response.json(api.searchTasks(token, readQuery(req, SearchQuery)))),
		},
	});
}
