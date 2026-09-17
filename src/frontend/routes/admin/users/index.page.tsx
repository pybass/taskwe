import { Group, Paper, Table, Text } from "@mantine/core";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/api/index.ts";
import { PageHeader } from "@/components/PageHeader.tsx";
import { SpaceName } from "@/components/SpaceName.tsx";
import { AdminSwitch } from "./-local/AdminSwitch.tsx";
import { NewUserButton } from "./-local/NewUserButton.tsx";
import { RenameUserButton } from "./-local/RenameUserButton.tsx";
import { SetPasswordButton } from "./-local/SetPasswordButton.tsx";

export const Route = createFileRoute("/_auth/_admin/admin/users")({ component: UsersPage });

/** Every user with the shared spaces they are in; the personal space is implied by the username. */
function UsersPage() {
	const users = api.cache.useUsers();
	const spaces = useSuspenseQuery(api.queries.listAllSpaces()).data;
	return (
		<>
			<PageHeader title="Users" bottomActions={<NewUserButton />} />
			<Paper withBorder>
				<Table highlightOnHover>
					<Table.Thead>
						<Table.Tr>
							<Table.Th>Username</Table.Th>
							<Table.Th>Admin</Table.Th>
							<Table.Th>Spaces</Table.Th>
							<Table.Th />
						</Table.Tr>
					</Table.Thead>
					<Table.Tbody>
						{users.map((user) => (
							<Table.Tr key={user.id}>
								<Table.Td>
									<Text span fw={500}>
										{user.username}
									</Text>
								</Table.Td>
								<Table.Td>
									<AdminSwitch user={user} />
								</Table.Td>
								<Table.Td>
									<Group gap="xs">
										{spaces.flatMap((space) => {
											const member = space.members.find((member) => member.userId === user.id);
											if (member === undefined || space.ownerId === user.id) return [];
											return (
												<Text key={space.id} span size="sm">
													<SpaceName space={space} />
													<Text span c="dimmed" size="xs">
														{" "}
														{member.role}
													</Text>
												</Text>
											);
										})}
									</Group>
								</Table.Td>
								<Table.Td>
									<Group justify="flex-end" gap="xs">
										<RenameUserButton user={user} />
										<SetPasswordButton user={user} />
									</Group>
								</Table.Td>
							</Table.Tr>
						))}
					</Table.Tbody>
				</Table>
			</Paper>
		</>
	);
}
