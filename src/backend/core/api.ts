// Reference file: the contract of every operation, for a web route, a CLI, or a script that acts for a user.

import type { Backup, SchemaDifferences } from "#shared/backup.ts";
import type { Comment, CommentPatch } from "#shared/comment.ts";
import type { ActivityEntry, TaskEvent } from "#shared/event.ts";
import type { Label, LabelPatch, NewLabel } from "#shared/label.ts";
import type { UnreadCount } from "#shared/notification.ts";
import type { PushConfig, PushDevice } from "#shared/push.ts";
import type { SearchPage, SearchQuery } from "#shared/search.ts";
import { hasSpaceRole, type NewSpace, type Space, type SpaceMember, type SpaceRole } from "#shared/space.ts";
import type { NewTask, SpaceTaskCounts, Task, TaskListQuery, TaskMention, TaskMove, TaskPage, TaskPatch } from "#shared/task.ts";
import type { NewUser, PasswordChange, User } from "#shared/user.ts";
import type { Core } from "./core.ts";
import { schemaDifferences } from "./db/structure.ts";
import { ForbiddenError, InvalidOperationError, NotFoundError, UnauthorizedError } from "./errors.ts";

/**
 * The checked door into Core. Every method but `login` and `logout` takes the session token that `login`
 * returned, resolves the user behind it, checks who may act, and delegates to a service. Core trusts its caller; Api
 * trusts nobody. The access rules are stated on each method and checked by the private methods at the end; they live
 * here and nowhere else.
 *
 * - Roles rank viewer < editor < manager: a role may do all a lower one may. On a method, "a member" is any role and
 *   "an editor" an editor or a manager. The admin flag gives no role in a space: an admin reads and writes only the
 *   spaces they are a member of, and the methods marked "admin only" are the whole of what the flag adds. A personal
 *   space is one with an `ownerId`, its user's; every other space is shared.
 * - Errors, all from errors.ts: UnauthorizedError when no live session is behind the token; ForbiddenError when the
 *   user may not act; NotFoundError for an id or a slug that names nothing; InvalidOperationError when the
 *   operation would break a rule of the model, listed per method. The record an access rule is checked on is looked up
 *   first, so an unknown id is a NotFoundError even for a stranger. web/http.ts maps the four to 401, 403, 404, and 400.
 * - A body arrives parsed by its schema in src/shared, which owns the format, length, and default rules; Api does not
 *   check them again.
 * - A write is one transaction: an error leaves nothing behind. Every write to a task, its labels, or its comments
 *   moves the task's `updatedAt` to the write's time, unless a method says otherwise, and records one event with the
 *   user as actor (`TaskChanges` in event.ts says what each write records), and an unread notification for each
 *   user the body's `notifyUserIds` names, then sends each of them a push per subscribed device, push.ts, without
 *   waiting for it. Every method is synchronous and returns the record as it is after the write.
 */
export class Api {
	constructor(private readonly core: Core) {}

	// --- Session ---

	/**
	 * Start a session. Anyone may call. Returns the user and the token to pass to every other method, or null when the
	 * username or the password is wrong, the same answer for both. The session lasts 30 days from its last use: every
	 * method that takes the token moves its expiry forward. Deletes the expired sessions of every user on the way.
	 */
	login(username: string, password: string): { user: User; token: string } | null {
		return this.core.services.session.login(username, password);
	}

	/** End the session behind the token. An unknown or expired token is a no-op: never throws. */
	logout(token: string): void {
		this.core.services.session.logout(token);
	}

	/** The user behind the token. The cheapest way to learn whether a session is still live: UnauthorizedError when not. */
	getCurrentUser(token: string): User {
		return this.ensureAuthenticated(token);
	}

	// --- Users ---

	/** Every user, sorted by username. Any user may call: member lists and assignee pickers need a username for each user id. */
	listUsers(token: string): User[] {
		this.ensureAuthenticated(token);
		return this.core.services.user.listUsers();
	}

	/**
	 * Create a user with its personal space, in one transaction. Admin only. The password is stored as a hash and never
	 * returned. A taken username is an InvalidOperationError: the personal space takes the username as its slug and its
	 * name, so the slug or the name of a shared space counts as taken too.
	 */
	createUser(token: string, input: NewUser): User {
		this.ensureAdmin(token);
		return this.core.services.user.createUser(input);
	}

