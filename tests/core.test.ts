import type { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { z } from "zod";
import { Core } from "../src/backend/core/core.ts";
import { openDatabase } from "../src/backend/core/db/db.ts";
import { MIGRATIONS } from "../src/backend/core/db/migrations.ts";
import SCHEMA from "../src/backend/core/db/schema.sql" with { type: "text" };
import { readStructure } from "../src/backend/core/db/structure.ts";

/** What `build` makes in an empty database, `readStructure` in structure.ts. */
function structure(build: (db: Database) => void): Record<string, unknown> {
	// As the app opens it: strict named parameters, so a migration that binds them behaves the same here.
	const db = openDatabase(":memory:");
	build(db);
	const result = readStructure(db);
	db.close();
	return result;
}

test("the full schema and the migrations give the same structure", () => {
	const fromSchema = structure((db) => db.run(SCHEMA));
	const fromMigrations = structure((db) => {
		for (const migration of MIGRATIONS) migration(db);
	});
	expect(fromSchema).toEqual(fromMigrations);
});

test("a new database gets the latest schema with foreign keys on", () => {
	const core = new Core(":memory:");
	expect(core.db.query("PRAGMA user_version").get()).toEqual({ user_version: MIGRATIONS.length });
	expect(core.db.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
	const tables = core.db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
	// A search index is an FTS5 table with four shadow tables of its own.
	expect(tables.values().flat()).toEqual([
		"comment_search",
		"comment_search_config",
		"comment_search_data",
		"comment_search_docsize",
		"comment_search_idx",
		"comments",
		"labels",
		"notifications",
		"repeat_dones",
		"sessions",
		"settings",
		"space_members",
		"spaces",
		"task_events",
		"task_labels",
		"task_search",
		"task_search_config",
		"task_search_data",
		"task_search_docsize",
		"task_search_idx",
		"tasks",
		"users",
	]);
	core.close();
});

test("a new database has the admin user with its personal space", () => {
	const core = new Core(":memory:");
	const rows = core.db
		.query(
			`SELECT u.username, u.admin, u.password_hash AS passwordHash, s.slug, s.name
			FROM users u JOIN space_members m ON m.user_id = u.id JOIN spaces s ON s.id = m.space_id`,
		)
		.all();
	const row = z.object({ username: z.string(), admin: z.number(), passwordHash: z.string(), slug: z.string(), name: z.string() });
	const [admin] = z.tuple([row]).parse(rows);
	expect(admin).toMatchObject({ username: "admin", admin: 1, slug: "admin", name: "admin" });
	expect(Bun.password.verifySync("admin", admin.passwordHash)).toBe(true);
	core.close();
});
