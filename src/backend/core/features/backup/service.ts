import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { type Backup, type BackupInfo, BackupName } from "#shared/backup.ts";
import type { Core } from "../../core.ts";
import { MIGRATIONS } from "../../db/migrations.ts";
import { schemaDifferences } from "../../db/structure.ts";
import { InvalidOperationError, NotFoundError } from "../../errors.ts";

/** What the database file at `path` holds; null when it does not open as a database or a query fails. */
function readBackupInfo(path: string): BackupInfo | null {
	let db: Database;
	try {
		db = new Database(path, { readonly: true });
	} catch {
		return null;
	}
	try {
		const version = z.object({ user_version: z.int() }).parse(db.query("PRAGMA user_version").get());
		const spaces = z
			.array(z.object({ slug: z.string(), name: z.string(), tasks: z.int() }))
			.parse(
				db
					.query("SELECT slug, name, (SELECT COUNT(*) FROM tasks WHERE space_id = spaces.id) AS tasks FROM spaces ORDER BY slug")
					.all(),
			);
		const last = z
			.object({ last: z.iso.datetime().nullable() })
			.parse(db.query("SELECT MAX(created_at) AS last FROM task_events").get());
		return { schemaVersion: version.user_version, schemaDifferences: schemaDifferences(db), spaces, lastEventAt: last.last };
	} catch {
		return null;
	} finally {
		db.close();
	}
}

function readBackup(path: string, name: string): Backup {
	return { name, size: statSync(path).size, info: readBackupInfo(path) };
}

/** The backup files under the data path. A system service: it owns no table and works on the file system. */
export class BackupService {
	constructor(private readonly core: Core) {}

	/**
	 * A consistent copy of the database as a new file in `backups/`, named by the current UTC second plus `-suffix`, which
	 * must fit a `BackupName`.
	 */
	createBackup(suffix?: string): Backup {
		const dir = this.backupsDir();
		mkdirSync(dir, { recursive: true });
		const second = new Date().toISOString().replace(/\.\d+Z$/, "Z");
		const name = `taskwe-${second.replace(/:/g, "-")}${suffix === undefined ? "" : `-${suffix}`}.db`;
		if (existsSync(join(dir, name))) throw new InvalidOperationError("A backup was made this second; try again");
		this.core.db.query("VACUUM INTO $path").run({ path: join(dir, name) });
		return readBackup(join(dir, name), name);
	}

	/**
	 * Save `content` as the backup file `name` in `backups/`. The file is written as `upload.tmp` and read first: it is
	 * refused, and nothing is kept, when its info cannot be read. InvalidOperationError when a file named `name` exists.
	 */
	uploadBackup(name: string, content: Uint8Array): Backup {
		const dir = this.backupsDir();
		mkdirSync(dir, { recursive: true });
		const path = join(dir, name);
		if (existsSync(path)) throw new InvalidOperationError(`Backup "${name}" exists`);
		const tmp = join(dir, "upload.tmp");
		writeFileSync(tmp, content);
		try {
			if (readBackupInfo(tmp) === null) throw new InvalidOperationError("The file is not a taskwe database");
			renameSync(tmp, path);
		} finally {
			rmSync(tmp, { force: true });
		}
		return readBackup(path, name);
	}

	/**
	 * Every backup file, newest last event first, then by name; files with no info last. A file in the folder whose name
	 * is not a `BackupName` is left out.
	 */
	listBackups(): Backup[] {
		const dir = this.backupsDir();
		mkdirSync(dir, { recursive: true });
		return readdirSync(dir)
			.filter((name) => BackupName.safeParse(name).success)
			.map((name) => readBackup(join(dir, name), name))
			.sort((a, b) => (b.info?.lastEventAt ?? "").localeCompare(a.info?.lastEventAt ?? "") || a.name.localeCompare(b.name));
	}

	/** The path of the backup file `name`. NotFoundError for a name that is not a `BackupName` or a file that is gone. */
	getBackupPath(name: string): string {
		const path = join(this.backupsDir(), name);
		if (!BackupName.safeParse(name).success || !existsSync(path)) throw new NotFoundError(`Backup "${name}" not found`);
		return path;
	}

	/**
	 * Rename the backup file `name` to `newName`, a `BackupName`; the answer is the renamed backup.
	 * NotFoundError as `getBackupPath`. InvalidOperationError when a file named `newName` exists.
	 */
	renameBackup(name: string, newName: string): Backup {
		const path = this.getBackupPath(name);
		if (newName === name) return readBackup(path, name);
		const newPath = join(this.backupsDir(), newName);
		// A case-only rename finds its own file on a case-insensitive filesystem, such as macOS in development.
		if (existsSync(newPath) && statSync(newPath).ino !== statSync(path).ino) {
			throw new InvalidOperationError(`Backup "${newName}" exists`);
		}
		renameSync(path, newPath);
		return readBackup(newPath, newName);
	}

	/** Remove the backup file `name`. NotFoundError as `getBackupPath`. */
	deleteBackup(name: string): void {
		rmSync(this.getBackupPath(name));
	}

	/**
	 * Replace the live database with the backup file `name`, in this order: the file is checked, the current database
	 * is backed up with `createBackup`, and `Core.replaceDatabase` swaps the file in. The answer is the backup made
	 * before the swap. NotFoundError as `getBackupPath`. InvalidOperationError for a file that is not a SQLite database,
	 * fails its integrity check, or has a schema version other than this build's: a backup restores only with a binary
	 * of its schema version.
	 */
	restoreBackup(name: string): Backup {
		const source = this.getBackupPath(name);
		this.checkBackupFile(source);
		const backup = this.createBackup();
		this.core.replaceDatabase(source);
		return backup;
	}

	private checkBackupFile(source: string): void {
		const db = new Database(source, { readonly: true });
		let check: unknown;
		let version: unknown;
		try {
			check = db.query("PRAGMA integrity_check").get();
			version = db.query("PRAGMA user_version").get();
		} catch (e) {
			throw new InvalidOperationError("The file is not a SQLite database", { cause: e });
		} finally {
			db.close();
		}
		const { integrity_check: result } = z.object({ integrity_check: z.string() }).parse(check);
		if (result !== "ok") throw new InvalidOperationError(`The file is damaged: ${result}`);
		const { user_version: found } = z.object({ user_version: z.int() }).parse(version);
		if (found !== MIGRATIONS.length) {
			throw new InvalidOperationError(`The file has schema version ${found}; this build needs ${MIGRATIONS.length}`);
		}
	}

	private backupsDir(): string {
		if (this.core.dataPath === null) throw new InvalidOperationError("An in-memory database has no backups");
		return join(this.core.dataPath, "backups");
	}
}