	/**
	 * Rename user `userId` to `username`; the personal space follows, see `UserRename`. Admin only, self included. An
	 * unknown id is a NotFoundError; a taken username, the current one included, an InvalidOperationError.
	 */
	renameUser(token: string, userId: number, username: string): User {
		this.ensureAdmin(token);
		return this.core.services.user.renameUser(userId, username);
	}

	/**
	 * Set the admin flag of user `userId`. Admin only. An unknown id is a NotFoundError. An admin cannot clear their
	 * own flag: InvalidOperationError. So every clear is done by another admin, who stays one, and the app always keeps
	 * at least one admin.
	 */
	setAdmin(token: string, userId: number, admin: boolean): User {
		const user = this.ensureAdmin(token);
		if (userId === user.id && !admin) throw new InvalidOperationError("You cannot clear your own admin flag");
		return this.core.services.user.setAdmin(userId, admin);
	}

	/**
	 * Change the password of the user behind the token. Any user may call. `input.currentPassword` must be the password
	 * in force; else InvalidOperationError, and nothing changes. Every other session of the user ends; the session behind
	 * `token` stays, so the user stays logged in. An admin who forgot theirs is reset by another admin with `setPassword`.
	 */
	changePassword(token: string, input: PasswordChange): void {
		const user = this.ensureAuthenticated(token);
		if (!this.core.services.user.checkPassword(user.id, input.currentPassword)) {
			throw new InvalidOperationError("The current password is wrong");
		}
		this.core.services.user.setPassword(user.id, input.password, token);
	}

	/**
	 * Set the password of user `userId` without knowing the old one. Admin only. An unknown id is a NotFoundError. Every
	 * session of that user ends, so they are logged out everywhere; an admin who sets their own keeps the session behind
	 * `token`.
	 */
	setPassword(token: string, userId: number, password: string): void {
		this.ensureAdmin(token);
		this.core.services.user.setPassword(userId, password, token);
	}

	// --- Spaces ---

	/** The spaces the user is a member of, any role, sorted by name. */
	listSpaces(token: string): Space[] {
		return this.core.services.space.listReadableSpaces(this.ensureAuthenticated(token));
	}

	/** Every space, sorted by name, for the admin pages. Admin only. */
	listAllSpaces(token: string): Space[] {
		this.ensureAdmin(token);
		return this.core.services.space.listSpaces();
	}

	/**
	 * Set the caller's own role in shared space `spaceId`, joining it when not a member; null leaves it. The one way
	 * into a space nobody invited the caller to. Returns the space with its members. Admin only. A personal space, or
	 * leaving or stepping down as the only manager, is an InvalidOperationError.
	 */
	setOwnSpaceRole(token: string, spaceId: number, role: SpaceRole | null): Space {
		const user = this.ensureAdmin(token);
		return this.core.services.space.setMemberRole(spaceId, user.id, role);
	}

	/**
	 * Create a shared space. Any user may call and becomes its manager, whether listed in `input.members` or not and
	 * whatever role the list gives them; the other listed users get the roles listed. Returns the space with its
	 * members. InvalidOperationError for a taken slug or name (a username is both, as the slug and the name of its
	 * personal space), a user listed twice, or an unknown user id.
	 */
	createSpace(token: string, input: NewSpace): Space {
		return this.core.services.space.createSpace(this.ensureAuthenticated(token).id, input);
	}

	/**
	 * Replace the whole member list of space `spaceId`: a member leaves by being left out, and a manager may leave as long as
	 * another manager stays. A manager of the space. Returns the space with its new list. InvalidOperationError for a
	 * personal space, a list without a manager, a user listed twice, or an unknown user id. A user left out stays the
	 * assignee of their tasks there, see `Task.assigneeId`.
	 */
	setSpaceMembers(token: string, spaceId: number, members: SpaceMember[]): Space {
		this.ensureSpaceAccess(token, spaceId, "manager");
		return this.core.services.space.setSpaceMembers(spaceId, members);
	}

	/**
	 * Delete a shared space with its members, labels, tasks, and comments. Admin only. A personal space is an
	 * InvalidOperationError: it lives as long as its user, and the app never deletes a user.
	 */
	deleteSpace(token: string, spaceId: number): void {
		this.ensureAdmin(token);
		this.core.services.space.deleteSpace(spaceId);
	}

