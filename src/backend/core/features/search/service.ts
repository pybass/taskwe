import { z } from "zod";
import type { SearchFound, SearchPage, SearchQuery, SnippetPart } from "#shared/search.ts";
import type { Space } from "#shared/space.ts";
import { TASK_PAGE_SIZE } from "#shared/task.ts";
import type { Core } from "../../core.ts";
import { TASK_COLUMNS, TaskRow } from "../task/models.ts";

// A word as the unicode61 tokenizer sees one: a run of letters and digits. Marks too, so an accent stays in its word.
const WORD = /[\p{L}\p{N}\p{M}\p{Co}]+/gu;

/** A word as the index holds it: lowercase, no accents on Latin letters, `ё` as `е`; see schema v4. */
function fold(text: string): string {
	return text
		.normalize("NFD")
		.replace(/(?<=\p{Script=Latin})\p{M}+/gu, "")
		.normalize("NFC")
		.toLowerCase()
		.replaceAll("ё", "е");
}

/** The excerpt of `text` around its first word that starts with one of `words`, folded; see `Snippet`. */
function snippet(text: string, words: string[]): SnippetPart[] {
	const flat = text.replace(/\s+/g, " ").trim();
	const isMatch = (token: string) => {
		const folded = fold(token);
		return words.some((word) => folded.startsWith(word));
	};
	const tokens = [...flat.matchAll(WORD)];
	const hitAt = tokens.find((token) => isMatch(token[0]))?.index ?? 0;
	// About 40 characters of context before the hit and 160 in all, cut at spaces.
	let start = Math.max(0, hitAt - 40);
	if (start > 0) {
		const space = flat.indexOf(" ", start);
		start = space === -1 || space >= hitAt ? hitAt : space + 1;
	}
	let end = Math.min(flat.length, start + 160);
	if (end < flat.length) {
		const space = flat.lastIndexOf(" ", end);
		if (space > hitAt) end = space;
	}
	const parts: SnippetPart[] = [];
	if (start > 0) parts.push({ text: "…", match: false });
	let at = start;
	for (const token of tokens) {
		const tokenEnd = token.index + token[0].length;
		if (token.index < start || tokenEnd > end || !isMatch(token[0])) continue;
		if (token.index > at) parts.push({ text: flat.slice(at, token.index), match: false });
		parts.push({ text: token[0], match: true });
		at = tokenEnd;
	}
	if (end > at) parts.push({ text: flat.slice(at, end), match: false });
	if (end < flat.length) parts.push({ text: "…", match: false });
	return parts;
}

const SearchRow = TaskRow.extend({ tier: z.int() });

const CommentHit = z.object({ commentId: z.int(), taskId: z.int(), authorId: z.int(), body: z.string() });

/** Reads the FTS5 indexes of schema v4, which triggers keep; owns no table. */
export class SearchService {
	constructor(private readonly core: Core) {}

	/** One page of the tasks of the given spaces that match `query`; the rules are on `SearchQuery` and `SearchPage`. */
	searchTasks(spaces: Space[], query: SearchQuery): SearchPage {
		const words = [...new Set(fold(query.q).match(WORD))];
		if (words.length === 0) return { results: [], open: 0, closed: 0 };
		// A word quoted is never FTS5 syntax, and it holds no quote; `*` after it matches the words it starts.
		const phrases = words.map((word) => `"${word}"*`);
		const wordParams = Object.fromEntries(phrases.map((phrase, i) => [`word${i}`, phrase]));
		const where = [
			"space_id IN (SELECT value FROM json_each($spaceIds))",
			// Each word in the task's own text or in any of its comments.
			...phrases.map(
				(_, i) => `(id IN (SELECT rowid FROM task_search WHERE task_search MATCH $word${i})
				OR id IN (SELECT task_id FROM comments WHERE id IN (SELECT rowid FROM comment_search WHERE comment_search MATCH $word${i})))`,
			),
		].join(" AND ");
		const params = { spaceIds: JSON.stringify(spaces.map((space) => space.id)), ...wordParams };
		const status = { all: "", open: " AND closed_at IS NULL", closed: " AND closed_at IS NOT NULL" }[query.status];
		const rows = z.array(SearchRow).parse(
			this.core.db
				.query(
					`SELECT ${TASK_COLUMNS},
						CASE WHEN id IN (SELECT rowid FROM task_search WHERE task_search MATCH $titleQuery) THEN 1
							WHEN id IN (SELECT rowid FROM task_search WHERE task_search MATCH $taskQuery) THEN 2
							ELSE 3 END AS tier
					FROM tasks WHERE ${where}${status}
					ORDER BY tier, closed_at IS NOT NULL, updated_at DESC, id DESC LIMIT $limit OFFSET $offset`,
				)
				.all({
					...params,
					titleQuery: phrases.map((phrase) => `title : ${phrase}`).join(" AND "),
					taskQuery: phrases.join(" AND "),
					limit: TASK_PAGE_SIZE,
					offset: (query.page - 1) * TASK_PAGE_SIZE,
				}),
		);
		const counts = z.object({ open: z.int(), closed: z.int() }).parse(
			this.core.db
				.query(
					`SELECT count(*) FILTER (WHERE closed_at IS NULL) AS open, count(*) FILTER (WHERE closed_at IS NOT NULL) AS closed
					FROM tasks WHERE ${where}`,
				)
				.get(params),
		);
		const comments = this.findBestComments(
			rows.filter((row) => row.tier === 3).map((row) => row.id),
			wordParams,
		);
		const results = rows.map(({ tier, ...task }) => {
			const comment = comments.get(task.id);
			const found: SearchFound =
				tier === 1
					? { in: "title" }
					: tier === 2 || comment === undefined
						? { in: "body", snippet: snippet(task.body, words) }
						: { in: "comment", snippet: snippet(comment.body, words), commentId: comment.commentId, authorId: comment.authorId };
			return { task, found };
		});
		return { results, ...counts };
	}

	/** Per task, its comment that matches the most of the words, the newest of equals; `wordParams` as built by `searchTasks`. */
	private findBestComments(taskIds: number[], wordParams: Record<string, string>): Map<number, z.infer<typeof CommentHit>> {
		if (taskIds.length === 0) return new Map();
		const hits = Object.keys(wordParams)
			.map((name) => `(id IN (SELECT rowid FROM comment_search WHERE comment_search MATCH $${name}))`)
			.join(" + ");
		const rows = z.array(CommentHit).parse(
			this.core.db
				.query(
					`SELECT id AS commentId, task_id AS taskId, author_id AS authorId, body FROM comments
					WHERE task_id IN (SELECT value FROM json_each($taskIds)) AND ${hits} > 0
					ORDER BY ${hits} DESC, id DESC`,
				)
				.all({ taskIds: JSON.stringify(taskIds), ...wordParams }),
		);
		const best = new Map<number, z.infer<typeof CommentHit>>();
		for (const row of rows) if (!best.has(row.taskId)) best.set(row.taskId, row);
		return best;
	}
}
