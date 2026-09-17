import { Anchor, Collapse, Flex, Select } from "@mantine/core";
import type { Space } from "#shared/space.ts";
import { defaultTaskOrder, type TaskListQuery, type TaskSort } from "#shared/task.ts";
import { api } from "@/api/index.ts";
import { LabelMultiSelect } from "@/components/LabelMultiSelect.tsx";
import { UserSelect } from "@/components/UserSelect.tsx";

/** How many settings of the query differ from the default: the figure on the Filter button. View and page do not count. */
export function countTaskFilters(query: TaskListQuery): number {
	return [
		query.authorId !== undefined,
		query.assigneeId !== undefined,
		query.label.length > 0,
		query.sort !== "updated" || (query.order !== undefined && query.order !== defaultTaskOrder(query.sort)),
	].filter(Boolean).length;
}

// The sort control's entries: a sort and an order as one choice, the default order of each sort first.
const SORTS: { value: string; label: string; sort: TaskSort; order: "asc" | "desc" }[] = [
	{ value: "updated-desc", label: "Last update, newest first", sort: "updated", order: "desc" },
	{ value: "updated-asc", label: "Last update, oldest first", sort: "updated", order: "asc" },
	{ value: "created-desc", label: "Created, newest first", sort: "created", order: "desc" },
	{ value: "created-asc", label: "Created, oldest first", sort: "created", order: "asc" },
	{ value: "due-asc", label: "Due date, soonest first", sort: "due", order: "asc" },
	{ value: "due-desc", label: "Due date, latest first", sort: "due", order: "desc" },
];

/**
 * The panel under the toolbar: one control per filter, one for the sort and its order, each writing the URL on change,
 * and a Clear link. A personal space has one assignee, so it gets no assignee control.
 */
export function TaskFilters({
	space,
	query,
	opened,
	onChange,
}: {
	space: Space;
	query: TaskListQuery;
	opened: boolean;
	onChange: (patch: Partial<TaskListQuery>) => void;
}) {
	const users = api.cache.useUsers();
	const currentUser = api.cache.useCurrentUser();
	const labels = api.cache.useSpaceLabels(space).map((label) => label.name);
	const members = users.filter((user) => space.members.some((member) => member.userId === user.id));
	return (
		<Collapse expanded={opened}>
			{/* One row from `sm`: the filters left, the sort at the right end, apart from them. Below, a column of full-width controls. */}
			<Flex direction={{ base: "column", sm: "row" }} align={{ sm: "center" }} wrap="nowrap" gap="sm" mb="xl">
				<UserSelect
					placeholder="Any author"
					users={members}
					value={query.authorId === undefined ? null : String(query.authorId)}
					onChange={(value) => onChange({ authorId: value === null ? undefined : Number(value) })}
					clearable
					w={{ base: "100%", sm: "10em" }}
				/>
				{space.ownerId === null && (
					// The caller comes first as "Me", the way to their own tasks of the space, so the list has them once.
					<UserSelect
						placeholder="Any assignee"
						before={[
							{ value: String(currentUser.id), label: "Me" },
							{ value: "none", label: "Unassigned" },
						]}
						users={members.filter((user) => user.id !== currentUser.id)}
						value={query.assigneeId === undefined ? null : String(query.assigneeId)}
						onChange={(value) => onChange({ assigneeId: value === null ? undefined : value === "none" ? "none" : Number(value) })}
						clearable
						w={{ base: "100%", sm: "10em" }}
					/>
				)}
				{labels.length > 0 && (
					<LabelMultiSelect
						placeholder={query.label.length === 0 ? "Any labels" : undefined}
						space={space}
						names={labels}
						value={query.label}
						onChange={(values) => onChange({ label: values })}
						clearable
						w={{ base: "100%", sm: "12em" }}
					/>
				)}
				<Select
					data={SORTS}
					value={`${query.sort}-${query.order ?? defaultTaskOrder(query.sort)}`}
					onChange={(value) => {
						const entry = SORTS.find((sort) => sort.value === value);
						// The default order stays out of the URL.
						if (entry !== undefined)
							onChange({ sort: entry.sort, order: entry.order === defaultTaskOrder(entry.sort) ? undefined : entry.order });
					}}
					allowDeselect={false}
					w={{ base: "100%", sm: "14em" }}
					ml={{ sm: "auto" }}
				/>
				{countTaskFilters(query) > 0 && (
					<Anchor
						component="button"
						type="button"
						size="sm"
						onClick={() => onChange({ authorId: undefined, assigneeId: undefined, label: [], sort: "updated", order: undefined })}
					>
						Clear
					</Anchor>
				)}
			</Flex>
		</Collapse>
	);
}
