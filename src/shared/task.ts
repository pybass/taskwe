// Reference file: a task with its repeat, and the bodies and queries of the task routes.

import { z } from "zod";
import { Day, Id, Slug, Timestamp } from "#shared/base.ts";
import { CommentBody } from "#shared/comment.ts";
import { LabelName } from "#shared/label.ts";

/**
 * How often a task repeats, in days: "every N days". A helper for the due date, not a rule: Done suggests today plus
 * the days, and the user may pick another day. So a month is 30 days and a year 365: the drift does not matter for a
 * suggestion.
 */
export const RepeatDays = z.int().min(1);

/** One press of Done. The event that recorded it is its key; `doneAt` and `actorId` repeat that event's time and actor. */
export const RepeatDone = z.object({
	eventId: Id,
	doneAt: Timestamp,
	actorId: Id, // the user who pressed
});
export type RepeatDone = z.infer<typeof RepeatDone>;

export const TaskTitle = z.string().trim().min(1).max(200);

/**
 * GitHub-flavored markdown, stored as written: one new line is a line break, and raw HTML is shown as text. Trimmed;
 * may be empty.
 */
export const TaskBody = z.string().trim().max(10_000);

/**
 * A task belongs to one space. It is open or closed; closing keeps every field. Reading needs a member of the space,
 * any role; every write needs an editor. Only an admin deletes a task, with its comments. No task is ever created by
 * the app: nothing runs in the background.
 */
export const Task = z.object({
	// The public number too, one sequence over every space: shown as #{id}, the URL is /t/{id}, and a mention in a
	// body or a comment is #{id}. Never reused, and never changes: a move keeps it, so links and mentions keep working.
	id: Id,
	spaceId: Id, // changes on move
	title: TaskTitle,
	body: TaskBody,
	closedAt: Timestamp.nullable(), // null means open; set on close, cleared on reopen
	dueDate: Day.nullable(), // kept on close and on move
	// A member of the task's space when set, a viewer included; in a personal space always its owner. Checked only when
	// a write picks it: a user left out of the space stays the assignee of their tasks there, open or closed, until
	// someone picks another. Nothing clears it on their leave, and the task's other writes go on.
	assigneeId: Id.nullable(),
	authorId: Id, // never changes
	createdAt: Timestamp,
	updatedAt: Timestamp, // last change to the task or its comments, a done included; lists sort by it, newest first
	// Names, sorted, each once. A page shows the ones the space's list has in its order, then the others in grey: they
	// came with a move or stayed after a delete.
	labels: z.array(LabelName),
	commentCount: z.int(), // counted on every read, not stored
	repeatDays: RepeatDays.nullable(), // null: the task does not repeat
	repeatDones: z.array(RepeatDone), // newest first; always empty when `repeatDays` is null. Removing the days drops them; closing keeps them
});
export type Task = z.infer<typeof Task>;

/**
 * The task behind a mention, `#42` or a `/t/42` URL in a body or a comment: what the link a page renders shows.
 * Read through `Api.getTaskMention`, which answers only for a task the caller may read.
 */
export const TaskMention = Task.pick({ id: true, title: true, closedAt: true });
export type TaskMention = z.infer<typeof TaskMention>;

/**
 * The users to notify of a write: members of the task's space, the target on a move, each once; the caller is
 * rejected. The server adds nobody: a browser preselects the assignee, and the user unticks or adds. Not a change of
 * the task: a patch with only this key is still rejected. An unread notification per user and event lives until the
 * user opens the task; the rest of the contract is in notification.ts.
 */
export const NotifyUserIds = z
	.array(Id)
	.refine((userIds) => new Set(userIds).size === userIds.length, "A user is named once")
	.default([]);

/**
 * The create body. The caller is the new task's author. Rejected: an
 * assignee who is not a member of the space, a label that is not one of the space, or, in a personal space, any
 * assignee but its owner, null included.
 */
export const NewTask = z.object({
	title: TaskTitle,
	body: TaskBody.default(""),
	dueDate: Day.nullable().default(null),
	assigneeId: Id.nullable().default(null),
	labels: z.array(LabelName).default([]),
	repeatDays: RepeatDays.nullable().default(null),
	notifyUserIds: NotifyUserIds,
});
export type NewTask = z.infer<typeof NewTask>;

/**
 * The one write of a task: every change goes through it, so one press of the user is one patch. Only the given fields
 * change; works on a closed task too. A new assignee follows the rules of `NewTask`. A patch that changes nothing and
 * adds no comment is rejected. The rest of the contract is on `Api.updateTask`.
 */
