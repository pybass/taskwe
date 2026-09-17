import { ActionIcon, Box, Divider, Group, Menu, Text, UnstyledButton, useMatches } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import {
	IconChevronDown,
	IconDatabase,
	IconFolder,
	IconFolders,
	IconKey,
	IconLogout,
	IconPlus,
	IconSearch,
	IconTag,
	IconTrash,
	IconUser,
	IconUsers,
} from "@tabler/icons-react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams, useSearch } from "@tanstack/react-router";
import { hasSpaceRole, type Space } from "#shared/space.ts";
import type { User } from "#shared/user.ts";
import { api } from "@/api/index.ts";
import { CustomLink } from "@/components/CustomLink.tsx";
import { LinkActionIcon } from "@/components/LinkActionIcon.tsx";
import { LinkButton } from "@/components/LinkButton.tsx";
import { SearchInput } from "@/components/SearchInput.tsx";
import { SpaceName } from "@/components/SpaceName.tsx";
import { Username } from "@/components/Username.tsx";
import "./header.css";

/** The header's icon buttons are 34px below `sm` for the thumb, 28px from there. Read synchronously, so desktop never flashes the large size. */
function useHeaderIconSize() {
	return useMatches({ base: "lg", sm: "md" }, { getInitialValueInEffect: false });
}

/**
 * The current space as a link to its list, or "Select a space" ("Spaces" on a phone) when the page has none, and a
 * chevron that opens the list of the user's spaces: the personal one first, then the shared ones by name, each with
 * its open tasks for the user over all its open tasks, then "New space", then under the space's name its settings for
 * its managers: Members, and Labels. A personal space has one fixed member, so it gets no Members entry. The name
 * stays a link because a task page has no other way back to its list.
 */
function SpaceSwitcher({ user, space }: { user: User; space: Space | undefined }) {
	const mySpaces = [...api.cache.useSpaces()].sort((a, b) => Number(b.ownerId === user.id) - Number(a.ownerId === user.id));
	const counts = new Map(useSuspenseQuery(api.queries.listTaskCounts()).data.map((entry) => [entry.spaceId, entry]));
	const iconSize = useHeaderIconSize();
	// The dropdown hangs from the chevron; shifted left by the name it starts under the picker's left edge instead.
	const name = useElementSize();
	const chevron = <IconChevronDown size={16} />;
	return (
		<Group gap={0} wrap="nowrap" miw={0}>
			<Menu position="bottom-start" width={260} offset={{ mainAxis: 8, crossAxis: space === undefined ? 0 : -name.width }}>
				{space === undefined ? (
					// With no space to link, the text opens the menu too: one button of the text and the chevron.
					<Menu.Target>
						<UnstyledButton miw={0}>
							<Group gap={0} wrap="nowrap">
								{/* Short on a phone, and truncated rather than pushed under the buttons beside it by a large font. */}
								<Text c="dimmed" px="xs" truncate>
									<Box component="span" visibleFrom="sm">
										Select a space
									</Box>
									<Box component="span" hiddenFrom="sm">
										Spaces
									</Box>
								</Text>
								<ActionIcon component="span" variant="subtle" color="gray" size={iconSize}>
									{chevron}
								</ActionIcon>
							</Group>
						</UnstyledButton>
					</Menu.Target>
				) : (
					<>
						<Text component="div" ref={name.ref} px="xs" miw={0} truncate>
							<CustomLink to="/s/$slug" params={{ slug: space.slug }} fw={500} underline="hover" c="var(--mantine-color-text)">
								<SpaceName space={space} />
							</CustomLink>
						</Text>
						<Menu.Target>
							<ActionIcon variant="subtle" color="gray" size={iconSize}>
								{chevron}
							</ActionIcon>
						</Menu.Target>
					</>
				)}
				<Menu.Dropdown>
					{mySpaces.map((candidate) => {
						const { open, mine } = counts.get(candidate.id) ?? { open: 0, mine: 0 };
						return (
							<Menu.Item
								key={candidate.id}
								renderRoot={(props) => <Link to="/s/$slug" params={{ slug: candidate.slug }} {...props} />}
								leftSection={<IconFolder size={16} />}
								rightSection={
									<Text span size="xs" c="dimmed" ml="md" style={{ whiteSpace: "nowrap" }}>
										{mine} / {open}
									</Text>
								}
								// The label section is flex: 1 with the default min-width, so without this a long name cannot shrink.
								styles={{ itemLabel: { minWidth: 0 } }}
							>
								<Group gap="sm" wrap="nowrap">
									<Text size="sm" fw={candidate.id === space?.id ? 600 : undefined} truncate>
										{candidate.name}
									</Text>
									{candidate.ownerId === user.id && (
										<Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
											personal
										</Text>
									)}
								</Group>
							</Menu.Item>
						);
					})}
					<Menu.Divider />
					<Menu.Item component={Link} to="/spaces/new" leftSection={<IconPlus size={16} />}>
						New space
					</Menu.Item>
					{space !== undefined && hasSpaceRole(user, space, "manager") && (
						<>
							<Menu.Divider />
							<Menu.Label>
								<Text component="div" inherit truncate>
									<SpaceName space={space} />
								</Text>
							</Menu.Label>
							{space.ownerId === null && (
								<Menu.Item
									renderRoot={(props) => <Link to="/s/$slug/members" params={{ slug: space.slug }} {...props} />}
									leftSection={<IconUsers size={16} />}
								>
									Members
								</Menu.Item>
							)}
							<Menu.Item
								renderRoot={(props) => <Link to="/s/$slug/labels" params={{ slug: space.slug }} {...props} />}
								leftSection={<IconTag size={16} />}
							>
								Labels
							</Menu.Item>
						</>
					)}
				</Menu.Dropdown>
			</Menu>
		</Group>
	);
}

