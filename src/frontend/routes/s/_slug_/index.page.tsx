import { Box, Pagination, Text } from "@mantine/core";
import { IconFilter } from "@tabler/icons-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { useState } from "react";
import { TASK_PAGE_SIZE, TaskListQuery } from "#shared/task.ts";
import { api } from "@/api/index.ts";
import { TabCount, TabLink } from "@/components/TabLink.tsx";
import { TaskRow } from "@/components/TaskRow.tsx";
import { countTaskFilters, TaskFilters } from "./-local/TaskFilters.tsx";
// The tab bar and the filter button are written here as `tab-*` classes.
import "@/components/tab-link.css";

export const Route = createFileRoute("/_auth/s/$slug/")({
	validateSearch: TaskListQuery,
	// The defaults stay out of the URL: /s/{slug} is the first page of the open tasks.
	search: { middlewares: [stripSearchParams({ status: "open", page: 1, label: [], sort: "updated" })] },
	loaderDeps: ({ search }) => search,
	// The API addresses a space by id while the URL carries its slug: the id comes from the list the auth loader cached.
	// A slug outside the list loads nothing, and the page shows not found.
	loader: async ({ context, params, deps }) => {
		const space = (await context.load(api.queries.listSpaces())).find((space) => space.slug === params.slug);
		if (space !== undefined) await context.load(api.queries.listTasks(space.id, deps));
	},
	component: SpacePage,
});

const STATUS_TABS: { value: TaskListQuery["status"]; label: string }[] = [
	{ value: "open", label: "Open" },
	{ value: "closed", label: "Closed" },
];

function SpacePage() {
	const { slug } = Route.useParams();
	const search = Route.useSearch();
	const { status, page } = search;
	// Typed from this route, so `prev` below is this page's search and not every page's: `status` means other things
	// elsewhere.
	const navigate = Route.useNavigate();
	const filterCount = countTaskFilters(search);
	// Open when the URL arrives with filters, so a shared link shows what it filters.
	const [filtersOpened, setFiltersOpened] = useState(filterCount > 0);
	const setSearch = (patch: Partial<TaskListQuery>) =>
		navigate({ to: "/s/$slug", params: { slug }, search: (prev) => ({ ...prev, page: 1, ...patch }) });
	const space = api.cache.useSpace(slug);
	const taskPage = useSuspenseQuery(api.queries.listTasks(space.id, search)).data;
	const total = taskPage[status];
	return (
		<>
			{/* One toolbar: the tabs, a rule, and the Filter toggle on one baseline. Below `sm` the toggle is an icon. */}
			<div className="list-toolbar">
				<nav className="tab-bar">
					{STATUS_TABS.map(({ value, label }) => (
						<TabLink
							key={value}
							to="/s/$slug"
							params={{ slug }}
							search={(prev) => ({ ...prev, page: 1, status: value })}
							current={status === value}
						>
							{label}
							<TabCount>{taskPage[value]}</TabCount>
						</TabLink>
					))}
					<span className="tab-bar-rule" />
					<button
						type="button"
						className="tab"
						onClick={() => setFiltersOpened((opened) => !opened)}
						data-expanded={filtersOpened ? "" : undefined}
					>
						<Box component="span" visibleFrom="sm">
							Filter
						</Box>
						<Box component="span" hiddenFrom="sm" display="flex">
							<IconFilter size={18} />
						</Box>
						{filterCount > 0 && <TabCount>{filterCount}</TabCount>}
					</button>
				</nav>
			</div>
			<TaskFilters space={space} query={search} opened={filtersOpened} onChange={setSearch} />
			{taskPage.tasks.length === 0 ? (
				<Text c="dimmed" py="md">
					{filterCount > 0 ? "Nothing matches the filter." : status === "open" ? "Nothing open here." : "Nothing closed yet."}
				</Text>
			) : (
				<div className="task-list">
					{taskPage.tasks.map((task) => (
						<TaskRow key={task.id} task={task} space={space} />
					))}
				</div>
			)}
			{/* The pager stays past the first page even when the total shrank under it, so an empty page has a way back. */}
			{(page > 1 || total > TASK_PAGE_SIZE) && (
				<Pagination
					total={Math.max(1, Math.ceil(total / TASK_PAGE_SIZE))}
					value={page}
					onChange={(value) => setSearch({ page: value })}
					mt="md"
				/>
			)}
		</>
	);
}
