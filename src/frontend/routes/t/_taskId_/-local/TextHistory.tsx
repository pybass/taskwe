import { Anchor, Group, Modal, Paper, Stack, Text } from "@mantine/core";
import { useState } from "react";
import type { TaskEvent } from "#shared/event.ts";
import { Markdown } from "@/components/Markdown.tsx";
import { Username } from "@/components/Username.tsx";
import { formatShortDate } from "@/utils/format.ts";

/** One text a record had, with the event that set it. */
type Version = { eventId: number; actorId: number; at: string; body: string };

/** Every text a record had, newest first: `textOf` reads the text an event set on it, undefined for any other event. */
function versionsOf(events: TaskEvent[], textOf: (event: TaskEvent) => string | undefined): Version[] {
	return events
		.flatMap((event) => {
			const body = textOf(event);
			return body === undefined ? [] : [{ eventId: event.id, actorId: event.actorId, at: event.createdAt, body }];
		})
		.reverse();
}

/** The description's versions: the text the task was created with, then each edit's result. */
export function bodyVersions(events: TaskEvent[]): Version[] {
	return versionsOf(events, ({ changes }) =>
		changes.action === "created" ? changes.body : changes.action === "updated" ? changes.body?.to : undefined,
	);
}

/** A comment's versions: its text as written, then each edit's result; the first is its author and date. */
export function commentVersions(events: TaskEvent[], commentId: number): Version[] {
	return versionsOf(events, ({ changes }) =>
		changes.action === "updated" && changes.commentAdded?.commentId === commentId
			? changes.commentAdded.body
			: changes.action === "commentUpdated" && changes.commentId === commentId
				? changes.body.to
				: undefined,
	);
}

type Props = { versions: Version[]; title: string; text: string; emptyText: string };

/** A dimmed underlined link with `text` that opens the versions in a modal. Nothing while there is no edit. */
export function TextHistoryLink({ versions, title, text, emptyText }: Props) {
	const [opened, setOpened] = useState(false);
	if (versions.length < 2) return null;
	return (
		<>
			<Anchor component="button" type="button" inherit c="dimmed" underline="always" onClick={() => setOpened(true)}>
				{text}
			</Anchor>
			<Modal opened={opened} onClose={() => setOpened(false)} title={title} size="lg">
				<Stack gap="sm">
					{versions.map((version, index) => (
						<Paper key={version.eventId} p="sm" withBorder>
							<Group gap="sm" align="center" mb={4}>
								<Text size="sm">
									<Username userId={version.actorId} />
								</Text>
								<Text size="xs" c="dimmed">
									{index === versions.length - 1 ? "created" : "edited"} {formatShortDate(version.at)}
								</Text>
							</Group>
							{version.body === "" ? (
								<Text size="sm" c="dimmed">
									{emptyText}
								</Text>
							) : (
								<Markdown fz="sm">{version.body}</Markdown>
							)}
						</Paper>
					))}
				</Stack>
			</Modal>
		</>
	);
}
