import type { Server } from "bun";
import icon192 from "../../frontend/icon-192.png" with { type: "file" };
import icon512 from "../../frontend/icon-512.png" with { type: "file" };
import index from "../../frontend/index.html";
import sw from "../../frontend/sw.js" with { type: "file" };
import type { Api } from "../core/api.ts";
import { errorResponse } from "./http.ts";
import { createAuthRoutes } from "./routes/auth.ts";
import { createBackupRoutes } from "./routes/backup.ts";
import { createCommentRoutes } from "./routes/comment.ts";
import { createEventRoutes } from "./routes/event.ts";
import { createLabelRoutes } from "./routes/label.ts";
import { createNotificationRoutes } from "./routes/notification.ts";
import { createPushRoutes } from "./routes/push.ts";
import { createSearchRoutes } from "./routes/search.ts";
import { createSpaceRoutes } from "./routes/space.ts";
import { createTaskRoutes } from "./routes/task.ts";
import { createUserRoutes } from "./routes/user.ts";

/**
 * `hostname` is the address to listen on: loopback when the reverse proxy is on the same host, `0.0.0.0` in a
 * container. `secureCookie`: whether the site is served over HTTPS, so the session cookie gets `Secure`.
 */
export function createServer(api: Api, hostname: string, secureCookie: boolean): Server<undefined> {
	return Bun.serve({
		// PORT comes from the environment, read by Bun.serve itself.
		hostname,
		// Always a production bundle. The dev-mode module runtime gives null for a module inside an import cycle, and
		// @tanstack/router-core has one (router.js <-> load-client.js) that it reads at load time. `hmr: false` alone
		// keeps that runtime. The page reloads by hand after a frontend change.
		development: false,
		routes: {
			...createAuthRoutes(api, secureCookie),
			...createUserRoutes(api),
			...createSpaceRoutes(api),
			...createLabelRoutes(api),
			...createTaskRoutes(api),
			...createCommentRoutes(api),
			...createEventRoutes(api),
			...createSearchRoutes(api),
			...createNotificationRoutes(api),
			...createPushRoutes(api),
			...createBackupRoutes(api),
			// Keeps an unknown API path from falling through to the SPA with a 200.
			"/api/*": () => errorResponse(404, "Not found."),
			// The manifest names the icons by these paths; the HTML bundler cannot rewrite paths inside JSON, so they
			// are fixed routes, embedded in the binary. Inside the binary `Bun.file` is an in-memory blob, which a route
			// takes only wrapped in a Response.
			"/icon-192.png": new Response(Bun.file(icon192)),
			"/icon-512.png": new Response(Bun.file(icon512)),
			// Served as is, not bundled: a worker's scope is its URL's folder, so it must sit at the root under its own name.
			"/sw.js": new Response(Bun.file(sw)),
			// Every other path is the SPA; the client router decides what to show.
			"/*": index,
		},
	});
}
