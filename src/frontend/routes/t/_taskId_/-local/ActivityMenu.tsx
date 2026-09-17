import { ActionIcon, Menu } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { IconArrowsSort, IconDots, IconHistory } from "@tabler/icons-react";
import { z } from "zod";
import type { TaskEvent } from "#shared/event.ts";

export const Order = z.enum(["oldest", "newest"]);
export type Order = z.infer<typeof Order>;

/** The activity's order, a reading habit kept in the browser. A stored value that is not one of the enum falls back. */
export function useActivityOrder() {
	return useLocalStorage<Order>({
		key: "activity-order",
		defaultValue: "newest",
		getInitialValueInEffect: false,
		serialize: (value) => value,
		deserialize: (value) => Order.catch("newest").parse(value),
	});
}

/** Whether the event is a comment: the events with one make the activity's default view; any other is a change. */
export function isComment(event: TaskEvent): boolean {
	return event.changes.action === "updated" && event.changes.commentAdded !== undefined;
}

type Props = {
	events: TaskEvent[];
	order: Order;
	onOrder: (value: Order) => void;
	showChanges: boolean;
	onShowChanges: (value: boolean) => void;
};

/**
 * A dots menu that sorts and filters the task's activity, at the end of the folded form's line: it is rare enough to
 * cost no row of its own. The filter item says how many changes the default view hides.
 */
export function ActivityMenu({ events, order, onOrder, showChanges, onShowChanges }: Props) {
	const changes = events.filter((event) => !isComment(event)).length;
	return (
		<Menu position="bottom-end">
			<Menu.Target>
				<ActionIcon variant="subtle" color="gray" size="input-sm">
					<IconDots size={16} />
				</ActionIcon>
			</Menu.Target>
			<Menu.Dropdown>
				<Menu.Item leftSection={<IconArrowsSort size={14} />} onClick={() => onOrder(order === "newest" ? "oldest" : "newest")}>
					{order === "newest" ? "Oldest first" : "Newest first"}
				</Menu.Item>
				<Menu.Item leftSection={<IconHistory size={14} />} onClick={() => onShowChanges(!showChanges)}>
					{showChanges ? "Hide changes" : `Show ${changes} ${changes === 1 ? "change" : "changes"}`}
				</Menu.Item>
			</Menu.Dropdown>
		</Menu>
	);
}
