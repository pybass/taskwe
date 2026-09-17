import { index, layout, rootRoute, route } from "@tanstack/virtual-file-routes";

// The route tree. `tsr generate` turns it and the files it names into ../routeTree.gen.ts; a file it does not name
// is not a route, so -shared/ and -local/ folders can sit next to the pages.
export const routes = rootRoute("root.layout.tsx", [
	route("/login", "login.page.tsx"),
	layout("auth", "auth/layout.tsx", [
		index("home/index.page.tsx"),
		route("/s/$slug", [
			index("s/_slug_/index.page.tsx"),
			route("/labels", "s/_slug_/labels/index.page.tsx"),
			route("/members", "s/_slug_/members.page.tsx"),
		]),
		route("/t/new", "t/new/index.page.tsx"),
		route("/t/$taskId", "t/_taskId_/index.page.tsx"),
		route("/search", "search/index.page.tsx"),
		route("/password", "password.page.tsx"),
		// Not /s/new: a space may take that slug.
		route("/spaces/new", "spaces/new.page.tsx"),
		layout("admin", "admin/layout.tsx", [
			route("/admin/labels", "admin/labels/index.page.tsx"),
			route("/admin/users", "admin/users/index.page.tsx"),
			route("/admin/spaces", "admin/spaces/index.page.tsx"),
			route("/admin/tasks/delete", "admin/tasks/delete.page.tsx"),
			route("/admin/backups", "admin/backups/index.page.tsx"),
		]),
	]),
]);