/**
 * The primary action of the app, on every page. The form presets the page's space when the user edits it. From `sm`
 * a pill in the header, a pine tint, not a filled block: the logo tile stays the only solid green in the header, and
 * the pill sits at the header's icon-button height instead of towering over it. Below `sm` the header has no room
 * for it, so it is a filled round button floating in the bottom right corner, in reach of the thumb; the new task
 * page itself has none there.
 */
function NewTaskButton({ user, space }: { user: User; space: Space | undefined }) {
	const search = space !== undefined && hasSpaceRole(user, space, "editor") ? { space: space.slug } : {};
	const onNewTaskPage = useLocation({ select: (location) => location.pathname === "/t/new" });
	return (
		<>
			<LinkButton
				to="/t/new"
				search={search}
				variant="light"
				radius="xl"
				size="sm"
				leftSection={<IconPlus size={16} stroke={2.5} />}
				visibleFrom="sm"
			>
				New task
			</LinkButton>
			{!onNewTaskPage && (
				// 56px: the size a phone's floating action button has everywhere else.
				<LinkActionIcon to="/t/new" search={search} radius="xl" size={56} hiddenFrom="sm" className="header-fab">
					<IconPlus size={26} stroke={2.5} />
				</LinkActionIcon>
			)}
		</>
	);
}

/** The admin pages, one menu item each: the admin switcher's list and the admin part of the user menu. */
function AdminMenuItems() {
	return (
		<>
			<Menu.Item component={Link} to="/admin/users" leftSection={<IconUsers size={16} />}>
				Users
			</Menu.Item>
			<Menu.Item component={Link} to="/admin/spaces" leftSection={<IconFolders size={16} />}>
				Spaces
			</Menu.Item>
			<Menu.Item component={Link} to="/admin/labels" leftSection={<IconTag size={16} />}>
				Labels
			</Menu.Item>
			<Menu.Item component={Link} to="/admin/tasks/delete" leftSection={<IconTrash size={16} />}>
				Delete task
			</Menu.Item>
			<Menu.Item component={Link} to="/admin/backups" leftSection={<IconDatabase size={16} />}>
				Backups
			</Menu.Item>
		</>
	);
}

/** The admin section's counterpart of the space switcher: "Admin" where the space name goes, and a menu of its pages. */
function AdminSwitcher() {
	const iconSize = useHeaderIconSize();
	return (
		<Group gap={0} wrap="nowrap">
			<Text fw={500} px="xs" style={{ whiteSpace: "nowrap" }}>
				Admin
			</Text>
			<Menu position="bottom-start" width={200}>
				<Menu.Target>
					<ActionIcon variant="subtle" color="gray" size={iconSize}>
						<IconChevronDown size={16} />
					</ActionIcon>
				</Menu.Target>
				<Menu.Dropdown>
					<AdminMenuItems />
				</Menu.Dropdown>
			</Menu>
		</Group>
	);
}

/** The mark's check on its green tile; the wordmark's `currentColor` comes from the link. */
function LogoMark() {
	return (
		<>
			<rect width="32" height="32" rx="9" fill="var(--mantine-primary-color-filled)" />
			<path
				d="m8 16 5.5 5.5L24 11"
				stroke="var(--mantine-color-white)"
				strokeWidth="3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path d="M8 10h7" stroke="var(--mantine-color-white)" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" />
		</>
	);
}