	// --- Labels ---
	// A label is global, `spaceId` null, or a space's. A name is unique within its list: `createLabel`, `createGlobalLabel`,
	// and a rename reject a name the list has. A space label with a global name shadows it in the space, see label.ts.
	// The global list is an admin's, a space's list its managers'; "the label's list" below means whichever holds it.
	// A task carries its labels as names and keeps them through a move and a delete; the list of its space gives them a
	// color and a place, and a name the list does not have shows in grey. A rename follows on the tasks, no `updatedAt`.

	/**
	 * Every label the user may see, the rows as they are: the global ones, then those of every space the user may read,
	 * space by space, each list by position, then name. Any user may call. A page keeps the
	 * list and takes a space's with `resolveSpaceLabels`: the ones a task there may carry, the shadowed globals left out.
	 */
	listLabels(token: string): Label[] {
		const user = this.ensureAuthenticated(token);
		return this.core.services.label.listLabels(this.core.services.space.listReadableSpaces(user).map((space) => space.id));
	}

	/**
	 * Add a label to space `spaceId`. A manager of the space. A name the space has is an InvalidOperationError; a global
	 * name is shadowed from now on. Every task of the space that carries the name shows this one from now on, a name in
	 * grey included. Without a position it goes last, after the global ones the space sees.
	 */
	createLabel(token: string, spaceId: number, input: NewLabel): Label {
		this.ensureSpaceAccess(token, spaceId, "manager");
		return this.core.services.label.createLabel(spaceId, input);
	}

	/** Add a global label. Admin only. A name the global list has is an InvalidOperationError. Without a position it goes last. */
	createGlobalLabel(token: string, input: NewLabel): Label {
		this.ensureAdmin(token);
		return this.core.services.label.createLabel(null, input);
	}

	/**
	 * Change the given fields of label `labelId`; the rest stay. A manager of the label's space; an admin for a global
	 * one. A name another label of the list has is an InvalidOperationError. A rename renames the label on every task
	 * that carries it, of the space, or, for a global one, of every space that has no label of the old name, in the
	 * same write; their `updatedAt` does not move and no event is written.
	 */
	updateLabel(token: string, labelId: number, patch: LabelPatch): Label {
		this.ensureLabelAccess(token, labelId);
		return this.core.services.label.updateLabel(labelId, patch);
	}

	/**
	 * Delete label `labelId` from its list. A manager of the label's space; an admin for a global one. The tasks keep
	 * the name, in grey from now on, untouched: no `updatedAt` change, no event; a label of that name created later
	 * takes them back.
	 */
	deleteLabel(token: string, labelId: number): void {
		this.ensureLabelAccess(token, labelId);
		this.core.services.label.deleteLabel(labelId);
	}

	// --- Tasks ---

	/**
	 * One page of the tasks of space `spaceId` that match `query`, in its order, with how many open and closed tasks its
	 * filters match. A member of the space. `query.status` picks the open or the closed tasks; `query.authorId`,
	 * `query.assigneeId`, and `query.label` narrow them, a task must carry every label name given; `query.sort` and
	 * `query.order` sort them; `query.page` counts from 1, TASK_PAGE_SIZE tasks each; a page
	 * past the end is empty.
	 */
	listTasks(token: string, spaceId: number, query: TaskListQuery): TaskPage {
		this.ensureSpaceAccess(token, spaceId, "viewer");
		return this.core.services.task.listTasks(spaceId, query);
	}

	/**
	 * Every open task of the user over every space the user may read, due soonest first, then the undated by last
	 * update, newest first; the home page's My tasks tab, which re-sorts them around the browser's day, so there is
	 * no paging. Any user may call.
	 */
	listMyTasks(token: string): Task[] {
		const user = this.ensureAuthenticated(token);
		return this.core.services.task.listMyTasks(this.core.services.space.listReadableSpaces(user), user.id);
	}

	/**
	 * For every space the user may read, in the order of `listSpaces`: its open tasks, and `mine`, how many of them are
	 * assigned to the user. Any user may call. In the user's personal space the two counts are equal.
	 */
	countOpenTasks(token: string): SpaceTaskCounts[] {
		const user = this.ensureAuthenticated(token);
		return this.core.services.task.countOpenTasks(this.core.services.space.listReadableSpaces(user), user.id);
	}

