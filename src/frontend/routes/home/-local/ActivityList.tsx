import { Text } from "@mantine/core";
import type { ActivityEntry } from "#shared/event.ts";
import type { Space } from "#shared/space.ts";
import { api } from "@/api/index.ts";
import { ChangeSentence } from "@/components/ChangeSentence.tsx";
import { CustomLink } from "@/components/CustomLink.tsx";
import { TaskLabels } from "@/components/LabelBadge.tsx";
import { Markdown } from "@/components/Markdown.tsx";
import { SpaceName } from "@/components/SpaceName.tsx";
import { TaskTitle } from "@/components/TaskTitle.tsx";
import { Username } from "@/components/Username.tsx";
import { formatShortDate } from "@/utils/format.ts";
import "./activity-list.css";

/** The first ten lines of a markdown text and whether more follow; "" for an empty text. */
function preview(text: string): { text: string; cut: boolean } {
	const lines = text.trim().split("\n");
	return { text: lines.slice(0, 10).join("\n"), cut: lines.length > 10 };
}

/** The text an event added, for the excerpt under its line: the description or the comment as written by that action. */
function addedText({ changes }: ActivityEntry["event"]): string {
	switch (changes.action) {
		case "created":
			return changes.body;
		case "updated":
			return changes.commentAdded?.body ?? changes.body?.to ?? "";
		case "commentUpdated":
			return changes.body.to;
		default:
			return "";
	}
}

type Block = { task: ActivityEntry["task"]; space: Space; entries: ActivityEntry[] };

/**
 * One task of the feed: the title line, with the number in the rail, the title with its labels and the space at the
 * right end; then one row per event with its date in the rail: the actor and what changed, and under them the text the
 * change added, quoted, its first ten lines with a note when more follow. On a phone the rail goes and the number and
 * the dates move to the right end of their lines, as in `TaskRow`.
 */
function TaskBlock({ task, space, entries }: Block) {
	return (
		<div className="activity-block">
			<div className="activity-block-head">
				<span className="activity-block-number">#{task.id}</span>
				<span className="activity-block-title">
					<CustomLink to="/t/$taskId" params={{ taskId: task.id }} inherit>
						<TaskTitle task={task} />
					</CustomLink>
					<TaskLabels space={space} labels={task.labels} inline />
				</span>
				<CustomLink
					to="/s/$slug"
					params={{ slug: space.slug }}
					size="xs"
					c="dimmed"
					underline="hover"
					className="activity-block-space"
				>
					<SpaceName space={space} />
				</CustomLink>
			</div>
			{entries.map((entry) => {
				const { text, cut } = preview(addedText(entry.event));
				return (
					<div key={entry.event.id} className="activity-block-event">
						<span className="activity-block-date">{formatShortDate(entry.event.createdAt)}</span>
						<div className="activity-block-body">
							<Username userId={entry.event.actorId} /> <ChangeSentence changes={entry.event.changes} space={space} brief />
							{text !== "" && (
								<div className="activity-block-quote">
									<Markdown fz="xs" c="dimmed" compact>
										{text}
									</Markdown>
									{cut && (
										<Text size="xs" c="dimmed">
											… the rest is on the task page
										</Text>
									)}
								</div>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

/**
 * The feed: events grouped by task, a block per task with a title line and one row per event, the date in a rail at
 * the left. The entries come newest first, so the tasks stand in the order of their newest event and each block lists
 * its rows newest first.
 */
export function ActivityList({ entries, empty }: { entries: ActivityEntry[]; empty: string }) {
	const spaces = api.cache.useSpaces();
	// Not `Map.groupBy`: iOS before 17.4 lacks it, and the bundle carries no polyfills.
	const groups = new Map<number, ActivityEntry[]>();
	for (const entry of entries) {
		const group = groups.get(entry.task.id);
		if (group === undefined) groups.set(entry.task.id, [entry]);
		else group.push(entry);
	}
	// A task of a space the cached list lacks is skipped.
	const blocks = [...groups.values()].flatMap((group): Block[] => {
		const first = group[0];
		const space = spaces.find((space) => space.id === first?.task.spaceId);
		return first === undefined || space === undefined ? [] : [{ task: first.task, space, entries: group }];
	});
	if (blocks.length === 0) return <Text c="dimmed">{empty}</Text>;
	return blocks.map((block) => <TaskBlock key={block.task.id} {...block} />);
}
