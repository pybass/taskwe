import { z } from "zod";
import { Id, Timestamp } from "#shared/base.ts";
import type { ActivityEntry } from "#shared/event.ts";
import { TaskChanges, TaskEvent } from "#shared/event.ts";
import { LabelName } from "#shared/label.ts";
import { TaskTitle } from "#shared/task.ts";
import { jsonText } from "../../db/json.ts";
import { labelsJson } from "../task/models.ts";

/** A task event's columns aliased to the JSON names, qualified so a join is unambiguous; parsed with `EventRow`. */
export const EVENT_COLUMNS =
	"task_events.id, task_events.task_id AS taskId, task_events.actor_id AS actorId, task_events.changes, task_events.created_at AS createdAt";

/** A row of `EVENT_COLUMNS`; `changes` is JSON text. */
export const EventRow = TaskEvent.extend({ changes: jsonText.pipe(TaskChanges) });

/** `EVENT_COLUMNS` plus the heading fields of the `tasks` row joined as `t`. */
export const ACTIVITY_COLUMNS = `${EVENT_COLUMNS}, t.space_id AS taskSpaceId, t.title AS taskTitle,
	t.closed_at AS taskClosedAt, ${labelsJson("t.id")} AS taskLabels`;

/** A row of `ACTIVITY_COLUMNS` as an `ActivityEntry`. */
export const ActivityRow = EventRow.extend({
	taskSpaceId: Id,
	taskTitle: TaskTitle,
	taskClosedAt: Timestamp.nullable(),
	taskLabels: jsonText.pipe(z.array(LabelName)),
}).transform(
	({ taskSpaceId, taskTitle, taskClosedAt, taskLabels, ...event }): ActivityEntry => ({
		event,
		task: {
			id: event.taskId,
			spaceId: taskSpaceId,
			title: taskTitle,
			closedAt: taskClosedAt,
			labels: taskLabels,
		},
	}),
);
