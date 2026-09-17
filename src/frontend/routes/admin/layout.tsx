import { createFileRoute, redirect } from "@tanstack/react-router";

/** Parent of the admin pages, all under /admin; anyone else lands on the home page. /admin itself is not a page. */
export const Route = createFileRoute("/_auth/_admin")({
	beforeLoad: ({ context }) => {
		if (!context.currentUser.admin) throw redirect({ to: "/" });
	},
});
