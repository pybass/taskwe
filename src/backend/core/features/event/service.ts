import { z } from "zod";
import type { ActivityEntry, TaskChanges, TaskEvent } from "#shared/event.ts";
import type { Space } from "#shared/space.ts";
import type { Core } from "../../core.ts";
import { ACTIVITY_COLUMNS, ActivityRow, EVENT_COLUMNS, EventRow } from "./models.ts";

/** Owner of the `task_events` table. Rows are never updated; a task's go with it. */
export class EventService {
	constructor(private readonly core: Core) {}

	/** The newest 300 events of the tasks of the given spaces, each with its task, newest first. */
	listActivity(spaces: Space[]): ActivityEntry[] {
		return z.array(ActivityRow).parse(
			this.core.db
				.query(
					`SELECT ${ACTIVITY_COLUMNS} FROM task_events JOIN tasks t ON t.id = task_events.task_id
					WHERE t.space_id IN (SELECT value FROM json_each($spaceIds))
					ORDER BY task_events.id DESC LIMIT 300`,
				)
				.all({ spaceIds: JSON.stringify(spaces.map((space) => space.id)) }),
		);
	}

	/** The events of a task, oldest first. */
	listTaskEvents(taskId: number): TaskEvent[] {
		return z
			.array(EventRow)
			.parse(
				this.core.db
					.query(`SELECT ${EVENT_COLUMNS} FROM task_events WHERE task_events.task_id = $taskId ORDER BY task_events.id`)
					.all({ taskId }),
			);
	}

	/**
	 * Insert one task event and return its id; call inside the transaction of the write it records, with the write's
	 * time. The one insert point of a task event.
	 */
	recordTaskEvent(actorId: number, taskId: number, changes: TaskChanges, createdAt: string): number {
		const { lastInsertRowid } = this.core.db
			.query("INSERT INTO task_events (actor_id, task_id, changes, created_at) VALUES ($actorId, $taskId, $changes, $createdAt)")
			.run({ actorId, taskId, changes: JSON.stringify(changes), createdAt });
		return Number(lastInsertRowid);
	}
}
