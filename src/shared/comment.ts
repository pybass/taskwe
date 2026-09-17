// Reference file: a comment on a task, and the body that edits one.

import { z } from "zod";
import { Id, Timestamp } from "#shared/base.ts";

/** The text of a comment: markdown, same rule as a task body in task.ts, but never empty. */
export const CommentBody = z.string().trim().min(1).max(10_000);

/**
 * A comment on a task. A page reads it through the task's events (event.ts), `commentAdded` and `commentUpdated`;
 * this row comes back only from an edit.
 * A comment is added only as the `comment` of a task patch, by an editor, on an open or a closed task; the rule is
 * on `Api.updateTask`. A comment is a message, so only its author edits it, and only while still an editor of the
 * space; the rule is on `Api.updateComment` (api.ts). An edit replaces the text: the comment holds only the current
 * one. A comment is never deleted: a mistake is edited.
 */
export const Comment = z.object({
	id: Id,
	taskId: Id, // follows the task on a move
	authorId: Id, // never changes
	body: CommentBody,
	createdAt: Timestamp, // the task's `updatedAt` becomes this on add
});
export type Comment = z.infer<typeof Comment>;

/** The edit body: the whole new text. */
export const CommentPatch = z.object({ body: CommentBody });
export type CommentPatch = z.infer<typeof CommentPatch>;
