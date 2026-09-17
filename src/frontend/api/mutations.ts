import { type QueryClient, type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import { Backup, type BackupRename, type BackupUpload } from "#shared/backup.ts";
import { Comment, type CommentPatch } from "#shared/comment.ts";
import { Label, type LabelPatch, type NewLabel } from "#shared/label.ts";
import type { MarkTaskRead } from "#shared/notification.ts";
import type { PushDevice } from "#shared/push.ts";
import { type NewSpace, type OwnSpaceRole, Space, type SpaceMembers } from "#shared/space.ts";
import { type NewTask, Task, type TaskMove, type TaskPatch } from "#shared/task.ts";
import { type Credentials, type NewUser, type PasswordChange, type PasswordSet, User, type UserRename } from "#shared/user.ts";
import { subscribeToPush, unsubscribeFromPush } from "../utils/push.ts";
import { httpClient } from "./httpClient.ts";
import { forgetSession } from "./queryClient.ts";

// Query keys are written out here, not imported from queries.ts: the two modules stay independent.

/** After a task write: the given prefix, everything keyed by task, such as the counts the home page shows, and the notifications, whose entries show the task as it is now. */
function invalidateTaskQueries(queryClient: QueryClient, queryKey: QueryKey): Promise<unknown> {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey }),
		queryClient.invalidateQueries({ queryKey: ["tasks"] }),
		queryClient.invalidateQueries({ queryKey: ["notifications"] }),
	]);
}

export function useLogin() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (credentials: Credentials): Promise<User> => User.parse(await httpClient.post("/api/login", credentials)),
		onSuccess: (user) => {
			// Drop what a previous user left in the cache; nothing observes it on the login page. The login answer is the user.
			queryClient.removeQueries();
			queryClient.setQueryData(["currentUser"], user);
		},
	});
}

export function useLogout() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => httpClient.post("/api/logout"),
		// Set to null rather than removed: the auth layout still observes this query until the page navigates away. The
		// rest goes, and the persisted copy with it.
		onSuccess: () => {
			queryClient.setQueryData(["currentUser"], null);
			forgetSession();
		},
	});
}

/** Changes the current user's password; nothing cached changes, and this session stays. */
export function useChangePassword() {
	return useMutation({ mutationFn: (input: PasswordChange) => httpClient.put("/api/me/password", input) });
}

/** Renames a user; admin only. The personal space follows, and the admin may be renaming themselves. */
export function useRenameUser(userId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: UserRename): Promise<User> =>
			User.parse(await httpClient.put(`/api/users/${userId}/username`, input)),
		onSuccess: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: ["users"] }),
				queryClient.invalidateQueries({ queryKey: ["spaces"] }),
				queryClient.invalidateQueries({ queryKey: ["currentUser"] }),
			]),
	});
}

/** Sets another user's admin flag; admin only. */
export function useSetAdmin(userId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (admin: boolean): Promise<User> =>
			User.parse(await httpClient.put(`/api/users/${userId}/admin`, { admin })),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
	});
}

/** Sets any user's password; admin only. That user is logged out everywhere. */
export function useSetPassword(userId: number) {
	return useMutation({ mutationFn: (input: PasswordSet) => httpClient.put(`/api/users/${userId}/password`, input) });
}

export function useCreateUser() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: NewUser): Promise<User> => User.parse(await httpClient.post("/api/users", input)),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
	});
}

export function useCreateSpace() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: NewSpace): Promise<Space> => Space.parse(await httpClient.post("/api/spaces", input)),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["spaces"] }),
	});
}

/** Replaces the whole member list of the space. The labels the user may see follow their memberships. */
export function useSetSpaceMembers(spaceId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: SpaceMembers): Promise<Space> =>
			Space.parse(await httpClient.put(`/api/spaces/${spaceId}/members`, input)),
		onSuccess: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: ["spaces"] }),
				queryClient.invalidateQueries({ queryKey: ["labels"] }),
			]),
	});
}

/** Sets the user's own role in the space, null to leave; admin only. What the user sees of its tasks, labels, and notifications changes, so all of those go stale. */
export function useSetOwnSpaceRole(spaceId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: OwnSpaceRole): Promise<Space> =>
			Space.parse(await httpClient.put(`/api/admin/spaces/${spaceId}/me`, input)),
		onSuccess: () =>
			Promise.all([invalidateTaskQueries(queryClient, ["spaces"]), queryClient.invalidateQueries({ queryKey: ["labels"] })]),
	});
}

/** The space's tasks and labels go with it, so its task queries, the counts, and the labels go stale with the list. */
export function useDeleteSpace() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (spaceId: number) => httpClient.delete(`/api/spaces/${spaceId}`),
		onSuccess: () =>
			Promise.all([invalidateTaskQueries(queryClient, ["spaces"]), queryClient.invalidateQueries({ queryKey: ["labels"] })]),
	});
}

// A label is global or a space's, `spaceId` null or a number: the URL differs, the rest is the same. A write changes
// what the tasks show and a rename their names, so every label write invalidates the labels and the tasks.

export function useCreateLabel(spaceId: number | null) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: NewLabel): Promise<Label> =>
			Label.parse(await httpClient.post(spaceId === null ? "/api/labels/global" : `/api/spaces/${spaceId}/labels`, input)),
		onSuccess: () => invalidateTaskQueries(queryClient, ["labels"]),
	});
}

export function useUpdateLabel(labelId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (patch: LabelPatch): Promise<Label> => Label.parse(await httpClient.patch(`/api/labels/${labelId}`, patch)),
		onSuccess: () => invalidateTaskQueries(queryClient, ["labels"]),
	});
}