	/** The same counts over every space, in the order of `listAllSpaces`, for the admin pages. Admin only. */
	countOpenTasksInAllSpaces(token: string): SpaceTaskCounts[] {
		const user = this.ensureAdmin(token);
		return this.core.services.task.countOpenTasks(this.core.services.space.listSpaces(), user.id);
	}

	/**
	 * The task shown at /t/{id}. A member of its space, whichever space it is in now. An id no task has, or a deleted
	 * task's, is a NotFoundError: an id is never given twice.
	 */
	getTask(token: string, taskId: number): Task {
		this.ensureTaskAccess(token, taskId, "viewer");
		return this.core.services.task.getTask(taskId);
	}

	/**
	 * The task behind a mention, `#42` or a `/t/42` URL in a body or a comment: its title and whether it is closed, for
	 * the link a page renders. Any user may call. A task in a space the user is not a member of, an id no task has, and
	 * a deleted task are one NotFoundError: a deleted task takes its events with it, so nothing tells the three apart,
	 * and one answer tells a stranger nothing. The one read where a stranger gets no ForbiddenError.
	 */
	getTaskMention(token: string, taskId: number): TaskMention {
		const user = this.ensureAuthenticated(token);
		const task = this.core.services.task.getTask(taskId);
		if (!hasSpaceRole(user, this.core.services.space.getSpace(task.spaceId), "viewer")) {
			throw new NotFoundError(`No task ${taskId}`);
		}
		return { id: task.id, title: task.title, closedAt: task.closedAt };
	}

	/** Any task by number, member of its space or not, for the admin's delete page. Admin only. NotFoundError as `getTask`. */
	getTaskAsAdmin(token: string, taskId: number): Task {
		this.ensureAdmin(token);
		return this.core.services.task.getTask(taskId);
	}

	/**
	 * Create a task in space `spaceId` with the next id; the user is its author. An editor of the space.
	 * The fields left out take the defaults of `NewTask` (task.ts). InvalidOperationError for an assignee who is not a
	 * member of the space, a label name the space's list does not have, or, in a personal space, an
	 * assignee other than its owner: there the owner is required, null included. `notifyUserIds` names who gets an
	 * unread notification of this write: members of the space, never the user, else InvalidOperationError; the server
	 * adds nobody.
	 */
	createTask(token: string, spaceId: number, input: NewTask): Task {
		return this.core.services.task.createTask(this.ensureSpaceAccess(token, spaceId, "editor").id, spaceId, input);
	}

	/**
	 * The one write of task `taskId`: apply `patch` in one transaction, at one time, as the user. An editor of the task's
	 * space, on an open or a closed task. The fields given change, the rest stay: `labels` adds and removes names on the
	 * set the task carries at the write, see `TaskPatch`; `dueDate: null` and `assigneeId: null` clear them; a new
	 * `repeatDays` keeps the dones and null drops them. A new assignee follows the rules of `createTask`. `closed: true`
	 * sets `closedAt` to the write's time and keeps every other field, the due date and the repeat included;
	 * `closed: false` clears it; a task already so is an InvalidOperationError. `recordRepeatDone` puts a done by the
	 * user, at the write's time, first in `repeatDones`, keyed by the event of this write, and takes `dueDate` as the
	 * next due day; a closed task or one that does not repeat is an InvalidOperationError. `comment` adds a comment by
	 * the user at the write's time, after the changes. A patch that changes nothing and adds no comment is an
	 * InvalidOperationError, whatever `notifyUserIds` holds; `updatedAt` moves on every write. `notifyUserIds` follows
	 * the rule of `createTask`.
	 */
	updateTask(token: string, taskId: number, patch: TaskPatch): Task {
		const user = this.ensureTaskAccess(token, taskId, "editor");
		return this.core.services.task.updateTask(user.id, taskId, patch);
	}

	/**
	 * Remove the done `eventId`, the id of the event that recorded it, from task `taskId`, a mistaken press. An editor
	 * of the task's space, not only the doer. The due date stays where it is. A closed task is an
	 * InvalidOperationError; an unknown done, or a task that does not repeat, a NotFoundError.
	 */
	removeRepeatDone(token: string, taskId: number, eventId: number): Task {
		const user = this.ensureTaskAccess(token, taskId, "editor");
		return this.core.services.task.removeRepeatDone(user.id, taskId, eventId);
	}

