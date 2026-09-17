// Reference file: the unread notifications of a user and the bodies that clear them.

import { z } from "zod";
import { Id } from "#shared/base.ts";

// A notification is an event the actor chose to tell a user about, `notifyUserIds` in task.ts, and it lives only
// while unread: opening the task deletes it, and nothing is kept. The unread list is `ActivityEntry[]`, the activity's
// shape, over the spaces the user may read now: a task moved out of reach hides its rows, and they come back with
// access. Never the actor's own writes.

/** How many tasks have unread events for the caller: tasks, not events. The count on the Notifications tab. */
export const UnreadCount = z.object({ tasks: z.int() });
export type UnreadCount = z.infer<typeof UnreadCount>;

/** Clears the caller's unread on a task up to and including this event; a newer one stays. Sent when the task page shows the events. */
export const MarkTaskRead = z.object({ upToEventId: Id });
export type MarkTaskRead = z.infer<typeof MarkTaskRead>;
