import { Button, Group, Paper, Select, Stack, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { hasSpaceRole, SPACE_ROLES, SpaceRole } from "#shared/space.ts";
import { api } from "@/api/index.ts";
import { CustomLink } from "@/components/CustomLink.tsx";
import { DeleteButton } from "@/components/DeleteButton.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
import { Username } from "@/components/Username.tsx";

export const Route = createFileRoute("/_auth/_admin/admin/spaces")({ component: SpacesPage });

/** The picker's value for a space the admin is not in; a real role is its own name. */
const NONE = "none";
const ROLE_OPTIONS = [{ value: NONE, label: "not a member" }, ...SPACE_ROLES.map((role) => ({ value: role, label: role }))];

/**
 * The admin's own role in one shared space, `role` null when not a member: a picker and "Save", which is enabled only
 * while the pick differs from what is saved, so an untouched row cannot be mistaken for a pending one. A save keeps
 * the picker on the new role.
 */
function OwnRoleForm({ spaceId, role }: { spaceId: number; role: SpaceRole | null }) {
	const saved = role ?? NONE;
	const [picked, setPicked] = useState(saved);
	const mutation = api.mutations.useSetOwnSpaceRole(spaceId);
	return (
		<Group gap="xs" wrap="nowrap">
			<Select
				data={ROLE_OPTIONS}
				value={picked}
				onChange={(value) => setPicked(value ?? NONE)}
				allowDeselect={false}
				size="xs"
				w="10em"
			/>
			<Button
				size="xs"
				variant="light"
				disabled={picked === saved}
				loading={mutation.isPending}
				onClick={() =>
					mutation.mutate(
						{ role: picked === NONE ? null : SpaceRole.parse(picked) },
						{
							onSuccess: () => notifications.show({ message: "Role saved", color: "green" }),
							onError: (error) => notifications.show({ message: error.message, color: "red" }),
						},
					)
				}
			>
				Save
			</Button>
		</Group>
	);
}

/**
 * Every shared space with its roster and open task count, the facts behind the two admin actions: a form for the
 * admin's own role there, the one way into a space without an invitation and the one way out or down without asking
 * its manager, and delete. Personal spaces are not listed: an admin can do nothing with them, and the users page
 * already implies one per user.
 */
function SpacesPage() {
	const currentUser = api.cache.useCurrentUser();
	const spaces = useSuspenseQuery(api.queries.listAllSpaces()).data;
	const counts = new Map(useSuspenseQuery(api.queries.listAllTaskCounts()).data.map((entry) => [entry.spaceId, entry.open]));
	const deleteMutation = api.mutations.useDeleteSpace();
	const shared = spaces.filter((space) => space.ownerId === null);
	return (
		<>
			<PageHeader title="Spaces" />
			<Paper withBorder>
				{shared.length === 0 ? (
					<Text c="dimmed" p="md">
						No shared spaces yet.
					</Text>
				) : (
					<Table highlightOnHover>
						<Table.Thead>
							<Table.Tr>
								<Table.Th style={{ whiteSpace: "nowrap" }}>Name</Table.Th>
								<Table.Th>Members</Table.Th>
								<Table.Th w={120} style={{ whiteSpace: "nowrap" }}>
									Open tasks
								</Table.Th>
								<Table.Th style={{ whiteSpace: "nowrap" }}>My role</Table.Th>
								{/* 1px with no wrapping: the column takes its content's width, so the button sits at the right edge. */}
								<Table.Th w={1} />
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{shared.map((space) => (
								<Table.Tr key={space.id}>
									<Table.Td style={{ whiteSpace: "nowrap" }}>
										{hasSpaceRole(currentUser, space, "viewer") ? (
											<CustomLink
												to="/s/$slug"
												params={{ slug: space.slug }}
												fw={500}
												underline="hover"
												c="var(--mantine-color-text)"
											>
												{space.name}
											</CustomLink>
										) : (
											<Text span fw={500}>
												{space.name}
											</Text>
										)}
										{space.slug !== space.name && (
											<Text size="xs" c="dimmed">
												{space.slug}
											</Text>
										)}
									</Table.Td>
									<Table.Td>
										<Stack gap={2}>
											{[...space.members]
												.sort((a, b) => SPACE_ROLES.indexOf(b.role) - SPACE_ROLES.indexOf(a.role))
												.map(({ userId, role }) => (
													<Text key={userId} size="sm">
														<Username userId={userId} />
														<Text span c="dimmed" size="xs">
															{" "}
															{role}
														</Text>
													</Text>
												))}
										</Stack>
									</Table.Td>
									<Table.Td>{counts.get(space.id) ?? 0}</Table.Td>
									<Table.Td>
										<OwnRoleForm
											spaceId={space.id}
											role={space.members.find((member) => member.userId === currentUser.id)?.role ?? null}
										/>
									</Table.Td>
									<Table.Td pl="xl">
										<DeleteButton
											label="Delete space"
											size="xs"
											title="Delete space"
											message={`Delete space "${space.name}" with its tasks?`}
											onConfirm={() =>
												deleteMutation.mutate(space.id, {
													onSuccess: () => notifications.show({ message: "Space deleted", color: "green" }),
													onError: (error) => notifications.show({ message: error.message, color: "red" }),
												})
											}
										/>
									</Table.Td>
								</Table.Tr>
							))}
						</Table.Tbody>
					</Table>
				)}
			</Paper>
		</>
	);
}