	/**
	 * Move task `taskId` to the space with slug `targetSlug`. The task keeps its id, so its URL and its mentions keep
	 * working; its comments and events, the whole history, go with it and become readable by the target's members. A
	 * manager of the task's space, the owner in a personal one, and an editor of the target, else ForbiddenError; a
	 * personal target must be the user's own, an admin included: nobody moves a task into another user's personal
	 * space. An unknown slug is a NotFoundError; the task's own space an InvalidOperationError. The assignee stays when
	 * a member of the target, else is cleared; a personal target assigns the task to its owner. The labels go with the
	 * task as they are: a name the target's list has shows with the target's color, any other in grey.
	 * `notifyUserIds` follows the rule of `createTask`, against the target's members.
	 */
	moveTask(token: string, taskId: number, input: TaskMove): Task {
		const user = this.ensureTaskAccess(token, taskId, "manager");
		const target = this.core.services.space.findSpaceBySlug(input.targetSlug);
		if (target === null) throw new NotFoundError(`No space "${input.targetSlug}"`);
		if (!hasSpaceRole(user, target, "editor")) throw new ForbiddenError("A task moves only to a space you edit");
		if (target.ownerId !== null && target.ownerId !== user.id) {
			throw new ForbiddenError("A task moves into a personal space only by its owner");
		}
		return this.core.services.task.moveTask(user.id, taskId, target.id, input.notifyUserIds);
	}

	/** Delete task `taskId` with its comments and events. Admin only. An unknown id is a NotFoundError. The id is never reused. */
	deleteTask(token: string, taskId: number): void {
		this.ensureAdmin(token);
		this.core.services.task.deleteTask(taskId);
	}

	/**
	 * One page of the tasks that match `query`, `SearchQuery` in search.ts, over every space the user may read, or over
	 * space `query.spaceId` alone, for a member of it, else ForbiddenError; an unknown id is a NotFoundError. Any user
	 * may call. Searches the current title, body, and comments, never the history in the events. A page past the end
	 * is empty.
	 */
	searchTasks(token: string, query: SearchQuery): SearchPage {
		if (query.spaceId !== undefined) {
			this.ensureSpaceAccess(token, query.spaceId, "viewer");
			return this.core.services.search.searchTasks([this.core.services.space.getSpace(query.spaceId)], query);
		}
		const user = this.ensureAuthenticated(token);
		return this.core.services.search.searchTasks(this.core.services.space.listReadableSpaces(user), query);
	}

	// --- Events ---

	/**
	 * The events of task `taskId`, `TaskEvent` in event.ts, oldest first, no paging. A member of the task's space. The
	 * comments are read through them: no operation returns a comment row but `updateComment`.
	 */
	listTaskEvents(token: string, taskId: number): TaskEvent[] {
		this.ensureTaskAccess(token, taskId, "viewer");
		return this.core.services.event.listTaskEvents(taskId);
	}

	/**
	 * The activity of the home page: the newest 300 events over the tasks of every space the user may read, each with its
	 * task as it is now, `ActivityEntry` in event.ts, newest first. Any user may call.
	 */
	listActivity(token: string): ActivityEntry[] {
		const user = this.ensureAuthenticated(token);
		return this.core.services.event.listActivity(this.core.services.space.listReadableSpaces(user));
	}

	// --- Notifications ---

	/**
	 * The user's unread notifications: the events others chose to tell them about, `notifyUserIds` on `createTask`,
	 * `updateTask`, and `moveTask`, each with its task as it is now, `ActivityEntry` in event.ts, newest first, no
	 * paging. Only over the spaces the user may read now: a task moved out of reach hides its rows until access
	 * returns. Any user may call.
	 */
	listUnreadNotifications(token: string): ActivityEntry[] {
		const user = this.ensureAuthenticated(token);
		return this.core.services.notification.listUnreadNotifications(user.id, this.core.services.space.listReadableSpaces(user));
	}

	/** How many tasks `listUnreadNotifications` would show, `UnreadCount` in notification.ts. Any user may call. */
	countUnreadTasks(token: string): UnreadCount {
		const user = this.ensureAuthenticated(token);
		return {
			tasks: this.core.services.notification.countUnreadTasks(user.id, this.core.services.space.listReadableSpaces(user)),
		};
	}

