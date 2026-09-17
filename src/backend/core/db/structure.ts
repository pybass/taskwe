import type { Database } from "bun:sqlite";
import { z } from "zod";
import { openDatabase, readSchemaVersion } from "./db.ts";
import { MIGRATIONS } from "./migrations.ts";
import SCHEMA from "./schema.sql" with { type: "text" };

let expectedStructure: Record<string, unknown> | undefined;

/**
 * How `db` differs from the schema this build makes from schema.sql, one line each, none when it matches: the schema
 * version against the migration count, then every object missing, extra, or different, a difference narrowed to the
 * part of a table it is in. Cheap: a few PRAGMAs per table, and the rows are not read.
 */
export function schemaDifferences(db: Database): string[] {
	if (expectedStructure === undefined) {
		const reference = openDatabase(":memory:");
		reference.run(SCHEMA);
		expectedStructure = readStructure(reference);
		reference.close();
	}
	const differences: string[] = [];
	const version = readSchemaVersion(db);
	if (version !== MIGRATIONS.length) differences.push(`schema version ${version}, expected ${MIGRATIONS.length}`);
	const isRecord = (value: unknown): value is Record<string, unknown> =>
		typeof value === "object" && value !== null && !Array.isArray(value);
	const compare = (key: string, want: unknown, have: unknown): void => {
		if (JSON.stringify(want) === JSON.stringify(have)) return;
		if (want === undefined) differences.push(`extra: ${key}`);
		else if (have === undefined) differences.push(`missing: ${key}`);
		else if (isRecord(want) && isRecord(have)) {
			for (const part of [...new Set([...Object.keys(want), ...Object.keys(have)])].sort()) {
				compare(key === "" ? part : `${key} ${part}`, want[part], have[part]);
			}
		} else differences.push(`differs: ${key}\n  expected: ${JSON.stringify(want)}\n  found:    ${JSON.stringify(have)}`);
	};
	compare("", expectedStructure, readStructure(db));
	return differences;
}

/**
 * The structure of a database, to compare two with `toEqual` or key by key: per table its columns, foreign keys,
 * indexes with their columns, the UNIQUE autoindexes included, CHECK clauses, and flags; for every other object its
 * SQL. Comments and whitespace are left out, so the explained schema and a bare migration compare equal. The rows
 * are not read. An autoindex goes by its columns, not its name, since SQLite numbers them by creation order.
 */
export function readStructure(db: Database): Record<string, unknown> {
	const Row = z.object({ type: z.string(), name: z.string(), sql: z.string().nullable() });
	const rows = z
		.array(Row)
		.parse(db.query("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all());
	const result: Record<string, unknown> = {};
	for (const { type, name, sql } of rows) {
		const bare =
			sql
				?.replace(/--[^\n]*/g, "")
				.replace(/\s+/g, " ")
				.trim() ?? "";
		if (type !== "table") {
			result[`${type} ${name}`] = bare;
			continue;
		}
		// A PRAGMA takes no bound parameter, and an uploaded file may name a table anything.
		const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
		const Index = z.object({ name: z.string(), unique: z.number(), origin: z.string(), partial: z.number() });
		const Column = z.object({ name: z.string().nullable() });
		const indexes = z
			.array(Index)
			.parse(db.query(`PRAGMA index_list(${quote(name)})`).all())
			.map((index) => ({
				name: index.origin === "c" ? index.name : null,
				unique: index.unique,
				origin: index.origin,
				partial: index.partial,
				columns: z.array(Column).parse(db.query(`PRAGMA index_info(${quote(index.name)})`).all()),
			}))
			.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
		result[`table ${name}`] = {
			columns: db.query(`PRAGMA table_info(${quote(name)})`).all(),
			foreignKeys: db.query(`PRAGMA foreign_key_list(${quote(name)})`).all(),
			indexes,
			checks: checkClauses(bare),
			autoincrement: /AUTOINCREMENT/i.test(bare),
			strict: /\) STRICT/i.test(bare),
			withoutRowid: /WITHOUT ROWID/i.test(bare),
		};
	}
	return result;
}

/**
 * The CHECK clauses of a CREATE TABLE, sorted, whitespace removed. SQLite keeps them only in the table's SQL text,
 * and ALTER TABLE ADD COLUMN writes a column's clause as the migration typed it.
 */
function checkClauses(sql: string): string[] {
	const clauses: string[] = [];
	const check = /\bCHECK\s*\(/gi;
	for (let match = check.exec(sql); match !== null; match = check.exec(sql)) {
		let depth = 1;
		let end = check.lastIndex;
		for (; depth > 0 && end < sql.length; end++) {
			if (sql[end] === "(") depth++;
			else if (sql[end] === ")") depth--;
		}
		clauses.push(sql.slice(match.index, end).replace(/\s+/g, ""));
	}
	return clauses.sort();
}
