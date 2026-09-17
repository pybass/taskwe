import { z } from "zod";
import type { TaskChanges } from "#shared/event.ts";
import type { Label } from "#shared/label.ts";
import type { Space } from "#shared/space.ts";
import {
	defaultTaskOrder,
	type NewTask,
	SpaceTaskCounts,
	TASK_PAGE_SIZE,
	type Task,
	type TaskListQuery,
	type TaskPage,
	type TaskPatch,
} from "#shared/task.ts";
import type { Core } from "../../core.ts";
import { InvalidOperationError, NotFoundError } from "../../errors.ts";
import { normalizeLabels, TASK_COLUMNS, TaskRow } from "./models.ts";

/** An assignee must be a member of the task's space; in a personal space it must be the owner. */
function assertAssignee(space: Space, assigneeId: number | null): void {
	if (space.ownerId !== null && assigneeId !== space.ownerId) {
		throw new InvalidOperationError("A task in a personal space is assigned to its owner");
	}
	if (assigneeId !== null && !space.members.some((member) => member.userId === assigneeId)) {
		throw new InvalidOperationError(`User ${assigneeId} is not a member of the space`);
	}
}

/** A user to notify must be a member of the space the task is in after the write, and never the actor. */
function assertNotifyUsers(space: Space, actorId: number, userIds: number[]): void {
	if (userIds.includes(actorId)) throw new InvalidOperationError("You cannot notify yourself");
	const outsider = userIds.find((userId) => !space.members.some((member) => member.userId === userId));
	if (outsider !== undefined) throw new InvalidOperationError(`User ${outsider} is not a member of the space`);
}

/** A label a task gets must be in its space's list, `known`. */
function assertLabels(known: Label[], labels: string[]): void {
	const allowed = new Set(known.map((label) => label.name));
	const unknown = labels.filter((name) => !allowed.has(name));
	if (unknown.length > 0)
		throw new InvalidOperationError(`No label ${unknown.map((name) => `"${name}"`).join(", ")} in the space`);
}

/**
 * Owner of the `tasks` and `repeat_dones` tables and of the rows of `task_labels`; the label service renames the
 * names in them. Not cached: a space may hold thousands of tasks.
 */
export class TaskService {
	constructor(private readonly core: Core) {}

	/** One page of the tasks of a space that match the query, in its order, with the counts of the open and the closed under its filters. */
	listTasks(spaceId: number, query: TaskListQuery): TaskPage {
		const clauses = ["space_id = $spaceId"];
		const params: {
			spaceId: number;
			authorId?: number;
			assigneeId?: number;
			labels?: string;
			labelCount?: number;
		} = { spaceId };
		if (query.authorId !== undefined) {
			clauses.push("author_id = $authorId");
			params.authorId = query.authorId;
		}
		if (query.assigneeId === "none") clauses.push("assignee_id IS NULL");
		else if (query.assigneeId !== undefined) {
			clauses.push("assignee_id = $assigneeId");
			params.assigneeId = query.assigneeId;
		}
		// Only the tasks carrying every name; each name once, so the count matches.
		const labels = [...new Set(query.label)];
		if (labels.length > 0) {
			clauses.push(
				`tasks.id IN (SELECT task_id FROM task_labels WHERE name IN (SELECT value FROM json_each($labels))
				GROUP BY task_id HAVING count(*) = $labelCount)`,
			);
			params.labels = JSON.stringify(labels);
			params.labelCount = labels.length;
		}
		const where = clauses.join(" AND ");
		const status = query.status === "open" ? " AND closed_at IS NULL" : " AND closed_at IS NOT NULL";
		const order = query.order ?? defaultTaskOrder(query.sort);
		// The id breaks ties, so a page boundary is stable between the two queries of a pagination.
		const orderBy = {
			updated: `updated_at ${order}`,
			created: `created_at ${order}`,
			due: `due_date IS NULL, due_date ${order}`,
		}[query.sort];
		const tasks = z
			.array(TaskRow)
			.parse(
				this.core.db
					.query(
						`SELECT ${TASK_COLUMNS} FROM tasks WHERE ${where}${status} ORDER BY ${orderBy}, id DESC LIMIT $limit OFFSET $offset`,
					)
					.all({ ...params, limit: TASK_PAGE_SIZE, offset: (query.page - 1) * TASK_PAGE_SIZE }),
			);
		const counts = z.object({ open: z.int(), closed: z.int() }).parse(
			this.core.db
				.query(
					`SELECT count(*) FILTER (WHERE closed_at IS NULL) AS open, count(*) FILTER (WHERE closed_at IS NOT NULL) AS closed
					FROM tasks WHERE ${where}`,
				)
				.get(params),
		);
		return { tasks, ...counts };
	}