export function useDeleteLabel() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (labelId: number) => httpClient.delete(`/api/labels/${labelId}`),
		onSuccess: () => invalidateTaskQueries(queryClient, ["labels"]),
	});
}

export function useCreateTask(spaceId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: NewTask): Promise<Task> => Task.parse(await httpClient.post(`/api/spaces/${spaceId}/tasks`, input)),
		onSuccess: () => invalidateTaskQueries(queryClient, ["spaces", spaceId, "tasks"]),
	});
}

export function useUpdateTask(task: Task) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (patch: TaskPatch): Promise<Task> => Task.parse(await httpClient.patch(`/api/tasks/${task.id}`, patch)),
		onSuccess: () => invalidateTaskQueries(queryClient, ["spaces", task.spaceId, "tasks"]),
	});
}

/** Moves the task to the space of the body's slug. The task lists of both spaces changed, and the target is known only by slug, so every space query goes stale. */
export function useMoveTask(task: Task) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: TaskMove): Promise<Task> => Task.parse(await httpClient.post(`/api/tasks/${task.id}/move`, input)),
		onSuccess: () => invalidateTaskQueries(queryClient, ["spaces"]),
	});
}

/** Clears the user's unread notifications on the task up to the given event. Only the notifications go stale: no task changed. */
export function useMarkTaskRead(taskId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: MarkTaskRead) => httpClient.post(`/api/tasks/${taskId}/read`, input),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
	});
}

/** Clears every unread notification of the user. */
export function useMarkAllNotificationsRead() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => httpClient.post("/api/notifications/read-all"),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
	});
}

/** Binds the browser's push subscription to the session. Nothing cached changes. */
export function useSetPushSubscription() {
	return useMutation({
		mutationFn: (device: PushDevice) => httpClient.put("/api/push/subscription", device),
	});
}

/**
 * Turns push on or off for this device. On: asks the browser's permission, subscribes at its push service with the
 * server's key, and binds the subscription to the session. Off: takes it off the session first, then drops the
 * browser's, since a browser subscription left behind is sent again on the next load and a server row is not. A
 * refused permission rejects with the message to show; only the browser's settings undo it. Nothing cached changes.
 * Call only when `canPush()`.
 */
export function useSetPushEnabled(vapidPublicKey: string) {
	return useMutation({
		mutationFn: async (on: boolean): Promise<void> => {
			if (!on) {
				await httpClient.delete("/api/push/subscription");
				await unsubscribeFromPush();
				return;
			}
			// The first await after the tap must be this one, or iOS drops the user gesture and denies.
			const result = await Notification.requestPermission();
			if (result !== "granted") throw new Error("Notifications are blocked for this app in the browser's settings.");
			await httpClient.put("/api/push/subscription", await subscribeToPush(vapidPublicKey));
		},
	});
}

/** Removes one done of the task's repeat, by the id of the event that recorded it; the task's `updatedAt` moves. */
export function useRemoveRepeatDone(task: Task) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (eventId: number): Promise<Task> =>
			Task.parse(await httpClient.delete(`/api/tasks/${task.id}/repeat/dones/${eventId}`)),
		onSuccess: () => invalidateTaskQueries(queryClient, ["spaces", task.spaceId, "tasks"]),
	});
}

/** Replaces the comment's text; the task's `updatedAt` moves, so its queries go stale like on a task write. */
export function useUpdateComment(task: Task, commentId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (patch: CommentPatch): Promise<Comment> =>
			Comment.parse(await httpClient.patch(`/api/comments/${commentId}`, patch)),
		onSuccess: () => invalidateTaskQueries(queryClient, ["spaces", task.spaceId, "tasks"]),
	});
}

export function useDeleteTask(task: Task) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => httpClient.delete(`/api/tasks/${task.id}`),
		onSuccess: () => invalidateTaskQueries(queryClient, ["spaces", task.spaceId, "tasks"]),
	});
}

/**
 * Fetches a task by number for the admin's delete page, member of its space or not. A mutation, not a query: the
 * task is looked up once on demand and never watched, so nothing refetches a task that was just deleted.
 */
export function useFindTaskAsAdmin() {
	return useMutation({
		mutationFn: async (taskId: number): Promise<Task> => Task.parse(await httpClient.get(`/api/admin/tasks/${taskId}`)),
	});
}

/** Makes a backup file of the whole database; admin only. */
export function useCreateBackup() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (): Promise<Backup> => Backup.parse(await httpClient.post("/api/admin/backups")),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "backups"] }),
	});
}

/** Renames the backup `name`; admin only. */
export function useRenameBackup(name: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: BackupRename): Promise<Backup> =>
			Backup.parse(await httpClient.patch(`/api/admin/backups/${name}`, input)),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "backups"] }),
	});
}

/** Adds an uploaded file to the list under `name`; admin only. The file must be a taskwe database and the name free. */
export function useUploadBackup() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: BackupUpload & { file: File }): Promise<Backup> => {
			const body = new FormData();
			body.append("file", input.file);
			body.append("name", input.name);
			return Backup.parse(await httpClient.post("/api/admin/backups/upload", body));
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "backups"] }),
	});
}

/** Removes the backup `name`; admin only. */
export function useDeleteBackup() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (name: string) => httpClient.delete(`/api/admin/backups/${name}`),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "backups"] }),
	});
}

/**
 * Replaces the database with the backup `name` of the list; admin only. The answer is the backup made before. Every
 * session ends with it, so the user is set to null as after a logout, and the caller goes to the login page; the next
 * login's loaders refetch the rest.
 */
export function useRestoreBackup() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (name: string): Promise<Backup> =>
			Backup.parse(await httpClient.post(`/api/admin/backups/${name}/restore`)),
		onSuccess: () => queryClient.setQueryData(["currentUser"], null),
	});
}
