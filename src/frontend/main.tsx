import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./app.css";
import { Center, createTheme, Loader, MantineProvider, rem } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { cacheRestored, load, queryClient } from "./api/index.ts";
import { RouteError } from "./components/RouteError.tsx";
import { routeTree } from "./routeTree.gen.ts";

/** What sw.js posts to a page: the task a push was about, and `open` when the user tapped its notification. */
const WorkerMessage = z.object({ taskId: z.int(), open: z.boolean().default(false) });

const router = createRouter({
	routeTree,
	context: { queryClient, load },
	// Links preload on hover. TanStack Query decides what is fresh, so the router's own preload cache is off.
	defaultPreload: "intent",
	defaultPreloadStaleTime: 0,
	// Every route, not only the auth layout: a route's error is caught by its own boundary or the router's default,
	// never by a parent's, so without these a page's 401 or 404 would show the router's built-in error box.
	defaultErrorComponent: RouteError,
	// A page's loader on a slow connection; the auth layout has its own full-height one for the first load.
	defaultPendingComponent: () => (
		<Center py="xl">
			<Loader />
		</Center>
	),
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

// Golos Text: one family for everything, chosen for its Cyrillic, since most tasks are written in Russian. The sizes
// are Mantine's defaults plus 2px on every step, for reading comfort; headings move with them so h4 stays above body
// text. Pine green is the brand ink, on links, the current tab, and the logo; the greys carry a hint of it so the
// dimmed text and rules sit in the same key. `white` is the lightest grey, not #fff: it is the page, the forms, the
// inputs, and the dropdowns, all one off-white surface with no bright card on it, and the text on filled buttons.
const theme = createTheme({
	fontFamily: '"Golos Text", "Segoe UI", Roboto, sans-serif',
	fontSizes: { xs: rem(14), sm: rem(16), md: rem(18), lg: rem(20), xl: rem(22) },
	headings: {
		fontWeight: "600",
		sizes: {
			h1: { fontSize: rem(36) },
			h2: { fontSize: rem(28) },
			h3: { fontSize: rem(24) },
			h4: { fontSize: rem(20) },
			h5: { fontSize: rem(18) },
			h6: { fontSize: rem(16) },
		},
	},
	primaryColor: "pine",
	primaryShade: 7,
	black: "#1B1F1C",
	white: "#F5F6F3",
	colors: {
		pine: ["#EEF5F0", "#D9EADF", "#B6D6C3", "#8FBFA3", "#6AA687", "#4B8B6B", "#3A7A5B", "#2E6B4E", "#235640", "#184232"],
		gray: ["#F5F6F3", "#EDEFEA", "#E3E6E1", "#DFE3DD", "#B4BAB6", "#8F9793", "#6B7370", "#525A56", "#3A403D", "#1B1F1C"],
	},
});

// In-app browsers and Safari private mode have no service worker; the app works there without one.
if ("serviceWorker" in navigator) {
	navigator.serviceWorker.register("/sw.js");
	// A message from the worker means a push arrived: someone wrote a task, so the same queries go stale as after an
	// own write, see `invalidateTaskQueries` in mutations.ts. A tapped notification also says which task to open.
	navigator.serviceWorker.onmessage = ({ data }) => {
		for (const queryKey of [["spaces"], ["tasks"], ["notifications"]]) queryClient.invalidateQueries({ queryKey });
		const message = WorkerMessage.safeParse(data);
		if (message.success && message.data.open) router.navigate({ to: "/t/$taskId", params: { taskId: message.data.taskId } });
	};
}

const root = document.getElementById("root");
if (root === null) throw new Error("#root element not found");
// The loaders run on the first render, and must find what the last open left in the cache.
await cacheRestored;
createRoot(root).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<MantineProvider theme={theme}>
				<ModalsProvider>
					<Notifications />
					<RouterProvider router={router} />
				</ModalsProvider>
			</MantineProvider>
		</QueryClientProvider>
	</StrictMode>,
);