	/**
	 * Delete the user's unread notifications on task `taskId` up to and including event `upToEventId`; a newer event
	 * stays unread. Any user may call, on their own rows only: no role is checked, and a task or an event the user
	 * cannot see is a no-op, never an error.
	 */
	markTaskRead(token: string, taskId: number, upToEventId: number): void {
		const user = this.ensureAuthenticated(token);
		this.core.services.notification.markTaskRead(user.id, taskId, upToEventId);
	}

	/** Delete every unread notification of the user, the hidden ones included. Any user may call. */
	markAllNotificationsRead(token: string): void {
		const user = this.ensureAuthenticated(token);
		this.core.services.notification.markAllNotificationsRead(user.id);
	}

	// --- Comments ---

	/**
	 * Replace the text of comment `commentId`; a comment is added through `updateTask`, never deleted. Its author only,
	 * while still an editor of the task's space: a manager or an admin who is not the author gets a ForbiddenError, and
	 * so does an author who is now a viewer. Allowed on a closed task. An unknown id is a NotFoundError; the same text
	 * as now an InvalidOperationError, as a write that changes nothing. The task's `updatedAt` moves.
	 */
	updateComment(token: string, commentId: number, patch: CommentPatch): Comment {
		const user = this.ensureCommentAuthor(token, commentId);
		return this.core.services.comment.updateComment(user.id, commentId, patch);
	}

	// --- Backup ---

	/**
	 * A backup of the whole database: `VACUUM INTO` a new file in `backups/` under the data path, named by the current
	 * UTC second, `Backup` in backup.ts. Admin only. Consistent while the server runs: a write waits for the copy.
	 * Nothing in the database changes. InvalidOperationError on an in-memory database. InvalidOperationError too for a second
	 * backup within the same second: the name is taken. `restoreBackup` puts a backup back.
	 */
	createBackup(token: string): Backup {
		this.ensureAdmin(token);
		return this.core.services.backup.createBackup();
	}

	/**
	 * Save `content` as the backup file `name`, a `BackupName` in backup.ts, and list it as any other. Admin only. The
	 * file is read first, `BackupInfo` in backup.ts: one that gives no info is refused and not kept. InvalidOperationError for a refused file, a name that is taken, or an in-memory database.
	 */
	uploadBackup(token: string, name: string, content: Uint8Array): Backup {
		this.ensureAdmin(token);
		return this.core.services.backup.uploadBackup(name, content);
	}

	/**
	 * Every backup file, newest last event first, each with its `info` read from the file on this call. Admin only. A
	 * file of any schema version is listed; one that is not a database is listed last, with `info: null`.
	 */
	listBackups(token: string): Backup[] {
		this.ensureAdmin(token);
		return this.core.services.backup.listBackups();
	}

	/**
	 * The path of the backup file `name`, for a client that sends the file. Admin only. Only a name from `listBackups`
	 * resolves: any other, a path included, is a NotFoundError. InvalidOperationError on an in-memory database.
	 */
	getBackupPath(token: string, name: string): string {
		this.ensureAdmin(token);
		return this.core.services.backup.getBackupPath(name);
	}

	/**
	 * Rename the backup file `name` from `listBackups` to `newName`, a `BackupName` in backup.ts. Admin only. The old
	 * name stops resolving. The answer is the renamed backup.
	 * NotFoundError for a name not in the list. InvalidOperationError when a file named `newName` exists, or on an
	 * in-memory database.
	 */
	renameBackup(token: string, name: string, newName: string): Backup {
		this.ensureAdmin(token);
		return this.core.services.backup.renameBackup(name, newName);
	}

	/**
	 * Replace the database with the backup file `name` from `listBackups`, in this order: the file is checked, a backup
	 * of the current database is made as by `createBackup`, and the file is copied over `taskwe.db` and reopened. Admin
	 * only. The answer is the backup made before the swap. The sessions are the file's: every current session ends, this
	 * one included, and the users log in again with the passwords of the file. NotFoundError for a name not in the
	 * list. InvalidOperationError for a file that is not a SQLite database, fails its integrity check, or has a schema
	 * version other than this build's; nothing is changed then, and no backup is made.
	 */
	restoreBackup(token: string, name: string): Backup {
		this.ensureAdmin(token);
		return this.core.services.backup.restoreBackup(name);
	}

