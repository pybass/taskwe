import { Text } from "@mantine/core";
import { IconCalendar, IconRepeat } from "@tabler/icons-react";
import { type DueUrgency, formatShortDay } from "@/utils/format.ts";

// The mark's color per urgency; "later" and no urgency keep the text color, with the icon dimmed.
const COLORS: Record<DueUrgency, string | undefined> = { overdue: "red.8", soon: "yellow.9", later: undefined };

/**
 * A small calendar icon, or the repeat icon with `repeats`, then the day at list size in medium weight: the mark of a
 * due date, built like `Username` so the marks match in a sentence. With `urgency` the whole mark takes a color: red
 * when overdue, amber when soon. The caller decides, because a past day in an activity sentence is history, not a
 * warning. The mark is plain inline text that never wraps inside, so a comma after it stays on its line.
 */
export function DueDate({ day, repeats = false, urgency }: { day: string; repeats?: boolean; urgency?: DueUrgency }) {
	const Icon = repeats ? IconRepeat : IconCalendar;
	const color = urgency === undefined ? undefined : COLORS[urgency];
	return (
		<Text span inherit fw={500} c={color} style={{ whiteSpace: "nowrap" }}>
			<Icon
				size="1.1em"
				stroke={2}
				style={{
					verticalAlign: "-0.2em",
					marginRight: "0.05em",
					color: color === undefined ? "var(--mantine-color-dimmed)" : undefined,
				}}
			/>
			{formatShortDay(day)}
		</Text>
	);
}
