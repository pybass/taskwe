// Reference file: a backup of the whole database, as the list of backups shows it.

import { z } from "zod";
import { Timestamp } from "#shared/base.ts";

/**
 * A backup file name: 1–100 characters of letters, digits, dots, hyphens, and underscores, not starting with a dot,
 * ending in `.db`. A new backup is named by its UTC time, `taskwe-2026-09-12T10-30-00Z.db`. The one the app makes at
 * start before a migration adds `-before-v3`, v3 the first migration applied. An admin renames a backup to anything
 * that fits, see `Api.renameBackup`. A file in `backups/` with any other name is not a backup: the list leaves it out
 * and no route resolves it.
 */
export const BackupName = z
	.string()
	.max(100)
	.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.db$/, "Letters, digits, dots, hyphens, and underscores, ending in .db");

/**
 * How a database differs from the schema of this build, one line each, empty when it matches: the live one on
 * `Api.checkSchema`, a backup file in its `BackupInfo`. A line names the schema version, or an object missing, extra,
 * or different, a difference down to the part of a table: `differs: table sessions indexes`, with the expected and the
 * found value.
 */
export const SchemaDifferences = z.array(z.string());
export type SchemaDifferences = z.infer<typeof SchemaDifferences>;

/**
 * What a backup file holds, read from the file itself each time the list is built, see `Api.listBackups`. A few small
 * indexed queries and the schema pragmas on the file opened read-only; the live database is not touched.
 */
export const BackupInfo = z.object({
	schemaVersion: z.int(), // the file's `PRAGMA user_version`: the migration count of the binary that made it; a restore needs this build's
	schemaDifferences: SchemaDifferences, // how the file's schema differs from this build's; a file of another version differs at least by the version
	spaces: z.array(z.object({ slug: z.string(), name: z.string(), tasks: z.int() })), // every space in the file, by slug, with its task count
	lastEventAt: Timestamp.nullable(), // the newest task event's time; null when the file has no events
});
export type BackupInfo = z.infer<typeof BackupInfo>;

/**
 * One backup file in `backups/` under the data path: a consistent copy of the whole SQLite database, users' password
 * hashes and sessions included, made while the server runs or uploaded by an admin. Admin only. What making one does is
 * on `Api.createBackup`, an upload on `Api.uploadBackup`. A restore is `Api.restoreBackup`; by hand, copying the file
 * over `taskwe.db` with the service stopped, only when the app cannot start. A backup carries the schema of the binary
 * that made it, so after a migration edit it restores only with that binary.
 */
export const Backup = z.object({
	name: BackupName,
	size: z.int(), // bytes
	info: BackupInfo.nullable(), // null when the file does not open as a database or a query fails: a damaged file, or a schema without these tables
});
export type Backup = z.infer<typeof Backup>;

/** The name an uploaded file is saved under, the multipart field `name` of `Api.uploadBackup`. Admin only; must be free. */
export const BackupUpload = z.object({ name: BackupName });
export type BackupUpload = z.infer<typeof BackupUpload>;

/** The body that renames a backup. Admin only; the new name must be free, see `Api.renameBackup`. */
export const BackupRename = z.object({ name: BackupName });
export type BackupRename = z.infer<typeof BackupRename>;
