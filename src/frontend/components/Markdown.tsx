import { Text, Typography, type TypographyProps } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Link as LinkNode, Parent, RootContent, Text as TextNode } from "mdast";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { api } from "@/api/index.ts";
import { TaskTitle } from "./TaskTitle.tsx";
import "./markdown.css";

// A mention in running text: `#42`, or the `/t/42` path pasted alone, with the `#c17` of a comment link if any. Not
// inside a word, a number, or a longer path, so `abc#42`, `#421a`, and `/x/t/42` stay text.
const MENTION = /(?<![\p{L}\p{N}_/])(?:#|\/t\/)(\d+)(#c\d+)?(?![\p{L}\p{N}_/])/gu;

/** Turns each mention in a text node into a link to /t/{id} whose text is the mention as written. */
function splitMentions(node: TextNode): (TextNode | LinkNode)[] {
	const parts: (TextNode | LinkNode)[] = [];
	let last = 0;
	for (const match of node.value.matchAll(MENTION)) {
		if (match.index > last) parts.push({ type: "text", value: node.value.slice(last, match.index) });
		parts.push({ type: "link", url: `/t/${match[1]}${match[2] ?? ""}`, children: [{ type: "text", value: match[0] }] });
		last = match.index + match[0].length;
	}
	if (parts.length === 0) return [node];
	if (last < node.value.length) parts.push({ type: "text", value: node.value.slice(last) });
	return parts;
}

/** Walks the tree; a link's own text and the code nodes, which are not text nodes, are left as they are. */
function linkMentions(parent: Parent): void {
	parent.children = parent.children.flatMap((node): RootContent[] => {
		if (node.type === "text") return splitMentions(node);
		if (node.type !== "link" && "children" in node) linkMentions(node);
		return [node];
	});
}

/** A remark plugin: `#42` and `/t/42` in the text become links to the task, see `TaskMentionLink`. */
function remarkTaskMentions() {
	return linkMentions;
}

/** The task id in a link to /t/{id} on this site, with the hash it carries, or null for any other link. */
function parseTaskLink(href: string): { taskId: number; hash?: string } | null {
	if (!URL.canParse(href, window.location.origin)) return null;
	const url = new URL(href, window.location.origin);
	const match = url.origin === window.location.origin ? /^\/t\/(\d+)$/.exec(url.pathname) : null;
	if (match === null || match[1] === undefined) return null;
	return { taskId: Number(match[1]), hash: url.hash === "" ? undefined : url.hash.slice(1) };
}

/**
 * A link to a task, in the router. With `children`, the author's own words for it, they are the link. Without, the
 * mention stands alone and shows the number with the task's title; a task the reader may not read, a number no task
 * has, and a deleted task all show as unavailable, one answer so the mention tells a stranger nothing.
 */
function TaskMentionLink({ taskId, hash, children }: { taskId: number; hash?: string; children?: ReactNode }) {
	const mention = useQuery({ ...api.queries.getTaskMention(taskId), enabled: children === undefined });
	if (mention.data === null) {
		return (
			<Text span inherit c="dimmed">
				#{taskId} (unavailable)
			</Text>
		);
	}
	return (
		<Link to="/t/$taskId" params={{ taskId }} hash={hash}>
			{children ?? (
				<>
					#{taskId}
					{mention.data !== undefined && (
						<>
							{" "}
							<TaskTitle task={mention.data} />
						</>
					)}
				</>
			)}
		</Link>
	);
}

/**
 * A task body or a comment, rendered as GitHub-flavored markdown in Mantine's typography. One new line is a line
 * break, as in a GitHub comment. Raw HTML in the text is shown as text, and a task-list checkbox is read-only: the
 * source is the only way to edit. A link to a task on this site, `#42`, `/t/42`, or its full URL pasted, opens the
 * task in the app and, when it is the whole text of the link, shows the task's title; any other link opens in a new
 * tab. `compact` tightens the paragraphs and lists, for an excerpt quoted in a feed.
 */
export function Markdown({
	children,
	compact = false,
	...props
}: { children: string; compact?: boolean } & Omit<TypographyProps, "children">) {
	return (
		<Typography className={compact ? "markdown-compact" : undefined} {...props}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkBreaks, remarkTaskMentions]}
				components={{
					a: ({ node: _node, href, children, ...anchor }) => {
						const task = href === undefined ? null : parseTaskLink(href);
						if (task === null)
							return (
								<a {...anchor} href={href} target="_blank" rel="noopener noreferrer">
									{children}
								</a>
							);
						// The mention as written, `#42` or the URL itself, is not the author's text: the title replaces it.
						const own = children !== `#${task.taskId}` && children !== href;
						return <TaskMentionLink {...task}>{own ? children : undefined}</TaskMentionLink>;
					},
				}}
			>
				{children}
			</ReactMarkdown>
		</Typography>
	);
}
