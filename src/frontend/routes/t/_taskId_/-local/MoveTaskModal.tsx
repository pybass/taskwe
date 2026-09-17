import { Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { hasSpaceRole, type Space } from "#shared/space.ts";
import type { Task } from "#shared/task.ts";
import { api } from "@/api/index.ts";
import { ErrorMessage } from "@/components/ErrorMessage.tsx";
import { NotifyUsersPicker } from "@/components/NotifyUsersPicker.tsx";

type Props = { task: Task; space: Space; opened: boolean; onClose: () => void };

/**
 * Picks the target among the other spaces the user edits and moves at once: a move is not part of the update patch.
 * The task keeps its id and its URL, so the page stays and shows the task in its new space. The notify picker shows
 * the target's members; the assignee is ticked when they stay a member.
 */
export function MoveTaskModal({ task, space, opened, onClose }: Props) {
	const spaces = api.cache.useSpaces();
	const currentUser = api.cache.useCurrentUser();
	const moveMutation = api.mutations.useMoveTask(task);
	const [targetSlug, setTargetSlug] = useState<string | null>(null);
	const [notifyUserIds, setNotifyUserIds] = useState<number[]>([]);
	// Already by name: `listSpaces` sorts.
	const targets = spaces.filter((other) => other.id !== space.id && hasSpaceRole(currentUser, other, "editor"));
	const target = targets.find((other) => other.slug === targetSlug);
	return (
		<Modal opened={opened} onClose={onClose} title="Move task">
			<Stack>
				<Select
					label="To space"
					placeholder="Pick a space"
					data={targets.map((other) => ({ value: other.slug, label: other.name }))}
					value={targetSlug}
					onChange={(slug) => {
						setTargetSlug(slug);
						const next = targets.find((other) => other.slug === slug);
						const keepsAssignee = next?.members.some((member) => member.userId === task.assigneeId) ?? false;
						setNotifyUserIds(
							task.assigneeId !== null && task.assigneeId !== currentUser.id && keepsAssignee ? [task.assigneeId] : [],
						);
					}}
					searchable
				/>
				<Text size="sm" c="dimmed">
					The whole history goes with it: every comment and every earlier version of the text become readable by the members of
					that space. The labels go with it; a name that space does not list shows in grey.
				</Text>
				{target !== undefined && <NotifyUsersPicker space={target} value={notifyUserIds} onChange={setNotifyUserIds} />}
				<ErrorMessage error={moveMutation.error} />
				<Group justify="flex-end">
					<Button
						disabled={target === undefined}
						loading={moveMutation.isPending}
						onClick={() => {
							if (target === undefined) return;
							moveMutation.mutate(
								{ targetSlug: target.slug, notifyUserIds },
								{
									onSuccess: () => {
										notifications.show({ message: `Task moved to ${target.name}`, color: "green" });
										onClose();
									},
								},
							);
						}}
					>
						Move
					</Button>
				</Group>
			</Stack>
		</Modal>
	);
}
