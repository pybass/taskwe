import { Group, Paper, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { Label } from "#shared/label.ts";
import { api } from "@/api/index.ts";
import { DeleteButton } from "@/components/DeleteButton.tsx";
import { LabelBadge } from "@/components/LabelBadge.tsx";
import { EditLabelButton } from "./EditLabelButton.tsx";
import { NewLabelButton } from "./NewLabelButton.tsx";

type Props = {
	/** The list shown: a space's, or the global one for null. */
	spaceId: number | null;
	/** The list in its order; for a space, its own labels and the globals it does not shadow. */
	labels: Label[];
};

/**
 * One list of labels in its order with each position. An own row has edit and delete; a global row in a space's list
 * has "Override", which creates a label of the same name here. The caller owns the create button.
 */
export function LabelTable({ spaceId, labels }: Props) {
	const deleteMutation = api.mutations.useDeleteLabel();
	return (
		<Paper withBorder>
			{labels.length === 0 ? (
				<Text c="dimmed" p="md">
					No labels yet.
				</Text>
			) : (
				<Table>
					<Table.Thead>
						<Table.Tr>
							<Table.Th w={90}>Position</Table.Th>
							<Table.Th>Label</Table.Th>
							<Table.Th>Color</Table.Th>
							<Table.Th w={100} />
						</Table.Tr>
					</Table.Thead>
					<Table.Tbody>
						{labels.map((label) => (
							<Table.Tr key={label.id}>
								<Table.Td>
									<Text span size="sm" c="dimmed" ff="monospace">
										{label.position}
									</Text>
								</Table.Td>
								<Table.Td>
									<Group gap="xs" wrap="nowrap">
										<LabelBadge label={label} />
										{label.spaceId !== spaceId && (
											<Text span size="xs" c="dimmed">
												global
											</Text>
										)}
									</Group>
								</Table.Td>
								<Table.Td>
									<Text span size="sm" c="dimmed" ff="monospace">
										{label.color}
									</Text>
								</Table.Td>
								<Table.Td>
									<Group gap={4} justify="flex-end" wrap="nowrap">
										{label.spaceId !== spaceId ? (
											<NewLabelButton spaceId={spaceId} labels={labels} initial={label}>
												Override
											</NewLabelButton>
										) : (
											<>
												<EditLabelButton label={label} labels={labels} />
												<DeleteButton
													title="Delete label"
													message={`Delete the label "${label.name}"? The tasks keep the name, in grey.`}
													onConfirm={() =>
														deleteMutation.mutate(label.id, {
															onSuccess: () => notifications.show({ message: "Label deleted", color: "green" }),
															onError: (error) => notifications.show({ message: error.message, color: "red" }),
														})
													}
												/>
											</>
										)}
									</Group>
								</Table.Td>
							</Table.Tr>
						))}
					</Table.Tbody>
				</Table>
			)}
		</Paper>
	);
}
