import { Mark, Text } from "@mantine/core";
import { IconMessage } from "@tabler/icons-react";
import { Fragment } from "react";
import type { SearchFound } from "#shared/search.ts";
import { Username } from "@/components/Username.tsx";

/** The excerpt under a result, at most two lines, the matching words marked; a comment's starts with its author. */
export function SearchSnippet({ found }: { found: Exclude<SearchFound, { in: "title" }> }) {
	// A part's offset in the excerpt is its key: the same text may occur twice.
	let offset = 0;
	return (
		<Text component="span" size="xs" c="dimmed" lineClamp={2} mt={4}>
			{found.in === "comment" && (
				<>
					<IconMessage size="1em" style={{ verticalAlign: "-0.125em" }} /> <Username userId={found.authorId} />:{" "}
				</>
			)}
			{found.snippet.map((part) => {
				const key = offset;
				offset += part.text.length;
				return part.match ? <Mark key={key}>{part.text}</Mark> : <Fragment key={key}>{part.text}</Fragment>;
			})}
		</Text>
	);
}