	/** Every open task of the given spaces assigned to `userId`, due soonest first, then the undated by last update, newest first. */
	listMyTasks(spaces: Space[], userId: number): Task[] {
		return z.array(TaskRow).parse(
			this.core.db
				.query(
					`SELECT ${TASK_COLUMNS} FROM tasks
					WHERE closed_at IS NULL AND assignee_id = $userId AND space_id IN (SELECT value FROM json_each($spaceIds))
					ORDER BY due_date IS NULL, due_date, updated_at DESC, id DESC`,
				)
				.all({ userId, spaceIds: JSON.stringify(spaces.map((space) => space.id)) }),
		);
	}

	/** Per given space, its open tasks and `mine`, how many of them are assigned to `userId`, in the order given. */
	countOpenTasks(spaces: Space[], userId: number): SpaceTaskCounts[] {
		const rows = z.array(SpaceTaskCounts).parse(
			this.core.db
				.query(
					`SELECT space_id AS spaceId, count(*) AS open, count(*) FILTER (WHERE assignee_id = $userId) AS mine
					FROM tasks WHERE closed_at IS NULL AND space_id IN (SELECT value FROM json_each($spaceIds)) GROUP BY space_id`,
				)
				.all({ userId, spaceIds: JSON.stringify(spaces.map((space) => space.id)) }),
		);
		const bySpace = new Map(rows.map((row) => [row.spaceId, row]));
		return spaces.map((space) => bySpace.get(space.id) ?? { spaceId: space.id, open: 0, mine: 0 });
	}

