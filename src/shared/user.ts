// Reference file: a user, the login body, and the create body.

import { z } from "zod";
import { Id, Slug, Timestamp } from "#shared/base.ts";

/**
 * A username and a password. There is no self-registration: only an admin adds users. The app never deletes a user,
 * so a task or a comment always has its author; only a script can. This is the row without the password hash, which
 * is never sent.
 */
export const User = z.object({
	id: Id,
	// Unique; shown as the user's name everywhere. Also the slug and the name of the personal space, so it is checked
	// against every space slug and name. Only an admin renames it, see `UserRename`.
	username: Slug,
	admin: z.boolean(), // no role in any space; the admin pages, joining any shared space, and deleting spaces and tasks
	createdAt: Timestamp,
});
export type User = z.infer<typeof User>;

/** A password as the user typed it, never trimmed, empty included. The cap bounds the hashing time of one request. */
const PasswordText = z.string().max(256);

/** A password to store, as an argon2id hash: `PasswordText`, not empty. */
export const Password = PasswordText.min(1);

/**
 * The login body. A wrong username and a wrong password get the same answer. Neither is trimmed: both must match as
 * typed. After 5 wrong passwords for a username within 15 minutes, its logins are refused until the window has
 * passed. A session lasts 30 days from its last use.
 */
export const Credentials = z.object({ username: z.string().max(32), password: PasswordText });
export type Credentials = z.infer<typeof Credentials>;

/**
 * The create body, admin only. A username that is a space slug or a space name is rejected, since the personal space
 * takes it as both. The personal space is created in the same transaction.
 */
export const NewUser = z.object({
	username: Slug,
	password: Password,
	admin: z.boolean().default(false),
});
export type NewUser = z.infer<typeof NewUser>;

/**
 * The body a user sends to change their own password. `currentPassword` must match the password in force; a mismatch
 * is rejected. An admin sets another user's password without it. Neither is trimmed.
 */
export const PasswordChange = z.object({
	currentPassword: PasswordText,
	password: Password, // the new one
});
export type PasswordChange = z.infer<typeof PasswordChange>;

/**
 * The body an admin sends to rename a user. The new username must be free of every username, space slug, and space
 * name, else rejected. The personal space takes it as its slug and name in the same transaction, so its URL changes;
 * sessions stay.
 */
export const UserRename = z.object({ username: Slug });
export type UserRename = z.infer<typeof UserRename>;

/** The body that sets a user's admin flag. Admin only; an admin cannot clear their own, see `Api.setAdmin`. */
export const AdminFlag = z.object({ admin: z.boolean() });
export type AdminFlag = z.infer<typeof AdminFlag>;

/** The body an admin sends to set any user's password. No current password: this is the recovery path. */
export const PasswordSet = PasswordChange.omit({ currentPassword: true });
export type PasswordSet = z.infer<typeof PasswordSet>;
