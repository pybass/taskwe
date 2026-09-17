import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { Backup, SchemaDifferences } from "#shared/backup.ts";
import { ActivityEntry, TaskEvent } from "#shared/event.ts";
import { Label } from "#shared/label.ts";
import { UnreadCount } from "#shared/notification.ts";
import { PushConfig } from "#shared/push.ts";
import { SearchPage, type SearchQuery } from "#shared/search.ts";
import { Space } from "#shared/space.ts";
import { SpaceTaskCounts, Task, type TaskListQuery, TaskMention, TaskPage } from "#shared/task.ts";
import { User } from "#shared/user.ts";
import { ApiError, httpClient } from "./httpClient.ts";

// A query key follows the API path below /api where it can, so invalidating a prefix hits every query under it.

/** The logged-in user, or null. Never goes stale: login and logout write it directly, and AuthLayout refetches it once per open of the app. */
export function currentUser() {
	return queryOptions({
		queryKey: ["currentUser"],
		queryFn: async (): Promise<User | null> => {
			try {
				return User.parse(await httpClient.get("/api/me"));
			} catch (e) {
				if (e instanceof ApiError && e.status === 401) return null;
				throw e;
			}
		},
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
	});
}

export function listUsers() {
	return queryOptions({
		queryKey: ["users"],
		queryFn: async () => z.array(User).parse(await httpClient.get("/api/users")),
	});
}

/** The user's spaces. The only space query the app pages use: a single space is read from this list. */
export function listSpaces() {
	return queryOptions({
		queryKey: ["spaces"],
		queryFn: async () => z.array(Space).parse(await httpClient.get("/api/spaces")),
	});
}

/** Every space, for the admin pages; under the spaces key, so a space write invalidates both lists. */
export function listAllSpaces() {
	return queryOptions({
		queryKey: ["spaces", "all"],
		queryFn: async () => z.array(Space).parse(await httpClient.get("/api/admin/spaces")),
	});
}

/** One page of a space's tasks; each query is its own entry. */
export function listTasks(spaceId: number, query: TaskListQuery) {
	return queryOptions({
		queryKey: ["spaces", spaceId, "tasks", query],
		queryFn: async () => {
			const params = new URLSearchParams({ status: query.status, page: String(query.page), sort: query.sort });
			if (query.order !== undefined) params.set("order", query.order);
			if (query.authorId !== undefined) params.set("authorId", String(query.authorId));
			if (query.assigneeId !== undefined) params.set("assigneeId", String(query.assigneeId));
			for (const name of query.label) params.append("label", name);
			return TaskPage.parse(await httpClient.get(`/api/spaces/${spaceId}/tasks?${params}`));
		},
	});
}

/** Every label the user may see, the rows before shadowing; every page shows badges, so the auth loader caches it like the spaces. */
export function listLabels() {
	return queryOptions({
		queryKey: ["labels"],
		queryFn: async () => z.array(Label).parse(await httpClient.get("/api/labels")),
	});
}

/** Not under a space key: every task write invalidates it by name. */
export function listTaskCounts() {
	return queryOptions({
		queryKey: ["tasks", "counts"],
		queryFn: async () => z.array(SpaceTaskCounts).parse(await httpClient.get("/api/tasks/counts")),
	});
}

/** The counts over every space, for the admin pages; under the counts key, so a task write invalidates it too. */
export function listAllTaskCounts() {
	return queryOptions({
		queryKey: ["tasks", "counts", "all"],
		queryFn: async () => z.array(SpaceTaskCounts).parse(await httpClient.get("/api/admin/spaces/counts")),
	});
}

/** The home page's My tasks list; under the tasks key like the counts, so every task write invalidates it. */
export function listMyTasks() {
	return queryOptions({
		queryKey: ["tasks", "mine"],
		queryFn: async () => z.array(Task).parse(await httpClient.get("/api/tasks/mine")),
	});
}

/** Under the tasks key like the events, so every task write invalidates it, a move included. */
export function getTask(taskId: number) {
	return queryOptions({
		queryKey: ["tasks", taskId],
		queryFn: async () => Task.parse(await httpClient.get(`/api/tasks/${taskId}`)),
	});
}

/**
 * The task behind a mention, or null when the user may not read it, no task has the id, or it was deleted: one answer
 * for the three. Under the task's key, so a write to it, a move included, invalidates it.
 */
export function getTaskMention(taskId: number) {
	return queryOptions({
		queryKey: ["tasks", taskId, "mention"],
		queryFn: async (): Promise<TaskMention | null> => {
			try {
				return TaskMention.parse(await httpClient.get(`/api/tasks/${taskId}/mention`));
			} catch (e) {
				if (e instanceof ApiError && e.status === 404) return null;
				throw e;
			}
		},
	});
}

/** One page of search results; under the tasks key, so every task write invalidates it. */
export function searchTasks(query: SearchQuery) {
	return queryOptions({
		queryKey: ["tasks", "search", query],
		queryFn: async () => {
			const params = new URLSearchParams({ q: query.q, status: query.status, page: String(query.page) });
			if (query.spaceId !== undefined) params.set("spaceId", String(query.spaceId));
			return SearchPage.parse(await httpClient.get(`/api/search?${params}`));
		},
	});
}

/** The activity of the home page: the newest events over the user's spaces; under the tasks key, so every task write invalidates it. */
export function listActivity() {
	return queryOptions({
		queryKey: ["tasks", "activity"],
		queryFn: async () => z.array(ActivityEntry).parse(await httpClient.get("/api/activity")),
	});
}

/** The task's events, oldest first; under the tasks key, so every task write invalidates it. */
export function listTaskEvents(taskId: number) {
	return queryOptions({
		queryKey: ["tasks", taskId, "events"],
		queryFn: async () => z.array(TaskEvent).parse(await httpClient.get(`/api/tasks/${taskId}/events`)),
	});
}

/** The user's unread notifications, newest first, the activity's shape. Its own key: every task write invalidates it too, since an entry shows the task as it is now. */
export function listUnreadNotifications() {
	return queryOptions({
		queryKey: ["notifications"],
		queryFn: async () => z.array(ActivityEntry).parse(await httpClient.get("/api/notifications")),
	});
}

/** How many tasks have unread notifications; the count on the Notifications tab. */
export function countUnreadTasks() {
	return queryOptions({
		queryKey: ["notifications", "count"],
		queryFn: async () => UnreadCount.parse(await httpClient.get("/api/notifications/count")),
	});
}

/** The server's push key. It never changes, so it never goes stale. */
export function getPushConfig() {
	return queryOptions({
		queryKey: ["push", "config"],
		queryFn: async () => PushConfig.parse(await httpClient.get("/api/push/config")),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

/** The backup files, newest last event first; admin only. */
export function listBackups() {
	return queryOptions({
		queryKey: ["admin", "backups"],
		queryFn: async () => z.array(Backup).parse(await httpClient.get("/api/admin/backups")),
	});
}

/** How the live database differs from the build's schema, empty when it matches; admin only. */
export function checkSchema() {
	return queryOptions({
		queryKey: ["admin", "schema"],
		queryFn: async () => SchemaDifferences.parse(await httpClient.get("/api/admin/schema")),
	});
}
