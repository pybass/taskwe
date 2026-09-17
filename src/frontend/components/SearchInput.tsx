import { Box, type BoxProps, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { SEARCH_TEXT_MAX } from "#shared/search.ts";

/**
 * The search box. Enter opens the results for its text, or the task for a number alone, `42` or `#42`; a new search
 * starts with no filters. It starts from `value`, the text of the results shown, and resets when that changes.
 */
export function SearchInput({ value, autoFocus, ...props }: { value: string; autoFocus?: boolean } & BoxProps) {
	const navigate = useNavigate();
	return (
		<Box
			component="form"
			onSubmit={(event) => {
				event.preventDefault();
				const q = String(new FormData(event.currentTarget).get("q") ?? "").trim();
				const taskId = /^#?(\d+)$/.exec(q)?.[1];
				if (taskId !== undefined) navigate({ to: "/t/$taskId", params: { taskId: Number(taskId) } });
				else if (q !== "") navigate({ to: "/search", search: { q } });
			}}
			{...props}
		>
			<TextInput
				key={value}
				name="q"
				type="search"
				enterKeyHint="search"
				defaultValue={value}
				placeholder="Search"
				maxLength={SEARCH_TEXT_MAX}
				leftSection={<IconSearch size={16} />}
				autoFocus={autoFocus}
			/>
		</Box>
	);
}
