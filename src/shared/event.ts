// Reference file: the events of a task, one per write, each carrying the changes of that write as one object.

import { z } from "zod";
import { Day, Id, Timestamp } from "#shared/base.ts";
import { CommentBody } from "#shared/comment.ts";
import { LabelName } from "#shared/label.ts";
import { SpaceName } from "#shared/space.ts";
import { RepeatDays, RepeatDone, Task, TaskBody, TaskTitle } from "#shared/task.ts";

/** The value before and after, in full, null included: the events are the edit history. */
const Change = <T extends z.ZodType>(value: T) => z.object({ from: value, to: value });

/** A space as it was at the write: the id to link, the name to show when the space is gone or renamed. */
export const SpaceSnapshot = z.object({ spaceId: Id, name: SpaceName });
export type SpaceSnapshot = z.infer<typeof SpaceSnapshot>;

/**
 * What one write changed on a task, named by the `Api` method that wrote it, `action`, with one shape per action, so
 * an event reads like a diff of the task. A key named like a task field holds that field's change, from and to; a
 * past-participle key holds something that happened. Labels are names, a snapshot: a page looks the name up in the
 * space of the moment for a color, and a renamed or deleted label shows as plain text.
 * - Every change of a task, its labels, its dones, or its comments writes an event, so the rows of `tasks`,
 *   `task_labels`, `repeat_dones`, and `comments` can be rebuilt from the events alone: start from `created`, then
 *   apply each event's keys in id order as its action's shape says: `space` and `labels` differ by action. The author
 *   and the creation time of a task or a comment are the actor and the time of the event that made it.
 * - Every event moves the task's `updatedAt` to its time, so `updatedAt` is the time of the newest event.
 * - A label rename or delete is a change of the label, not of the task: it writes no event and keeps `updatedAt`.
 *   So the rebuild gives the label names as they were written, and `task_labels` alone knows the names of today.
 * The rows stay the truth for every read; nothing replays the events.
 */
export const TaskChanges = z.discriminatedUnion("action", [
	// `Api.createTask`: the task as written and where.
	z.object({
		action: z.literal("created"),
		space: SpaceSnapshot,
		title: TaskTitle,
		body: TaskBody,
		assigneeId: Id.nullable(),
		labels: z.array(LabelName),
		dueDate: Day.nullable(),
		repeatDays: RepeatDays.nullable(),
	}),
	// `Api.updateTask`: the keys of the parts of the patch that differ from the task, then the done and the comment
	// when the patch has them. At least one key besides `action`: a patch that changes nothing is rejected before the
	// write. A done writes `dueDate` only when the day differs; the event's id is the done's `eventId` in `repeatDones`.
	z.object({
		action: z.literal("updated"),
		closedAt: Change(Timestamp.nullable()).optional(), // `to` set: closed; null: reopened, `from` says when it was closed
		title: Change(TaskTitle).optional(),
		body: Change(TaskBody).optional(),
		assigneeId: Change(Id.nullable()).optional(),
		dueDate: Change(Day.nullable()).optional(),
		labels: z.object({ added: z.array(LabelName), removed: z.array(LabelName) }).optional(), // not both empty
		repeatDays: Change(RepeatDays.nullable()).optional(), // null drops the dones too; their events stay
		repeatDoneRecorded: z.literal(true).optional(), // the done is the event: its id, actor, and time
		commentAdded: z.object({ commentId: Id, body: CommentBody }).optional(), // the row's id and the text as written
	}),
	// `Api.moveTask`: both spaces, and the assignee only when the target changed it. The labels go as they are.
	z.object({ action: z.literal("moved"), space: Change(SpaceSnapshot), assigneeId: Change(Id.nullable()).optional() }),
	// `Api.removeRepeatDone`: the done as it was.
	z.object({ action: z.literal("repeatDoneRemoved"), done: RepeatDone }),
	// `Api.updateComment`.
	z.object({ action: z.literal("commentUpdated"), commentId: Id, body: Change(CommentBody) }),
]);
export type TaskChanges = z.infer<typeof TaskChanges>;

/**
 * One write of a task, immutable, written in the same transaction as the change with the write's time; a write that
 * changes nothing writes no event. Read by a member of the task's space, oldest first by id, no paging; the events go
 * with their task. The record of a task is its row plus its events. A comment is shown only through its events: its
 * text as written in `commentAdded`, the current one in the last `commentUpdated` with its id.
 */
export const TaskEvent = z.object({
	id: Id, // the order within a task, and the key of the done it recorded
	taskId: Id, // stable across moves, so the history follows the task
	actorId: Id,
	changes: TaskChanges,
	createdAt: Timestamp, // the write's time; the clock may step back, so the order is the id
});
export type TaskEvent = z.infer<typeof TaskEvent>;

/**
 * One entry of the activity, the home page's Activity tab: an event with its task as the task is now, the fields a
 * heading needs. The activity is the newest 300 events over the tasks of every space the caller may read, newest
 * first, no paging; a page groups them by task.
 */
export const ActivityEntry = z.object({
	event: TaskEvent,
	task: Task.pick({ id: true, spaceId: true, title: true, closedAt: true, labels: true }),
});
export type ActivityEntry = z.infer<typeof ActivityEntry>;
