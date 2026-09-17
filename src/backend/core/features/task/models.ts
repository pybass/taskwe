import { z } from "zod";
import { LabelName } from "#shared/label.ts";
import { RepeatDone, Task } from "#shared/task.ts";
import { jsonText } from "../../db/json.ts";

/** The label names of the task `taskId` as one JSON array, sorted; '[]' for none. `taskId` is a column reference. */
export function labelsJson(taskId: string): string {
	return `(SELECT json_group_array(name ORDER BY name) FROM task_labels WHERE task_id = ${taskId})`;
}

/**
 * The columns of a task row aliased to the JSON names, with its labels, its dones, and its comment count packed from
 * their tables: `SELECT ${TASK_COLUMNS} FROM tasks ...`, parsed with `TaskRow`. Each is a lookup per row read.
 */
export const TASK_COLUMNS = `id, space_id AS spaceId, title, body, closed_at AS closedAt, due_date AS dueDate,
	assignee_id AS assigneeId, author_id AS authorId, created_at AS createdAt, updated_at AS updatedAt,
	${labelsJson("tasks.id")} AS labels, repeat_days AS repeatDays,
	(SELECT json_group_array(json_object('eventId', event_id, 'doneAt', done_at, 'actorId', actor_id) ORDER BY event_id DESC)
		FROM repeat_dones WHERE task_id = tasks.id) AS repeatDones,
	(SELECT count(*) FROM comments WHERE task_id = tasks.id) AS commentCount`;

/** A row of `TASK_COLUMNS`; `labels` and `repeatDones` are JSON text. */
export const TaskRow = Task.extend({
	labels: jsonText.pipe(z.array(LabelName)),
	repeatDones: jsonText.pipe(z.array(RepeatDone)),
});

/** A label list as the API and the events carry it: sorted, each once, so two equal sets compare equal. */
export function normalizeLabels(labels: Iterable<string>): string[] {
	return [...new Set(labels)].sort();
}