/** The only link home: the mark alone below `sm`, the mark with the wordmark from there. */
function Logo() {
	return (
		<CustomLink to="/" display="flex" style={{ flexShrink: 0 }}>
			<Box component="svg" hiddenFrom="sm" width="32" height="32" viewBox="0 0 32 32" fill="none">
				<LogoMark />
			</Box>
			<Box component="svg" visibleFrom="sm" width="144" height="32" viewBox="0 0 144 32" fill="none">
				<LogoMark />
				<g stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
					<path d="M46 8v13q0 4 5 3M42 13h10" />
					<path d="M68 13v11m0-5.5a5.5 5.5 0 1 0-11 0 5.5 5.5 0 1 0 11 0" />
					<path d="M83 14q-2-2-5-1t-3 3q0 2 4 2.5t4 3q-1 4-9 1.5" />
					<path d="M90 7v17m9-11-9 7m4-3 6 7" />
					<path d="m105 13 3.5 11 4.5-9 4.5 9 3.5-11" />
					<path d="M127 18h12q0-5-5.5-5t-6 5.5q0 5.5 6 5.5 3 0 5-2" />
				</g>
			</Box>
		</CustomLink>
	);
}

/**
 * The logo, the space switcher (or the admin switcher on admin pages), "New task", then the search box and the user
 * menu. Below `sm` the separator goes, New task floats over the page, and the user menu opens from a user icon, with
 * the username as the menu's first label. Below `md` the search box is an icon that opens the search page, which has
 * its own box there.
 */
export function Header({ user }: { user: User }) {
	const logoutMutation = api.mutations.useLogout();
	// Every route under a space carries `slug`. A task page carries `taskId` instead, and its loader cached the task, so
	// the space comes from there. Elsewhere both are absent and the switcher shows no space.
	const { slug, taskId } = useParams({ strict: false });
	const task = useQuery({ ...api.queries.getTask(taskId ?? 0), enabled: taskId !== undefined }).data;
	const space = api.cache.useSpaces().find((space) => (taskId === undefined ? space.slug === slug : space.id === task?.spaceId));
	const inAdmin = useLocation({ select: (location) => location.pathname.startsWith("/admin") });
	// On the search page the box keeps the text searched.
	const { q: searchText } = useSearch({ strict: false });
	const iconSize = useHeaderIconSize();
	return (
		<header>
			<Group justify="space-between" py="sm" wrap="nowrap">
				<Group gap="sm" wrap="nowrap" miw={0}>
					<Logo />
					<Text c="dimmed" fw={300} fz="lg" visibleFrom="sm">
						/
					</Text>
					{inAdmin ? <AdminSwitcher /> : <SpaceSwitcher user={user} space={space} />}
					<NewTaskButton user={user} space={space} />
				</Group>
				<Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
					<SearchInput value={searchText ?? ""} visibleFrom="md" w="14em" />
					<LinkActionIcon to="/search" variant="subtle" color="gray" size={iconSize} hiddenFrom="md">
						<IconSearch size={18} />
					</LinkActionIcon>
					<Menu>
						<Menu.Target>
							<UnstyledButton style={{ flexShrink: 0 }}>
								<Group gap="xs" wrap="nowrap" mih={34}>
									<Text fw={500} visibleFrom="sm">
										<Username userId={user.id} />
									</Text>
									<Box visibleFrom="sm" display="flex">
										<IconChevronDown size={16} />
									</Box>
									{/* A twin of the search icon beside it: the app has no avatars to show. */}
									<ActionIcon component="span" variant="subtle" color="gray" size={iconSize} hiddenFrom="sm">
										<IconUser size={18} />
									</ActionIcon>
								</Group>
							</UnstyledButton>
						</Menu.Target>
						<Menu.Dropdown>
							<Menu.Label hiddenFrom="sm">
								<Username userId={user.id} />
							</Menu.Label>
							{user.admin && (
								<>
									<Menu.Label>Admin</Menu.Label>
									<AdminMenuItems />
									<Menu.Divider />
								</>
							)}
							<Menu.Item component={Link} to="/password" leftSection={<IconKey size={16} />}>
								Change password
							</Menu.Item>
							<Menu.Item leftSection={<IconLogout size={16} />} onClick={() => logoutMutation.mutate()}>
								Log out
							</Menu.Item>
						</Menu.Dropdown>
					</Menu>
				</Group>
			</Group>
			<Divider />
		</header>
	);
}