	/** Remove the backup file `name` from `listBackups`. Admin only. NotFoundError for a name not in the list. */
	deleteBackup(token: string, name: string): void {
		this.ensureAdmin(token);
		this.core.services.backup.deleteBackup(name);
	}

	/**
	 * How the live database differs from the schema this build makes, `SchemaDifferences` in backup.ts, empty when it
	 * matches: the version, and every table, index, trigger, or constraint missing, extra, or different, after a
	 * migration or an edit by hand on the host. Admin only. Read on each call from the database's catalog; the rows
	 * are not read.
	 */
	checkSchema(token: string): SchemaDifferences {
		this.ensureAdmin(token);
		return schemaDifferences(this.core.db);
	}

	// --- Push ---

	/** The server's VAPID public key, `PushConfig` in push.ts, to subscribe with. Any user may call. */
	getPushConfig(token: string): PushConfig {
		this.ensureAuthenticated(token);
		return { vapidPublicKey: this.core.services.push.getVapidKeys().publicKey };
	}

	/**
	 * Bind the browser's push subscription, `PushDevice` in push.ts, to the caller's session, over any earlier one: a
	 * session holds at most one, and it goes with the session, on logout, a password change, or expiry, or earlier
	 * through `removePushSubscription`. Sent on every load of the app, so a new session gets the browser's
	 * subscription. Any user may call.
	 */
	setPushSubscription(token: string, device: PushDevice): void {
		this.ensureAuthenticated(token);
		this.core.services.session.setPushSubscription(token, device);
	}

	/** Take the push subscription off the caller's session, when the user turns push off on the device. Any user may call. */
	removePushSubscription(token: string): void {
		this.ensureAuthenticated(token);
		this.core.services.session.removePushSubscription(token);
	}

	// --- Access rules ---

	/** The user behind a live token; anyone else gets an UnauthorizedError. */
	private ensureAuthenticated(token: string): User {
		const user = this.core.services.session.getUserByToken(token);
		if (user === null) throw new UnauthorizedError("Not logged in");
		return user;
	}

	private ensureAdmin(token: string): User {
		const user = this.ensureAuthenticated(token);
		if (!user.admin) throw new ForbiddenError("Only an admin can do this");
		return user;
	}

	/** The user, for a member with `minRole` or a higher role in the space; anyone else gets a ForbiddenError. */
	private ensureSpaceAccess(token: string, spaceId: number, minRole: SpaceRole): User {
		const user = this.ensureAuthenticated(token);
		this.ensureRole(user, this.core.services.space.getSpace(spaceId), minRole);
		return user;
	}

	private ensureRole(user: User, space: Space, minRole: SpaceRole): void {
		if (hasSpaceRole(user, space, minRole)) return;
		const holders = { viewer: "a member", editor: "an editor or a manager", manager: "a manager" };
		throw new ForbiddenError(`Only ${holders[minRole]} of the space can do this`);
	}

	/** A label is a manager's: access to it is manager access to its space, or admin for a global one. */
	private ensureLabelAccess(token: string, labelId: number): User {
		const { spaceId } = this.core.services.label.getLabel(labelId);
		return spaceId === null ? this.ensureAdmin(token) : this.ensureSpaceAccess(token, spaceId, "manager");
	}

	/** Access to a task is access to its space. */
	private ensureTaskAccess(token: string, taskId: number, minRole: SpaceRole): User {
		const user = this.ensureAuthenticated(token);
		const task = this.core.services.task.getTask(taskId);
		this.ensureRole(user, this.core.services.space.getSpace(task.spaceId), minRole);
		return user;
	}

	/** A comment write is its author's, while still an editor of the task's space. */
	private ensureCommentAuthor(token: string, commentId: number): User {
		const user = this.ensureAuthenticated(token);
		const comment = this.core.services.comment.getComment(commentId);
		const task = this.core.services.task.getTask(comment.taskId);
		this.ensureRole(user, this.core.services.space.getSpace(task.spaceId), "editor");
		if (comment.authorId !== user.id) throw new ForbiddenError("Only the author can change a comment");
		return user;
	}
}
