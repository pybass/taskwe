import { Button, Group, Paper, Select, Stack, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { createFileRoute, notFound, rootRouteId } from "@tanstack/react-router";
import { useState } from "react";
import { hasSpaceRole, SPACE_ROLES, SpaceRole } from "#shared/space.ts";
import { api } from "@/api/index.ts";
import { DeleteButton } from "@/components/DeleteButton.tsx";
import { ErrorMessage } from "@/components/ErrorMessage.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
import { Username } from "@/components/Username.tsx";
import { UserSelect } from "@/components/UserSelect.tsx";

export const Route = createFileRoute("/_auth/s/$slug/members")({
	// A manager's page: anyone else gets not found, as for a slug outside their spaces, so the URL tells them nothing.
	loader: async ({ context, params }) => {
		const space = (await context.load(api.queries.listSpaces())).find((space) => space.slug === params.slug);
		if (space === undefined || !hasSpaceRole(context.currentUser, space, "manager")) throw notFound({ routeId: rootRouteId });
	},
	// The page keeps the member list in state, so a new slug must get a new instance.
	remountDeps: ({ params }) => params.slug,
	component: SpaceMembersPage,
});

const ROLE_OPTIONS = SPACE_ROLES.map((role) => ({ value: role, label: role }));

function SpaceMembersPage() {
	const { slug } = Route.useParams();
	const space = api.cache.useSpace(slug);
	const users = api.cache.useUsers();
	const currentUser = api.cache.useCurrentUser();
	const setMembersMutation = api.mutations.useSetSpaceMembers(space.id);
	// The list is edited here and sent whole on Save.
	const [members, setMembers] = useState(space.members);
	const [newMember, setNewMember] = useState<string | null>(null);
	const [newRole, setNewRole] = useState<SpaceRole>("editor");
	const setRole = (userId: number, role: SpaceRole) =>
		setMembers(members.map((member) => (member.userId === userId ? { userId, role } : member)));
	return (
		<>
			<PageHeader title="Members" />
			<Paper withBorder p="md">
				<Stack>
					<Table>
						<Table.Thead>
							<Table.Tr>
								<Table.Th>Username</Table.Th>
								<Table.Th w={160}>Role</Table.Th>
								<Table.Th w={60} />
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{members.map(({ userId, role }) => (
								<Table.Tr key={userId}>
									<Table.Td>
										<Username userId={userId} />
										{userId === currentUser.id && (
											<Text span c="dimmed" size="sm">
												{" "}
												(you)
											</Text>
										)}
									</Table.Td>
									<Table.Td>
										<Select
											data={ROLE_OPTIONS}
											value={role}
											onChange={(value) => setRole(userId, SpaceRole.parse(value))}
											allowDeselect={false}
											size="xs"
										/>
									</Table.Td>
									<Table.Td>
										{userId !== currentUser.id && (
											<DeleteButton
												title="Remove member"
												message={`Remove "${users.find((user) => user.id === userId)?.username}" from this space?`}
												onConfirm={() => setMembers(members.filter((member) => member.userId !== userId))}
											/>
										)}
									</Table.Td>
								</Table.Tr>
							))}
						</Table.Tbody>
					</Table>
					<Group>
						<UserSelect
							placeholder="Add member"
							users={users.filter((user) => !members.some((member) => member.userId === user.id))}
							value={newMember}
							onChange={setNewMember}
							clearable
						/>
						<Select
							data={ROLE_OPTIONS}
							value={newRole}
							onChange={(value) => setNewRole(SpaceRole.parse(value))}
							allowDeselect={false}
							w={140}
						/>
						<Button
							variant="light"
							disabled={newMember === null}
							onClick={() => {
								if (newMember !== null) setMembers([...members, { userId: Number(newMember), role: newRole }]);
								setNewMember(null);
							}}
						>
							Add
						</Button>
					</Group>
					<Text size="xs" c="dimmed">
						A manager runs the space: members, roles, and labels. An editor works on tasks and comments. A viewer only reads.
					</Text>
					<ErrorMessage error={setMembersMutation.error} />
					<Group justify="flex-end">
						<Button
							loading={setMembersMutation.isPending}
							onClick={() =>
								setMembersMutation.mutate(
									{ members },
									{ onSuccess: () => notifications.show({ message: "Members saved", color: "green" }) },
								)
							}
						>
							Save
						</Button>
					</Group>
				</Stack>
			</Paper>
		</>
	);
}
