import { Alert } from "@mantine/core";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Navigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { ApiError, api, forgetSession, queryClient } from "../api/index.ts";
import { NotFoundPage } from "./NotFoundPage.tsx";

/**
 * The error page of every route, set as the router's default. A 401 from a loader or a page means the session
 * ended: forget the user and their data, and go to login, back here after. A 404 means the record behind the URL is
 * gone, so it gets the not-found page.
 */
export function RouteError({ error }: ErrorComponentProps) {
	const location = useLocation();
	const expired = error instanceof ApiError && error.status === 401;
	useEffect(() => {
		if (expired) {
			queryClient.setQueryData(api.queries.currentUser().queryKey, null);
			forgetSession();
		}
	}, [expired]);
	if (expired) return <Navigate to="/login" search={{ redirect: location.href }} replace />;
	if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
	return (
		<Alert color="red" title="Something went wrong" m="xl">
			{error instanceof Error ? error.message : String(error)}
		</Alert>
	);
}