	getTask(taskId: number): Task {
		const row = this.core.db.query(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $taskId`).get({ taskId });
		if (row === null) throw new NotFoundError(`No task ${taskId}`);
		return TaskRow.parse(row);
	}

	/** Create a task; `authorId` is its author. */
	createTask(authorId: number, spaceId: number, input: NewTask): Task {
		const space = this.core.services.space.getSpace(spaceId);
		assertAssignee(space, input.assigneeId);
		assertNotifyUsers(space, authorId, input.notifyUserIds);
		assertLabels(this.core.services.label.listSpaceLabels(space.id), input.labels);
		const labels = normalizeLabels(input.labels);
		const changes: TaskChanges = {
			action: "created",
			space: { spaceId: space.id, name: space.name },
			title: input.title,
			body: input.body,
			assigneeId: input.assigneeId,
			labels,
			dueDate: input.dueDate,
			repeatDays: input.repeatDays,
		};
		const taskId = this.core.db.transaction(() => {
			const now = new Date().toISOString();
			const { lastInsertRowid } = this.core.db
				.query(
					`INSERT INTO tasks (space_id, title, body, due_date, assignee_id, repeat_days, author_id, created_at, updated_at)
					VALUES ($spaceId, $title, $body, $dueDate, $assigneeId, $repeatDays, $authorId, $now, $now)`,
				)
				.run({
					spaceId: space.id,
					title: input.title,
					body: input.body,
					dueDate: input.dueDate,
					assigneeId: input.assigneeId,
					repeatDays: input.repeatDays,
					authorId,
					now,
				});
			const taskId = Number(lastInsertRowid);
			this.replaceLabels(taskId, labels);
			const eventId = this.core.services.event.recordTaskEvent(authorId, taskId, changes, now);
			this.core.services.notification.recordNotifications(eventId, input.notifyUserIds);
			return taskId;
		})();
		this.core.services.push.sendTaskPush(authorId, taskId, changes, input.notifyUserIds);
		return this.getTask(taskId);
	}

	/** Apply a patch by `actorId` in one transaction at one time; the rules and the errors are on `Api.updateTask`. */
	updateTask(actorId: number, taskId: number, patch: TaskPatch): Task {
		const task = this.getTask(taskId);
		const { repeatDays, closed, recordRepeatDone, comment, notifyUserIds, labels: labelChange, ...fields } = patch;
		if (closed !== undefined && (task.closedAt !== null) === closed) {
			throw new InvalidOperationError(`The task is already ${closed ? "closed" : "open"}`);
		}
		const now = new Date().toISOString();
		const nextRepeatDays = repeatDays === undefined ? task.repeatDays : repeatDays;
		if (recordRepeatDone !== undefined) {
			if (task.closedAt !== null) throw new InvalidOperationError("The task is closed");
			if (nextRepeatDays === null) throw new InvalidOperationError("The task does not repeat");
		}
		const next = { ...task, ...fields, closedAt: closed === undefined ? task.closedAt : closed ? now : null };
		const space = this.core.services.space.getSpace(task.spaceId);
		// Only a new assignee: one who left the space stays on the task, and its other writes go on.
		if (next.assigneeId !== task.assigneeId) assertAssignee(space, next.assigneeId);
		assertNotifyUsers(space, actorId, notifyUserIds);
		const added = normalizeLabels((labelChange?.added ?? []).filter((name) => !task.labels.includes(name)));
		const removed = task.labels.filter((name) => labelChange?.removed.includes(name));
		assertLabels(this.core.services.label.listSpaceLabels(space.id), added);
		const labels = normalizeLabels([...task.labels.filter((name) => !removed.includes(name)), ...added]);
		const changes: Extract<TaskChanges, { action: "updated" }> = { action: "updated" };
		if (closed !== undefined) changes.closedAt = { from: task.closedAt, to: next.closedAt };
		if (next.assigneeId !== task.assigneeId) changes.assigneeId = { from: task.assigneeId, to: next.assigneeId };
		if (next.dueDate !== task.dueDate) changes.dueDate = { from: task.dueDate, to: next.dueDate };
		if (added.length > 0 || removed.length > 0) changes.labels = { added, removed };
		if (nextRepeatDays !== task.repeatDays) changes.repeatDays = { from: task.repeatDays, to: nextRepeatDays };
		if (next.title !== task.title) changes.title = { from: task.title, to: next.title };
		if (next.body !== task.body) changes.body = { from: task.body, to: next.body };
		if (recordRepeatDone !== undefined) changes.repeatDoneRecorded = true;
		// Only `action` set: nothing differed.
		if (Object.keys(changes).length === 1 && comment === undefined) throw new InvalidOperationError("Nothing to change");
		this.core.db.transaction(() => {
			if (comment !== undefined) {
				const commentId = this.core.services.comment.createComment(actorId, taskId, comment, now);
				changes.commentAdded = { commentId, body: comment };
			}
			const eventId = this.core.services.event.recordTaskEvent(actorId, taskId, changes, now);
			this.core.services.notification.recordNotifications(eventId, notifyUserIds);
			this.core.db
				.query(
					`UPDATE tasks SET title = $title, body = $body, due_date = $dueDate, assignee_id = $assigneeId,
					repeat_days = $repeatDays, closed_at = $closedAt, updated_at = $now WHERE id = $taskId`,
				)
				.run({
					title: next.title,
					body: next.body,
					dueDate: next.dueDate,
					assigneeId: next.assigneeId,
					repeatDays: nextRepeatDays,
					closedAt: next.closedAt,
					now,
					taskId,
				});
			if (changes.labels !== undefined) this.replaceLabels(taskId, labels);
			// New days keep the dones; null drops them with it.
			if (nextRepeatDays === null) this.core.db.query("DELETE FROM repeat_dones WHERE task_id = $taskId").run({ taskId });
			if (recordRepeatDone !== undefined) {
				this.core.db
					.query("INSERT INTO repeat_dones (event_id, task_id, done_at, actor_id) VALUES ($eventId, $taskId, $now, $actorId)")
					.run({ eventId, taskId, now, actorId });
			}
		})();
		this.core.services.push.sendTaskPush(actorId, taskId, changes, notifyUserIds);
		return this.getTask(taskId);
	}

	/** Remove the done `eventId`, a mistaken press, by `actorId`; the due date stays. A closed task is an InvalidOperationError, an unknown done a NotFoundError. */
	removeRepeatDone(actorId: number, taskId: number, eventId: number): Task {
		const task = this.getTask(taskId);
		if (task.closedAt !== null) throw new InvalidOperationError("The task is closed");
		const done = task.repeatDones.find((done) => done.eventId === eventId);
		if (done === undefined) throw new NotFoundError(`No done ${eventId} on task ${taskId}`);
		const now = new Date().toISOString();
		this.core.db.transaction(() => {
			this.core.db.query("DELETE FROM repeat_dones WHERE event_id = $eventId").run({ eventId });
			this.setUpdatedAt(taskId, now);
			this.core.services.event.recordTaskEvent(actorId, taskId, { action: "repeatDoneRemoved", done }, now);
		})();
		return this.getTask(taskId);
	}

	/** Move the task to another space by `actorId`; the assignee rule is on `Api.moveTask`. The labels go as they are. */
	moveTask(actorId: number, taskId: number, targetSpaceId: number, notifyUserIds: number[]): Task {
		const task = this.getTask(taskId);
		const source = this.core.services.space.getSpace(task.spaceId);
		const target = this.core.services.space.getSpace(targetSpaceId);
		if (target.id === task.spaceId) throw new InvalidOperationError("The task is already in that space");
		assertNotifyUsers(target, actorId, notifyUserIds);
		const assigneeId =
			target.ownerId ?? (target.members.some((member) => member.userId === task.assigneeId) ? task.assigneeId : null);
		const changes: TaskChanges = {
			action: "moved",
			space: { from: { spaceId: source.id, name: source.name }, to: { spaceId: target.id, name: target.name } },
		};
		if (assigneeId !== task.assigneeId) changes.assigneeId = { from: task.assigneeId, to: assigneeId };
		this.core.db.transaction(() => {
			const now = new Date().toISOString();
			this.core.db
				.query("UPDATE tasks SET space_id = $spaceId, assignee_id = $assigneeId, updated_at = $now WHERE id = $taskId")
				.run({ spaceId: target.id, assigneeId, now, taskId });
			const eventId = this.core.services.event.recordTaskEvent(actorId, taskId, changes, now);
			this.core.services.notification.recordNotifications(eventId, notifyUserIds);
		})();
		this.core.services.push.sendTaskPush(actorId, taskId, changes, notifyUserIds);
		return this.getTask(taskId);
	}

	/** Replace the task's label rows; `labels` must hold each name once, see `normalizeLabels`. Call inside the caller's transaction. */
	private replaceLabels(taskId: number, labels: string[]): void {
		this.core.db.query("DELETE FROM task_labels WHERE task_id = $taskId").run({ taskId });
		const insert = this.core.db.query("INSERT INTO task_labels (task_id, name) VALUES ($taskId, $name)");
		for (const name of labels) insert.run({ taskId, name });
	}

	/** Delete the task with its labels, dones, comments, and events. */
	deleteTask(taskId: number): void {
		const { changes } = this.core.db.query("DELETE FROM tasks WHERE id = $taskId").run({ taskId });
		if (changes === 0) throw new NotFoundError(`No task ${taskId}`);
	}

	/** Record a change outside the row, a comment edit or a removed done; call inside the caller's transaction. */
	setUpdatedAt(taskId: number, updatedAt: string): void {
		this.core.db.query("UPDATE tasks SET updated_at = $updatedAt WHERE id = $taskId").run({ updatedAt, taskId });
	}
}
