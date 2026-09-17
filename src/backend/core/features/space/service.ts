import { z } from "zod";
import { hasSpaceRole, type NewSpace, type Space, type SpaceMember, type SpaceRole } from "#shared/space.ts";
import type { User } from "#shared/user.ts";
import type { Core } from "../../core.ts";
import { InvalidOperationError, NotFoundError } from "../../errors.ts";
import { SpaceRow } from "./models.ts";

/** Owner of the `spaces` and `space_members` tables. Reads come from `spaces`, a copy of both; see `updateSpacesCache`. */
export class SpaceService {
	private spaces = new Map<number, Space>();

	constructor(private readonly core: Core) {}

	/** Fill the copy from the tables. Core calls it after migrations, and a write calls it again once its transaction commits. */
	updateSpacesCache(): void {
		// json_group_array gives '[]' for a space without members, so the schema always sees a JSON list.
		const rows = z.array(SpaceRow).parse(
			this.core.db
				.query(`
					SELECT s.id, s.slug, s.name, s.owner_id AS ownerId, s.created_at AS createdAt,
						(SELECT json_group_array(json_object('userId', user_id, 'role', role)) FROM space_members WHERE space_id = s.id) AS members
					FROM spaces s`)
				.all(),
		);
		this.spaces = new Map(rows.map((space) => [space.id, space]));
	}

	getSpace(spaceId: number): Space {
		const space = this.spaces.get(spaceId);
		if (space === undefined) throw new NotFoundError(`No space ${spaceId}`);
		return space;
	}

	findSpaceBySlug(slug: string): Space | null {
		for (const space of this.spaces.values()) if (space.slug === slug) return space;
		return null;
	}

	findSpaceByName(name: string): Space | null {
		for (const space of this.spaces.values()) if (space.name === name) return space;
		return null;
	}

	/** Every space, sorted by name. */
	listSpaces(): Space[] {
		return [...this.spaces.values()].sort((a, b) => a.name.localeCompare(b.name));
	}

	/** The spaces the user may read: the ones they are a member of. */
	listReadableSpaces(user: User): Space[] {
		return this.listSpaces().filter((space) => hasSpaceRole(user, space, "viewer"));
	}

	/**
	 * Set `userId`'s role in a shared space, adding them when absent; null removes them. The member rules apply: a
	 * personal space, or removing or demoting the only manager, is an InvalidOperationError.
	 */
	setMemberRole(spaceId: number, userId: number, role: SpaceRole | null): Space {
		const others = this.getSpace(spaceId).members.filter((member) => member.userId !== userId);
		return this.setSpaceMembers(spaceId, role === null ? others : [...others, { userId, role }]);
	}

	/** Create a shared space with `input.members` and the creator as a manager. A taken slug or name is an InvalidOperationError. */
	createSpace(creatorId: number, input: NewSpace): Space {
		const spaceId = this.core.db.transaction(() => {
			// Usernames and slugs share one namespace, and every username is also the slug and the name of its personal
			// space, so the spaces alone cover usernames.
			if (this.findSpaceBySlug(input.slug) !== null) throw new InvalidOperationError(`The slug "${input.slug}" is taken`);
			if (this.findSpaceByName(input.name) !== null) throw new InvalidOperationError(`The name "${input.name}" is taken`);
			const { lastInsertRowid } = this.core.db
				.query("INSERT INTO spaces (slug, name, owner_id, created_at) VALUES ($slug, $name, NULL, $now)")
				.run({ slug: input.slug, name: input.name, now: new Date().toISOString() });
			const spaceId = Number(lastInsertRowid);
			// The creator's own entry, if any, is overridden: the creator is a manager.
			this.insertMembers(spaceId, [
				...input.members.filter((member) => member.userId !== creatorId),
				{ userId: creatorId, role: "manager" },
			]);
			return spaceId;
		})();
		this.updateSpacesCache();
		return this.getSpace(spaceId);
	}

	/** Replace the member list. A personal space or a list without a manager is an InvalidOperationError. */
	setSpaceMembers(spaceId: number, members: SpaceMember[]): Space {
		if (this.getSpace(spaceId).ownerId !== null) {
			throw new InvalidOperationError("The members of a personal space cannot change");
		}
		if (!members.some((member) => member.role === "manager")) {
			throw new InvalidOperationError("A space needs at least one manager");
		}
		this.core.db.transaction(() => {
			this.core.db.query("DELETE FROM space_members WHERE space_id = $spaceId").run({ spaceId });
			this.insertMembers(spaceId, members);
		})();
		this.updateSpacesCache();
		return this.getSpace(spaceId);
	}

	/** Delete a shared space; its members, labels, tasks, and comments go by cascade. A personal space is an InvalidOperationError. */
	deleteSpace(spaceId: number): void {
		if (this.getSpace(spaceId).ownerId !== null) throw new InvalidOperationError("A personal space cannot be deleted");
		this.core.db.query("DELETE FROM spaces WHERE id = $spaceId").run({ spaceId });
		this.updateSpacesCache();
		this.core.services.label.updateLabelsCache();
	}

	/**
	 * Insert the personal space of `userId`, slug and name `username`, with the user as manager; call inside the user's
	 * transaction, after the caller has checked the username is free, see `UserService.createUser`, then `updateSpacesCache`.
	 */
	createPersonalSpace(userId: number, username: string, createdAt: string): void {
		const { lastInsertRowid } = this.core.db
			.query("INSERT INTO spaces (slug, name, owner_id, created_at) VALUES ($username, $username, $userId, $createdAt)")
			.run({ username, userId, createdAt });
		this.core.db
			.query("INSERT INTO space_members (space_id, user_id, role) VALUES ($spaceId, $userId, 'manager')")
			.run({ spaceId: lastInsertRowid, userId });
	}

	/** Give the personal space of `userId` the slug and name `username`; call inside the user's transaction, then `updateSpacesCache`. */
	renamePersonalSpace(userId: number, username: string): void {
		this.core.db.query("UPDATE spaces SET slug = $username, name = $username WHERE owner_id = $userId").run({ username, userId });
	}

	/** A user listed twice or an id that is no user is an InvalidOperationError. Call inside the caller's transaction. */
	private insertMembers(spaceId: number, members: SpaceMember[]): void {
		const ids = members.map((member) => member.userId);
		const twice = ids.find((id, index) => ids.indexOf(id) !== index);
		if (twice !== undefined) throw new InvalidOperationError(`User ${twice} is listed twice`);
		const known = new Set(this.core.services.user.listUsers().map((user) => user.id));
		const unknown = ids.filter((id) => !known.has(id));
		if (unknown.length > 0) throw new InvalidOperationError(`No user ${unknown.join(", ")}`);
		const insert = this.core.db.query("INSERT INTO space_members (space_id, user_id, role) VALUES ($spaceId, $userId, $role)");
		for (const { userId, role } of members) insert.run({ spaceId, userId, role });
	}
}