export const TaskPatch = z
	.object({
		// Not `NewTask.partial()`: that keeps the defaults, so a missing field would reset.
		title: TaskTitle.optional(),
		body: TaskBody.optional(),
		dueDate: Day.nullable().optional(), // null clears it
		assigneeId: Id.nullable().optional(), // null clears it; rejected in a personal space, where the owner stays
		// Applied to the names the task carries at the write, so two users' label changes add up. A name added must be
		// in the space's list unless the task carries it already, so one in grey is kept or removed, never added. A name
		// added that the task carries, or removed that it does not, changes nothing. A name in both lists is rejected.
		labels: z
			.object({ added: z.array(LabelName).default([]), removed: z.array(LabelName).default([]) })
			.refine(({ added, removed }) => !added.some((name) => removed.includes(name)), "A label is added or removed, not both")
			.optional(),
		// A new value keeps the task's dones; null drops them with it.
		repeatDays: RepeatDays.nullable().optional(),
		closed: z.boolean().optional(), // true closes, false reopens; a task already so is rejected
		// Records a done by the caller at the server's time, on an open repeating task; `dueDate` is the next due day,
		// which the browser suggests from the days and the user may change. The server never computes a date.
		recordRepeatDone: z.literal(true).optional(),
		comment: CommentBody.optional(), // added by the caller, after the changes
		notifyUserIds: NotifyUserIds,
	})
	.refine((patch) => patch.recordRepeatDone === undefined || patch.dueDate !== undefined, "A done sets the next due date")
	.refine((patch) => patch.recordRepeatDone === undefined || patch.closed === undefined, "A done keeps the task open")
	.refine((patch) => patch.recordRepeatDone === undefined || patch.repeatDays !== null, "A done needs the days");
export type TaskPatch = z.infer<typeof TaskPatch>;

/** The move body: the target by slug, as in its URL. Who may move where, and what the task keeps, is on `Api.moveTask`. */
export const TaskMove = z.object({ targetSlug: Slug, notifyUserIds: NotifyUserIds });
export type TaskMove = z.infer<typeof TaskMove>;

/** Tasks per page of a list. */
export const TASK_PAGE_SIZE = 50;

/** The sort keys of a task list, each a column of the task. */
export const TaskSort = z.enum(["updated", "created", "due"]);
export type TaskSort = z.infer<typeof TaskSort>;

/** The order of a sort: newest first for `updated` and `created`, soonest first for `due`. */
export function defaultTaskOrder(sort: TaskSort): "asc" | "desc" {
	return sort === "due" ? "asc" : "desc";
}

/**
 * The search params of a task list; the values arrive as strings. The page URL carries the same params, so a view is
 * a link. The counts of a page follow every filter but `status`. A page past the end is empty.
 */
export const TaskListQuery = z.object({
	status: z.enum(["open", "closed"]).catch("open").default("open"), // the tabs of the list; an old link's other value falls back to open
	page: z.coerce.number().int().min(1).default(1),
	authorId: z.coerce.number().int().optional(), // a user who never wrote here matches nothing
	assigneeId: z.union([z.literal("none"), z.coerce.number().int()]).optional(), // `none` for unassigned
	// Only the tasks that carry every one of these names; sent as `label=urgent&label=bug`. Any name goes, one the
	// list does not have included; a name no task carries matches nothing.
	label: z.preprocess((value) => (value === undefined || Array.isArray(value) ? value : [value]), z.array(LabelName).default([])),
	sort: TaskSort.default("updated"),
	order: z.enum(["asc", "desc"]).optional(), // absent means `defaultTaskOrder(sort)`
});
export type TaskListQuery = z.infer<typeof TaskListQuery>;

/** One page of `TASK_PAGE_SIZE` tasks in the query's order, and how many open and closed tasks its filters match. */
export const TaskPage = z.object({ tasks: z.array(Task), open: z.int(), closed: z.int() });
export type TaskPage = z.infer<typeof TaskPage>;

/**
 * One entry per space the caller may read: its open tasks, and `mine`, how many of them are assigned to the caller.
 * In the caller's personal space the two are equal.
 */
export const SpaceTaskCounts = z.object({ spaceId: Id, open: z.int(), mine: z.int() });
export type SpaceTaskCounts = z.infer<typeof SpaceTaskCounts>;
