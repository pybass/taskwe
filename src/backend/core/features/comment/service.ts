import { Comment, type CommentPatch } from "#shared/comment.ts";
import type { Core } from "../../core.ts";
import { InvalidOperationError, NotFoundError } from "../../errors.ts";

// The columns of a comment row, aliased to the JSON names, so every read parses with the shared schema.
const COLUMNS = "id, task_id AS taskId, author_id AS authorId, body, created_at AS createdAt";

/** Owner of the `comments` table. */
export class CommentService {
	constructor(private readonly core: Core) {}

	getComment(commentId: number): Comment {
		const row = this.core.db.query(`SELECT ${COLUMNS} FROM comments WHERE id = $commentId`).get({ commentId });
		if (row === null) throw new NotFoundError(`No comment ${commentId}`);
		return Comment.parse(row);
	}

	/** Insert a comment by `authorId` at `createdAt`; call inside the task write's transaction, which moves the task's `updatedAt`. */
	createComment(authorId: number, taskId: number, body: string, createdAt: string): number {
		const { lastInsertRowid } = this.core.db
			.query("INSERT INTO comments (task_id, author_id, body, created_at) VALUES ($taskId, $authorId, $body, $createdAt)")
			.run({ taskId, authorId, body, createdAt });
		return Number(lastInsertRowid);
	}

	/** Replace the text of a comment by `actorId`; the task's `updatedAt` moves. The same text is an InvalidOperationError. */
	updateComment(actorId: number, commentId: number, patch: CommentPatch): Comment {
		const comment = this.getComment(commentId);
		if (patch.body === comment.body) throw new InvalidOperationError("Nothing to change");
		const now = new Date().toISOString();
		this.core.db.transaction(() => {
			this.core.db.query("UPDATE comments SET body = $body WHERE id = $commentId").run({ commentId, body: patch.body });
			this.core.services.task.setUpdatedAt(comment.taskId, now);
			this.core.services.event.recordTaskEvent(
				actorId,
				comment.taskId,
				{ action: "commentUpdated", commentId, body: { from: comment.body, to: patch.body } },
				now,
			);
		})();
		return this.getComment(commentId);
	}
}
