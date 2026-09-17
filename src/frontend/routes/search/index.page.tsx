import { Flex, Pagination, Select, Text } from "@mantine/core";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { SearchQuery } from "#shared/search.ts";
import type { Space } from "#shared/space.ts";
import { TASK_PAGE_SIZE } from "#shared/task.ts";
import { api } from "@/api/index.ts";
import { SearchInput } from "@/components/SearchInput.tsx";
import { TabCount, TabLink } from "@/components/TabLink.tsx";
import { TaskRow } from "@/components/TaskRow.tsx";
import { SearchSnippet } from "./-local/SearchSnippet.tsx";
// The tab bar is written here as `tab-*` classes.
import "@/components/tab-link.css";

// The URL names a space by its slug, as everywhere; the API takes its id.
const SearchPageSearch = SearchQuery.omit({ spaceId: true }).extend({ space: z.string().optional() });
type SearchPageSearch = z.infer<typeof SearchPageSearch>;

/** The API query of the URL; a slug outside the user's spaces searches them all. */
function toQuery({ space, ...search }: SearchPageSearch, spaces: Space[]): SearchQuery {
	return { ...search, spaceId: spaces.find((candidate) => candidate.slug === space)?.id };
}

export const Route = createFileRoute("/_auth/search")({
	validateSearch: SearchPageSearch,
	// The defaults stay out of the URL: /search?q=pool is the first page of every match.
	search: { middlewares: [stripSearchParams({ q: "", status: "all", page: 1 })] },
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		if (deps.q === "") return;
		const spaces = await context.load(api.queries.listSpaces());
		await context.load(api.queries.searchTasks(toQuery(deps, spaces)));
	},
	component: SearchPage,
});

const STATUS_TABS: { value: SearchPageSearch["status"]; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "open", label: "Open" },
	{ value: "closed", label: "Closed" },
];

function SearchPage() {
	const search = Route.useSearch();
	return (
		<>
			{/* Below `md` the header's box is an icon that leads here, so the page has its own, focused while empty. */}
			<SearchInput value={search.q} autoFocus={search.q === ""} hiddenFrom="md" mb="md" />
			{search.q === "" ? (
				<Text c="dimmed" py="md">
					Type a word to search the tasks of all your spaces.
				</Text>
			) : (
				<SearchResults search={search} />
			)}
		</>
	);
}

/**
 * The tabs by status with their counts and the space filter, then the results as task rows: a row found by its body or
 * a comment shows the excerpt, and one found by a comment links to it.
 */
function SearchResults({ search }: { search: SearchPageSearch }) {
	const navigate = useNavigate();
	const spaces = api.cache.useSpaces();
	const page = useSuspenseQuery(api.queries.searchTasks(toQuery(search, spaces))).data;
	const counts = { all: page.open + page.closed, open: page.open, closed: page.closed };
	return (
		<>
			{/* The space filter goes to its own line when the tabs leave no room, as on a phone. */}
			<Flex className="list-toolbar" wrap="wrap" rowGap="xs">
				<nav className="tab-bar">
					{STATUS_TABS.map(({ value, label }) => (
						<TabLink
							key={value}
							to="/search"
							search={(prev) => ({ ...prev, page: 1, status: value })}
							current={search.status === value}
						>
							{label}
							<TabCount>{counts[value]}</TabCount>
						</TabLink>
					))}
				</nav>
				<Select
					placeholder="All spaces"
					data={spaces.map((space) => ({ value: space.slug, label: space.name }))}
					value={search.space ?? null}
					onChange={(value) => navigate({ to: "/search", search: (prev) => ({ ...prev, page: 1, space: value ?? undefined }) })}
					clearable
					w="12em"
					ml="auto"
				/>
			</Flex>
			{page.results.length === 0 ? (
				<Text c="dimmed" py="md">
					Nothing found.
				</Text>
			) : (
				<div className="task-list">
					{page.results.flatMap(({ task, found }) => {
						// A task of a space the cached list lacks is skipped.
						const space = spaces.find((space) => space.id === task.spaceId);
						if (space === undefined) return [];
						return [
							<TaskRow
								key={task.id}
								task={task}
								space={space}
								showSpace
								hash={found.in === "comment" ? `c${found.commentId}` : undefined}
							>
								{found.in === "title" ? undefined : <SearchSnippet found={found} />}
							</TaskRow>,
						];
					})}
				</div>
			)}
			{/* The pager stays past the first page even when the total shrank under it, so an empty page has a way back. */}
			{(search.page > 1 || counts[search.status] > TASK_PAGE_SIZE) && (
				<Pagination
					total={Math.max(1, Math.ceil(counts[search.status] / TASK_PAGE_SIZE))}
					value={search.page}
					onChange={(value) => navigate({ to: "/search", search: (prev) => ({ ...prev, page: value }) })}
					mt="md"
				/>
			)}
		</>
	);
}
