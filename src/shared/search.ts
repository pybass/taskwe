// Reference file: a text search over the tasks, its query and its answer.

import { z } from "zod";
import { Id } from "#shared/base.ts";
import { Task } from "#shared/task.ts";

/** The longest query text, in characters. */
export const SEARCH_TEXT_MAX = 200;

/**
 * The search params of a search; the values arrive as strings. `q` is split into words, runs of letters and digits,
 * the rest is ignored: there is no query syntax, so any text is safe. Every word must be found in the task, each in
 * its title, its body, or any of its comments, as the start of a word: `бассейн` finds `бассейна`. Case, the accents
 * of Latin letters, and `ё` against `е` do not count. There is no stemming: `задача` does not find `задачи`, `задач`
 * finds both. A text with no word finds nothing.
 */
export const SearchQuery = z.object({
	q: z.string().trim().max(SEARCH_TEXT_MAX).default(""),
	status: z.enum(["all", "open", "closed"]).catch("all").default("all"), // the tabs of the page; an unknown value falls back to all
	spaceId: z.coerce.number().int().optional(), // one space the caller may read; absent: every one
	page: z.coerce.number().int().min(1).default(1), // TASK_PAGE_SIZE results each, see task.ts
});
export type SearchQuery = z.infer<typeof SearchQuery>;

/** A piece of a snippet; `match` marks a word that starts with a query word. */
export const SnippetPart = z.object({ text: z.string(), match: z.boolean() });
export type SnippetPart = z.infer<typeof SnippetPart>;

/**
 * An excerpt of a text around its first word that matches, whitespace collapsed, markdown as written. It starts or
 * ends with "…" where the text goes on.
 */
export const Snippet = z.array(SnippetPart);

/**
 * Where a result was found, the best place first: `title`, every word in the title; `body`, every word in the title
 * and the body together, with the body's snippet; `comment`, the rest, with the snippet of the comment that matches
 * the most words, the newest of equals. A comment is shown at /t/{taskId}#c{commentId}.
 */
export const SearchFound = z.discriminatedUnion("in", [
	z.object({ in: z.literal("title") }),
	z.object({ in: z.literal("body"), snippet: Snippet }),
	z.object({ in: z.literal("comment"), snippet: Snippet, commentId: Id, authorId: Id }),
]);
export type SearchFound = z.infer<typeof SearchFound>;

export const SearchResult = z.object({ task: Task, found: SearchFound });
export type SearchResult = z.infer<typeof SearchResult>;

/**
 * One page of results: by where they were found, `SearchFound`, then the open before the closed, then by last update,
 * newest first. `open` and `closed` count every match of the query, whatever its `status`.
 */
export const SearchPage = z.object({ results: z.array(SearchResult), open: z.int(), closed: z.int() });
export type SearchPage = z.infer<typeof SearchPage>;
