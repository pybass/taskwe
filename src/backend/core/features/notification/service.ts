import { z } from "zod";
import type { ActivityEntry } from "#shared/event.ts";
import type { Space } from "#shared/space.ts";
import type { Core } from "../../core.ts";
import { ACTIVITY_COLUMNS, ActivityRow } from "../event/models.ts";

/** The unread rows of `$userId` with their event and task `t`, over the spaces of `$spaceIds`: what the user may read now. */
const UNREAD_FROM = `FROM notifications n JOIN task_events ON task_events.id = n.event_id JOIN tasks t ON t.id = task_events.task_id
	WHERE n.user_id = $userId AND t.space_id IN (SELECT value FROM json_each($spaceIds))`;

/** Owner of the `notifications` table: one row per user and event while unread. The rules are in notification.ts. */
export class NotificationService {
	constructor(private readonly core: Core) {}

	/** One unread row per user for the event; call inside the transaction that recorded it. The caller keeps the actor out and names each user once. */
	recordNotifications(eventId: number, userIds: number[]): void {
		const insert = this.core.db.query("INSERT INTO notifications (user_id, event_id) VALUES ($userId, $eventId)");
		for (const userId of userIds) insert.run({ userId, eventId });
	}

	/** The user's unread events over the tasks of the given spaces, each with its task, newest first. */
	listUnreadNotifications(userId: number, spaces: Space[]): ActivityEntry[] {
		return z
			.array(ActivityRow)
			.parse(
				this.core.db
					.query(`SELECT ${ACTIVITY_COLUMNS} ${UNREAD_FROM} ORDER BY n.event_id DESC`)
					.all({ userId, spaceIds: JSON.stringify(spaces.map((space) => space.id)) }),
			);
	}

	/** How many tasks of the given spaces have unread events for the user. */
	countUnreadTasks(userId: number, spaces: Space[]): number {
		const { tasks } = z
			.object({ tasks: z.int() })
			.parse(
				this.core.db
					.query(`SELECT count(DISTINCT t.id) AS tasks ${UNREAD_FROM}`)
					.get({ userId, spaceIds: JSON.stringify(spaces.map((space) => space.id)) }),
			);
		return tasks;
	}

	/** Delete the user's unread rows on the task up to and including `upToEventId`; a newer event stays unread. */
	markTaskRead(userId: number, taskId: number, upToEventId: number): void {
		this.core.db
			.query(
				`DELETE FROM notifications WHERE user_id = $userId
				AND event_id IN (SELECT id FROM task_events WHERE task_id = $taskId AND id <= $upToEventId)`,
			)
			.run({ userId, taskId, upToEventId });
	}

	/** Delete every unread row of the user, the hidden ones of spaces they cannot read now included. */
	markAllNotificationsRead(userId: number): void {
		this.core.db.query("DELETE FROM notifications WHERE user_id = $userId").run({ userId });
	}
}
