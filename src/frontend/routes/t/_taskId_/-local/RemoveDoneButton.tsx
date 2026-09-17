import type { TaskEvent } from "#shared/event.ts";
import { DeleteButton } from "@/components/DeleteButton.tsx";
import { formatShortDate } from "@/utils/format.ts";

/** The trash icon on the line of a done the task still holds; `onRemove` gets the event that recorded it. */
export function RemoveDoneButton({ event, onRemove }: { event: TaskEvent; onRemove: (eventId: number) => void }) {
	return (
		<DeleteButton
			size="xs"
			title="Remove done"
			message={`Remove the done of ${formatShortDate(event.createdAt)}? The due date stays.`}
			onConfirm={() => onRemove(event.id)}
		/>
	);
}
