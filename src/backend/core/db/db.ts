import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { MIGRATIONS } from "./migrations.ts";
import SCHEMA from "./schema.sql" with { type: "text" };

/** Open the database at `path` (`:memory:` in tests), creating its directory. The schema is not touched; see `migrate`. */
export function openDatabase(path: string): Database {
	if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
	// strict: a named parameter binds without its `$` prefix, and a missing one throws instead of binding null.
	const db = new Database(path, { strict: true });
	// Off by default in SQLite and not stored in the file, so every connection sets it.
	db.run("PRAGMA foreign_keys = ON");
	return db;
}

/** The file's `PRAGMA user_version`: the count of migrations applied, 0 for a new database. */
export function readSchemaVersion(db: Database): number {
	return z.object({ user_version: z.int() }).parse(db.query("PRAGMA user_version").get()).user_version;
}

/**
 * Bring the database to the latest schema: a new one, version 0, runs schema.sql whole; an older one runs the
 * migrations past its version, each committing together with its version bump. A database a newer build has
 * migrated is refused: this build does not know its schema.
 */
export function migrate(db: Database): void {
	const version = readSchemaVersion(db);
	const latest = MIGRATIONS.length;
	if (version > latest) {
		throw new Error(`The database has schema version ${version}; this build knows up to ${latest}: update taskwe`);
	}
	if (version === 0) {
		db.transaction(() => {
			db.run(SCHEMA);
			db.run(`PRAGMA user_version = ${latest}`);
		})();
		return;
	}
	for (const [offset, migration] of MIGRATIONS.slice(version).entries()) {
		db.transaction(() => {
			migration(db);
			db.run(`PRAGMA user_version = ${version + offset + 1}`);
		})();
	}
}
