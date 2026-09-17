import { z } from "zod";
import type { NewUser, User } from "#shared/user.ts";
import type { Core } from "../../core.ts";
import { InvalidOperationError, NotFoundError } from "../../errors.ts";
import { UserRow } from "./models.ts";

/** Owner of the `users` table. Reads come from `users` and `hashes`, a copy of the table; see `updateUsersCache`. */
export class UserService {
	private users = new Map<number, User>();
	// Kept out of `users`, which go into responses as they are: a hash must never travel with one.
	private hashes = new Map<number, string>();

	constructor(private readonly core: Core) {}

	/** Fill the maps from the table. Core calls it after migrations, and a write calls it again once its transaction commits. */
	updateUsersCache(): void {
		const rows = z
			.array(UserRow.extend({ passwordHash: z.string() }))
			.parse(
				this.core.db.query("SELECT id, username, admin, created_at AS createdAt, password_hash AS passwordHash FROM users").all(),
			);
		this.users = new Map(rows.map(({ passwordHash: _, ...user }) => [user.id, user]));
		this.hashes = new Map(rows.map((row) => [row.id, row.passwordHash]));
	}

	getUser(userId: number): User {
		const user = this.users.get(userId);
		if (user === undefined) throw new NotFoundError(`No user ${userId}`);
		return user;
	}

	findUserByUsername(username: string): User | null {
		for (const user of this.users.values()) if (user.username === username) return user;
		return null;
	}

	listUsers(): User[] {
		return [...this.users.values()].sort((a, b) => a.username.localeCompare(b.username));
	}

	/** Check a username and password; null when either is wrong, so a caller cannot tell which. */
	authenticate(username: string, password: string): User | null {
		const user = this.findUserByUsername(username);
		return user !== null && this.checkPassword(user.id, password) ? user : null;
	}

	/** Whether `password` is the user's password in force; false for an unknown id. */
	checkPassword(userId: number, password: string): boolean {
		const hash = this.hashes.get(userId);
		return hash !== undefined && Bun.password.verifySync(password, hash);
	}

	/** Create the user and its personal space in one transaction. A taken username is an InvalidOperationError. */
	createUser(input: NewUser): User {
		const userId = this.core.db.transaction(() => {
			this.assertUsernameFree(input.username);
			const now = new Date().toISOString();
			const { lastInsertRowid } = this.core.db
				.query("INSERT INTO users (username, password_hash, admin, created_at) VALUES ($username, $hash, $admin, $now)")
				.run({ username: input.username, hash: Bun.password.hashSync(input.password), admin: input.admin ? 1 : 0, now });
			const userId = Number(lastInsertRowid);
			this.core.services.space.createPersonalSpace(userId, input.username, now);
			return userId;
		})();
		// After the commit, so a rollback leaves both maps untouched.
		this.updateUsersCache();
		this.core.services.space.updateSpacesCache();
		return this.getUser(userId);
	}

	/** Rename the user and its personal space in one transaction. A taken username is an InvalidOperationError. */
	renameUser(userId: number, username: string): User {
		this.getUser(userId);
		this.core.db.transaction(() => {
			this.assertUsernameFree(username);
			this.core.db.query("UPDATE users SET username = $username WHERE id = $userId").run({ username, userId });
			this.core.services.space.renamePersonalSpace(userId, username);
		})();
		this.updateUsersCache();
		this.core.services.space.updateSpacesCache();
		return this.getUser(userId);
	}

	setAdmin(userId: number, admin: boolean): User {
		this.getUser(userId);
		this.core.db.query("UPDATE users SET admin = $admin WHERE id = $userId").run({ admin: admin ? 1 : 0, userId });
		this.updateUsersCache();
		return this.getUser(userId);
	}

	/** Set a new password. Ends the user's other sessions; `currentToken` stays. */
	setPassword(userId: number, password: string, currentToken: string): void {
		this.getUser(userId);
		this.core.db.transaction(() => {
			this.core.db
				.query("UPDATE users SET password_hash = $hash WHERE id = $userId")
				.run({ hash: Bun.password.hashSync(password), userId });
			// When an admin sets another user's password, the admin's own token is not among that user's sessions,
			// so every session of that user ends.
			this.core.services.session.deleteOtherSessions(userId, currentToken);
		})();
		this.updateUsersCache();
	}

	/** A username is also the slug and the name of the personal space, so it must be free of every space slug and name; every username is a slug already. */
	private assertUsernameFree(username: string): void {
		if (
			this.core.services.space.findSpaceBySlug(username) !== null ||
			this.core.services.space.findSpaceByName(username) !== null
		) {
			throw new InvalidOperationError(`The username "${username}" is taken`);
		}
	}
}
