// Reference file: a space, its members with their roles, and the rule of who may do what in it.

import { z } from "zod";
import { Id, Slug, Timestamp } from "#shared/base.ts";
import type { User } from "#shared/user.ts";

/**
 * A member's role, in rank order: a higher role may do everything a lower one may.
 * - `viewer`: read the tasks and the comments.
 * - `editor`: create tasks; edit, close, assign, and label any task, the body included; add comments.
 * - `manager`: the member list and the roles, the labels, and moving a task out of the space: the whole history goes
 *   with it, so the move is the manager's call. In a personal space the owner is the manager.
 * The admin flag gives no role: an admin is a member like anyone, and sets their own role in any shared space, or
 * leaves it, through the admin page. Only an admin deletes a space or a task. A comment is edited only by its
 * author, whatever the role, the admin included: see comment.ts.
 */
export const SpaceRole = z.enum(["viewer", "editor", "manager"]);
export type SpaceRole = z.infer<typeof SpaceRole>;
/** The roles in rank order, for a picker. */
export const SPACE_ROLES = SpaceRole.options;

/** One entry of a space's member list. */
export const SpaceMember = z.object({
	userId: Id,
	role: SpaceRole,
});
export type SpaceMember = z.infer<typeof SpaceMember>;

/** Unique across every space, exact match, and free of every username: a personal space is named by its owner's username. */
export const SpaceName = z.string().trim().min(1).max(64);

/**
 * A space holds tasks. It is personal when `ownerId` is set, else shared.
 * - A personal space is created with its user, who is its owner, its only member, and its manager, for good: its
 *   member list cannot change, and it cannot be deleted. Its name and slug are both the username. Every task in it is
 *   assigned to the owner.
 * - A shared space is created by any user, who is a manager whether listed or not. Only an admin deletes it, with its
 *   members, labels, tasks, and comments.
 * A shared space has no rename: its name and slug are set once. A personal space is renamed only with its user,
 * see `UserRename`.
 */
export const Space = z.object({
	id: Id,
	slug: Slug, // the URL of the space is /s/{slug}
	name: SpaceName, // what every page shows
	ownerId: Id.nullable(), // the user whose personal space this is; null: shared. One personal space per user
	createdAt: Timestamp,
	members: z.array(SpaceMember), // one entry per user; always at least one manager
});
export type Space = z.infer<typeof Space>;

/**
 * The create body. `members` are the users to invite, with their roles; the creator becomes a manager whether listed
 * or not, and with that role whatever the list says. Rejected: a taken slug or name, a user listed twice, an unknown
 * user id. The form suggests a slug from the name; the API requires one.
 */
export const NewSpace = z.object({
	name: SpaceName,
	slug: Slug,
	members: z.array(SpaceMember).default([]),
});
export type NewSpace = z.infer<typeof NewSpace>;

/**
 * The whole member list: the request replaces the old one, so a member leaves by being left out, and a manager may
 * leave while another manager stays. Rejected for a personal space, a list without a manager, a user listed twice,
 * or an unknown user id.
 */
export const SpaceMembers = z.object({ members: z.array(SpaceMember) });
export type SpaceMembers = z.infer<typeof SpaceMembers>;

/** An admin's own role in a shared space, set from the admin page; null leaves the space. */
export const OwnSpaceRole = z.object({ role: SpaceRole.nullable() });
export type OwnSpaceRole = z.infer<typeof OwnSpaceRole>;

/**
 * Whether the user's role in the space is `minRole` or higher; false for a non-member, the admin flag giving no role.
 * The one access rule both sides share: `Api` checks a method's lowest role with it, and a page hides what the role
 * cannot do with the same call. The page never decides; a hidden button is a 403 saved.
 */
export function hasSpaceRole(user: User, space: Space, minRole: SpaceRole): boolean {
	const role = space.members.find((member) => member.userId === user.id)?.role;
	return role !== undefined && SPACE_ROLES.indexOf(role) >= SPACE_ROLES.indexOf(minRole);
}
